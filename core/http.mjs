// @zone socle | Outils HTTP : HOSTS/ORIGINS autorises, HttpError, send (JSON no-store), readBody (JSON, 4 Ko max par defaut : CORPS_MAX ; une route peut declarer plus, core/routeur.mjs), checkWrite (Origin + X-Requested-With: tablette), V1.8 : ecoute reseau du mode distant (reglerReseau, hoteValide ; req.distant pose par server.mjs : Host = adresse:port du serveur, Origin HTTPS du serveur exigee pour toute ecriture), describe (erreur -> [statut, message] via les traducteurs des adaptateurs).
import { LOCAL_PORT } from '../config.mjs';

export const ORIGINS = ['http://127.0.0.1:' + LOCAL_PORT, 'http://localhost:' + LOCAL_PORT];
export const HOSTS = ['127.0.0.1:' + LOCAL_PORT, 'localhost:' + LOCAL_PORT];

// V1.8, mode distant : hote et origine de l'ecoute reseau (HTTPS), poses par server.mjs une fois l'ecoute ouverte ; null en mode local.
let reseau = null;
export function reglerReseau(adresse, port) { reseau = adresse ? { hote: adresse + ':' + port, origine: 'https://' + adresse + ':' + port } : null; }
// En-tete Host attendu : celui de l'ecoute par laquelle la requete est arrivee (req.distant : ecoute reseau).
export function hoteValide(req) { return req.distant ? !!reseau && req.headers.host === reseau.hote : HOSTS.includes(req.headers.host); }

export class HttpError extends Error {
  constructor(code, message) { super(message); this.status = code; }
}

export function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// Taille de corps par defaut ; une route qui recoit de longues listes (animations, pieces) declare la sienne (option corps de la ligne de route).
export const CORPS_MAX = 4096;
export async function readBody(req, max = CORPS_MAX) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.startsWith('application/json')) throw new HttpError(415, 'Format JSON requis.');
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new HttpError(413, 'Requête trop grande.');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new HttpError(400, 'JSON invalide.'); }
}

export function checkWrite(req) {
  const origin = req.headers.origin;
  if (req.distant) { if (!reseau || origin !== reseau.origine) throw new HttpError(403, 'Origine refusée.'); } // ecoute reseau : Origin exigee (Chrome l'envoie avec tout POST)
  else if (origin && !ORIGINS.includes(origin)) throw new HttpError(403, 'Origine refusée.');
  if (req.headers['x-requested-with'] !== 'tablette') throw new HttpError(403, 'En-tête de sécurité manquant.');
}

// Chaque adaptateur peut fournir erreur(e) -> [statut, message] | null (ex. : jeton refuse, hub injoignable).
const traducteurs = [];
export function ajouterTraducteur(f) { traducteurs.push(f); }
export function describe(e) {
  if (e instanceof HttpError) return [e.status, e.message];
  for (const t of traducteurs) { const r = t(e); if (r) return r; }
  if ((e && e.code) === 'ETIMEDOUT') return [504, 'L\'appareil ne répond pas (délai dépassé).'];
  return [500, 'Erreur inattendue du serveur local.'];
}
// FIN
