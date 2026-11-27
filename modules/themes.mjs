// @zone themes | Thèmes personnalisés (V2.2 étape 10) : donnees/themes.json {v: 1, themes: [{id, base, nom?, couleurs: {cle: "#rrggbb"}}]} (sans secret, commun à tous les appareils ; le choix du thème reste propre à chaque appareil) ; entrée d'id égal à sa base = thème du registre modifié (jamais sombre) ; id perso-… = thème créé (nom, base = thème du registre dont il part, sombre compris) ; GET /api/themes, POST /api/themes {theme}, POST /api/themes/supprimer {id, confirm} ; analyser et valider (purs, essais banc/unitaires/themes.test.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../core/http.mjs';
import { DONNEES, ecrireJson, nouvelId } from '../core/outils.mjs';

const FICHIER = 'themes.json';
// Couleurs modifiables (palette de l'éditeur ; public/version.js en tire les variables de themes.css, même liste)
export const CLES = ['fond', 'carte', 'texte', 'attenue', 'accent', 'succes', 'alerte', 'danger', 'chaud', 'local'];
export const MAX = 20; // entrées (thèmes modifiés et créés)
export const VERROUILLE = 'sombre'; // thème d'origine, jamais modifié
const ID_BASE = /^[a-z][a-z0-9]{1,19}$/, ID_PERSO = /^perso-[a-z0-9]{4,16}$/, HEX = /^#[0-9a-f]{6}$/;
const objet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// Nom d'un thème créé : 1 à 30 caractères après espaces retirés, sans caractère de contrôle
const nomValide = (n) => typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 30 && !/[\u0000-\u001f\u007f]/.test(n);
export const vide = () => ({ v: 1, themes: [] });

// Entrée lue avec tolérance (null si inutilisable) : couleurs inconnues ou mal formées ignorées
function entree(t) {
  if (!objet(t) || typeof t.id !== 'string' || typeof t.base !== 'string' || !ID_BASE.test(t.base)) return null;
  const perso = ID_PERSO.test(t.id);
  if (!perso && (t.id !== t.base || t.id === VERROUILLE)) return null;
  if (perso && !nomValide(t.nom)) return null;
  const couleurs = {}, c = objet(t.couleurs) ? t.couleurs : {};
  for (const k of CLES) if (typeof c[k] === 'string' && HEX.test(c[k].toLowerCase())) couleurs[k] = c[k].toLowerCase();
  const r = { id: t.id, base: t.base, couleurs };
  if (perso) r.nom = t.nom.trim();
  return r;
}
// Lecture tolérante du fichier (texte, ou null s'il est absent) : absent = vide ; illisible = vide et lisible false (jamais réécrit : écritures refusées) ;
// entrées invalides et doublons d'id ignorés, MAX au plus
export function analyser(texte) {
  if (texte === null || texte === undefined) return { themes: vide(), lisible: true };
  let j;
  try { j = JSON.parse(texte); } catch (e) { return { themes: vide(), lisible: false }; }
  if (!objet(j)) return { themes: vide(), lisible: false };
  const r = vide(), vu = new Set();
  for (const t of Array.isArray(j.themes) ? j.themes : []) {
    const e = entree(t);
    if (!e || vu.has(e.id)) continue;
    vu.add(e.id); r.themes.push(e);
    if (r.themes.length >= MAX) break;
  }
  return { themes: r, lisible: true };
}
// Corps d'un POST /api/themes : {theme: {id?, base, nom?, couleurs}} ; sans id (ou id perso-…) avec nom : thème créé ou modifié ; id = base : thème du registre modifié.
// Validation stricte (400) ; rend l'entrée à écrire (id créé côté serveur pour un nouveau thème).
export function valider(corps) {
  const t = objet(corps) && objet(corps.theme) ? corps.theme : null;
  if (!t) throw new HttpError(400, 'Thème invalide.');
  for (const k of Object.keys(t)) if (!['id', 'base', 'nom', 'couleurs'].includes(k)) throw new HttpError(400, 'Réglage inconnu.');
  if (typeof t.base !== 'string' || !ID_BASE.test(t.base)) throw new HttpError(400, 'Thème de départ invalide.');
  const perso = t.id === undefined || t.id === null || (typeof t.id === 'string' && ID_PERSO.test(t.id));
  if (!perso) {
    if (t.id !== t.base) throw new HttpError(400, 'Thème invalide.');
    if (t.id === VERROUILLE) throw new HttpError(403, 'Le thème Sombre d\'origine ne se modifie pas : créez-en une copie.');
    if (t.nom !== undefined) throw new HttpError(400, 'Le nom d\'un thème de l\'application ne change pas.');
  } else if (!nomValide(t.nom)) throw new HttpError(400, 'Nom invalide : 1 à 30 caractères.');
  if (!objet(t.couleurs)) throw new HttpError(400, 'Couleurs invalides.');
  const couleurs = {};
  for (const k of Object.keys(t.couleurs)) {
    if (!CLES.includes(k)) throw new HttpError(400, 'Couleur inconnue.');
    if (typeof t.couleurs[k] !== 'string' || !HEX.test(t.couleurs[k].toLowerCase())) throw new HttpError(400, 'Couleur invalide : #rrggbb attendu.');
    couleurs[k] = t.couleurs[k].toLowerCase();
  }
  const r = { id: perso ? (t.id || 'perso-' + nouvelId()) : t.id, base: t.base, couleurs };
  if (perso) r.nom = t.nom.trim();
  return r;
}

function lire() {
  let t = null;
  try { t = fs.readFileSync(path.join(DONNEES, FICHIER), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') return { themes: vide(), lisible: false }; }
  return analyser(t);
}
const reponse = (x, id) => ({ themes: x.themes.themes, lisible: x.lisible, max: MAX, id: id || null, time: new Date().toISOString() });
const ILLISIBLE = 'Thèmes illisibles sur le serveur (themes.json) : rien n\'a été enregistré.';

export const routes = [
  ['GET', '/api/themes', async () => reponse(lire())],
  ['POST', '/api/themes', async (c) => {
    const corps = await c.corps(), e = valider(corps), corpsId = !!corps.theme.id;
    const x = lire();
    if (!x.lisible) throw new HttpError(409, ILLISIBLE);
    const l = x.themes.themes, i = l.findIndex((t) => t.id === e.id);
    if (i >= 0) l[i] = e;
    else if (ID_PERSO.test(e.id) && corpsId) throw new HttpError(404, 'Thème inconnu : il a peut-être été supprimé depuis un autre appareil.');
    else {
      if (l.length >= MAX) throw new HttpError(409, MAX + ' thèmes personnalisés au plus : supprimez-en un.');
      l.push(e);
    }
    // Thème du registre sans aucune couleur changée : rien à garder (retour à l'origine)
    if (!ID_PERSO.test(e.id) && !Object.keys(e.couleurs).length) l.splice(l.findIndex((t) => t.id === e.id), 1);
    ecrireJson(FICHIER, x.themes);
    return reponse(x, e.id);
  }],
  ['POST', '/api/themes/supprimer', async (c) => {
    const b = await c.corps();
    if (!objet(b) || b.confirm !== true || typeof b.id !== 'string') throw new HttpError(400, 'Confirmation requise.');
    const x = lire();
    if (!x.lisible) throw new HttpError(409, ILLISIBLE);
    const i = x.themes.themes.findIndex((t) => t.id === b.id);
    if (i < 0) throw new HttpError(404, 'Thème inconnu.');
    x.themes.themes.splice(i, 1);
    ecrireJson(FICHIER, x.themes);
    return reponse(x);
  }],
];
// FIN
