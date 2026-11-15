// @zone electromenager
// smartthings.mjs : configuration (config, autoriser) et diagnostic (liste, machine, lecture seule) du cloud SmartThings, sans jamais afficher un jeton ; serveur arrete. Le compte se gere aussi depuis l'application (icone compte). Usage : node scripts/smartthings.mjs config | autoriser ['r:devices:* x:devices:*'] | liste | machine [deviceId] (tout appareil ; secrets, identifiants et donnees geographiques masques). Secrets : donnees/smartthings.json (600).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_DON = String(process.env.DOMOWA_DONNEES || '').trim(); // V1.8 : meme regle que core/outils.mjs (choisirDonnees)
const DON = ENV_DON && path.isAbsolute(ENV_DON) ? path.resolve(ENV_DON) : path.join(DIR, 'donnees');
const FICHIER = path.join(DON, 'smartthings.json');
const API = 'https://api.smartthings.com'; // seul hote contacte
const RETOUR = 'https://httpbin.org/get'; // page publique qui affiche le code ; le code seul est inutilisable sans le client_secret
const SCOPE = 'r:devices:*'; // par defaut : lecture seule
// Droits demandables (liste fermee, doc App Setup) : r = lire, x = executer des commandes ; w (supprimer, renommer) inutile ici.
const SCOPES_OK = ['r:devices:*', 'x:devices:*'];
function choisirScope(arg) {
  const s = [...new Set(String(arg || SCOPE).trim().split(/\s+/))];
  if (!s.includes('r:devices:*') || s.some((x) => !SCOPES_OK.includes(x))) throw new Error('droits acceptes : ' + SCOPES_OK.join(' ') + ' (r:devices:* obligatoire), entre apostrophes');
  return s.join(' ');
}

const lire = () => { try { return JSON.parse(fs.readFileSync(FICHIER, 'utf8')); } catch (e) { return {}; } };
function ecrire(o) { // atomique, 600
  fs.mkdirSync(DON, { recursive: true, mode: 0o700 });
  const t = FICHIER + '.tmp';
  fs.writeFileSync(t, JSON.stringify(o, null, 2), { mode: 0o600 });
  fs.chmodSync(t, 0o600);
  fs.renameSync(t, FICHIER);
}
function propre(s) { // remplace tout secret connu
  const c = lire();
  let t = String(s);
  for (const k of ['client_secret', 'access_token', 'refresh_token']) if (c[k] && c[k].length > 6) t = t.split(c[k]).join('***');
  return t;
}
const dire = (...a) => console.log(propre(a.join(' ')));
const motif = (j) => String((j && (j.error_description || j.error || j.message)) || '').replace(/[^\w .,:\/-]/g, '').slice(0, 120);
// Masquage avant affichage (sortie destinee a etre collee dans un chat) : secrets, identifiants materiels ou personnels, et TOUTE donnee geographique.
// Une cle est decoupee en mots (camelCase, _, -, .) : "otnDUID" -> otn, duid ; "timeInMin" -> time, in, min (plus de faux "imei").
// Cle sensible -> '***' ; cle geographique -> '*** (geo)' ; capacite geographique (geolocation, location, position...) -> toutes ses valeurs masquees ;
// valeur qui ressemble a des coordonnees (texte "48.8566, 2.3522", URI geo:, paire de decimaux) -> masquee quelle que soit sa cle.
const mots = (k) => String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const SENS_SOUS = /token|secret|passw|serial|apikey|address|email|userid|ownerid|deviceid|account|encrypt|nonce|certif/i;
const SENS_MOTS = new Set(['imei', 'mac', 'bssid', 'ssid', 'ip', 'ipv4', 'ipv6', 'di', 'pi', 'uid', 'duid', 'uuid', 'guid', 'eui', 'key', 'pin', 'phone', 'cert', 'owner', 'mail']);
const GEO_SOUS = /latitude|longitude|geo|locat|coord|altitude|accuracy|position|gps|postal|zipcode|street|country|timezone/i;
const GEO_MOTS = new Set(['lat', 'lng', 'lon', 'alt', 'zip', 'city', 'place', 'heading']);
const sensible = (k) => SENS_SOUS.test(k) || mots(k).some((m) => SENS_MOTS.has(m));
const geo = (k) => GEO_SOUS.test(k) || mots(k).some((m) => GEO_MOTS.has(m));
const CAP_GEO = /geo|locat|position|gps|coord|fmm/i;
const COORD = /-?\d{1,3}\.\d{3,}\s*[,; ]\s*-?\d{1,3}\.\d{3,}/;
const NB = { sens: 0, geo: 0 };
const decimal = (x) => typeof x === 'number' && !Number.isInteger(x) && Math.abs(x) <= 180;
function masque(v) {
  if (Array.isArray(v)) {
    if (v.length === 2 && v.every(decimal)) { NB.geo++; return '*** (coordonnees)'; }
    return v.map(masque);
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      if (geo(k)) { NB.geo++; o[k] = '*** (geo)'; } else if (sensible(k)) { NB.sens++; o[k] = '***'; } else o[k] = masque(v[k]);
    }
    return o;
  }
  if (typeof v === 'string' && (COORD.test(v) || /^geo:/i.test(v.trim()))) { NB.geo++; return '*** (coordonnees)'; }
  return v;
}
function attribut(cap, at, a) { // texte affiche pour un attribut de l'etat, deja masque
  if (CAP_GEO.test(cap) || geo(at)) { NB.geo++; return '*** (donnee geographique masquee)'; }
  if (sensible(at)) { NB.sens++; return '***'; }
  const m = masque(a && typeof a === 'object' && 'value' in a ? a.value : a);
  return LIGNE(m) + (a && typeof a.unit === 'string' && !sensible(a.unit) ? ' ' + a.unit : '');
}

function demander(question, muet) {
  return new Promise((res, rej) => {
    if (!process.stdin.isTTY) return rej(new Error('a lancer directement dans Termux (pas en redirection)'));
    if (muet) process.stdout.write(question); // sinon : invite de readline (ecrite avant, elle etait effacee par le terminal)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (muet) rl._writeToOutput = () => {};
    rl.question(muet ? '' : question, (r) => { if (muet) process.stdout.write('\n'); rl.close(); res(r.trim()); });
  });
}

async function jetonPost(form, c) {
  const r = await fetch(API + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(c.client_id + ':' + c.client_secret).toString('base64') },
    body: new URLSearchParams(Object.assign({ client_id: c.client_id, client_secret: c.client_secret }, form)).toString(),
    signal: AbortSignal.timeout(15000),
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* corps vide */ }
  if (!r.ok || !j.access_token) throw new Error('jeton refuse : HTTP ' + r.status + ' ' + motif(j));
  return j;
}
function garder(c, j) { // ecrit tout de suite le nouveau jeton de rafraichissement (usage unique)
  const ancien = c.refresh_token;
  c.access_token = j.access_token;
  if (j.refresh_token) c.refresh_token = j.refresh_token;
  c.expires_at = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  if (j.scope) c.scope = String(j.scope);
  ecrire(c);
  const durees = Object.keys(j).filter((k) => /expires/i.test(k)).map((k) => k + '=' + Number(j[k])).join(' ');
  dire('reponse du serveur : champs [' + Object.keys(j).join(', ') + ']', durees, '| jeton de rafraichissement renouvele :', ancien ? (j.refresh_token && j.refresh_token !== ancien ? 'oui' : 'non') : 'premier');
}
async function jeton() {
  const c = lire();
  if (!c.client_id || !c.client_secret) throw new Error('lancez d abord : node scripts/smartthings.mjs config');
  if (!c.refresh_token) throw new Error('lancez d abord : node scripts/smartthings.mjs autoriser');
  if (c.access_token && c.expires_at - Date.now() > 300000) return c.access_token;
  garder(c, await jetonPost({ grant_type: 'refresh_token', refresh_token: c.refresh_token }, c));
  return c.access_token;
}
async function get(chemin) {
  const url = chemin.startsWith('http') ? chemin : API + chemin;
  if (!url.startsWith(API + '/')) throw new Error('hote refuse');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await jeton(), Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + motif(j));
  return j;
}

async function config() {
  const c = lire();
  const id = await demander('client_id de l application OAuth' + (c.client_id ? ' (Entree = garder) ' : ' ') + ': ');
  const sec = await demander('client_secret (saisie masquee)' + (c.client_secret ? ' (Entree = garder) ' : ' ') + ': ', true);
  if (id) c.client_id = id;
  if (sec) c.client_secret = sec;
  if (!c.client_id || !c.client_secret) throw new Error('client_id et client_secret sont necessaires');
  ecrire(c);
  dire('Enregistre dans donnees/smartthings.json (600).');
}

async function autoriser(arg) {
  const scope = choisirScope(arg);
  const c = lire();
  if (!c.client_id || !c.client_secret) throw new Error('lancez d abord : node scripts/smartthings.mjs config');
  const url = API + '/oauth/authorize?' + new URLSearchParams({ client_id: c.client_id, response_type: 'code', redirect_uri: RETOUR, scope }).toString();
  dire('1) Ouvrez cette adresse dans Chrome (droits demandes : ' + scope + '), connectez-vous, acceptez.');
  dire('2) La page httpbin affiche un champ "code" : copiez sa valeur.');
  dire(url);
  spawnSync('am', ['start', '-a', 'android.intent.action.VIEW', '-d', url], { stdio: 'ignore' });
  const code = await demander('3) Collez le code (saisie masquee) : ', true);
  if (!code) throw new Error('code vide');
  dire('(' + code.length + ' caracteres recus)');
  garder(c, await jetonPost({ grant_type: 'authorization_code', code, redirect_uri: RETOUR, scope }, c));
  dire('Autorisation enregistree (jetons non affiches). Droits accordes : ' + (c.scope || 'non indiques'));
}

const estLave = (d) => (d.components || []).some((k) => (k.capabilities || []).some((x) => x && (x.id === 'washerOperatingState' || x.id === 'samsungce.washerOperatingState'))); // comme le serveur (dishwasherOperatingState contient « washer »)
async function appareils() {
  const tous = [];
  let url = '/v1/devices';
  for (let n = 0; url && n < 10; n++) {
    const j = await get(url);
    for (const d of j.items || []) tous.push(d);
    url = j._links && j._links.next && j._links.next.href;
  }
  return tous;
}
async function liste() {
  const tous = await appareils();
  dire(tous.length + ' appareil(s) :');
  for (const d of tous) {
    const nb = (d.components || []).reduce((a, k) => a + (k.capabilities || []).length, 0);
    dire('- ' + (d.label || d.name) + ' | id=' + d.deviceId + ' | ' + (d.manufacturerName || '?') + ' | ' + (d.deviceTypeName || d.presentationId || '?') + ' | ' + nb + ' capacites' + (estLave(d) ? ' | <- lave-linge probable' : ''));
  }
}
const LIGNE = (v) => { const s = JSON.stringify(v); return s === undefined ? 'null' : s.length > 400 ? s.slice(0, 400) + '...' : s; };
const MAXDEF = 80; // definitions de capacites lues au plus (une requete chacune)
const argument = (p) => {
  const s = (p && p.schema) || {};
  let t = String(p && p.name) + (p && p.optional ? '?' : '');
  if (Array.isArray(s.enum)) t += ':' + s.enum.slice(0, 40).join('|');
  else if (s.type) t += ':' + s.type + (s.minimum !== undefined || s.maximum !== undefined ? ' ' + (s.minimum !== undefined ? s.minimum : '') + '..' + (s.maximum !== undefined ? s.maximum : '') : '');
  return t;
};
async function machine(arg) {
  let id = arg;
  if (!id) {
    const l = (await appareils()).filter(estLave);
    if (l.length !== 1) { dire(l.length + ' lave-linge probable(s). Relancez avec l id (voir : node scripts/smartthings.mjs liste) :'); for (const d of l) dire('- ' + (d.label || d.name) + ' id=' + d.deviceId); return; }
    id = l[0].deviceId;
  }
  const d = await get('/v1/devices/' + encodeURIComponent(id));
  dire('Appareil :', d.label || d.name, '|', d.manufacturerName || '?', '|', d.deviceTypeName || d.presentationId || '?');
  const defs = [];
  for (const k of d.components || []) {
    dire('Composant ' + k.id + ' : ' + (k.capabilities || []).map((x) => x.id + ' v' + x.version).join(', '));
    for (const x of k.capabilities || []) if (x && x.id && !defs.some((y) => y.id === x.id)) defs.push(x);
  }
  const s = await get('/v1/devices/' + encodeURIComponent(id) + '/status');
  dire('--- ETAT (une ligne par attribut ; secrets, identifiants et toute donnee geographique masques) ---');
  const comps = (s && s.components) || {};
  for (const k of Object.keys(comps)) for (const cap of Object.keys(comps[k] || {})) {
    const attrs = comps[k][cap];
    if (!attrs || typeof attrs !== 'object') continue;
    for (const at of Object.keys(attrs)) dire(k + '.' + cap + '.' + at + ' = ' + attribut(cap, at, attrs[at]));
  }
  dire('--- COMMANDES DE TOUTES LES CAPACITES (definitions publiques, lecture seule) ---');
  for (const x of defs.slice(0, MAXDEF)) {
    try {
      const def = await get('/v1/capabilities/' + encodeURIComponent(x.id) + '/' + encodeURIComponent(x.version || 1));
      const cmds = def.commands || {};
      const n = Object.keys(cmds);
      dire(x.id + ' v' + (x.version || 1) + (def.status && def.status !== 'live' ? ' [' + def.status + ']' : '') + ' : ' + (n.length ? n.map((c) => c + '(' + ((cmds[c] && cmds[c].arguments) || []).map(argument).join(', ') + ')').join(' ; ') : 'aucune commande (lecture seule)'));
    } catch (e) { dire(x.id + ' : definition illisible (' + e.message + ')'); }
  }
  if (defs.length > MAXDEF) dire('(' + (defs.length - MAXDEF) + ' capacite(s) non lue(s) : limite ' + MAXDEF + ')');
  dire('--- MASQUAGE : ' + NB.sens + ' valeur(s) sensible(s) et ' + NB.geo + ' donnee(s) geographique(s) masquee(s). Relisez avant de coller. ---');
}

const [, , cmd, arg] = process.argv;
const ACTIONS = { config, autoriser, liste, machine };
if (!ACTIONS[cmd]) { console.log("Usage : node scripts/smartthings.mjs config | autoriser ['r:devices:* x:devices:*'] | liste | machine [deviceId]"); process.exit(1); }
ACTIONS[cmd](arg).then(() => process.exit(0), (e) => { console.error('ERREUR : ' + propre(e.message)); process.exit(1); });
// FIN
