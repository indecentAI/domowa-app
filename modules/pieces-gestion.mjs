// @zone pieces | Modification et suppression des pieces (contrat gestionPieces : modifier, supprimer, contenu ; registre local : modules/pieces-registre.mjs ;
// CLAUDE.md « Pièces » ; aucun nom de marque) : POST /api/pieces/:id/modifier {adapter, nom, icone?, ajouter?, locaux?} et
// POST /api/pieces/:id/supprimer {adapter, confirm: true, destination?}. Piece du hub : chaque ecriture est envoyee une seule fois, jamais renvoyee ni defaite ;
// sans reponse claire, relecture ; une operation a la fois (verrou commun avec la creation). Une piece du hub n'est supprimee que vide : ses appareils
// (tous, telecommandes comprises) sont d'abord ranges dans la destination (une piece du hub), puis relus ; s'il en reste, rien n'est supprime ; ensuite
// plan retire de layout.json, supprimee_le dans pieces-creees.json. Piece locale (loc-...) : registre seulement ; un appareil du hub ajoute la cree dans
// le hub (nom, icone), l'id local devient celui du hub dans le rangement. Appareils independants (locaux : liste complete voulue) : registre seulement,
// ceux d'une piece supprimee vont dans la destination, sinon redeviennent sans piece.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, describe } from '../core/http.mjs';
import { DONNEES, log, sleep, withTimeout, borne, lireJson, ecrireJson } from '../core/outils.mjs';
import { charger, gestionsPieces, invalider, lister } from '../core/appareils.mjs';
import { nomValide, MAX_NOM, iconesDe, piecesValides, lire, contenu, peut, majNotes, verrou, listeIds, doublon, verifierIndependants, creerAuService, CORPS_PIECES } from './pieces-creation.mjs';
import { lireRegistre, majRegistre, estLocale, independants } from './pieces-registre.mjs';
import { ID_RE } from '../core/modele.mjs';

const maintenant = () => new Date().toISOString();
const noter = (p) => majNotes((l) => l.push(p), 'création');
const raison = (e) => (e && (e.code || e.status || e.name)) || '';
const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

async function cibleDe(b, quoi) {
  await charger();
  const x = gestionsPieces().find((y) => y.id === b.adapter);
  if (!x || !peut(x)[quoi]) throw new HttpError(404, quoi === 'modifier' ? 'Modification de pièce non gérée.' : 'Suppression de pièce non gérée.');
  return x;
}
async function avecVerrou(fn) {
  if (verrou.pris) throw new HttpError(409, 'Une opération sur les pièces est déjà en cours.');
  verrou.pris = true;
  try { return await fn(); } finally { verrou.pris = false; }
}
// Relecture apres une ecriture sans reponse claire : pieces, ou null si impossible
async function relirePieces(x) {
  invalider();
  try { return piecesValides(await borne(() => x.a.pieces(), 6000)); } catch (e) { return null; }
}
// Appareils et leur piece : tous si l'adaptateur le declare (contenu), sinon ses appareils ON/OFF
async function appareils(x) {
  const t = await contenu(x);
  if (t) return t;
  return (await withTimeout(lister(x.id), 10000)).map((d) => ({ id: d.id, nom: d.name, piece: d.room ? d.room.id : null }));
}
// Rangement de ids dans la piece : une seule demande, jamais renvoyee ni defaite ; relecture 1 s apres -> {deplaces, echecs, relus (null si impossible)}
async function ranger(x, piece, ids, nomDe) {
  let motif = null;
  try { await borne(() => x.g.deplacer(piece, ids), 10000); } catch (e) { motif = describe(e)[1]; log('pieces : déplacement', x.id, 'en échec', raison(e)); }
  invalider();
  await sleep(1000);
  let relus = null;
  try { relus = await appareils(x); } catch (e) { relus = null; }
  const deplaces = [], echecs = [];
  for (const i of ids) {
    const d = relus && relus.find((y) => y.id === i);
    if (d && d.piece === piece) deplaces.push({ id: i, nom: d.nom });
    else echecs.push({ id: i, nom: nomDe(i), motif: motif || (relus ? 'Non confirmé par le hub.' : 'Relecture impossible.') });
  }
  return { deplaces, echecs, relus };
}
// Plan de la piece retire (layout.json) ; fichier illisible jamais reecrit
function oublierPlan(id) {
  if (!fs.existsSync(path.join(DONNEES, 'layout.json'))) return;
  const j = lireJson('layout.json', null);
  if (!j || typeof j !== 'object' || Array.isArray(j)) { log('pieces : layout.json illisible, plan de la pièce supprimée gardé'); return; }
  if (!Object.prototype.hasOwnProperty.call(j, id)) return;
  delete j[id];
  ecrireJson('layout.json', j);
}

// Rangement complet des appareils independants d'une piece (registre) : « locaux » = liste voulue ; les autres de la piece redeviennent sans piece,
// sauf ceux qui ne sont pas visibles en ce moment (vus : ids rendus par les adaptateurs ; V1.7 : adaptateur en panne ou appareils masques, ex. cloud
// SmartThings injoignable) : le client ne les a pas vus, leur rangement est garde.
export function rangementComplet(r, piece, locaux, vus) {
  for (const a of Object.keys(r.rangement)) if (r.rangement[a] === piece && !locaux.includes(a) && vus.has(a)) delete r.rangement[a];
  for (const a of locaux) r.rangement[a] = piece;
}
// Lecture fraiche du hub pour une piece locale (doublons, promotion) : {pieces, appareils} ; vide sans hub
async function lireHub(x, quoi) {
  if (!x) return { pieces: [], appareils: [] };
  try { return await lire(x); } catch (e) { const [s, m] = describe(e); throw new HttpError(s, m + ' Rien n\'a été ' + quoi + '.'); }
}

async function modifier(c) {
  const id = c.m[1], b = await c.corps();
  const locale = estLocale(id);
  await charger();
  const x = locale ? (gestionsPieces().find((y) => y.id === b.adapter) || gestionsPieces()[0] || null) : await cibleDe(b, 'modifier');
  const nom = nomValide(b.nom);
  if (!nom) throw new HttpError(400, 'Nom invalide : 1 à ' + MAX_NOM + ' caractères.');
  const icone = b.icone === undefined || b.icone === null ? null : b.icone;
  if (icone !== null && (x ? !iconesDe(x).includes(icone) : !/^[a-z]{1,20}$/.test(String(icone)))) throw new HttpError(400, 'Icône inconnue.');
  const ids = listeIds(b.ajouter, 'd\'appareils');
  const locaux = b.locaux === undefined ? null : listeIds(b.locaux, 'd\'appareils indépendants');
  if (locale && ids.length && !x) throw new HttpError(404, 'Aucun hub pour y créer la pièce.');
  return avecVerrou(async () => {
    // 1. Lecture fraiche : rien n'est ecrit si elle echoue
    const avant = await lireHub(x, 'modifié');
    const reg = lireRegistre();
    const p = locale ? (reg.locales.find((q) => q.id === id) && { id, name: reg.locales.find((q) => q.id === id).nom, icone: reg.locales.find((q) => q.id === id).icone }) : avant.pieces.find((q) => q.id === id);
    if (!p) throw new HttpError(404, 'Pièce introuvable : la liste a changé, rouvrez la fenêtre.');
    const pris = doublon(nom, avant.pieces, id);
    if (pris) throw new HttpError(409, 'Une pièce « ' + pris.slice(0, 60) + ' » existe déjà.');
    const parId = new Map(avant.appareils.map((d) => [d.id, d]));
    if (ids.some((i) => !parId.has(i))) throw new HttpError(400, 'Appareil inconnu : la liste a changé, rouvrez la fenêtre.');
    const par = await verifierIndependants(locaux || [], id);
    const vus = locaux ? new Set((await independants()).appareils.map((d) => d.id)) : null; // appareils independants visibles a l'instant
    const hubIds = x ? avant.pieces.map((q) => q.id) : null;
    const change = nom !== p.name || (icone !== null && icone !== p.icone);

    // Piece locale sans appareil du hub ajoute : registre seulement
    if (locale && !ids.length) {
      majRegistre((r) => {
        const q = r.locales.find((y) => y.id === id);
        q.nom = nom; if (icone !== null) q.icone = icone;
        if (locaux) rangementComplet(r, id, locaux, vus);
      }, hubIds);
      log('pieces : pièce locale modifiée');
      return c.envoyer(200, { piece: { id, nom, adapter: null, locale: true }, modifiee: change, confirmee: true, deplaces: [], echecs: [], ranges: (locaux || []).map((i) => ({ id: i, nom: (par.get(i) || {}).nom || i })), time: maintenant() });
    }

    // Piece locale qui recoit un appareil du hub : creee dans le hub (nom, icone), puis appareils ranges, puis registre (id local -> id du hub)
    let hubId = id, confirmee = true, promue = false;
    if (locale) {
      const ic = icone !== null ? icone : (iconesDe(x).includes(p.icone) ? p.icone : iconesDe(x)[0]);
      const r = await creerAuService(x, nom, ic, avant.pieces);
      hubId = r.id; confirmee = r.confirmee; promue = true;
      noter({ id: hubId, adapter: x.id, nom, cree_le: maintenant() });
      try {
        majRegistre((rg) => {
          rg.locales = rg.locales.filter((y) => y.id !== id);
          for (const a of Object.keys(rg.rangement)) if (rg.rangement[a] === id) rg.rangement[a] = hubId;
        }, hubIds.concat(hubId));
      } catch (e) { log('pieces : registre local non mis à jour après la création dans le hub', raison(e)); }
    } else if (change) {
      // 2. Nom et icone : une seule demande ; sans reponse claire, relecture
      try { await borne(() => x.g.modifier(id, { nom, icone }), 10000); } catch (e) {
        log('pieces : modification', x.id, 'sans réponse claire', raison(e));
        const apres = await relirePieces(x);
        if (!apres) throw new HttpError(504, 'Résultat inconnu : vérifiez la pièce avant de réessayer.');
        const q = apres.find((r) => r.id === id);
        if (!(q && q.name === nom && (icone === null || q.icone === icone))) { const [s, m] = describe(e); throw new HttpError(s, 'La pièce n\'a pas été modifiée. ' + m); }
        confirmee = false;
      }
      majNotes((l) => { const n = l.find((y) => y.id === id && y.adapter === x.id); if (!n) return false; n.nom = nom; }, 'renommage');
    }
    // 3. Appareils du hub ajoutes : un seul deplacement, jamais renvoye ni defait
    const aRanger = ids.filter((i) => !(parId.get(i).room && parId.get(i).room.id === hubId));
    const r = aRanger.length ? await ranger(x, hubId, aRanger, (i) => parId.get(i).name) : { deplaces: [], echecs: [] };
    // 4. Appareils independants (registre)
    let ranges = [];
    if (locaux) {
      try { majRegistre((rg) => rangementComplet(rg, hubId, locaux, vus), hubIds.concat(hubId)); ranges = locaux.map((i) => ({ id: i, nom: (par.get(i) || {}).nom || i })); }
      catch (e) { r.echecs.push(...locaux.map((i) => ({ id: i, nom: (par.get(i) || {}).nom || i, motif: describe(e)[1] }))); }
    }
    log('pieces : pièce modifiée', x.id + (promue ? ' (pièce locale créée dans le hub)' : change ? (confirmee ? '' : ' (confirmée par relecture)') : ' (nom et icône inchangés)') + ',', r.deplaces.length + '/' + aRanger.length, 'appareil(s) ajouté(s)');
    c.envoyer(r.echecs.length ? 207 : 200, { piece: { id: hubId, nom, adapter: x.id }, modifiee: change || promue, confirmee, promue, ancienId: promue ? id : undefined, deplaces: r.deplaces, echecs: r.echecs, ranges, time: maintenant() });
  });
}

async function supprimer(c) {
  const id = c.m[1], b = await c.corps();
  if (b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
  const locale = estLocale(id);
  await charger();
  const x = locale ? (gestionsPieces()[0] || null) : await cibleDe(b, 'supprimer');
  const dest = b.destination === undefined || b.destination === null ? null : b.destination;
  if (dest !== null && (typeof dest !== 'string' || !ID_RE.test(dest) || dest === id)) throw new HttpError(400, 'Pièce de destination invalide.');
  return avecVerrou(async () => {
    const reg = lireRegistre();
    // Piece locale : registre seulement ; ses appareils independants vont dans la destination, sinon redeviennent sans piece
    if (locale) {
      const p = reg.locales.find((q) => q.id === id);
      if (!p) throw new HttpError(404, 'Pièce introuvable : la liste a changé, rouvrez la fenêtre.');
      let destination = null, hubIds = null;
      if (dest !== null) {
        const l = reg.locales.find((q) => q.id === dest);
        if (l) destination = { id: l.id, nom: l.nom };
        else {
          const h = await lireHub(x, 'supprimé');
          hubIds = h.pieces.map((q) => q.id);
          const q = h.pieces.find((y) => y.id === dest);
          if (!q) throw new HttpError(400, 'Pièce de destination introuvable : la liste a changé, rouvrez la fenêtre.');
          destination = { id: q.id, nom: q.name };
        }
      }
      let n = 0;
      majRegistre((r) => {
        r.locales = r.locales.filter((y) => y.id !== id);
        for (const a of Object.keys(r.rangement)) if (r.rangement[a] === id) { n++; if (destination) r.rangement[a] = destination.id; else delete r.rangement[a]; }
      }, hubIds);
      log('pieces : pièce locale supprimée,', n, 'appareil(s) indépendant(s)', destination ? 'rangé(s) ailleurs' : 'sans pièce');
      return c.envoyer(200, { piece: { id, nom: p.nom, adapter: null, locale: true }, supprimee: true, confirmee: true, destination, deplaces: [], echecs: [], independants: n, time: maintenant() });
    }
    // 1. Lecture fraiche (pieces et tous les appareils) : rien n'est ecrit si elle echoue
    let pieces, tous;
    try {
      invalider();
      [pieces, tous] = await Promise.all([borne(() => x.a.pieces(), 10000).then(piecesValides), appareils(x)]);
    } catch (e) { const [s, m] = describe(e); throw new HttpError(s, m + ' Rien n\'a été supprimé.'); }
    const p = pieces.find((q) => q.id === id);
    if (!p) throw new HttpError(404, 'Pièce introuvable : la liste a changé, rouvrez la fenêtre.');
    const piece = { id, nom: p.name, adapter: x.id };
    const dedans = tous.filter((d) => d.piece === id);
    let destination = null;
    if (dest !== null) {
      const d = pieces.find((q) => q.id === dest), l = reg.locales.find((q) => q.id === dest);
      if (!d && !l) throw new HttpError(400, 'Pièce de destination introuvable : la liste a changé, rouvrez la fenêtre.');
      if (!d && dedans.length) throw new HttpError(400, 'Les appareils du hub ne peuvent aller que dans une pièce du hub.');
      destination = d ? { id: d.id, nom: d.name } : { id: l.id, nom: l.nom };
    }
    if (dedans.length && !destination) {
      if (pieces.length < 2) throw new HttpError(409, 'Pièce non vide et aucune autre pièce où ranger ses appareils : créez-en une d\'abord.');
      throw new HttpError(400, 'Choisissez la pièce où ranger ses ' + pluriel(dedans.length, 'appareil') + '.');
    }
    // 2. Appareils ranges dans la destination (une seule demande), puis relus : la piece doit etre vide, sinon rien n'est supprime
    let deplaces = [], echecs = [];
    if (dedans.length) {
      const r = await ranger(x, destination.id, dedans.map((d) => d.id), (i) => dedans.find((d) => d.id === i).nom);
      deplaces = r.deplaces; echecs = r.echecs;
      const restent = r.relus ? r.relus.filter((d) => d.piece === id).length : null;
      if (restent !== 0) {
        log('pieces : suppression', x.id, 'abandonnée, pièce non vide après le déplacement');
        return c.envoyer(207, { piece, supprimee: false, confirmee: true, destination, deplaces, echecs, time: maintenant(),
          message: restent === null ? 'Rien n\'a été supprimé : relecture impossible après le déplacement.' : 'Rien n\'a été supprimé : ' + pluriel(restent, 'appareil') + ' ' + (restent > 1 ? 'restent' : 'reste') + ' dans la pièce.' });
      }
    }
    // 3. Suppression : une seule demande ; sans reponse claire, relecture
    let confirmee = true;
    try { await borne(() => x.g.supprimer(id), 10000); } catch (e) {
      log('pieces : suppression', x.id, 'sans réponse claire', raison(e));
      const apres = await relirePieces(x);
      const [s, m] = describe(e);
      if (!apres) return c.envoyer(504, { error: 'Résultat inconnu : vérifiez la liste des pièces avant de réessayer.', piece, supprimee: null, destination, deplaces, echecs, time: maintenant() });
      if (apres.some((q) => q.id === id)) {
        if (!deplaces.length) throw new HttpError(s, 'La pièce n\'a pas été supprimée. ' + m);
        return c.envoyer(207, { piece, supprimee: false, confirmee: true, destination, deplaces, echecs, message: 'La pièce n\'a pas été supprimée (ses appareils ont été rangés). ' + m, time: maintenant() });
      }
      confirmee = false;
    }
    // 4. Suppression faite : plan oublie, trace dans pieces-creees.json, appareils independants dans la destination (sinon sans piece)
    invalider();
    oublierPlan(id);
    majNotes((l) => { const n = l.find((y) => y.id === id && y.adapter === x.id); if (!n) return false; n.supprimee_le = maintenant(); }, 'suppression');
    let n = 0;
    try {
      majRegistre((r) => { for (const a of Object.keys(r.rangement)) if (r.rangement[a] === id) { n++; if (destination) r.rangement[a] = destination.id; else delete r.rangement[a]; } },
        pieces.map((q) => q.id).filter((q) => q !== id));
    } catch (e) { log('pieces : registre local non mis à jour après la suppression', raison(e)); }
    log('pieces : pièce supprimée', x.id + (confirmee ? '' : ' (confirmée par relecture)') + ',', deplaces.length, 'appareil(s) rangé(s) avant,', n, 'indépendant(s)');
    c.envoyer(200, { piece, supprimee: true, confirmee, destination, deplaces, echecs, independants: n, time: maintenant() });
  });
}

export const routes = [
  ['POST', /^\/api\/pieces\/([A-Za-z0-9_-]{1,80})\/modifier$/, modifier, { corps: CORPS_PIECES }],
  ['POST', /^\/api\/pieces\/([A-Za-z0-9_-]{1,80})\/supprimer$/, supprimer],
];
// FIN
