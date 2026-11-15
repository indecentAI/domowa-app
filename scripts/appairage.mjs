// @zone distant | Code d'appairage en terminal (V1.8, machine sans ecran), serveur demarre en mode distant : node scripts/appairage.mjs affiche l'adresse a ouvrir, l'empreinte du certificat et un code a 8 chiffres (usage unique, 5 min), demande a l'ecoute locale (POST /api/appairage/code). Option « seul » : le code seulement s'il n'y a encore aucun appareil autorise (journal d'un conteneur).
import { LOCAL_HOST, LOCAL_PORT } from '../config.mjs';

const BASE = 'http://' + LOCAL_HOST + ':' + LOCAL_PORT;
const fin = (m) => { console.log(m); process.exit(1); };
async function appel(methode, chemin) {
  let r;
  try { r = await fetch(BASE + chemin, { method: methode, headers: { 'X-Requested-With': 'tablette', 'Content-Type': 'application/json' }, body: methode === 'POST' ? '{}' : undefined, signal: AbortSignal.timeout(10000) }); }
  catch (e) { fin('Serveur injoignable sur ' + BASE + ' : le démarrer d\'abord (bash start.sh, ou le service).'); }
  let j = null; try { j = await r.json(); } catch (e) { /* reponse sans JSON */ }
  if (!r.ok) fin((j && j.error) || 'Erreur ' + r.status);
  return j;
}
const c = await appel('GET', '/api/clients');
if (!c.serveur || c.serveur.mode !== 'distant') fin('Mode local : aucun autre appareil ne peut se connecter. Pour ouvrir l\'accès, serveur arrêté : node scripts/serveur.mjs distant');
if (!c.serveur.ecoute) fin('L\'accès réseau n\'est pas ouvert : ' + (c.serveur.motif || 'voir server.log') + ' Correction, serveur arrêté : node scripts/serveur.mjs distant');
if (process.argv[2] === 'seul' && c.clients.length) { console.log(c.clients.length + ' appareil(s) autorisé(s) : nouveau code depuis la fenêtre « Appareils autorisés » d\'un appareil autorisé.'); process.exit(0); }
const k = await appel('POST', '/api/appairage/code');
console.log('Sur l\'appareil à autoriser, ouvrir : ' + c.serveur.url);
console.log('Le navigateur avertit que le certificat n\'est pas reconnu (il est créé par ce serveur) : vérifier son empreinte SHA-256, puis continuer :');
console.log('  ' + c.serveur.empreinte);
console.log('Code d\'appairage : ' + k.code.slice(0, 4) + ' ' + k.code.slice(4) + '   (valable 5 minutes, une seule fois)');
console.log('Appareils déjà autorisés : ' + c.clients.length + ' sur ' + c.max + '.');
// FIN
