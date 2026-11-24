// @zone appareils hubs | Connexion au hub DIRIGERA : adresse (donnees/dirigera.json, migree de config.mjs), jeton (donnees/dirigera-token.txt, 600, jamais renvoye ni journalise), client TLS strict reconstruit des que l'adresse ou le jeton change, deconnexion, traduction des erreurs.
// TLS strict : rejectUnauthorized: true, jamais desactivable. La bibliotheque verifie alors la chaine du hub contre la seule racine « IKEA Home smart Root CA »
// qu'elle embarque (node_modules/dirigera/dist/certificate.js) ; le nom d'hote n'est pas controle (hub joint par son adresse IP).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { createDirigeraClient } from 'dirigera';
import { DONNEES, lireJson, ecrireJson, log } from '../../core/outils.mjs';
import { privee } from '../../core/reseau.mjs';
import { arreter } from './evenements.mjs';

export const JETON = path.join(DONNEES, 'dirigera-token.txt');
const FICHIER = 'dirigera.json'; // { adresse, appaire_le?, deconnecte_le?, migre_de?, migre_le? } : sans secret (sauvegarde.sh l'archive)
const RESEAU = ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'ECONNRESET'];

// Migration V1.2 (automatique, sans perte, reversible) : l'adresse etait la constante HUB_IP de config.mjs. Faite une fois au chargement, seulement si
// un jeton existe (installation en service) et que dirigera.json est absent. V1.8 : l'adresse d'origine n'est plus ecrite dans le code (depot public :
// aucune adresse d'un reseau personnel) ; elle vient de la variable d'environnement DOMOWA_HUB_V11 (IPv4 privee ; le banc la pose). Sans elle, une
// installation restee en V1.1 affiche « Aucun hub configuré. » et se reconnecte par la fenetre Hubs. Le jeton ne bouge pas.
const ADRESSE_V11 = String(process.env.DOMOWA_HUB_V11 || '').trim();
export function migrer() {
  try {
    if (!privee(ADRESSE_V11) || fs.existsSync(path.join(DONNEES, FICHIER)) || !fs.existsSync(JETON)) return;
    ecrireJson(FICHIER, { adresse: ADRESSE_V11, migre_de: 'config.mjs', migre_le: new Date().toISOString() });
    log('dirigera : adresse du hub reprise de config.mjs dans donnees/dirigera.json');
  } catch (e) { log('dirigera : migration de l\'adresse impossible', e.code || e.name || ''); }
}
migrer();

// Configuration lue a chaque usage (petit fichier) : { adresse (IPv4 privee) | null, illisible, deconnecte_le }.
export function lire() {
  const f = path.join(DONNEES, FICHIER);
  if (!fs.existsSync(f)) return { adresse: null, illisible: false, deconnecte_le: null };
  const j = lireJson(FICHIER, null);
  if (!j || typeof j !== 'object') return { adresse: null, illisible: true, deconnecte_le: null };
  return { adresse: privee(j.adresse) ? j.adresse : null, illisible: !privee(j.adresse), deconnecte_le: typeof j.deconnecte_le === 'string' ? j.deconnecte_le : null };
}
export const jetonPresent = () => fs.existsSync(JETON);
// Pour l'etat du hub (hub.mjs) : non_configure : aucune adresse (installation neuve) ; deconnecte : deconnexion demandee, jeton efface ;
// pret : sinon (jeton absent par accident : erreur « Fichier jeton introuvable. »).
export function etatLocal() {
  const c = lire();
  if (!c.adresse && !c.illisible && !jetonPresent()) return 'non_configure';
  if (c.deconnecte_le && !jetonPresent()) return 'deconnecte';
  return 'pret';
}
const erreurCode = (code, m) => Object.assign(new Error(m), { code });

let cache = null; // { cle: adresse + empreinte du jeton, p: promesse du client }
export function client() {
  const c = lire();
  if (!c.adresse) return Promise.reject(erreurCode(c.illisible ? 'HUB_ADRESSE' : 'HUB_NON_CONFIGURE', 'adresse du hub'));
  let jeton;
  try { jeton = fs.readFileSync(JETON, 'utf8').trim(); } catch (e) { return Promise.reject(e.code === 'ENOENT' && c.deconnecte_le ? erreurCode('HUB_DECONNECTE', 'hub non connecte') : e); }
  const cle = c.adresse + ' ' + crypto.createHash('sha256').update(jeton).digest('hex');
  if (!cache || cache.cle !== cle) {
    const x = { cle, p: createDirigeraClient({ gatewayIP: c.adresse, accessToken: jeton, rejectUnauthorized: true }) };
    x.p.catch(() => { if (cache === x) cache = null; });
    cache = x;
  }
  return cache.p;
}
// Ecritures PUT et DELETE (V1.4) : got (reglages par defaut, instance de la bibliotheque) renvoie d'elle-meme PUT et DELETE apres un 500, 502, 503, 504
// ou une coupure (2 envois de plus ; vu au banc). Pour ces ecritures, le serveur appelle les fonctions de la bibliotheque elle-meme (api/rooms.js : memes
// chemins et formats) sur une instance got identique a la sienne (index.js : adresse, jeton, seule racine « IKEA Home smart Root CA » embarquee,
// nom d'hote non controle, TLS strict) mais sans aucun renvoi (retry.limit 0). Fichiers de la bibliotheque lus par leur chemin (non exportes).
const LIB = new URL('../../node_modules/dirigera/dist/', import.meta.url);
let sr = null; // { cle, p: promesse de { rooms } }
export function sansRenvoi() {
  const c = lire();
  if (!c.adresse) return Promise.reject(erreurCode(c.illisible ? 'HUB_ADRESSE' : 'HUB_NON_CONFIGURE', 'adresse du hub'));
  let jeton;
  try { jeton = fs.readFileSync(JETON, 'utf8').trim(); } catch (e) { return Promise.reject(e.code === 'ENOENT' && c.deconnecte_le ? erreurCode('HUB_DECONNECTE', 'hub non connecte') : e); }
  const cle = c.adresse + ' ' + crypto.createHash('sha256').update(jeton).digest('hex');
  if (!sr || sr.cle !== cle) {
    const x = { cle, p: Promise.all([import('got'), import(new URL('certificate.js', LIB).href), import(new URL('api/rooms.js', LIB).href), import(new URL('api/devices.js', LIB).href), import(new URL('api/hub.js', LIB).href), import(new URL('api/deviceSets.js', LIB).href)]).then(([g, ca, rooms, devices, hub, deviceSets]) => {
      const inst = g.default.extend({
        prefixUrl: 'https://' + c.adresse + ':8443/v1',
        headers: { authorization: 'Bearer ' + jeton },
        agent: { https: new https.Agent({ ca: [ca.default], checkServerIdentity: () => undefined, rejectUnauthorized: true }) },
        retry: { limit: 0 },
      });
      return { rooms: rooms.default(inst), devices: devices.default(inst), hub: hub.default(inst), deviceSets: deviceSets.default(inst) }; // V2.1 : identifier et mise a jour du hub (PUT), groupes (DELETE : scripts/groupes-essai.mjs) sans renvoi
    }) };
    x.p.catch(() => { if (sr === x) sr = null; });
    sr = x;
  }
  return sr.p;
}
// Appairage reussi (appairage.mjs) : jeton ecrit par le serveur seul, 600, atomique (fichier temporaire puis renommage), jamais renvoye ni journalise ;
// adresse du hub notee, deconnecte_le retire. Ancien jeton remplace seulement ici (appairage abouti) ; un echec ou une annulation ne touche a rien.
export function enregistrer(adresse, jeton) {
  if (!privee(adresse) || typeof jeton !== 'string' || !/^[\x21-\x7e]{8,4096}$/.test(jeton)) throw erreurCode('HUB_JETON', 'jeton ou adresse invalide');
  fs.mkdirSync(DONNEES, { recursive: true, mode: 0o700 });
  const tmp = JETON + '.tmp';
  fs.writeFileSync(tmp, jeton, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, JETON);
  const c = lireJson(FICHIER, {});
  const n = Object.assign({}, c && typeof c === 'object' ? c : {}, { adresse, appaire_le: new Date().toISOString() });
  delete n.deconnecte_le;
  ecrireJson(FICHIER, n);
  cache = null; sr = null;
  log('dirigera : hub appaire, jeton enregistre');
}
// Deconnexion (confirmee par l'appelant) : jeton efface, adresse gardee (reconnexion), date notee.
export function deconnecter() {
  const c = lireJson(FICHIER, {});
  try { fs.unlinkSync(JETON); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  ecrireJson(FICHIER, Object.assign({}, c && typeof c === 'object' ? c : {}, { deconnecte_le: new Date().toISOString() }));
  cache = null; sr = null;
  arreter(); // ecoute des evenements fermee aussitot (l'adaptateur peut passer en retrait : plus aucune lecture pour la fermer)
  log('dirigera : hub deconnecte (jeton efface)');
}

export function erreur(e) {
  const code = (e && e.code) || '';
  const http = e && e.response && e.response.statusCode;
  if (code === 'HUB_DECONNECTE') return [409, 'Hub non connecté.'];
  if (code === 'HUB_NON_CONFIGURE') return [409, 'Aucun hub configuré.'];
  if (code === 'HUB_JETON') return [502, 'Réponse du hub illisible (jeton).'];
  if (code === 'HUB_ADRESSE') return [500, 'Adresse du hub illisible (donnees/dirigera.json).'];
  if (code === 'ENOENT') return [500, 'Fichier jeton introuvable.'];
  if (http === 401 || http === 403) return [502, 'Jeton refusé par le hub.'];
  if (code === 'ETIMEDOUT') return [504, 'Le hub ne répond pas (délai dépassé).'];
  if (RESEAU.includes(code)) return [502, 'Hub inaccessible (Wi-Fi ou hub éteint ?).'];
  if (String(code).startsWith('ERR_TLS') || /CERT|SIGNATURE|ISSUER/.test(String(code)) || /certificate/i.test(String(e && e.message))) return [502, 'Erreur de certificat TLS avec le hub.'];
  return null;
}
// FIN
