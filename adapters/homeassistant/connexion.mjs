// @zone homeassistant | Connexion a Home Assistant : adresse et port (donnees/homeassistant.json, sans secret), jeton d'acces longue duree (donnees/homeassistant-token.txt, 600, jamais renvoye ni journalise), requetes de l'API REST en liste fermee (GET : obtenir ; POST d'une action : envoyer, jamais renvoyee), deconnexion, traduction des erreurs.
// HTTP local seulement (choix de l'utilisateur, V2.0 ; exception ecrite dans CLAUDE.md « Home Assistant ») : adresse IPv4 privee (core/reseau.mjs, privee), aucune redirection suivie,
// reponse JSON de 8 Mo au plus, delai borne, sans connexion persistante. En-tetes : Authorization: Bearer <jeton> (documentation REST de Home Assistant). Erreurs : codes HA_* sans message
// d'origine (jamais e.message : il peut porter l'adresse).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { DONNEES, lireJson, ecrireJson, log } from '../../core/outils.mjs';
import { privee } from '../../core/reseau.mjs';

export const JETON = path.join(DONNEES, 'homeassistant-token.txt');
const FICHIER = 'homeassistant.json'; // { adresse, port, appaire_le?, deconnecte_le? } : sans secret
export const PORT_DEFAUT = 8123;
const MAX = 8 * 1024 * 1024;
export const portValide = (p) => Number.isInteger(p) && p >= 1 && p <= 65535;
export const jetonValide = (j) => typeof j === 'string' && /^[\x21-\x7e]{20,4096}$/.test(j);
const erreurCode = (code, extra) => Object.assign(new Error(code), { code }, extra || {});

export function lire() {
  const f = path.join(DONNEES, FICHIER);
  if (!fs.existsSync(f)) return { adresse: null, port: PORT_DEFAUT, illisible: false, deconnecte_le: null };
  const j = lireJson(FICHIER, null);
  if (!j || typeof j !== 'object' || !privee(j.adresse)) return { adresse: null, port: PORT_DEFAUT, illisible: true, deconnecte_le: null };
  return { adresse: j.adresse, port: portValide(j.port) ? j.port : PORT_DEFAUT, illisible: false, deconnecte_le: typeof j.deconnecte_le === 'string' ? j.deconnecte_le : null };
}
export const jetonPresent = () => fs.existsSync(JETON);
// non_configure : aucune adresse ni jeton ; deconnecte : deconnexion demandee, jeton efface ; pret : sinon.
export function etatLocal() {
  const c = lire();
  if (!c.adresse && !c.illisible && !jetonPresent()) return 'non_configure';
  if (c.deconnecte_le && !jetonPresent()) return 'deconnecte';
  return 'pret';
}
// Adresse, port et jeton relus a chaque appel (aussi pour le registre WebSocket, registre.mjs) ; sans jeton : erreur, aucune requete.
export function cible() {
  const c = lire();
  if (!c.adresse) throw erreurCode(c.illisible ? 'HA_ADRESSE' : 'HA_NON_CONFIGURE');
  let jeton;
  try { jeton = fs.readFileSync(JETON, 'utf8').trim(); } catch (e) { throw erreurCode(e.code === 'ENOENT' && c.deconnecte_le ? 'HA_DECONNECTE' : 'HA_JETON_ABSENT'); }
  return { adresse: c.adresse, port: c.port, jeton };
}

// Chemins permis (listes fermees) : GET /api/config, /api/states, /api/states/<light|switch>.<objet> ; POST (V2.0 etape 3, documentation REST : corps = donnees de l'action,
// entity_id compris ; reponse = etats changes ; 500 si l'action echoue) /api/services/light/turn_on|turn_off, /api/services/switch/turn_on|turn_off.
const CHEMINS = [/^\/api\/config$/, /^\/api\/states$/, /^\/api\/states\/(light|switch)\.[a-z0-9_]{1,70}$/];
const ACTIONS = /^\/api\/services\/(light|switch)\/(turn_on|turn_off)$/;
// GET vers une adresse donnee (appairage) ou celle du fichier ; -> JSON. Codes : HA_RESEAU, HA_DELAI, HA_JETON (401, 403), HA_REDIRECTION (3xx), HA_HTTP (autre statut, statut),
// HA_REPONSE (pas du JSON), HA_TROP (plus de 8 Mo).
export const obtenir = (chemin, opts = {}) => demande('GET', chemin, null, opts);
// POST d'une action (une seule fois : aucune connexion gardee, aucun renvoi, meme sur delai depasse : resultat inconnu, l'appelant relit). Statut hors 2xx : HA_REFUS (statut).
// Corps de la reponse ignore (seul le statut compte) ; 10 s au plus (Home Assistant repond quand l'action est faite).
export const envoyer = (chemin, corps, opts = {}) => demande('POST', chemin, corps, Object.assign({ delai: 10000 }, opts));
function demande(methode, chemin, corps, { adresse, port, jeton, delai = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    let t, texte = null;
    try {
      if (methode === 'GET' ? !CHEMINS.some((re) => re.test(chemin)) : !ACTIONS.test(chemin)) throw erreurCode('HA_CHEMIN');
      if (methode === 'POST') texte = JSON.stringify(corps);
      t = adresse ? { adresse, port, jeton } : cible();
      if (!privee(t.adresse) || !portValide(t.port)) throw erreurCode('HA_ADRESSE');
    } catch (e) { reject(e); return; }
    let fini = false;
    const fin = (e, v) => { if (fini) return; fini = true; clearTimeout(minuteur); if (e) reject(e); else resolve(v); };
    const entetes = { Authorization: 'Bearer ' + t.jeton, Accept: 'application/json' };
    if (texte !== null) Object.assign(entetes, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(texte) });
    const req = http.request({ host: t.adresse, port: t.port, path: chemin, method: methode, agent: false, headers: entetes }, (res) => {
      const s = res.statusCode;
      if (s >= 300 && s < 400) { res.resume(); fin(erreurCode('HA_REDIRECTION', { statut: s })); req.destroy(); return; }
      if (s === 401 || s === 403) { res.resume(); fin(erreurCode('HA_JETON', { statut: s })); return; }
      const morceaux = []; let taille = 0;
      res.on('data', (c) => { taille += c.length; if (taille > MAX) { fin(erreurCode('HA_TROP')); req.destroy(); return; } morceaux.push(c); });
      res.on('end', () => {
        if (s < 200 || s >= 300) { fin(erreurCode(methode === 'POST' ? 'HA_REFUS' : 'HA_HTTP', { statut: s })); return; }
        if (methode === 'POST') { fin(null, true); return; }
        try { fin(null, JSON.parse(Buffer.concat(morceaux).toString('utf8'))); } catch (e) { fin(erreurCode('HA_REPONSE')); }
      });
      res.on('error', () => fin(erreurCode('HA_RESEAU')));
    });
    const minuteur = setTimeout(() => { fin(erreurCode('HA_DELAI')); req.destroy(); }, delai);
    req.on('error', () => fin(erreurCode('HA_RESEAU')));
    req.end(texte === null ? undefined : texte);
  });
}

// Appairage reussi (hub.mjs) : jeton ecrit par le serveur seul, 600, atomique ; adresse et port notes, deconnecte_le retire. Un echec ou une annulation ne touche a rien.
export function enregistrer(adresse, port, jeton) {
  if (!privee(adresse) || !portValide(port) || !jetonValide(jeton)) throw erreurCode('HA_JETON_FORME');
  fs.mkdirSync(DONNEES, { recursive: true, mode: 0o700 });
  const tmp = JETON + '.tmp';
  fs.writeFileSync(tmp, jeton, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, JETON);
  const c = lireJson(FICHIER, {});
  const n = Object.assign({}, c && typeof c === 'object' ? c : {}, { adresse, port, appaire_le: new Date().toISOString() });
  delete n.deconnecte_le;
  ecrireJson(FICHIER, n);
  log('homeassistant : connecte, jeton enregistre');
}
export function deconnecter() {
  const c = lireJson(FICHIER, {});
  try { fs.unlinkSync(JETON); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  ecrireJson(FICHIER, Object.assign({}, c && typeof c === 'object' ? c : {}, { deconnecte_le: new Date().toISOString() }));
  log('homeassistant : deconnecte (jeton efface)');
}

export function erreur(e) {
  const code = (e && e.code) || '';
  if (code === 'HA_DECONNECTE') return [409, 'Hub non connecté.'];
  if (code === 'HA_NON_CONFIGURE') return [409, 'Aucun hub configuré.'];
  if (code === 'HA_ADRESSE') return [500, 'Adresse de Home Assistant illisible (donnees/homeassistant.json).'];
  if (code === 'HA_JETON_ABSENT') return [500, 'Fichier jeton introuvable.'];
  if (code === 'HA_JETON_FORME') return [400, 'Jeton mal formé.'];
  if (code === 'HA_JETON') return [502, 'Jeton refusé par Home Assistant.'];
  if (code === 'HA_DELAI') return [504, 'Home Assistant ne répond pas (délai dépassé).'];
  if (code === 'HA_RESEAU') return [502, 'Home Assistant injoignable (adresse, port, Wi-Fi ?).'];
  if (code === 'HA_REDIRECTION') return [502, 'Home Assistant a répondu par une redirection (refusée).'];
  if (code === 'HA_HTTP') return [502, 'Réponse inattendue de Home Assistant (code ' + e.statut + ').'];
  if (code === 'HA_REFUS') return [502, 'Home Assistant a refusé la commande (code ' + e.statut + ').'];
  if (code === 'HA_REPONSE') return [502, 'Réponse illisible : est-ce bien Home Assistant ?'];
  if (code === 'HA_TROP') return [502, 'Réponse de Home Assistant trop volumineuse.'];
  if (code === 'HA_CHEMIN') return [500, 'Chemin refusé.'];
  return null;
}
// FIN
