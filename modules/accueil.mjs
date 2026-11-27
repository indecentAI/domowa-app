// @zone accueil | Accueil personnalisable (V1.9 révision 3) : ordre des cartes de chaque rubrique, ordre des rubriques, cartes, rubriques et colonne des caméras masquées ; donnees/accueil.json {v: 1, ordre: {pieces, actions, categories}, rubriques, masques: {pieces, actions, categories, rubriques, cameras}} (sans secret, commun à tous les appareils) ; GET et POST /api/accueil, POST /api/accueil/defaut ; analyser et valider (purs, essais banc/unitaires/accueil.test.mjs), CORPS_ACCUEIL.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../core/http.mjs';
import { DONNEES, ecrireJson } from '../core/outils.mjs';
import { ID_RE } from '../core/modele.mjs';

const FICHIER = 'accueil.json';
export const RUBRIQUES = ['pieces', 'actions', 'categories'];
export const MAX_CLES = 100; // par rubrique : pièces du hub (30), locales (30), « Autres », et les places gardées des éléments absents
// Pire cas du corps : ordre et masques, 2 x 3 rubriques x 100 clés de 80 caractères (guillemets et virgule compris) = 49,8 Ko, plus l'enveloppe ; vérifié par l'essai unitaire
export const CORPS_ACCUEIL = 64 * 1024;

const cleValide = (k) => typeof k === 'string' && ID_RE.test(k) && k !== '__proto__';
export const vide = () => ({ v: 1, ordre: { pieces: [], actions: [], categories: [] }, rubriques: RUBRIQUES.slice(), masques: { pieces: [], actions: [], categories: [], rubriques: [], cameras: false } });
// Liste de clés lue avec tolérance : invalides et doublons ignorés, 100 au plus
function cles(l, permises) {
  const o = [], vu = new Set();
  for (const k of Array.isArray(l) ? l : []) {
    if (!cleValide(k) || vu.has(k) || (permises && !permises.includes(k))) continue;
    vu.add(k); o.push(k);
    if (o.length >= MAX_CLES) break;
  }
  return o;
}
// Ordre des rubriques : toujours les trois, celles qui manquent à leur place par défaut, au bout
const ordreRubriques = (l) => { const o = cles(l, RUBRIQUES); return o.concat(RUBRIQUES.filter((r) => !o.includes(r))); };

// Lecture tolérante du fichier (texte, ou null s'il est absent) : absent = ordre par défaut ; illisible (JSON invalide, autre chose qu'un objet) = défaut et
// lisible false (jamais réécrit : écritures refusées) ; entrées inconnues, clés invalides et doublons ignorés ; 100 clés par rubrique au plus.
export function analyser(texte) {
  if (texte === null || texte === undefined) return { accueil: vide(), lisible: true };
  let j;
  try { j = JSON.parse(texte); } catch (e) { return { accueil: vide(), lisible: false }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { accueil: vide(), lisible: false };
  const objet = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const a = vide(), o = objet(j.ordre), m = objet(j.masques);
  for (const r of RUBRIQUES) { a.ordre[r] = cles(o[r]); a.masques[r] = cles(m[r]); }
  a.rubriques = ordreRubriques(j.rubriques);
  a.masques.rubriques = cles(m.rubriques, RUBRIQUES);
  a.masques.cameras = m.cameras === true;
  return { accueil: a, lisible: true };
}

// Corps d'un POST : {ordre?: {rubrique: [clés]}, rubriques?: [les trois rubriques], masques?: {rubrique?: [clés], rubriques?: [rubriques], cameras?: booléen}}
// (une partie au moins ; ce qui n'est pas envoyé est gardé) ; validation stricte (400), rend {ordre: {…}, rubriques?, masques: {…}}
const liste = (l, msg, permises) => {
  if (!Array.isArray(l) || l.length > MAX_CLES || !l.every(cleValide) || new Set(l).size !== l.length || (permises && !l.every((k) => permises.includes(k)))) throw new HttpError(400, msg);
  return l.slice();
};
const objetStrict = (x, msg) => { if (!x || typeof x !== 'object' || Array.isArray(x) || !Object.keys(x).length) throw new HttpError(400, msg); return x; };
export function valider(corps) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) throw new HttpError(400, 'Réglage invalide.');
  const r = { ordre: {}, masques: {} };
  let n = 0;
  for (const k of Object.keys(corps)) {
    if (k === 'ordre') {
      const o = objetStrict(corps.ordre, 'Ordre invalide.');
      for (const x of Object.keys(o)) {
        if (!RUBRIQUES.includes(x)) throw new HttpError(400, 'Rubrique inconnue.');
        r.ordre[x] = liste(o[x], 'Ordre invalide.');
      }
    } else if (k === 'rubriques') {
      const l = liste(corps.rubriques, 'Ordre des rubriques invalide.', RUBRIQUES);
      if (l.length !== RUBRIQUES.length) throw new HttpError(400, 'Ordre des rubriques invalide.');
      r.rubriques = l;
    } else if (k === 'masques') {
      const m = objetStrict(corps.masques, 'Masques invalides.');
      for (const x of Object.keys(m)) {
        if (x === 'cameras') { if (typeof m.cameras !== 'boolean') throw new HttpError(400, 'Masques invalides.'); r.masques.cameras = m.cameras; }
        else if (x === 'rubriques') r.masques.rubriques = liste(m.rubriques, 'Masques invalides.', RUBRIQUES);
        else if (RUBRIQUES.includes(x)) r.masques[x] = liste(m[x], 'Masques invalides.');
        else throw new HttpError(400, 'Rubrique inconnue.');
      }
    } else throw new HttpError(400, 'Réglage inconnu.');
    n++;
  }
  if (!n) throw new HttpError(400, 'Réglage invalide.');
  return r;
}

function lire() {
  const f = path.join(DONNEES, FICHIER);
  let t = null;
  try { t = fs.readFileSync(f, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') return { accueil: vide(), lisible: false }; }
  return analyser(t);
}
const reponse = (x) => ({ accueil: x.accueil, lisible: x.lisible, time: new Date().toISOString() });
const ILLISIBLE = 'Réglage de l\'accueil illisible sur le serveur (accueil.json) : rien n\'a été enregistré.';

export const routes = [
  ['GET', '/api/accueil', async () => reponse(lire())],
  ['POST', '/api/accueil', async (c) => {
    const n = valider(await c.corps());
    const x = lire();
    if (!x.lisible) throw new HttpError(409, ILLISIBLE);
    Object.assign(x.accueil.ordre, n.ordre);
    Object.assign(x.accueil.masques, n.masques);
    if (n.rubriques) x.accueil.rubriques = n.rubriques;
    ecrireJson(FICHIER, x.accueil);
    return reponse(x);
  }, { corps: CORPS_ACCUEIL }],
  ['POST', '/api/accueil/defaut', async (c) => {
    const b = await c.corps();
    if (!b || b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
    if (!lire().lisible) throw new HttpError(409, ILLISIBLE);
    const a = vide();
    ecrireJson(FICHIER, a);
    return reponse({ accueil: a, lisible: true });
  }],
];
// FIN
