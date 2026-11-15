// @zone electromenager | Client du cloud SmartThings : HTTPS vers api.smartthings.com seul (TLS strict, aucune redirection suivie, 10 s, 1 Mo max) ; jetons OAuth de donnees/smartthings.json (600).
// Renouvellement (doc officielle Token Management) : POST /v1/oauth/token, Basic client_id:client_secret, grant_type=refresh_token ; jeton de rafraichissement a usage unique :
// un seul renouvellement a la fois, fichier relu avant, nouveau jeton ecrit (atomique, fsync) AVANT tout usage. Jeton refuse : plus aucun essai tant que le fichier ne change pas.
// Erreurs : ErreurST, code ST_* a message fixe (jamais de jeton, d'adresse ni de reponse brute).
// V1.7 : joignabilite du cloud (etatCloud), distincte du compte : toute reponse HTTP -> joignable ; ST_RESEAU, ST_DELAI, ST_TLS -> injoignable. Injoignable (compte connecte) :
// poignee de main TLS stricte seule vers api.smartthings.com:443 toutes les 30 s (aucune requete HTTP, aucun chemin ni jeton) ; reussie -> joignable, crochets surRetourCloud.
// Jamais de renouvellement du jeton tant que le cloud est injoignable (ST_RESEAU sans envoi) : une coupure ne consomme ni n'efface le jeton de rafraichissement.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import tls from 'node:tls';
import { DONNEES, log } from '../../core/outils.mjs';

const HOTE = 'api.smartthings.com', PORT = 443; // liste fermee : seul hote contacte
const FICHIER = path.join(DONNEES, 'smartthings.json');
const DELAI = 10000, MAX = 1048576, MARGE = 300000;
const CHEMINS = /^\/(v1\/devices(\/[A-Za-z0-9-]{1,80}\/(status|health|commands))?(\?[A-Za-z0-9=&_.%-]{0,200})?|v1\/oauth\/token|oauth\/token)$/;

export class ErreurST extends Error {
  constructor(code, statut) { super(code); this.name = 'ErreurST'; this.code = code; this.statutHttp = statut || 0; }
}

// ---------- joignabilite du cloud (V1.7) ----------
const COUPURES = new Set(['ST_RESEAU', 'ST_DELAI', 'ST_TLS']), SONDE = 30000, SONDE_DELAI = 5000;
let cloud = { etat: 'inconnu', depuis: 0 }, sondeT = null;
const auRetour = [];
export const cloudInjoignable = () => cloud.etat === 'injoignable'; // V1.7 : appareils SmartThings masques (index.mjs, familles.mjs)
export function etatCloud() { return { etat: cloud.etat, depuis: cloud.depuis ? new Date(cloud.depuis).toISOString() : null }; }
export function surRetourCloud(fn) { auRetour.push(fn); }
function noterCloud(etat) {
  if (cloud.etat === etat) return;
  const avant = cloud.etat;
  cloud = { etat, depuis: Date.now() };
  if (etat === 'inconnu') return;
  log('smartthings : cloud', etat);
  if (etat === 'injoignable') armerSonde();
  else if (avant === 'injoignable') for (const fn of auRetour) { try { fn(); } catch (e) { log('smartthings : reprise apres retour du cloud en echec'); } }
}
// Poignee de main TLS (TLS strict, nom verifie) puis fermeture : rien n'est envoye au-dela.
function poignee() {
  return new Promise((resolve) => {
    let fini = false;
    const s = tls.connect({ host: HOTE, port: PORT, servername: HOTE, rejectUnauthorized: true });
    const finir = (ok) => { if (fini) return; fini = true; clearTimeout(t); s.destroy(); resolve(ok); };
    const t = setTimeout(() => finir(false), SONDE_DELAI);
    s.once('secureConnect', () => finir(s.authorized === true));
    s.once('error', () => finir(false));
  });
}
function armerSonde() {
  if (sondeT) return;
  sondeT = setTimeout(async () => {
    sondeT = null;
    if (cloud.etat !== 'injoignable') return;
    if (!etatCompte().connecte) { noterCloud('inconnu'); return; } // compte deconnecte : plus rien a surveiller
    if (await poignee()) noterCloud('joignable'); else armerSonde();
  }, SONDE);
  if (sondeT.unref) sondeT.unref();
}

function envoyer(methode, chemin, entetes, corps) {
  if (typeof chemin !== 'string' || !CHEMINS.test(chemin)) return Promise.reject(new ErreurST('ST_CHEMIN'));
  return envoyerBrut(methode, chemin, entetes, corps).then(
    (r) => { noterCloud('joignable'); return r; },
    (e) => { if (e && COUPURES.has(e.code)) noterCloud('injoignable'); throw e; });
}
function envoyerBrut(methode, chemin, entetes, corps) {
  return new Promise((res, rej) => {
    let fini = false, t = null;
    const finir = (f, v) => { if (!fini) { fini = true; clearTimeout(t); f(v); } };
    const req = https.request({
      hostname: HOTE, port: PORT, path: chemin, method: methode, servername: HOTE, rejectUnauthorized: true, agent: false,
      headers: Object.assign({ Accept: 'application/json' }, entetes),
    }, (r) => {
      const morceaux = [];
      let n = 0;
      r.on('data', (c) => { n += c.length; if (n > MAX) { req.destroy(); finir(rej, new ErreurST('ST_REPONSE')); } else morceaux.push(c); });
      r.on('end', () => {
        let j = null;
        try { j = JSON.parse(Buffer.concat(morceaux).toString('utf8') || 'null'); } catch (e) { j = null; }
        finir(res, { statut: r.statusCode, j });
      });
      r.on('error', () => finir(rej, new ErreurST('ST_RESEAU')));
    });
    t = setTimeout(() => { req.destroy(); finir(rej, new ErreurST('ST_DELAI')); }, DELAI);
    req.on('error', (e) => finir(rej, new ErreurST(/CERT|SELF_SIGNED|UNABLE_TO_|ERR_TLS|ERR_SSL/.test(String((e && e.code) || '')) ? 'ST_TLS' : 'ST_RESEAU')));
    if (corps) req.write(corps);
    req.end();
  });
}

function lireSecrets() {
  let c;
  try { c = JSON.parse(fs.readFileSync(FICHIER, 'utf8')); } catch (e) { throw new ErreurST(e && e.code === 'ENOENT' ? 'ST_CONFIG' : 'ST_SECRET'); }
  if (!c || typeof c.client_id !== 'string' || !c.client_id || typeof c.client_secret !== 'string' || !c.client_secret
    || typeof c.refresh_token !== 'string' || !c.refresh_token) throw new ErreurST('ST_CONFIG');
  return c;
}
function ecrireSecrets(c) {
  const t = FICHIER + '.tmp-serveur';
  fs.mkdirSync(DONNEES, { recursive: true, mode: 0o700 });
  const fd = fs.openSync(t, 'w', 0o600);
  try { fs.writeSync(fd, JSON.stringify(c, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.chmodSync(t, 0o600);
  fs.renameSync(t, FICHIER);
}
// Change quand le fichier est remplace (nouvelle autorisation, restauration) : sert a relancer tout de suite apres une panne de configuration.
export function versionSecrets() { try { return fs.statSync(FICHIER).mtimeMs; } catch (e) { return 0; } }

let refuse = null; // jeton de rafraichissement refuse par le serveur (en memoire seulement)
let enCours = null;
// Verrou unique (renouvellement, autorisation, deconnexion, application) : une operation a la fois sur le fichier, dans l'ordre d'arrivee.
function exclusif(f) {
  const avant = enCours || Promise.resolve();
  const p = avant.catch(() => {}).then(f);
  const q = p.finally(() => { if (enCours === q) enCours = null; });
  enCours = q;
  return q;
}
// rejete : jeton d'acces refuse par l'API (401) -> renouvellement force.
function jeton(rejete) {
  const c = lireSecrets();
  if (c.access_token && c.access_token !== rejete && Number(c.expires_at) - Date.now() > MARGE) return Promise.resolve(c.access_token);
  return exclusif(() => renouveler(rejete)); // en file : relit le fichier et rend le jeton deja renouvele s'il est frais
}
async function renouveler(rejete) {
  const c = lireSecrets(); // relu : un autre renouvellement a pu avoir lieu
  if (c.access_token && c.access_token !== rejete && Number(c.expires_at) - Date.now() > MARGE) return c.access_token;
  if (refuse && c.refresh_token === refuse) throw new ErreurST('ST_REAUTH');
  if (cloud.etat === 'injoignable') throw new ErreurST('ST_RESEAU'); // V1.7 : aucun renouvellement tant que le cloud ne repond pas (sonde TLS)
  const corps = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id }).toString();
  const ent = {
    'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corps),
    Authorization: 'Basic ' + Buffer.from(c.client_id + ':' + c.client_secret).toString('base64'),
  };
  let r = await envoyer('POST', '/v1/oauth/token', ent, corps);
  if (r.statut === 404) r = await envoyer('POST', '/oauth/token', ent, corps); // chemin verifie par scripts/smartthings.mjs (404 : rien n'a ete consomme)
  const j = (r.j && typeof r.j === 'object') ? r.j : {};
  if (r.statut === 200 && typeof j.access_token === 'string' && j.access_token) {
    const n = Object.assign({}, c, { access_token: j.access_token, expires_at: Date.now() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600) * 1000 });
    if (typeof j.refresh_token === 'string' && j.refresh_token) n.refresh_token = j.refresh_token;
    if (typeof j.scope === 'string') n.scope = j.scope;
    try { ecrireSecrets(n); } catch (e) { log('smartthings : ENREGISTREMENT DU NOUVEAU JETON IMPOSSIBLE', (e && e.code) || ''); throw new ErreurST('ST_ECRITURE'); }
    refuse = null;
    log('smartthings : jeton renouvelé, valable', Math.round((n.expires_at - Date.now()) / 3600000), 'h, rafraîchissement renouvelé :', n.refresh_token !== c.refresh_token ? 'oui' : 'non');
    return n.access_token;
  }
  if (r.statut === 400 || r.statut === 401) { refuse = c.refresh_token; throw new ErreurST('ST_REAUTH', r.statut); }
  if (r.statut === 429) throw new ErreurST('ST_QUOTA', 429);
  throw new ErreurST('ST_HTTP', r.statut);
}

// Appel authentifie : 401 -> jeton renouvele puis un seul nouvel essai (un 401 signifie que rien n'a ete execute).
async function appel(methode, chemin, corps) {
  const ent = (t) => Object.assign({ Authorization: 'Bearer ' + t }, corps ? { 'Content-Type': 'application/json;charset=utf-8', 'Content-Length': Buffer.byteLength(corps) } : {});
  const t = await jeton(null);
  let r = await envoyer(methode, chemin, ent(t), corps);
  if (r.statut === 401) r = await envoyer(methode, chemin, ent(await jeton(t)), corps);
  if (r.statut === 200) return (r.j && typeof r.j === 'object') ? r.j : {};
  if (r.statut === 401 || r.statut === 403) throw new ErreurST('ST_DROITS', r.statut);
  if (r.statut === 404) throw new ErreurST('ST_INCONNU', 404);
  if (r.statut === 429) throw new ErreurST('ST_QUOTA', 429);
  if (methode === 'POST' && (r.statut === 400 || r.statut === 409 || r.statut === 422)) throw new ErreurST('ST_REFUS', r.statut);
  throw new ErreurST('ST_HTTP', r.statut);
}
const get = (chemin) => appel('GET', chemin);

// Commande (doc Control Devices) : POST /v1/devices/:id/commands {commands: [{component, capability, command, arguments}]} -> {results: [{id, status}]} ;
// ACCEPTED = mise en file, pas encore executee. Commandes permises (liste fermee) : washerOperatingState.setMachineState(pause | run | stop), samsungce.washerCycle.setWasherCycle(<code>) (choisirProgramme), custom.washerWaterTemperature.setWasherWaterTemperature et custom.washerSpinLevel.setWasherSpinLevel (reglerOption).
// Jamais renvoyee apres un delai ou une coupure (elle a pu etre recue) : ST_INCERTAIN.
const ETATS_MACHINE = ['pause', 'run', 'stop'];
export async function commande(deviceId, etat) {
  if (!ETATS_MACHINE.includes(etat)) throw new ErreurST('ST_CHEMIN');
  const corps = JSON.stringify({ commands: [{ component: 'main', capability: 'washerOperatingState', command: 'setMachineState', arguments: [etat] }] });
  let j;
  try { j = await appel('POST', '/v1/devices/' + encodeURIComponent(deviceId) + '/commands', corps); }
  catch (e) { throw (e instanceof ErreurST && ['ST_DELAI', 'ST_RESEAU', 'ST_REPONSE'].includes(e.code)) ? new ErreurST('ST_INCERTAIN') : e; }
  const s = j && Array.isArray(j.results) && j.results[0] && j.results[0].status;
  if (s !== 'ACCEPTED' && s !== 'COMPLETED') throw new ErreurST('ST_REFUS');
  return s;
}
// Choix du programme (definition lue sur la machine : samsungce.washerCycle.setWasherCycle(washerCycle)) : format court <code> comme la liste
// supportedCycles de la machine, verifie le 01/11/2026 (le format Table_xx_Course_<code> est accepte par le cloud mais ignore). Ne demarre jamais.
// Jamais renvoyee apres un delai ou une coupure : ST_INCERTAIN.
export async function choisirProgramme(deviceId, code) {
  if (typeof code !== 'string' || !/^[0-9A-F]{2}$/.test(code)) throw new ErreurST('ST_CHEMIN');
  const corps = JSON.stringify({ commands: [{ component: 'main', capability: 'samsungce.washerCycle', command: 'setWasherCycle', arguments: [code] }] });
  let j;
  try { j = await appel('POST', '/v1/devices/' + encodeURIComponent(deviceId) + '/commands', corps); }
  catch (e) { throw (e instanceof ErreurST && ['ST_DELAI', 'ST_RESEAU', 'ST_REPONSE'].includes(e.code)) ? new ErreurST('ST_INCERTAIN') : e; }
  const s = j && Array.isArray(j.results) && j.results[0] && j.results[0].status;
  if (s !== 'ACCEPTED' && s !== 'COMPLETED') throw new ErreurST('ST_REFUS');
  return s;
}
// Reglages (definitions lues sur la machine) : custom.washerWaterTemperature.setWasherWaterTemperature(temperature) et
// custom.washerSpinLevel.setWasherSpinLevel(spinLevel) ; valeur verifiee avant par le serveur (options declarees pour le programme). Liste fermee.
// Jamais renvoyee apres un delai ou une coupure : ST_INCERTAIN.
const OPTIONS = {
  temperature: { capability: 'custom.washerWaterTemperature', command: 'setWasherWaterTemperature' },
  essorage: { capability: 'custom.washerSpinLevel', command: 'setWasherSpinLevel' },
};
export async function reglerOption(deviceId, type, valeur) {
  const o = Object.prototype.hasOwnProperty.call(OPTIONS, type) ? OPTIONS[type] : null;
  if (!o || typeof valeur !== 'string' || !/^[A-Za-z0-9]{1,16}$/.test(valeur)) throw new ErreurST('ST_CHEMIN');
  const corps = JSON.stringify({ commands: [{ component: 'main', capability: o.capability, command: o.command, arguments: [valeur] }] });
  let j;
  try { j = await appel('POST', '/v1/devices/' + encodeURIComponent(deviceId) + '/commands', corps); }
  catch (e) { throw (e instanceof ErreurST && ['ST_DELAI', 'ST_RESEAU', 'ST_REPONSE'].includes(e.code)) ? new ErreurST('ST_INCERTAIN') : e; }
  const s = j && Array.isArray(j.results) && j.results[0] && j.results[0].status;
  if (s !== 'ACCEPTED' && s !== 'COMPLETED') throw new ErreurST('ST_REFUS');
  return s;
}
// Droit d'executer selon le scope enregistre : true, false (lecture seule) ou null (inconnu : le cloud tranchera).
export function droitCommande() {
  try { const s = JSON.parse(fs.readFileSync(FICHIER, 'utf8')).scope; return typeof s === 'string' ? /(^|\s)x:devices:/.test(s) : null; } catch (e) { return null; }
}

// Lecture seule : liste des appareils (pages suivantes seulement sur le meme hote) et etat d'un appareil.
export async function appareils() {
  const tous = [];
  let chemin = '/v1/devices';
  for (let n = 0; chemin && n < 10; n++) {
    const j = await get(chemin);
    for (const d of (Array.isArray(j.items) ? j.items : [])) tous.push(d);
    const h = j._links && j._links.next && j._links.next.href;
    chemin = null;
    if (typeof h === 'string') {
      try { const u = new URL(h); if (u.protocol === 'https:' && u.hostname === HOTE && Number(u.port || 443) === PORT && CHEMINS.test(u.pathname + u.search)) chemin = u.pathname + u.search; } catch (e) { /* lien ignore */ }
    }
  }
  return tous;
}
export const statut = (deviceId) => get('/v1/devices/' + encodeURIComponent(deviceId) + '/status');
// Connexion (doc Device Health) : { state: ONLINE | UNHEALTHY | OFFLINE, lastUpdatedDate }.
export const sante = (deviceId) => get('/v1/devices/' + encodeURIComponent(deviceId) + '/health');

// ---- Compte (V1.1, routes dans compte.mjs) : doc Implement the OAuth 2.0 Flow ; ecritures sous le verrou exclusif(). ----
export const RETOUR = 'https://httpbin.org/get'; // localhost refuse par SmartThings ; la page affiche le code, inutilisable sans client_secret
export const SCOPES = { lecture: 'r:devices:*', commande: 'r:devices:* x:devices:*' };
const JETONS = ['access_token', 'refresh_token', 'expires_at', 'scope', 'autorise_le'];
function lireBrut() {
  try { const c = JSON.parse(fs.readFileSync(FICHIER, 'utf8')); return c && typeof c === 'object' && !Array.isArray(c) ? c : {}; }
  catch (e) { if (e && e.code === 'ENOENT') return {}; throw new ErreurST('ST_SECRET'); }
}
const rempli = (c, k) => typeof c[k] === 'string' && c[k].length > 0;
// Etat sans aucun secret.
export function etatCompte() {
  let c;
  try { c = lireBrut(); } catch (e) { return { lisible: false, application: false, connecte: false, reautoriser: false, droits: null, commande: null, autorise_le: null, deconnecte_le: null }; }
  const scope = typeof c.scope === 'string' ? c.scope : null;
  const bloque = !!(refuse && c.refresh_token === refuse);
  return {
    lisible: true, application: rempli(c, 'client_id') && rempli(c, 'client_secret'), connecte: rempli(c, 'refresh_token') && !bloque, reautoriser: bloque,
    droits: scope, commande: scope ? /(^|\s)x:devices:/.test(scope) : null,
    autorise_le: rempli(c, 'autorise_le') ? c.autorise_le : null, deconnecte_le: rempli(c, 'deconnecte_le') ? c.deconnecte_le : null,
  };
}
// Adresse ouverte par le navigateur (chemin valide en V1.0 par scripts/smartthings.mjs).
export function adresseAutorisation(scope, state) {
  const c = lireBrut();
  if (!rempli(c, 'client_id') || !rempli(c, 'client_secret')) throw new ErreurST('ST_CONFIG');
  return 'https://' + HOTE + '/oauth/authorize?' + new URLSearchParams({ client_id: c.client_id, response_type: 'code', redirect_uri: RETOUR, scope, state }).toString();
}
// Echange du code (doc : POST /v1/oauth/token, Basic client_id:client_secret, grant_type=authorization_code, code, client_id, redirect_uri).
export function echangerCode(code, scope) {
  return exclusif(async () => {
    const c = lireBrut();
    if (!rempli(c, 'client_id') || !rempli(c, 'client_secret')) throw new ErreurST('ST_CONFIG');
    const corps = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: c.client_id, redirect_uri: RETOUR }).toString();
    const ent = {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corps),
      Authorization: 'Basic ' + Buffer.from(c.client_id + ':' + c.client_secret).toString('base64'),
    };
    let r = await envoyer('POST', '/v1/oauth/token', ent, corps);
    if (r.statut === 404) r = await envoyer('POST', '/oauth/token', ent, corps); // 404 : rien n'a ete consomme
    const j = (r.j && typeof r.j === 'object') ? r.j : {};
    if (r.statut === 200 && typeof j.access_token === 'string' && j.access_token && typeof j.refresh_token === 'string' && j.refresh_token) {
      const n = Object.assign({}, c, {
        access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600) * 1000,
        scope: typeof j.scope === 'string' && j.scope ? j.scope : scope, autorise_le: new Date().toISOString(),
      });
      delete n.deconnecte_le;
      try { ecrireSecrets(n); } catch (e) { log('smartthings : ENREGISTREMENT DE L\'AUTORISATION IMPOSSIBLE', (e && e.code) || ''); throw new ErreurST('ST_ECRITURE'); }
      refuse = null;
      log('smartthings : autorisation enregistrée depuis l\'application, droits :', n.scope);
      return n.access_token;
    }
    if (r.statut === 400 || r.statut === 401) throw new ErreurST('ST_CODE', r.statut);
    if (r.statut === 429) throw new ErreurST('ST_QUOTA', 429);
    throw new ErreurST('ST_HTTP', r.statut);
  });
}
// Deconnexion : jetons effaces localement (client_id et client_secret gardes) ; aucune route officielle de revocation.
export function effacerJetons() {
  return exclusif(async () => {
    const c = lireBrut();
    if (!Object.keys(c).length) return;
    for (const k of JETONS) delete c[k];
    c.deconnecte_le = new Date().toISOString();
    try { ecrireSecrets(c); } catch (e) { throw new ErreurST('ST_ECRITURE'); }
    refuse = null; noterCloud('inconnu'); // compte deconnecte : joignabilite sans objet (V1.7)
    log('smartthings : compte déconnecté (jetons effacés)');
  });
}
// Application OAuth (saisie de secours) : un autre client_id rend les jetons inutilisables -> effaces ; meme client_id -> jetons gardes.
export function enregistrerApplication(id, secret) {
  return exclusif(async () => {
    const c = lireBrut();
    const autre = rempli(c, 'client_id') && c.client_id !== id;
    const n = Object.assign({}, c, { client_id: id, client_secret: secret });
    if (autre) { for (const k of JETONS) delete n[k]; refuse = null; }
    try { ecrireSecrets(n); } catch (e) { throw new ErreurST('ST_ECRITURE'); }
    log('smartthings : application OAuth enregistrée' + (autre ? ' (nouvelle application : connexion à refaire)' : ''));
  });
}
// FIN
