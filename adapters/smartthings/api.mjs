// @zone electromenager | Client du cloud SmartThings : HTTPS vers api.smartthings.com seul (TLS strict, aucune redirection suivie, 10 s, 1 Mo max) ; jetons OAuth de donnees/smartthings.json (600).
// Renouvellement (doc officielle Token Management) : POST /v1/oauth/token, Basic client_id:client_secret, grant_type=refresh_token ; jeton de rafraichissement a usage unique :
// un seul renouvellement a la fois, fichier relu avant, nouveau jeton ecrit (atomique, fsync) AVANT tout usage. Jeton refuse : plus aucun essai tant que le fichier ne change pas.
// Erreurs : ErreurST, code ST_* a message fixe (jamais de jeton, d'adresse ni de reponse brute).
// V1.7 : joignabilite du cloud (etatCloud), distincte du compte : toute reponse HTTP -> joignable ; ST_RESEAU, ST_DELAI, ST_TLS -> injoignable. Injoignable (compte connecte) :
// poignee de main TLS stricte seule vers api.smartthings.com:443 toutes les 30 s (aucune requete HTTP, aucun chemin ni jeton) ; reussie -> joignable, crochets surRetourCloud.
// Jamais de renouvellement du jeton tant que le cloud est injoignable (ST_RESEAU sans envoi) : une coupure ne consomme ni n'efface le jeton de rafraichissement.
// Qualite 2026-11-15 : etat (joignabilite, jeton refuse, verrou) dans creerClient(dependances) ; les exports nommes sont ceux de l'instance unique du serveur
// (client). Dependances remplacables pour les essais (banc/unitaires/smartthings-client.test.mjs) : fichier, requete (https.request), connecter (tls.connect),
// maintenant (Date.now), attendre / annuler (setTimeout / clearTimeout), journal (log). Comportement inchange.
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


const COUPURES = new Set(['ST_RESEAU', 'ST_DELAI', 'ST_TLS']), SONDE = 30000, SONDE_DELAI = 5000;
// Erreurs d'une commande envoyee dont on ne sait pas si elle a ete recue : jamais renvoyee (ST_INCERTAIN).
const INCERTAINES = new Set(['ST_DELAI', 'ST_RESEAU', 'ST_REPONSE']);
// Commandes permises (liste fermee) : washerOperatingState.setMachineState(pause | run | stop), samsungce.washerCycle.setWasherCycle(<code>),
// custom.washerWaterTemperature.setWasherWaterTemperature et custom.washerSpinLevel.setWasherSpinLevel.
const ETATS_MACHINE = ['pause', 'run', 'stop'];
const OPTIONS = {
  temperature: { capability: 'custom.washerWaterTemperature', command: 'setWasherWaterTemperature' },
  essorage: { capability: 'custom.washerSpinLevel', command: 'setWasherSpinLevel' },
};
export const RETOUR = 'https://httpbin.org/get'; // localhost refuse par SmartThings ; la page affiche le code, inutilisable sans client_secret
export const SCOPES = { lecture: 'r:devices:*', commande: 'r:devices:* x:devices:*' };
const JETONS = ['access_token', 'refresh_token', 'expires_at', 'scope', 'autorise_le'];
const rempli = (c, k) => typeof c[k] === 'string' && c[k].length > 0;
const objet = (j) => ((j && typeof j === 'object') ? j : {});

export function creerClient(d = {}) {
  const o = {
    fichier: FICHIER, requete: (opts, cb) => https.request(opts, cb), connecter: (opts) => tls.connect(opts), maintenant: () => Date.now(),
    attendre: (f, ms) => setTimeout(f, ms), annuler: (t) => clearTimeout(t), journal: log, ...d,
  };
  const FIC = o.fichier;

  // ---------- joignabilite du cloud (V1.7) ----------
  let cloud = { etat: 'inconnu', depuis: 0 }, sondeT = null;
  const auRetour = [];
  const cloudInjoignable = () => cloud.etat === 'injoignable'; // V1.7 : appareils SmartThings masques (index.mjs, familles.mjs)
  function etatCloud() { return { etat: cloud.etat, depuis: cloud.depuis ? new Date(cloud.depuis).toISOString() : null }; }
  function surRetourCloud(fn) { auRetour.push(fn); }
  function noterCloud(etat) {
    if (cloud.etat === etat) return;
    const avant = cloud.etat;
    cloud = { etat, depuis: o.maintenant() };
    if (etat === 'inconnu') return;
    o.journal('smartthings : cloud', etat);
    if (etat === 'injoignable') armerSonde();
    else if (avant === 'injoignable') for (const fn of auRetour) { try { fn(); } catch (e) { o.journal('smartthings : reprise apres retour du cloud en echec'); } }
  }
  // Poignee de main TLS (TLS strict, nom verifie) puis fermeture : rien n'est envoye au-dela.
  function poignee() {
    return new Promise((resolve) => {
      let fini = false;
      const s = o.connecter({ host: HOTE, port: PORT, servername: HOTE, rejectUnauthorized: true });
      const finir = (ok) => { if (fini) return; fini = true; o.annuler(t); s.destroy(); resolve(ok); };
      const t = o.attendre(() => finir(false), SONDE_DELAI);
      s.once('secureConnect', () => finir(s.authorized === true));
      s.once('error', () => finir(false));
    });
  }
  function armerSonde() {
    if (sondeT) return;
    sondeT = o.attendre(async () => {
      sondeT = null;
      if (cloud.etat !== 'injoignable') return;
      if (!etatCompte().connecte) { noterCloud('inconnu'); return; } // compte deconnecte : plus rien a surveiller
      if (await poignee()) noterCloud('joignable'); else armerSonde();
    }, SONDE);
    if (sondeT && sondeT.unref) sondeT.unref();
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
      const finir = (f, v) => { if (!fini) { fini = true; o.annuler(t); f(v); } };
      const req = o.requete({
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
      t = o.attendre(() => { req.destroy(); finir(rej, new ErreurST('ST_DELAI')); }, DELAI);
      req.on('error', (e) => finir(rej, new ErreurST(/CERT|SELF_SIGNED|UNABLE_TO_|ERR_TLS|ERR_SSL/.test(String((e && e.code) || '')) ? 'ST_TLS' : 'ST_RESEAU')));
      if (corps) req.write(corps);
      req.end();
    });
  }

  // ---------- fichier des secrets ----------
  function lireSecrets() {
    let c;
    try { c = JSON.parse(fs.readFileSync(FIC, 'utf8')); } catch (e) { throw new ErreurST(e && e.code === 'ENOENT' ? 'ST_CONFIG' : 'ST_SECRET'); }
    if (!c || typeof c.client_id !== 'string' || !c.client_id || typeof c.client_secret !== 'string' || !c.client_secret
      || typeof c.refresh_token !== 'string' || !c.refresh_token) throw new ErreurST('ST_CONFIG');
    return c;
  }
  function ecrireSecrets(c) {
    const t = FIC + '.tmp-serveur';
    fs.mkdirSync(path.dirname(FIC), { recursive: true, mode: 0o700 });
    const fd = fs.openSync(t, 'w', 0o600);
    try { fs.writeSync(fd, JSON.stringify(c, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.chmodSync(t, 0o600);
    fs.renameSync(t, FIC);
  }
  // Change quand le fichier est remplace (nouvelle autorisation, restauration) : sert a relancer tout de suite apres une panne de configuration.
  function versionSecrets() { try { return fs.statSync(FIC).mtimeMs; } catch (e) { return 0; } }
  function lireBrut() {
    try { const c = JSON.parse(fs.readFileSync(FIC, 'utf8')); return c && typeof c === 'object' && !Array.isArray(c) ? c : {}; }
    catch (e) { if (e && e.code === 'ENOENT') return {}; throw new ErreurST('ST_SECRET'); }
  }

  // ---------- jeton ----------
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
  const frais = (c, rejete) => c.access_token && c.access_token !== rejete && Number(c.expires_at) - o.maintenant() > MARGE;
  const echeance = (j) => o.maintenant() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600) * 1000;
  // POST du chemin de jeton (doc : Basic client_id:client_secret, corps en formulaire) ; 404 : second chemin officiel (rien n'a ete consomme,
  // chemin verifie par scripts/smartthings.mjs). Rend {statut, j (objet)}.
  async function posterJeton(c, champs) {
    const corps = new URLSearchParams(champs).toString();
    const ent = {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corps),
      Authorization: 'Basic ' + Buffer.from(c.client_id + ':' + c.client_secret).toString('base64'),
    };
    let r = await envoyer('POST', '/v1/oauth/token', ent, corps);
    if (r.statut === 404) r = await envoyer('POST', '/oauth/token', ent, corps);
    return { statut: r.statut, j: objet(r.j) };
  }
  // rejete : jeton d'acces refuse par l'API (401) -> renouvellement force.
  function jeton(rejete) {
    const c = lireSecrets();
    if (frais(c, rejete)) return Promise.resolve(c.access_token);
    return exclusif(() => renouveler(rejete)); // en file : relit le fichier et rend le jeton deja renouvele s'il est frais
  }
  async function renouveler(rejete) {
    const c = lireSecrets(); // relu : un autre renouvellement a pu avoir lieu
    if (frais(c, rejete)) return c.access_token;
    if (refuse && c.refresh_token === refuse) throw new ErreurST('ST_REAUTH');
    if (cloud.etat === 'injoignable') throw new ErreurST('ST_RESEAU'); // V1.7 : aucun renouvellement tant que le cloud ne repond pas (sonde TLS)
    const { statut, j } = await posterJeton(c, { grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id });
    if (statut === 200 && typeof j.access_token === 'string' && j.access_token) {
      const n = Object.assign({}, c, { access_token: j.access_token, expires_at: echeance(j) });
      if (typeof j.refresh_token === 'string' && j.refresh_token) n.refresh_token = j.refresh_token;
      if (typeof j.scope === 'string') n.scope = j.scope;
      try { ecrireSecrets(n); } catch (e) { o.journal('smartthings : ENREGISTREMENT DU NOUVEAU JETON IMPOSSIBLE', (e && e.code) || ''); throw new ErreurST('ST_ECRITURE'); }
      refuse = null;
      o.journal('smartthings : jeton renouvelé, valable', Math.round((n.expires_at - o.maintenant()) / 3600000), 'h, rafraîchissement renouvelé :', n.refresh_token !== c.refresh_token ? 'oui' : 'non');
      return n.access_token;
    }
    if (statut === 400 || statut === 401) { refuse = c.refresh_token; throw new ErreurST('ST_REAUTH', statut); }
    if (statut === 429) throw new ErreurST('ST_QUOTA', 429);
    throw new ErreurST('ST_HTTP', statut);
  }

  // Appel authentifie : 401 -> jeton renouvele puis un seul nouvel essai (un 401 signifie que rien n'a ete execute).
  async function appel(methode, chemin, corps) {
    const ent = (t) => Object.assign({ Authorization: 'Bearer ' + t }, corps ? { 'Content-Type': 'application/json;charset=utf-8', 'Content-Length': Buffer.byteLength(corps) } : {});
    const t = await jeton(null);
    let r = await envoyer(methode, chemin, ent(t), corps);
    if (r.statut === 401) r = await envoyer(methode, chemin, ent(await jeton(t)), corps);
    if (r.statut === 200) return objet(r.j);
    if (r.statut === 401 || r.statut === 403) throw new ErreurST('ST_DROITS', r.statut);
    if (r.statut === 404) throw new ErreurST('ST_INCONNU', 404);
    if (r.statut === 429) throw new ErreurST('ST_QUOTA', 429);
    if (methode === 'POST' && (r.statut === 400 || r.statut === 409 || r.statut === 422)) throw new ErreurST('ST_REFUS', r.statut);
    throw new ErreurST('ST_HTTP', r.statut);
  }
  const get = (chemin) => appel('GET', chemin);

  // ---------- commandes ----------
  // Commande (doc Control Devices) : POST /v1/devices/:id/commands {commands: [{component, capability, command, arguments}]} -> {results: [{id, status}]} ;
  // ACCEPTED = mise en file, pas encore executee. Jamais renvoyee apres un delai ou une coupure (elle a pu etre recue) : ST_INCERTAIN.
  async function envoyerCommande(deviceId, capability, command, valeur) {
    const corps = JSON.stringify({ commands: [{ component: 'main', capability, command, arguments: [valeur] }] });
    let j;
    try { j = await appel('POST', '/v1/devices/' + encodeURIComponent(deviceId) + '/commands', corps); }
    catch (e) { throw (e instanceof ErreurST && INCERTAINES.has(e.code)) ? new ErreurST('ST_INCERTAIN') : e; }
    const s = j && Array.isArray(j.results) && j.results[0] && j.results[0].status;
    if (s !== 'ACCEPTED' && s !== 'COMPLETED') throw new ErreurST('ST_REFUS');
    return s;
  }
  function commande(deviceId, etat) {
    if (!ETATS_MACHINE.includes(etat)) return Promise.reject(new ErreurST('ST_CHEMIN'));
    return envoyerCommande(deviceId, 'washerOperatingState', 'setMachineState', etat);
  }
  // Choix du programme (definition lue sur la machine : samsungce.washerCycle.setWasherCycle(washerCycle)) : format court <code> comme la liste
  // supportedCycles de la machine, verifie le 01/11/2026 (le format Table_xx_Course_<code> est accepte par le cloud mais ignore). Ne demarre jamais.
  function choisirProgramme(deviceId, code) {
    if (typeof code !== 'string' || !/^[0-9A-F]{2}$/.test(code)) return Promise.reject(new ErreurST('ST_CHEMIN'));
    return envoyerCommande(deviceId, 'samsungce.washerCycle', 'setWasherCycle', code);
  }
  // Reglages (definitions lues sur la machine) : custom.washerWaterTemperature.setWasherWaterTemperature(temperature) et
  // custom.washerSpinLevel.setWasherSpinLevel(spinLevel) ; valeur verifiee avant par le serveur (options declarees pour le programme).
  function reglerOption(deviceId, type, valeur) {
    const x = Object.prototype.hasOwnProperty.call(OPTIONS, type) ? OPTIONS[type] : null;
    if (!x || typeof valeur !== 'string' || !/^[A-Za-z0-9]{1,16}$/.test(valeur)) return Promise.reject(new ErreurST('ST_CHEMIN'));
    return envoyerCommande(deviceId, x.capability, x.command, valeur);
  }
  // Droit d'executer selon le scope enregistre : true, false (lecture seule) ou null (inconnu : le cloud tranchera).
  function droitCommande() {
    try { const s = JSON.parse(fs.readFileSync(FIC, 'utf8')).scope; return typeof s === 'string' ? /(^|\s)x:devices:/.test(s) : null; } catch (e) { return null; }
  }

  // ---------- lecture seule : liste des appareils (pages suivantes seulement sur le meme hote) et etat d'un appareil ----------
  async function appareils() {
    const tous = [];
    let chemin = '/v1/devices';
    for (let n = 0; chemin && n < 10; n++) {
      const j = await get(chemin);
      for (const x of (Array.isArray(j.items) ? j.items : [])) tous.push(x);
      const h = j._links && j._links.next && j._links.next.href;
      chemin = null;
      if (typeof h === 'string') {
        try { const u = new URL(h); if (u.protocol === 'https:' && u.hostname === HOTE && Number(u.port || 443) === PORT && CHEMINS.test(u.pathname + u.search)) chemin = u.pathname + u.search; } catch (e) { /* lien ignore */ }
      }
    }
    return tous;
  }
  const statut = (deviceId) => get('/v1/devices/' + encodeURIComponent(deviceId) + '/status');
  // Connexion (doc Device Health) : { state: ONLINE | UNHEALTHY | OFFLINE, lastUpdatedDate }.
  const sante = (deviceId) => get('/v1/devices/' + encodeURIComponent(deviceId) + '/health');

  // ---- Compte (V1.1, routes dans compte.mjs) : doc Implement the OAuth 2.0 Flow ; ecritures sous le verrou exclusif(). ----
  // Etat sans aucun secret.
  function etatCompte() {
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
  function adresseAutorisation(scope, state) {
    const c = lireBrut();
    if (!rempli(c, 'client_id') || !rempli(c, 'client_secret')) throw new ErreurST('ST_CONFIG');
    return 'https://' + HOTE + '/oauth/authorize?' + new URLSearchParams({ client_id: c.client_id, response_type: 'code', redirect_uri: RETOUR, scope, state }).toString();
  }
  // Echange du code (doc : POST /v1/oauth/token, Basic client_id:client_secret, grant_type=authorization_code, code, client_id, redirect_uri).
  function echangerCode(code, scope) {
    return exclusif(async () => {
      const c = lireBrut();
      if (!rempli(c, 'client_id') || !rempli(c, 'client_secret')) throw new ErreurST('ST_CONFIG');
      const { statut: s, j } = await posterJeton(c, { grant_type: 'authorization_code', code, client_id: c.client_id, redirect_uri: RETOUR });
      if (s === 200 && typeof j.access_token === 'string' && j.access_token && typeof j.refresh_token === 'string' && j.refresh_token) {
        const n = Object.assign({}, c, {
          access_token: j.access_token, refresh_token: j.refresh_token, expires_at: echeance(j),
          scope: typeof j.scope === 'string' && j.scope ? j.scope : scope, autorise_le: new Date(o.maintenant()).toISOString(),
        });
        delete n.deconnecte_le;
        try { ecrireSecrets(n); } catch (e) { o.journal('smartthings : ENREGISTREMENT DE L\'AUTORISATION IMPOSSIBLE', (e && e.code) || ''); throw new ErreurST('ST_ECRITURE'); }
        refuse = null;
        o.journal('smartthings : autorisation enregistrée depuis l\'application, droits :', n.scope);
        return n.access_token;
      }
      if (s === 400 || s === 401) throw new ErreurST('ST_CODE', s);
      if (s === 429) throw new ErreurST('ST_QUOTA', 429);
      throw new ErreurST('ST_HTTP', s);
    });
  }
  // Deconnexion : jetons effaces localement (client_id et client_secret gardes) ; aucune route officielle de revocation.
  function effacerJetons() {
    return exclusif(async () => {
      const c = lireBrut();
      if (!Object.keys(c).length) return;
      for (const k of JETONS) delete c[k];
      c.deconnecte_le = new Date(o.maintenant()).toISOString();
      try { ecrireSecrets(c); } catch (e) { throw new ErreurST('ST_ECRITURE'); }
      refuse = null; noterCloud('inconnu'); // compte deconnecte : joignabilite sans objet (V1.7)
      o.journal('smartthings : compte déconnecté (jetons effacés)');
    });
  }
  // Application OAuth (saisie de secours) : un autre client_id rend les jetons inutilisables -> effaces ; meme client_id -> jetons gardes.
  function enregistrerApplication(id, secret) {
    return exclusif(async () => {
      const c = lireBrut();
      const autre = rempli(c, 'client_id') && c.client_id !== id;
      const n = Object.assign({}, c, { client_id: id, client_secret: secret });
      if (autre) { for (const k of JETONS) delete n[k]; refuse = null; }
      try { ecrireSecrets(n); } catch (e) { throw new ErreurST('ST_ECRITURE'); }
      o.journal('smartthings : application OAuth enregistrée' + (autre ? ' (nouvelle application : connexion à refaire)' : ''));
    });
  }

  return {
    cloudInjoignable, etatCloud, surRetourCloud, versionSecrets, commande, choisirProgramme, reglerOption, droitCommande, appareils, statut, sante,
    etatCompte, adresseAutorisation, echangerCode, effacerJetons, enregistrerApplication,
  };
}

// Instance unique du serveur (donnees/smartthings.json) : ses fonctions sont les exports nommes lus par index.mjs, familles.mjs et compte.mjs.
export const client = creerClient();
export const {
  cloudInjoignable, etatCloud, surRetourCloud, versionSecrets, commande, choisirProgramme, reglerOption, droitCommande, appareils, statut, sante,
  etatCompte, adresseAutorisation, echangerCode, effacerJetons, enregistrerApplication,
} = client;
// FIN
