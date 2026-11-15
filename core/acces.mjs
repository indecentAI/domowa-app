// @zone distant | Appareils autorises a joindre l'ecoute reseau (V1.8, mode distant) : code d'appairage (8 chiffres, usage unique, 5 min, en memoire ; 5 erreurs : code annule et 5 min d'attente), jeton par appareil (32 octets aleatoires, cookie « domowa »), donnees/clients.json (600 : [{id, nom, cree_le, vu_le, empreinte}], empreinte = SHA-256 du jeton, jamais le jeton ; 10 au plus ; illisible : jamais reecrit, aucun acces reseau), revocation.
// creerAcces({maintenant, lire, ecrire, journal}) : dependances remplacables (essais unitaires : banc/unitaires/acces.test.mjs) ; acces = instance du serveur.
// Jamais dans le journal, une reponse (hors POST /api/appairage/code pour le code, affiche a l'ecran) ni une URL : le code, le jeton, le cookie, l'empreinte du jeton.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DONNEES, log } from './outils.mjs';
import { HttpError } from './http.mjs';

export const COOKIE = 'domowa';
export const MAX_CLIENTS = 10, DUREE_CODE = 5 * 60000, ERREURS_MAX = 5, BLOCAGE = 5 * 60000, NOM_MAX = 30, DUREE_COOKIE = 365 * 86400;
const VU_PAS = 3600000; // vu_le n'est reecrit qu'une fois par heure au plus
const JETON_RE = /^[A-Za-z0-9_-]{43}$/, ID_RE = /^[a-z0-9]{8}$/, EMPREINTE_RE = /^[0-9a-f]{64}$/;
const FICHIER = () => path.join(DONNEES, 'clients.json');
const empreinteDe = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');
const egal = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Fichier absent : [] ; illisible ou mal forme : null (aucun client reconnu, aucune ecriture).
function lireFichier() {
  if (!fs.existsSync(FICHIER())) return [];
  try {
    const j = JSON.parse(fs.readFileSync(FICHIER(), 'utf8'));
    if (!Array.isArray(j) || !j.every((c) => c && ID_RE.test(c.id) && EMPREINTE_RE.test(c.empreinte) && typeof c.nom === 'string')) return null;
    return j;
  } catch (e) { return null; }
}
function ecrireFichier(liste) {
  fs.mkdirSync(DONNEES, { recursive: true, mode: 0o700 });
  fs.writeFileSync(FICHIER() + '.tmp', JSON.stringify(liste, null, 1), { mode: 0o600 });
  fs.chmodSync(FICHIER() + '.tmp', 0o600);
  fs.renameSync(FICHIER() + '.tmp', FICHIER());
}
// Nom donne a l'appareil : espaces reduits, sans caractere de controle, 1 a 30 caracteres ; null sinon.
export function nomValide(n) {
  if (typeof n !== 'string') return null;
  const t = n.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= NOM_MAX ? t : null;
}
// Valeur du cookie « domowa » dans l'en-tete Cookie ; null si absente ou mal formee.
export function jetonDe(enTete) {
  for (const p of String(enTete || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === COOKIE) { const v = p.slice(i + 1).trim(); return JETON_RE.test(v) ? v : null; }
  }
  return null;
}
export const cookie = (jeton) => COOKIE + '=' + jeton + '; Max-Age=' + DUREE_COOKIE + '; Path=/; HttpOnly; Secure; SameSite=Strict';
export const cookieEfface = () => COOKIE + '=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict';

export function creerAcces(o = {}) {
  const maintenant = o.maintenant || (() => Date.now());
  const lire = o.lire || lireFichier, ecrire = o.ecrire || ecrireFichier, journal = o.journal || log;
  const iso = () => new Date(maintenant()).toISOString();
  let liste;            // undefined : pas encore lu ; null : fichier illisible ; sinon la liste (le serveur est le seul a ecrire)
  let code = null;      // {valeur, expire (ms), erreurs}
  let bloque = 0;       // instant (ms) jusqu'auquel appairage et nouveaux codes sont refuses
  const clients = () => { if (liste === undefined) { liste = lire(); if (liste === null) journal('acces : clients.json illisible, aucun appareil autorisé (fichier laissé tel quel)'); } return liste; };
  const exiger = () => { const l = clients(); if (l === null) throw new HttpError(500, 'Liste des appareils autorisés illisible (donnees/clients.json) : la corriger ou la retirer, serveur arrêté.'); return l; };
  const attente = () => { const r = bloque - maintenant(); if (r > 0) throw new HttpError(429, 'Trop de codes refusés. Réessayer dans ' + Math.ceil(r / 60000) + ' min.'); };

  // Client du jeton porte par l'en-tete Cookie, ou null. vu_le note au plus une fois par heure (ecriture en echec : sans effet sur l'acces).
  function authentifier(enTete) {
    const j = jetonDe(enTete), l = clients();
    if (!j || !l) return null;
    const e = empreinteDe(j);
    const c = l.find((x) => egal(x.empreinte, e));
    if (!c) return null;
    const t = maintenant();
    if (!(t - new Date(c.vu_le || 0).getTime() < VU_PAS)) { c.vu_le = iso(); try { ecrire(l); } catch (x) { /* disque : l'acces reste valable */ } }
    return { id: c.id, nom: c.nom };
  }
  // Nouveau code (remplace le precedent). 429 pendant l'attente, 409 a 10 appareils.
  function demanderCode() {
    attente();
    if (exiger().length >= MAX_CLIENTS) throw new HttpError(409, MAX_CLIENTS + ' appareils sont déjà autorisés : en révoquer un d\'abord.');
    code = { valeur: String(crypto.randomInt(0, 100000000)).padStart(8, '0'), expire: maintenant() + DUREE_CODE, erreurs: 0 };
    journal('appairage : code demandé');
    return { code: code.valeur, expire: new Date(code.expire).toISOString(), duree: DUREE_CODE / 1000 };
  }
  // Code en cours (sans sa valeur) : {expire} | null
  function codeEnCours() { if (code && code.expire <= maintenant()) code = null; return code ? { expire: new Date(code.expire).toISOString() } : null; }
  // Appairage : rend {jeton (pour le cookie, jamais garde), client: {id, nom}}. Le code est consomme des qu'il est reconnu.
  function appairer(saisi, nom) {
    attente();
    const n = nomValide(nom);
    if (typeof saisi !== 'string' || !/^\d{8}$/.test(saisi)) throw new HttpError(400, 'Code à 8 chiffres requis.');
    if (!n) throw new HttpError(400, 'Nom de l\'appareil requis (1 à ' + NOM_MAX + ' caractères).');
    if (!codeEnCours()) throw new HttpError(403, 'Aucun code en cours : en demander un nouveau (fenêtre « Appareils autorisés »).');
    if (!egal(saisi, code.valeur)) {
      code.erreurs++;
      const reste = ERREURS_MAX - code.erreurs;
      journal('appairage : code refusé (' + code.erreurs + '/' + ERREURS_MAX + ')');
      if (reste <= 0) { code = null; bloque = maintenant() + BLOCAGE; throw new HttpError(429, 'Code refusé ' + ERREURS_MAX + ' fois : il est annulé. Demander un nouveau code dans ' + (BLOCAGE / 60000) + ' min.'); }
      throw new HttpError(403, 'Code refusé (' + reste + ' essai' + (reste > 1 ? 's' : '') + ' restant' + (reste > 1 ? 's' : '') + ').');
    }
    code = null;
    const l = exiger();
    if (l.length >= MAX_CLIENTS) throw new HttpError(409, MAX_CLIENTS + ' appareils sont déjà autorisés : en révoquer un d\'abord.');
    const jeton = crypto.randomBytes(32).toString('base64url');
    let id; do { id = crypto.randomBytes(6).toString('hex').slice(0, 8); } while (l.some((c) => c.id === id));
    const c = { id, nom: n, cree_le: iso(), vu_le: iso(), empreinte: empreinteDe(jeton) };
    const suite = l.concat([c]);
    try { ecrire(suite); } catch (e) { throw new HttpError(500, 'Appareil non enregistré (écriture impossible). Demander un nouveau code.'); }
    liste = suite;
    journal('appairage : client ' + id + ' autorisé');
    return { jeton, client: { id, nom: n } };
  }
  function revoquer(id) {
    const l = exiger();
    if (!l.some((c) => c.id === id)) throw new HttpError(404, 'Appareil inconnu.');
    const suite = l.filter((c) => c.id !== id);
    try { ecrire(suite); } catch (e) { throw new HttpError(500, 'Révocation non enregistrée (écriture impossible).'); }
    liste = suite;
    journal('acces : client ' + id + ' révoqué');
  }
  // Liste sans secret ; courant : identifiant du client qui demande (null depuis l'ecoute locale)
  const lister = (courant) => (clients() || []).map((c) => ({ id: c.id, nom: c.nom, cree_le: c.cree_le || null, vu_le: c.vu_le || null, courant: c.id === courant }));
  return { authentifier, demanderCode, codeEnCours, appairer, revoquer, lister, lisible: () => clients() !== null, nombre: () => (clients() || []).length };
}
export const acces = creerAcces();
// FIN
