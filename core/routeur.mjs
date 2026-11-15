// @zone socle | Registre de routes : charge modules/*.mjs puis les routes apportees par les adaptateurs. Un module exporte routes = [[methode, chemin | /regex/, async (c) => objet, options?]] (seul format ; l'ancien handle(req, res, p, ctx) n'est plus lu : journal, ignore).
// options : {corps: octets} (taille maximale du corps JSON de cette route ; defaut CORPS_MAX = 4 Ko de core/http.mjs).
// c = { req, res, m (correspondance), corps() (lit le JSON), envoyer(statut, objet) }. Un objet renvoye part en 200 ; rien (undefined) : la route a repondu elle-meme sur c.res (flux). Tout POST passe d'abord par checkWrite.
// Ligne de route mal formee (methode autre que GET ou POST, chemin qui n'est ni « /api/… » ni une expression reguliere, fonction absente), routes qui ne sont pas une liste,
// route en double : ignorees avec une ligne de journal ; le serveur demarre avec les autres (un adaptateur fautif ne fait pas tomber les routes communes).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIR, log } from './outils.mjs';
import { HttpError, send, readBody, checkWrite, CORPS_MAX } from './http.mjs';
import { charger as chargerAdaptateurs, extensions } from './appareils.mjs';

const routes = [];
let pret = null;
// Taille de corps declaree par une route : entier positif d'au plus 1 Mo, sinon la taille par defaut (CORPS_MAX).
export function tailleCorps(options) {
  const n = options && options.corps;
  return Number.isInteger(n) && n > 0 && n <= 1048576 ? n : CORPS_MAX;
}
// Motif d'une ligne de route refusee, ou null si elle est valide.
export function defaut(ligne) {
  if (!Array.isArray(ligne)) return 'ligne qui n\'est pas une liste';
  const [methode, chemin, h] = ligne;
  if (methode !== 'GET' && methode !== 'POST') return 'méthode ' + String(methode) + ' (GET ou POST)';
  if (!(chemin instanceof RegExp) && !(typeof chemin === 'string' && chemin.startsWith('/api/'))) return 'chemin ' + String(chemin) + ' (/api/… ou expression régulière)';
  if (typeof h !== 'function') return 'fonction absente';
  return null;
}
// sources : [[nom (journal), module]] dans l'ordre de chargement ; la premiere route d'une cle (methode + chemin) l'emporte. Rend le nombre de routes ajoutees.
export function enregistrer(sources) {
  let n = 0;
  for (const [nom, mod] of sources) {
    if (!mod) continue;
    if (mod.handle) log('routeur : format handle abandonné (routes = [[méthode, chemin, fonction]]), ignoré (' + nom + ')');
    if (mod.routes === undefined) continue;
    if (!Array.isArray(mod.routes)) { log('routeur : routes n\'est pas une liste, ignoré (' + nom + ')'); continue; }
    for (const ligne of mod.routes) {
      const motif = defaut(ligne);
      if (motif) { log('routeur : route ignorée,', motif, '(' + nom + ')'); continue; }
      const [methode, chemin, h, options] = ligne;
      const cle = methode + ' ' + String(chemin);
      if (routes.some((r) => r.cle === cle)) { log('routeur : route en double ignorée', cle, '(' + nom + ')'); continue; }
      routes.push({ cle, methode, chemin, h, corps: tailleCorps(options) });
      n++;
    }
  }
  return n;
}
export function preparer() {
  if (!pret) pret = (async () => {
    await chargerAdaptateurs();
    const base = path.join(DIR, 'modules');
    const sources = [];
    for (const n of fs.readdirSync(base).filter((f) => f.endsWith('.mjs')).sort()) sources.push([n, await import(pathToFileURL(path.join(base, n)).href)]);
    for (const x of extensions()) sources.push(['adapters/' + x.id, x]);
    enregistrer(sources);
  })();
  return pret;
}
export const inventaire = () => routes.map((r) => r.cle);

// Premiere route dont la methode et le chemin correspondent ; 404 sinon.
export async function repondre(req, res, p) {
  for (const r of routes) {
    if (r.methode !== req.method) continue;
    const m = typeof r.chemin === 'string' ? (r.chemin === p ? [p] : null) : p.match(r.chemin);
    if (!m) continue;
    if (req.method === 'POST') checkWrite(req);
    const out = await r.h({ req, res, m, corps: () => readBody(req, r.corps), envoyer: (s, o) => send(res, s, o) });
    if (out !== undefined && !res.headersSent) send(res, 200, out);
    return;
  }
  throw new HttpError(404, 'Route inconnue.');
}
export async function api(req, res, p) {
  await preparer();
  return repondre(req, res, p);
}
// FIN
