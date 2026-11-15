// @zone electromenager | Familles SmartThings generiques, LECTURE SEULE : capteurs, interrupteurs, audio, appareils a cycle (seche-linge, lave-vaisselle), autre ; routes GET /api/smartthings/appareils et POST /api/smartthings/appareils/actualiser.
// Decouverte par les capacites du composant principal (GET /v1/devices, chemins deja permis par api.mjs : aucun nouveau chemin) ; lave-linge exclus (index.mjs).
// Vie privee : seuls les attributs de la liste blanche VALEURS sortent du serveur ; l'etat brut n'est jamais renvoye ni journalise. Traceur ou appareil a capacite
// geographique (geolocation, geofence, location, tag.*...) -> famille « autre » : nom, connexion, batterie, JAMAIS de position ni de coordonnees.
// Aucune commande : une famille ne recoit ses commandes qu'apres validation sur un appareil reel (etape separee). Hors Tout OFF et hors pieces.
// Lecture a la demande : GET (vue ouverte) relit le cloud au plus toutes les 30 s ; appareil en echec : derniers etats gardes (perime), les autres continuent.
import { log, withTimeout } from '../../core/outils.mjs';
import { ErreurST, appareils, statut, sante, versionSecrets, etatCloud, surRetourCloud } from './api.mjs';

const CADENCE = 30000, DECOUVERTE = 3600000, ACTU = 5000, MAXAPP = 40, ATTENTE_MAX = 600000;
const FATALES = new Set(['ST_CONFIG', 'ST_SECRET', 'ST_REAUTH', 'ST_ECRITURE', 'ST_QUOTA']); // compte entier : on arrete la lecture
const COUPURES = new Set(['ST_RESEAU', 'ST_DELAI', 'ST_TLS']); // reseau : inutile d'essayer les appareils suivants
const ID_RE = /^[A-Za-z0-9-]{1,72}$/;
const CONNEXIONS = ['ONLINE', 'UNHEALTHY', 'OFFLINE'];

// ---------- classement (ordre : lave-linge exclu, traceur/geographique, cycle, audio, interrupteurs, capteurs, autre) ----------
const GEO = /geo|locat|position|gps|coord|fmm/i;
const CYCLE = { dryerOperatingState: 'seche_linge', 'samsungce.dryerOperatingState': 'seche_linge', dishwasherOperatingState: 'lave_vaisselle', 'samsungce.dishwasherOperatingState': 'lave_vaisselle' };
const AUDIO = ['mediaPlayback', 'audioMute', 'audioVolume', 'mediaTrackControl'];
const INTER = ['switch', 'switchLevel'];
const CAPTEURS = ['temperatureMeasurement', 'relativeHumidityMeasurement', 'contactSensor', 'motionSensor', 'presenceSensor', 'battery', 'powerMeter', 'energyMeter'];
export const FAMILLES = ['capteurs', 'interrupteurs', 'audio', 'cycle', 'autre'];
export function famille(ids) {
  if (ids.has('washerOperatingState') || ids.has('samsungce.washerOperatingState')) return null; // lave-linge : index.mjs
  for (const c of ids) if (GEO.test(c) || /^tag\./.test(c)) return 'autre';
  for (const c of Object.keys(CYCLE)) if (ids.has(c)) return 'cycle';
  if (AUDIO.some((c) => ids.has(c))) return 'audio';
  if (INTER.some((c) => ids.has(c))) return 'interrupteurs';
  if (CAPTEURS.some((c) => ids.has(c))) return 'capteurs';
  return 'autre';
}
const principal = (d) => { const l = Array.isArray(d.components) ? d.components : []; return l.find((k) => k && k.id === 'main') || l[0] || {}; };
const capacites = (k) => new Set((Array.isArray(k.capabilities) ? k.capabilities : []).map((x) => x && typeof x.id === 'string' ? x.id : null).filter(Boolean));

// ---------- liste blanche des valeurs (rien d'autre ne sort) ----------
const attr = (m, cap, at) => { const a = m && m[cap] && m[cap][at]; return a && typeof a === 'object' ? a : null; };
const brut = (m, cap, at) => { const a = attr(m, cap, at); return a ? a.value : undefined; };
const num = (m, cap, at, min, max) => { const x = brut(m, cap, at); return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? Math.round(x * 100) / 100 : null; };
const parmi = (m, cap, at, ok) => { const x = brut(m, cap, at); return ok.includes(x) ? x : null; };
const unite = (m, cap, at, ok) => { const a = attr(m, cap, at); return a && ok.includes(a.unit) ? a.unit : null; };
const OPERATION = { ready: 'pret', running: 'en_cours', paused: 'pause' }, MACHINE = { run: 'en_cours', pause: 'pause', stop: 'pret' };
export function valeurs(m, fam, ids) {
  const v = {};
  const mettre = (k, x) => { if (x !== null && x !== undefined) v[k] = x; };
  mettre('batterie', num(m, 'battery', 'battery', 0, 100));
  if (fam === 'autre') return v; // repli : batterie seulement (nom et connexion a part) ; jamais de position
  const t = num(m, 'temperatureMeasurement', 'temperature', -60, 300);
  if (t !== null) v.temperature = { v: t, u: unite(m, 'temperatureMeasurement', 'temperature', ['C', 'F']) || 'C' };
  mettre('humidite', num(m, 'relativeHumidityMeasurement', 'humidity', 0, 100));
  mettre('contact', parmi(m, 'contactSensor', 'contact', ['open', 'closed']));
  mettre('mouvement', parmi(m, 'motionSensor', 'motion', ['active', 'inactive']));
  mettre('presence', parmi(m, 'presenceSensor', 'presence', ['present', 'not present']));
  mettre('puissance', num(m, 'powerMeter', 'power', -1e6, 1e6));
  const e = num(m, 'energyMeter', 'energy', 0, 1e9);
  if (e !== null) v.energie = { v: e, u: unite(m, 'energyMeter', 'energy', ['kWh', 'Wh']) || 'kWh' };
  mettre('interrupteur', parmi(m, 'switch', 'switch', ['on', 'off']));
  mettre('niveau', num(m, 'switchLevel', 'level', 0, 100));
  mettre('volume', num(m, 'audioVolume', 'volume', 0, 100));
  mettre('muet', parmi(m, 'audioMute', 'mute', ['muted', 'unmuted']));
  mettre('lecture', parmi(m, 'mediaPlayback', 'playbackStatus', ['playing', 'paused', 'stopped', 'buffering', 'fast forwarding', 'rewinding']));
  if (fam === 'cycle') {
    const cap = Object.keys(CYCLE).find((c) => ids.has(c) && c.startsWith('samsungce.')) || Object.keys(CYCLE).find((c) => ids.has(c));
    const simple = cap.replace('samsungce.', ''), sce = 'samsungce.' + simple;
    const op = brut(m, sce, 'operatingState'), ms = brut(m, simple, 'machineState');
    const etat = (typeof op === 'string' && OPERATION[op]) || (typeof ms === 'string' && MACHINE[ms]) || 'autre';
    const actif = etat === 'en_cours' || etat === 'pause';
    const fin = brut(m, simple, 'completionTime');
    v.cycle = {
      type: CYCLE[cap], etat,
      restantMin: actif ? num(m, sce, 'remainingTime', 0, 6000) : null,
      progression: actif ? num(m, sce, 'progress', 0, 100) : null,
      fin: actif && typeof fin === 'string' && !Number.isNaN(Date.parse(fin)) ? new Date(fin).toISOString() : null,
    };
  }
  return v;
}

// ---------- lecture (cache propre, jamais deux a la fois) ----------
let liste = []; // [{ deviceId, nom, famille, ids }]
// Rangement local dans les pieces (V1.4) : appareils connus, depuis le cache ; une decouverte (GET /v1/devices, chemin deja permis) si elle n'a jamais ete faite.
const GENRES = { capteurs: 'Capteur', interrupteurs: 'Interrupteur', audio: 'Audio', cycle: 'Électroménager', autre: 'Autre appareil' };
export async function connus() {
  if (!decouvert) { try { await withTimeout(decouvrir(), 6000); } catch (e) { /* compte non connecte ou cloud injoignable : liste connue (vide) */ } }
  return liste.map((x) => ({ id: 'st-' + x.deviceId, nom: x.nom, genre: x.famille === 'autre' && [...x.ids].some((c) => /^tag\./.test(c)) ? 'Traceur' : GENRES[x.famille] || 'Autre appareil', vue: x.famille === 'cycle' ? 'electro' : 'st-' + x.famille }));
}
let etats = new Map(); // deviceId -> { connexion, valeurs, perime, maj }
let decouvert = 0, versionDecouverte = -1, versionLue = -1, dernier = 0, essai = 0, echecs = 0, vol = null, erreurDerniere = null;
async function decouvrir() {
  const tous = await appareils();
  liste = tous.filter((d) => d && ID_RE.test(String(d.deviceId))).map((d) => {
    const ids = capacites(principal(d));
    return { deviceId: String(d.deviceId), nom: String(d.label || d.name || 'Appareil').slice(0, 40), famille: famille(ids), ids };
  }).filter((x) => x.famille).slice(0, MAXAPP);
  decouvert = Date.now(); versionDecouverte = versionSecrets();
}
async function lire(forcer) {
  if (forcer || !decouvert || Date.now() - decouvert > DECOUVERTE || versionSecrets() !== versionDecouverte) await decouvrir();
  const n = new Map();
  let reussis = 0, coupure = null;
  for (const x of liste) {
    const avant = etats.get(x.deviceId);
    const garder = () => n.set(x.deviceId, avant ? Object.assign({}, avant, { perime: true }) : { connexion: null, valeurs: {}, perime: true, maj: null });
    if (coupure) { garder(); continue; }
    try {
      const s = await statut(x.deviceId);
      let h = null;
      try { h = await sante(x.deviceId); } catch (e) { if (e instanceof ErreurST && (FATALES.has(e.code) || COUPURES.has(e.code))) throw e; } // sante absente : connexion inconnue
      const m = (s && s.components && s.components.main) || {};
      n.set(x.deviceId, { connexion: h && CONNEXIONS.includes(h.state) ? h.state : null, valeurs: valeurs(m, x.famille, x.ids), perime: false, maj: Date.now() });
      reussis++;
    } catch (e) {
      const err = e instanceof ErreurST ? e : new ErreurST('ST_INTERNE');
      if (FATALES.has(err.code)) throw err;
      if (COUPURES.has(err.code)) coupure = err;
      garder();
    }
  }
  etats = n;
  if (liste.length && !reussis) throw coupure || new ErreurST('ST_HTTP'); // aucun appareil lisible : panne
  dernier = Date.now(); echecs = 0;
  if (erreurDerniere) log('smartthings familles : rétabli');
  erreurDerniere = null;
}
function lancer(forcer) {
  if (vol) return vol;
  essai = Date.now(); versionLue = versionSecrets();
  vol = lire(forcer).catch((e) => {
    const err = e instanceof ErreurST ? e : new ErreurST('ST_INTERNE');
    echecs++;
    if (err.code === 'ST_CONFIG') { liste = []; etats = new Map(); decouvert = 0; dernier = 0; } // compte non connecte : rien a afficher
    if (!erreurDerniere || erreurDerniere.code !== err.code) log('smartthings familles : échec de lecture', err.code, err.statutHttp || '');
    erreurDerniere = err;
  }).finally(() => { vol = null; });
  return vol;
}
surRetourCloud(() => { echecs = 0; }); // V1.7 : cloud de nouveau joignable : la prochaine lecture (vue ouverte) part sans attendre l'espacement
// Due : fichier des secrets change (connexion, deconnexion, renouvellement), sinon cadence ; apres un echec, nouvel essai espace (30 s a 10 min).
const due = () => versionSecrets() !== versionLue || (erreurDerniere
  ? Date.now() - essai >= Math.min(ATTENTE_MAX, CADENCE * 2 ** Math.max(0, echecs - 1))
  : !dernier || Date.now() - dernier >= CADENCE);

const MESSAGES = {
  ST_SECRET: 'fichier donnees/smartthings.json illisible',
  ST_REAUTH: 'reconnexion nécessaire (icône compte de la carte SmartThings)',
  ST_DROITS: 'droits insuffisants : reconnecter (icône compte de la carte SmartThings)',
  ST_ECRITURE: 'enregistrement du jeton impossible',
  ST_QUOTA: 'quota du cloud atteint, nouvel essai plus tard',
  ST_RESEAU: 'cloud SmartThings injoignable (Internet ?)',
  ST_DELAI: 'le cloud SmartThings ne répond pas',
  ST_TLS: 'erreur de certificat TLS avec le cloud',
};
function reponse() {
  const e = erreurDerniere, cloud = etatCloud(), horsLigne = cloud.etat === 'injoignable';
  const appareilsClient = horsLigne ? [] : liste.filter((x) => etats.has(x.deviceId)).map((x) => { // V1.7 : cloud injoignable -> aucun appareil
    const s = etats.get(x.deviceId);
    return { id: 'st-' + x.deviceId, nom: x.nom, famille: x.famille, connexion: s.connexion, valeurs: s.valeurs, perime: !!(s.perime || e), maj: s.maj ? new Date(s.maj).toISOString() : null, commandes: false };
  });
  return { appareils: appareilsClient, panne: e && e.code !== 'ST_CONFIG' ? (MESSAGES[e.code] || 'réponse inattendue du cloud') : null, cloud, time: new Date().toISOString() };
}

export const routes = [
  ['GET', '/api/smartthings/appareils', async () => {
    const change = versionSecrets() !== versionLue; // connexion ou deconnexion : reponse a jour, pas l'ancien etat
    if (vol && change) await withTimeout(vol, 15000).catch(() => {});
    if (due()) { const p = lancer(false); if (!dernier || change) await withTimeout(p, 15000).catch(() => {}); } // premiere lecture ou compte change : attendue 15 s au plus
    return reponse();
  }],
  // Actualisation manuelle : nouvelle decouverte et lecture fraiche (au plus une toutes les 5 s, 15 s d'attente au plus).
  ['POST', '/api/smartthings/appareils/actualiser', async () => {
    if (vol) await withTimeout(vol, 15000).catch(() => {});
    else if (Date.now() - essai >= ACTU) await withTimeout(lancer(true), 15000).catch(() => {});
    return reponse();
  }],
];
// FIN
