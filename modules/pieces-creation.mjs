// @zone pieces | Creation de pieces (contrat gestionPieces, CLAUDE.md « Pièces » ; aucun nom de marque) : GET /api/pieces (pieces du hub et leurs appareils
// ON/OFF, lecture fraiche ; V1.4 : pieces locales, appareils independants et leur piece), POST /api/pieces {adapter, nom, icone, appareils, locaux} :
// lecture fraiche (hub joignable, doublon parmi les pieces du hub et locales, appareils connus ; rien n'est ecrit si elle echoue). Avec au moins un appareil
// du hub : une creation dans le hub, puis un deplacement, chacun envoye une seule fois (jamais renvoye ni defait), relecture 1 s apres, 201 ou 207 ;
// sans appareil du hub : piece locale (registre, modules/pieces-registre.mjs), 201. Appareils independants (locaux) ranges dans le registre.
// Pieces creees dans le hub notees dans donnees/pieces-creees.json [{id, adapter, nom, cree_le, supprimee_le?}].
// Expose aussi a modules/pieces-gestion.mjs (modification, suppression) : lecture, controles, notes, creation dans le service, verrou commun.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, describe } from '../core/http.mjs';
import { DONNEES, log, sleep, withTimeout, borne, lireJson, ecrireJson } from '../core/outils.mjs';
import { charger, gestionsPieces, hubs, invalider, lister } from '../core/appareils.mjs';
import { ID_RE, estOnOff } from '../core/modele.mjs';
import { lireRegistre, majRegistre, independants, estLocale, nouvelleLocale } from './pieces-registre.mjs';

export const MAX_NOM = 30;
export const MAX_APP = 50;
// Corps de POST /api/pieces et /modifier : 50 appareils + 50 independants (identifiants de 80 caracteres au plus) depassent les 4 Ko par defaut (~8,5 Ko)
export const CORPS_PIECES = 16 * 1024;
const MAX_NOTES = 200;
export const texte = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
// Comparaison des noms (doublons) : sans accents, sans majuscules, espaces reduits.
export const cle = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Nom accepte : chaine, espaces reduits, 1 a 30 caracteres, sans caractere de controle.
export function nomValide(v) {
  if (typeof v !== 'string' || /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/.test(v)) return null;
  const n = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  return n && [...n].length <= MAX_NOM ? n : null;
}
export const iconesDe = (x) => (Array.isArray(x.g.icones) ? x.g.icones.filter((k) => typeof k === 'string' && /^[a-z]{1,20}$/.test(k)) : []);
export const piecesValides = (l) => (Array.isArray(l) ? l : []).filter((r) => r && typeof r.id === 'string' && ID_RE.test(r.id) && typeof r.name === 'string');
const onoff = (l) => l.filter(estOnOff);

// Lecture fraiche d'un adaptateur : ses pieces et ses appareils ON/OFF (leve l'erreur de l'adaptateur).
export async function lire(x) {
  invalider();
  const [p, l] = await borne(() => Promise.all([x.a.pieces(), lister(x.id)]), 10000);
  return { pieces: piecesValides(p), appareils: onoff(l) };
}
async function nomHub(x) {
  const h = hubs().find((y) => y.id === x.id);
  if (!h) return null;
  try { const e = await borne(() => h.hub.etat(), 4000); return texte(e && e[0] && e[0].nom, 60); } catch (e) { return null; }
}
async function cible(x) {
  const ics = iconesDe(x);
  const o = { adapter: x.id, nom: texte(x.g.nom, 60) || x.id, hub: null, icones: ics, max: MAX_NOM, peut: peut(x), panne: null, pieces: [], appareils: [] };
  try {
    const [r, tous] = await Promise.all([lire(x), contenu(x)]);
    const nb = {}, total = {}, ici = new Set(notes().filter((n) => n.adapter === x.id && !n.supprimee_le).map((n) => n.id));
    for (const d of r.appareils) if (d.room) nb[d.room.id] = (nb[d.room.id] || 0) + 1;
    for (const d of tous || r.appareils.map((y) => ({ piece: y.room && y.room.id }))) if (d.piece) total[d.piece] = (total[d.piece] || 0) + 1;
    o.pieces = r.pieces.map((p) => ({ id: p.id, nom: p.name, icone: ics.includes(p.icone) ? p.icone : null, appareils: nb[p.id] || 0, total: total[p.id] || 0, creeeIci: ici.has(p.id) }));
    o.appareils = r.appareils.map((d) => ({ id: d.id, nom: d.name, type: d.type, piece: d.room ? { id: d.room.id, nom: d.room.name } : null, joignable: d.reachable !== false }));
    o.hub = await nomHub(x);
  } catch (e) { o.panne = describe(e)[1]; }
  return o;
}

// Possibilites declarees par l'adaptateur (V1.4) : modifier (nom, icone) ; supprimer (exige contenu : une piece n'est supprimee que vide).
export const peut = (x) => ({ modifier: typeof x.g.modifier === 'function', supprimer: typeof x.g.supprimer === 'function' && typeof x.g.contenu === 'function' });
// Tous les appareils de l'adaptateur et leur piece [{id, nom, piece}] (null si l'adaptateur ne le declare pas)
export async function contenu(x) {
  if (typeof x.g.contenu !== 'function') return null;
  const l = await borne(() => x.g.contenu(), 10000);
  return (Array.isArray(l) ? l : []).filter((d) => d && typeof d.id === 'string' && ID_RE.test(d.id))
    .map((d) => ({ id: d.id, nom: texte(d.nom, 60) || d.id, piece: typeof d.piece === 'string' ? d.piece : null }));
}

// Pieces creees depuis l'application (trace ; V1.4 : nom mis a jour au renommage, supprimee_le a la suppression) : fichier illisible jamais ecrase.
const NOTES = 'pieces-creees.json';
export function notes() { const l = lireJson(NOTES, null); return Array.isArray(l) ? l.filter((n) => n && typeof n === 'object') : []; }
// fn(liste) modifie la liste (false : rien a changer) ; rien n'est ecrit si le fichier existe mais est illisible
export function majNotes(fn, quoi) {
  const l = lireJson(NOTES, null);
  if (!Array.isArray(l) && fs.existsSync(path.join(DONNEES, NOTES))) { log('pieces :', NOTES, 'illisible,', quoi, 'non noté(e)'); return; }
  const liste = Array.isArray(l) ? l : [];
  if (fn(liste) === false) return; // rien a changer : fichier non reecrit
  ecrireJson(NOTES, liste.slice(-MAX_NOTES), 1);
}
const noter = (p) => majNotes((l) => l.push(p), 'création');

// Une operation sur les pieces a la fois (creation, modification, suppression)
export const verrou = { pris: false };
// Validation d'une liste d'identifiants (0 a 50, sans doublon)
export function listeIds(v, quoi) {
  const l = v === undefined || v === null ? [] : v;
  if (!Array.isArray(l) || l.length > MAX_APP || !l.every((id) => typeof id === 'string' && ID_RE.test(id)) || new Set(l).size !== l.length) throw new HttpError(400, 'Liste ' + quoi + ' invalide.');
  return l;
}
// Nom deja pris (pieces du hub et pieces locales, sauf la piece « sauf ») : nom existant ou null
export const AUTRES = 'Autres'; // piece par defaut des appareils sans piece (client : pieces-choix.js)
export function doublon(nom, piecesHub, sauf) {
  // « Autres » : nom réservé à la pièce par défaut (V1.4 ; une pièce du hub qui le porte déjà peut le garder)
  if (cle(nom) === cle(AUTRES) && !piecesHub.some((p) => p.id === sauf && cle(p.name) === cle(AUTRES))) return AUTRES;
  const t = piecesHub.find((p) => p.id !== sauf && cle(p.name) === cle(nom)) || lireRegistre().locales.map((p) => ({ id: p.id, name: p.nom })).find((p) => p.id !== sauf && cle(p.name) === cle(nom));
  return t ? t.name : null;
}
// Appareils independants demandes : tous connus (ou deja dans la piece « garder ») ; sinon 400
export async function verifierIndependants(ids, garder) {
  if (!ids.length) return new Map();
  const { appareils } = await independants();
  const r = lireRegistre(), par = new Map(appareils.map((d) => [d.id, d]));
  for (const i of ids) if (!par.has(i) && !(garder && r.rangement[i] === garder)) throw new HttpError(400, 'Appareil inconnu : la liste a changé, rouvrez la fenêtre.');
  return par;
}
// Range les appareils independants ids dans la piece (registre local, aucun effet sur le hub) -> {ranges: [{id, nom}], echecs: [{id, nom, motif}]}
export function rangerLocaux(ids, piece, par, piecesHub) {
  if (!ids.length) return { ranges: [], echecs: [] };
  const nomDe = (i) => (par.get(i) && par.get(i).nom) || i;
  try {
    majRegistre((r) => { for (const i of ids) r.rangement[i] = piece; }, piecesHub);
    return { ranges: ids.map((i) => ({ id: i, nom: nomDe(i) })), echecs: [] };
  } catch (e) { return { ranges: [], echecs: ids.map((i) => ({ id: i, nom: nomDe(i), motif: describe(e)[1] })) }; }
}
// Creation dans le service : une seule demande ; sans reponse claire, relecture (jamais de renvoi) -> {id, confirmee} ; leve une HttpError sinon
export async function creerAuService(x, nom, icone, avant) {
  try {
    const r = await borne(() => x.g.creer({ nom, icone }), 10000);
    const id = r && typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : null;
    if (!id) throw new HttpError(502, 'Réponse illisible après la création.');
    return { id, confirmee: true };
  } catch (e) {
    log('pieces : création', x.id, 'sans réponse claire', e.code || e.status || e.name || '');
    let apres = null;
    try { invalider(); apres = piecesValides(await borne(() => x.a.pieces(), 6000)); } catch (e2) { apres = null; }
    if (!apres) throw new HttpError(504, 'Résultat inconnu : vérifiez la liste des pièces avant de réessayer.');
    const t = apres.find((p) => cle(p.name) === cle(nom) && !avant.some((a) => a.id === p.id));
    if (!t) { const [s, m] = describe(e); throw new HttpError(s, 'La pièce n\'a pas été créée. ' + m); }
    return { id: t.id, confirmee: false };
  }
}

async function creer(c) {
  const b = await c.corps();
  await charger();
  const nom = nomValide(b.nom);
  if (!nom) throw new HttpError(400, 'Nom invalide : 1 à ' + MAX_NOM + ' caractères.');
  const ids = listeIds(b.appareils, 'd\'appareils');
  const loc = listeIds(b.locaux, 'd\'appareils indépendants');
  if (!ids.length && !loc.length) throw new HttpError(400, 'Choisissez au moins un appareil.');
  // Piece du hub (au moins un appareil du hub) ou piece locale (appareils independants seulement)
  const x = gestionsPieces().find((y) => y.id === b.adapter) || (!ids.length && !b.adapter ? gestionsPieces()[0] : null);
  if (ids.length && !x) throw new HttpError(404, 'Création de pièce non gérée.');
  const icone = b.icone;
  if (x ? !iconesDe(x).includes(icone) : !(typeof icone === 'string' && /^[a-z]{1,20}$/.test(icone))) throw new HttpError(400, 'Icône inconnue.');
  if (verrou.pris) throw new HttpError(409, 'Une opération sur les pièces est déjà en cours.');
  verrou.pris = true;
  try {
    // 1. Lecture fraiche : rien n'est ecrit si elle echoue
    let avant = { pieces: [], appareils: [] };
    if (x) { try { avant = await lire(x); } catch (e) { const [s, m] = describe(e); throw new HttpError(s, m + ' Rien n\'a été créé.'); } }
    const pris = doublon(nom, avant.pieces, null);
    if (pris) throw new HttpError(409, 'Une pièce « ' + pris.slice(0, 60) + ' » existe déjà.');
    const parId = new Map(avant.appareils.map((d) => [d.id, d]));
    if (ids.some((id) => !parId.has(id))) throw new HttpError(400, 'Appareil inconnu : la liste a changé, rouvrez la fenêtre.');
    const par = await verifierIndependants(loc, null);
    const hubIds = x ? avant.pieces.map((p) => p.id) : null;
    // Piece locale : registre seulement (aucun effet sur le hub)
    if (!ids.length) {
      const id = nouvelleLocale();
      majRegistre((r) => {
        r.locales.push({ id, nom, icone, cree_le: new Date().toISOString() });
        for (const i of loc) r.rangement[i] = id;
      }, hubIds);
      log('pieces : pièce locale créée,', loc.length, 'appareil(s) indépendant(s) rangé(s)');
      return c.envoyer(201, { piece: { id, nom, adapter: null, locale: true }, confirmee: true, deplaces: [], echecs: [], ranges: loc.map((i) => ({ id: i, nom: par.get(i).nom })), time: new Date().toISOString() });
    }
    // 2. Creation dans le hub : une seule demande ; en cas d'echec, relecture (jamais de renvoi)
    const { id, confirmee } = await creerAuService(x, nom, icone, avant.pieces);
    noter({ id, adapter: x.id, nom, cree_le: new Date().toISOString() });
    // 3. Deplacement : une seule demande, jamais renvoyee ni defaite
    let motif = null;
    try { await borne(() => x.g.deplacer(id, ids), 10000); } catch (e) { motif = describe(e)[1]; log('pieces : déplacement', x.id, 'en échec', e.code || e.status || e.name || ''); }
    // 4. Appareils independants ranges localement
    const rl = rangerLocaux(loc, id, par, hubIds.concat(id));
    // 5. Relecture 1 s apres
    invalider();
    await sleep(1000);
    let relus = null;
    try { relus = await withTimeout(lister(x.id), 10000); } catch (e) { relus = null; }
    const deplaces = [], echecs = [];
    for (const i of ids) {
      const d = relus && relus.find((y) => y.id === i);
      if (d && d.room && d.room.id === id) deplaces.push({ id: i, nom: d.name });
      else echecs.push({ id: i, nom: parId.get(i).name, motif: motif || (relus ? 'Non confirmé par le hub.' : 'Relecture impossible.') });
    }
    echecs.push(...rl.echecs);
    log('pieces : pièce créée', x.id + (confirmee ? '' : ' (confirmée par relecture)') + ',', deplaces.length + '/' + ids.length, 'appareil(s) déplacé(s)' + (loc.length ? ', ' + rl.ranges.length + '/' + loc.length + ' indépendant(s) rangé(s)' : ''));
    c.envoyer(echecs.length ? 207 : 201, { piece: { id, nom, adapter: x.id }, confirmee, deplaces, echecs, ranges: rl.ranges, time: new Date().toISOString() });
  } finally { verrou.pris = false; }
}

// Liste legere pour l'accueil, le menu et la vue d'une piece (GET /api/pieces/liste, relue avec chaque actualisation du client) : toutes les pieces
// (du hub et locales) et leurs appareils independants ; hub injoignable : ses pieces absentes, panne. Aucune ecriture.
async function liste() {
  await charger();
  const x = gestionsPieces()[0];
  let hub = [], panne = null;
  if (x) { try { hub = piecesValides(await borne(() => x.a.pieces(), 6000)); } catch (e) { panne = describe(e)[1]; } }
  const reg = lireRegistre(), ind = await independants(), par = {}, autres = [];
  const connues = new Set(hub.map((p) => p.id).concat(reg.locales.map((p) => p.id)));
  for (const d of ind.appareils) {
    const p = reg.rangement[d.id], a = { id: d.id, nom: d.nom, genre: d.genre, origine: d.origine, vue: d.vue };
    if (p && connues.has(p)) (par[p] = par[p] || []).push(a);
    else if (!p || estLocale(p) || (x && !panne)) autres.push(a); // sans pièce, ou pièce disparue : « Autres » (hub injoignable : pièce inconnue, non listé)
  }
  const pieces = hub.map((p) => ({ id: p.id, nom: p.name, icone: p.icone || null, locale: false, independants: par[p.id] || [] }))
    .concat(reg.locales.map((p) => ({ id: p.id, nom: p.nom, icone: p.icone, locale: true, independants: par[p.id] || [] })));
  return { pieces, autres, panne, time: new Date().toISOString() };
}

// Vue d'ensemble pour les fenetres (GET /api/pieces) : cibles (hub), pieces locales, appareils independants et leur piece
async function vue() {
  await charger();
  const [cibles, ind] = await Promise.all([Promise.all(gestionsPieces().map(cible)), independants()]);
  const reg = lireRegistre(), noms = new Map(), nb = {};
  for (const x of cibles) for (const p of x.pieces) noms.set(p.id, p.nom);
  for (const p of reg.locales) noms.set(p.id, p.nom);
  const hubInconnu = cibles.some((x) => x.panne);
  const appareils = ind.appareils.map((d) => {
    const pid = reg.rangement[d.id];
    let piece = null;
    if (pid && noms.has(pid)) piece = { id: pid, nom: noms.get(pid) };
    else if (pid && !estLocale(pid) && hubInconnu) piece = { id: pid, nom: null }; // piece du hub, hub injoignable : nom inconnu
    if (piece) nb[pid] = (nb[pid] || 0) + 1;
    return { id: d.id, nom: d.nom, genre: d.genre, origine: d.origine, piece };
  });
  for (const x of cibles) for (const p of x.pieces) p.independants = nb[p.id] || 0;
  return {
    cibles, locales: reg.locales.map((p) => ({ id: p.id, nom: p.nom, icone: p.icone, independants: nb[p.id] || 0 })),
    independants: appareils, rangement: { pannes: ind.pannes, illisible: reg.illisible }, time: new Date().toISOString(),
  };
}

export const routes = [
  ['GET', '/api/pieces', vue],
  ['GET', '/api/pieces/liste', liste],
  ['POST', '/api/pieces', creer, { corps: CORPS_PIECES }],
];
// FIN
