// @zone equipements | Vue Equipements (V2.1 etape equipements-vue) : GET /api/equipements (equipements composes de tous les hubs, pannes a part, Nouveau, absents du hub, piece),
// POST /api/equipements/vus, POST /api/equipements/oublier, POST /api/equipements/code (code d'appairage sur demande : ecoute locale seulement, une capacite a la fois, jamais journalise) ;
// cycle de vie dans donnees/equipements.json {v: 1, connus: {cle: {vu_le, nom, absent_depuis?}}} (sans secret ni donnee privee ; analyser, suivre : purs, essais banc/unitaires/equipements.test.mjs).
// Preréglages de position communs a tous les stores : GET /api/equipements/positions, POST /api/equipements/positions {position}, POST /api/equipements/positions/supprimer {position}
// (donnees/stores-positions.json {v: 1, positions} ; analyserPositions, ajouterPosition, retirerPosition : purs).
// Icones (V2.1 etape icones) : GET /api/equipements/icones -> {equipements, elements, pack, lisible}, POST /api/equipements/icone {id, icone|null} (donnees/icones.json).
// Alarmes (V2.1 etape alarmes) : GET /api/equipements/alarmes -> {alarmes: [{id, nom, piece, cap, depuis}]}. Presence (V2.2 ha-localisation) : GET /api/equipements/presence ->
// {presence: [{id, nom, zone, maison}]} (personnes, zone seulement).
// Ecriture generique (V2.1 etape ecriture-generique) : POST /api/equipements/:id/capacite {element, cap, valeur?, confirm?, options?} -> {ok, equipement} (core/appareils.mjs ecrireCapacite).
// Contrats « Capacités » et « Données sensibles » de .claude/rules/equipements.md. Lampes et prises de la vue Lumières : leurs routes (inchangées).
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../core/http.mjs';
import { DONNEES, ecrireJson } from '../core/outils.mjs';
import { equipements, codeAppairage, ecrireCapacite } from '../core/appareils.mjs';
import { lireRegistre } from './pieces-registre.mjs';

const FICHIER = 'equipements.json';
export const MAX_CONNUS = 2000;
const OUBLI_MS = 30 * 24 * 3600 * 1000; // absent du hub depuis 30 jours : oublie
const CLE_RE = /^[a-z0-9_-]{1,40}:[A-Za-z0-9_.:-]{1,160}$/;
const date = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null);
const nom = (v) => (typeof v === 'string' ? v.slice(0, 60) : '');

// Lecture tolerante (texte, ou null si absent) -> {connus, lisible, absent}. Illisible (JSON invalide, autre chose qu'un objet, connus qui n'est pas un objet) : lisible false
// (jamais reecrit, ecritures refusees) ; entrees invalides ignorees ; champs inconnus d'une entree ignores (une version suivante peut en ajouter).
export function analyser(texte) {
  if (texte === null || texte === undefined) return { connus: {}, lisible: true, absent: true };
  let j;
  try { j = JSON.parse(texte); } catch (e) { return { connus: {}, lisible: false, absent: false }; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || (j.connus !== undefined && (!j.connus || typeof j.connus !== 'object' || Array.isArray(j.connus)))) return { connus: {}, lisible: false, absent: false };
  const connus = {};
  for (const [k, v] of Object.entries(j.connus || {})) {
    if (!CLE_RE.test(k) || !v || typeof v !== 'object' || Object.keys(connus).length >= MAX_CONNUS) continue;
    const e = { vu_le: date(v.vu_le), nom: nom(v.nom) };
    if (date(v.absent_depuis)) e.absent_depuis = v.absent_depuis;
    connus[k] = e;
  }
  return { connus, lisible: true, absent: false };
}

// Suivi pur : connus (copie modifiee), liste rendue par les hubs [{id, nom}], repondu (adaptateurs qui ont repondu), maintenant (ms), init (fichier absent : tout ce qui est vu
// est connu d'office, rien n'est « Nouveau » a la premiere lecture apres la mise a jour). Rend {connus, change, nouveaux: Set, absents: [{id, nom, absent_depuis}]}.
// Absent : cle connue d'un adaptateur qui a repondu, absente de sa liste (un hub en panne ou en retrait ne rend jamais ses equipements absents) ; revenu : absent_depuis retire ;
// absent depuis plus de OUBLI_MS : oublie. Nom suivi (carte d'un absent). Plafond MAX_CONNUS : au-dela, un nouvel equipement reste « Nouveau » sans etre note.
export function suivre(connus0, liste, repondu, maintenant, init) {
  const connus = {};
  for (const [k, v] of Object.entries(connus0 || {})) connus[k] = { ...v };
  const iso = new Date(maintenant).toISOString(), ids = new Set(), nouveaux = new Set();
  let change = false;
  for (const e of liste) {
    ids.add(e.id);
    const c = connus[e.id];
    if (!c) {
      if (init && Object.keys(connus).length < MAX_CONNUS) { connus[e.id] = { vu_le: iso, nom: nom(e.nom) }; change = true; } else nouveaux.add(e.id);
      continue;
    }
    if (c.absent_depuis) { delete c.absent_depuis; change = true; }
    if (nom(e.nom) && c.nom !== nom(e.nom)) { c.nom = nom(e.nom); change = true; }
  }
  const absents = [];
  for (const [k, c] of Object.entries(connus)) {
    if (ids.has(k) || !repondu.includes(k.split(':')[0])) { if (!ids.has(k) && c.absent_depuis) absents.push({ id: k, nom: c.nom, absent_depuis: c.absent_depuis }); continue; }
    if (!c.absent_depuis) { c.absent_depuis = iso; change = true; }
    if (maintenant - Date.parse(c.absent_depuis) > OUBLI_MS) { delete connus[k]; change = true; continue; }
    absents.push({ id: k, nom: c.nom, absent_depuis: c.absent_depuis });
  }
  return { connus, change, nouveaux, absents };
}

// Preréglages de position des stores (communs a tous, comme les couleurs personnalisees) : entiers 0-100, uniques, tries, MAX_POSITIONS au plus ; absent = DEFAUT_POSITIONS
// (rien n'est ecrit avant un changement) ; illisible (JSON invalide, positions qui n'est pas une liste) : lisible false, jamais reecrit, ecritures refusees ; valeurs invalides ignorees.
const FICHIER_POSITIONS = 'stores-positions.json';
export const MAX_POSITIONS = 8;
const DEFAUT_POSITIONS = Object.freeze([0, 10, 50, 80, 100]);
const position = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
const ranger = (l) => [...new Set(l.filter(position))].sort((a, b) => a - b).slice(0, MAX_POSITIONS);
export function analyserPositions(texte) {
  if (texte === null || texte === undefined) return { positions: [...DEFAUT_POSITIONS], lisible: true, absent: true };
  let j;
  try { j = JSON.parse(texte); } catch (e) { return { positions: [...DEFAUT_POSITIONS], lisible: false, absent: false }; }
  if (!j || typeof j !== 'object' || !Array.isArray(j.positions)) return { positions: [...DEFAUT_POSITIONS], lisible: false, absent: false };
  return { positions: ranger(j.positions), lisible: true, absent: false };
}
export function ajouterPosition(l, x) {
  if (!position(x)) throw new HttpError(400, 'Position invalide (0 à 100 %).');
  if (l.includes(x)) return ranger(l);
  if (l.length >= MAX_POSITIONS) throw new HttpError(409, 'Déjà ' + MAX_POSITIONS + ' préréglages : supprimez-en un d\'abord.');
  return ranger(l.concat([x]));
}
export function retirerPosition(l, x) {
  if (!position(x)) throw new HttpError(400, 'Position invalide (0 à 100 %).');
  return ranger(l.filter((v) => v !== x));
}
// Lecture d'un fichier de donnees/ : texte (null s'il est absent) passe a l'analyseur ; autre erreur : vide() (illisible, jamais reecrit).
function lireDonnee(fichier, analyseur, vide) {
  let t = null;
  try { t = fs.readFileSync(path.join(DONNEES, fichier), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') return { ...vide(), lisible: false, absent: false }; }
  return analyseur(t);
}
const lirePositions = () => lireDonnee(FICHIER_POSITIONS, analyserPositions, () => ({ positions: [...DEFAUT_POSITIONS] }));
const ILLISIBLE_POS = 'Préréglages des stores illisibles sur le serveur (stores-positions.json) : rien n\'a été enregistré.';
function changerPositions(fn) {
  const f = lirePositions();
  if (!f.lisible) throw new HttpError(409, ILLISIBLE_POS);
  const positions = fn(f.positions);
  if (positions.join() !== f.positions.join() || f.absent) ecrireJson(FICHIER_POSITIONS, { v: 1, positions }, 1);
  return { positions, lisible: true, time: new Date().toISOString() };
}

// Icones choisies (V2.1 etape icones ; cartes §4) : donnees/icones.json {v: 1, equipements: {id d'equipement: nom}} (fichier a part : une version precedente qui reecrit
// equipements.json ne les efface pas ; absent = icones par defaut ; illisible : jamais reecrit, ecritures refusees ; ignore par une version precedente ; 2000 au plus ; dans sauvegarde.sh).
// Nouvelle icone d'equipement : ICONES_EQUIPEMENTS ici ET PACK de public/icones.js (meme liste, meme ordre).
const FICHIER_ICONES = 'icones.json';
export const ICONES_EQUIPEMENTS = Object.freeze([
  'porte', 'fenetre', 'garage', 'portail', 'volet', 'store', 'baie', 'boite_lettres',
  'ampoule', 'plafonnier', 'lampadaire', 'lampe_bureau', 'applique', 'guirlande', 'spot', 'ruban',
  'prise', 'tv', 'enceinte', 'purificateur', 'ventilateur', 'radiateur', 'lave_linge', 'cafetiere',
  'capteur', 'thermometre', 'goutte', 'mouvement', 'telecommande', 'bouton', 'hub', 'cadenas',
]);
export function analyserIcones(texte) {
  if (texte === null || texte === undefined) return { icones: {}, lisible: true, absent: true };
  let j;
  try { j = JSON.parse(texte); } catch (e) { return { icones: {}, lisible: false, absent: false }; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || (j.equipements !== undefined && (!j.equipements || typeof j.equipements !== 'object' || Array.isArray(j.equipements)))) return { icones: {}, lisible: false, absent: false };
  const icones = {};
  for (const [k, v] of Object.entries(j.equipements || {})) if (CLE_RE.test(k) && ICONES_EQUIPEMENTS.includes(v) && Object.keys(icones).length < MAX_CONNUS) icones[k] = v;
  return { icones, lisible: true, absent: false };
}
// Icone posee (nom du pack) ou retiree (null : icone par defaut) ; rend une copie ; refus : HttpError 400
export function poserIcone(icones, id, nomIcone) {
  if (typeof id !== 'string' || !CLE_RE.test(id)) throw new HttpError(400, 'Équipement invalide.');
  if (nomIcone !== null && !ICONES_EQUIPEMENTS.includes(nomIcone)) throw new HttpError(400, 'Icône inconnue.');
  const n = { ...icones };
  if (nomIcone === null) delete n[id]; else { if (!n[id] && Object.keys(n).length >= MAX_CONNUS) throw new HttpError(409, 'Trop d\'icônes enregistrées.'); n[id] = nomIcone; }
  return n;
}
const lireIcones = () => lireDonnee(FICHIER_ICONES, analyserIcones, () => ({ icones: {} }));

const lire = () => lireDonnee(FICHIER, analyser, () => ({ connus: {} }));
// Piece affichee de chaque equipement (pieceDe : rangement local, pieces locales, pieces du hub vues dans la liste).
function avecPieces(liste) {
  const reg = lireRegistre(), piecesHub = new Map();
  for (const e of liste) if (e.piece && e.piece.id) piecesHub.set(e.piece.id, String(e.piece.name || e.piece.id));
  return liste.map((e) => ({ ...e, piece: pieceDe(e, reg.rangement, reg.locales, piecesHub) }));
}
const ecrire = (connus) => ecrireJson(FICHIER, { v: 1, connus }, 1);
const ILLISIBLE = 'Suivi des équipements illisible sur le serveur (equipements.json) : rien n\'a été enregistré.';

// Piece d'un equipement : rangement local d'un de ses elements (pieces.json : piece locale, ou piece d'un hub connue par un equipement), sinon celle du hub, sinon « Autres ».
export function pieceDe(e, rangement, locales, piecesHub) {
  for (const el of e.elements || []) {
    const p = rangement[el];
    if (!p) continue;
    const l = locales.find((x) => x.id === p);
    if (l) return { id: l.id, name: l.nom };
    if (piecesHub.has(p)) return { id: p, name: piecesHub.get(p) };
  }
  return e.piece && e.piece.id ? { id: e.piece.id, name: String(e.piece.name || e.piece.id) } : { id: null, name: 'Autres' };
}

const pour = (s) => typeof s === 'string' && s.length <= 200;
// Alarmes en cours (V2.1 etape alarmes ; cartes §3) : capacites d'alerte (fuite, fumee, monoxyde, gaz) vraies d'un equipement present -> [{id, nom, piece, cap, depuis}]
// (depuis : heure retenue par le serveur, ou null) ; plus recente d'abord, sans heure ensuite (ordre du nom) ; 20 au plus. Pur (banc/unitaires/equipements.test.mjs).
const ALERTES = ['fuite', 'fumee', 'monoxyde', 'gaz'];
export function alarmes(liste) {
  const r = [];
  for (const e of liste || []) {
    if (!e || e.absent || !Array.isArray(e.capacites)) continue;
    for (const c of e.capacites) if (c && ALERTES.includes(c.cap) && c.valeur === true) r.push({ id: e.id, nom: nom(e.nom), piece: e.piece && e.piece.name ? nom(e.piece.name) : null, cap: c.cap, depuis: date(c.depuis) });
  }
  return r.sort((a, b) => (b.depuis || '').localeCompare(a.depuis || '') || a.nom.localeCompare(b.nom, 'fr') || a.cap.localeCompare(b.cap)).slice(0, 20);
}
// Presence (V2.2 ha-localisation ; carte « Présence » de l'accueil, public/presence.js) : personnes (capacite localisation marquee personne) d'un equipement present -> [{id, nom, zone, maison}]
// (zone : texte de la capacite, « À la maison », « Absent » ou nom de zone ; jamais de coordonnees) ; ordre du nom ; 12 au plus. Pur (banc/unitaires/equipements.test.mjs).
export function presence(liste) {
  const r = [];
  for (const e of liste || []) {
    if (!e || e.absent || !Array.isArray(e.capacites)) continue;
    const c = e.capacites.find((x) => x && x.cap === 'localisation' && x.personne === true);
    if (c) r.push({ id: e.id, nom: nom(e.nom), zone: typeof c.valeur === 'string' && c.valeur.length <= 200 ? c.valeur : null, maison: c.maison === true });
  }
  return r.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)).slice(0, 12);
}
export const routes = [
  // ?frais=1 : sans le cache court (bouton Actualiser de la vue)
  ['GET', '/api/equipements', async (c) => {
    const frais = /[?&]frais=1(&|$)/.test(String(c.req.url || ''));
    const r = await equipements(frais);
    const f = lire();
    const s = suivre(f.connus, r.equipements, r.repondu, Date.now(), f.absent);
    let lisible = f.lisible;
    if (f.lisible && s.change && (!f.absent || r.repondu.length)) { try { ecrire(s.connus); } catch (e) { lisible = false; } }
    const ic = lireIcones().icones;
    const liste = avecPieces(r.equipements).map((e) => ({ ...e, nouveau: f.lisible && s.nouveaux.has(e.id), ...(ic[e.id] ? { icone: ic[e.id] } : {}) }));
    for (const a of s.absents) {
      liste.push({ id: a.id, adapter: a.id.split(':')[0], nom: a.nom || '(sans nom)', absent: true, absent_depuis: a.absent_depuis, joignable: false, piece: { id: null, name: 'Autres' },
        elements: [], capacites: [], codes: [], inconnues: 0, nouveau: false });
    }
    return { equipements: liste, pannes: r.pannes, lisible, distant: !!c.req.distant, time: new Date().toISOString() };
  }],
  // Alarmes en cours (bandeau de toutes les vues, public/alarmes.js) : liste courte, depuis le cache court des equipements
  ['GET', '/api/equipements/alarmes', async () => {
    const r = await equipements(false);
    return { alarmes: alarmes(avecPieces(r.equipements)), time: new Date().toISOString() };
  }],
  // Presence (V2.2 ha-localisation) : carte « Présence » de l'accueil, depuis le cache court des equipements ; zone seulement, jamais de coordonnees
  ['GET', '/api/equipements/presence', async () => {
    const r = await equipements(false);
    return { presence: presence(r.equipements), time: new Date().toISOString() };
  }],
  // Icones (etape icones) : par equipement et par element (une lampe : la meme icone dans les vues Lumieres et Equipements)
  ['GET', '/api/equipements/icones', async () => {
    const f = lireIcones(), elements = {};
    if (Object.keys(f.icones).length) {
      const r = await equipements(false);
      for (const e of r.equipements) if (f.icones[e.id]) for (const x of e.elements || []) if (typeof x === 'string') elements[x] = f.icones[e.id];
    }
    return { equipements: f.icones, elements, pack: ICONES_EQUIPEMENTS, lisible: f.lisible, time: new Date().toISOString() };
  }],
  // {id, icone: nom du pack | null (icone par defaut)}
  ['POST', '/api/equipements/icone', async (c) => {
    const b = await c.corps();
    if (!b || (b.icone !== null && typeof b.icone !== 'string')) throw new HttpError(400, 'Icône invalide.');
    const f = lireIcones();
    if (!f.lisible) throw new HttpError(409, 'Icônes illisibles sur le serveur (icones.json) : rien n\'a été enregistré.');
    const n = poserIcone(f.icones, b.id, b.icone);
    ecrireJson(FICHIER_ICONES, { v: 1, equipements: n }, 1);
    return { ok: true, equipements: n, time: new Date().toISOString() };
  }],
  // {ids: [identifiants d'equipements vus]} : « Nouveau » retire (equipements actuellement rendus par un hub seulement)
  ['POST', '/api/equipements/vus', async (c) => {
    const b = await c.corps();
    if (!b || !Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500 || !b.ids.every((i) => typeof i === 'string' && CLE_RE.test(i))) throw new HttpError(400, 'Liste d\'équipements invalide.');
    const f = lire();
    if (!f.lisible) throw new HttpError(409, ILLISIBLE);
    const r = await equipements(false), par = new Map(r.equipements.map((e) => [e.id, e]));
    let n = 0;
    for (const i of b.ids) {
      const e = par.get(i);
      if (!e || f.connus[i] || Object.keys(f.connus).length >= MAX_CONNUS) continue;
      f.connus[i] = { vu_le: new Date().toISOString(), nom: nom(e.nom) }; n++;
    }
    if (n) ecrire(f.connus);
    return { ok: true, vus: n, time: new Date().toISOString() };
  }, { corps: 128 * 1024 }],
  // {id, confirm: true} : equipement absent du hub oublie (son rangement dans pieces.json est garde)
  ['POST', '/api/equipements/oublier', async (c) => {
    const b = await c.corps();
    if (!b || b.confirm !== true || typeof b.id !== 'string' || !CLE_RE.test(b.id)) throw new HttpError(400, 'Confirmation requise.');
    const f = lire();
    if (!f.lisible) throw new HttpError(409, ILLISIBLE);
    const e = f.connus[b.id];
    if (!e || !e.absent_depuis) throw new HttpError(409, 'Équipement présent sur le hub : il ne peut pas être oublié.');
    delete f.connus[b.id];
    ecrire(f.connus);
    return { ok: true, time: new Date().toISOString() };
  }],
  ['GET', '/api/equipements/positions', async () => { const f = lirePositions(); return { positions: f.positions, lisible: f.lisible, time: new Date().toISOString() }; }],
  ['POST', '/api/equipements/positions', async (c) => { const b = await c.corps(); return changerPositions((l) => ajouterPosition(l, b && b.position)); }],
  ['POST', '/api/equipements/positions/supprimer', async (c) => { const b = await c.corps(); return changerPositions((l) => retirerPosition(l, b && b.position)); }],
  // {element, cap, valeur?, confirm?, options?} (options, V2.2 ha-ouvrants : code d'alarme ou de serrure, ton, volume, duree ; jamais gardees ni journalisees) : une capacite ecrivable de l'equipement (validee par son descripteur ; une commande a la fois par equipement ; relu 1 s apres)
  ['POST', /^\/api\/equipements\/([^/]{1,220})\/capacite$/, async (c) => {
    let id;
    try { id = decodeURIComponent(c.m[1]); } catch (e) { throw new HttpError(400, 'Équipement invalide.'); }
    const b = await c.corps();
    if (!CLE_RE.test(id) || !b || !pour(b.element) || !b.element || !pour(b.cap) || !/^[a-z_]{1,40}$/.test(b.cap)) throw new HttpError(400, 'Commande invalide.');
    const e = await ecrireCapacite(id, b.element, b.cap, b.valeur === undefined ? null : b.valeur, b.confirm === true, b.options);
    return { ok: true, equipement: e, time: new Date().toISOString() };
  }],
  // {id, element, cap} : code d'appairage (capacite secrete) d'un element, sur demande ; ecoute locale seulement (contrat « Mode distant » : req.distant pose par server.mjs) ;
  // une capacite a la fois ; jamais journalise ni garde (reponse no-store de core/http.mjs) ; refuse en mode distant meme pour un appareil autorise.
  ['POST', '/api/equipements/code', async (c) => {
    if (c.req.distant) throw new HttpError(403, 'Le code d\'appairage s\'affiche sur la machine du serveur seulement.');
    const b = await c.corps();
    if (!b || !pour(b.id) || !CLE_RE.test(b.id) || !pour(b.element) || !b.element || !pour(b.cap) || !b.cap) throw new HttpError(400, 'Demande invalide.');
    const k = await codeAppairage(b.id, b.element, b.cap);
    if (!k) throw new HttpError(404, 'Aucun code d\'appairage pour cet élément.');
    return { code: { libelle: k.libelle, valeur: k.valeur }, time: new Date().toISOString() };
  }],
];
// FIN
