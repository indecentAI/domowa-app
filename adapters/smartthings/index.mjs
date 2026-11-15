// @zone electromenager | Adaptateur SmartThings (cloud) : lave-linge -> type generique washer (voir core/modele.mjs) ; routes GET /api/washers et POST /api/washers/:id/commande {action: pause|reprendre|arreter}, POST /api/washers/:id/reglages {programme?, temperature?, essorage?}, POST /api/washers/actualiser  ; compte : compte.mjs ; familles generiques en lecture seule (capteurs, interrupteurs, audio, cycle, autre) : familles.mjs.
// Cache propre : cloud lu toutes les 2 min, toutes les 30 s si la vue est ouverte (GET /api/washers depuis moins d'1 min) ou si un cycle tourne.
// lister() ne bloque jamais : dernier etat connu (perime si la derniere lecture a echoue) ; echec : nouvel essai espace (30 s, 1, 2, 4, 8, 10 min max),
// tout de suite si donnees/smartthings.json change. Panne signalee (bandeau) : configuration ou autorisation a refaire, ou aucune lecture reussie depuis 10 min.
// Etat affiche (doc/tests de la machine) : temps restant, progression, heure de fin et phase seulement en cours ou en pause (sinon valeurs perimees du cloud).
// Connexion (GET /health) : OFFLINE ou UNHEALTHY (machine eteinte ou sans Wi-Fi) -> etat hors_ligne, reachable false ; le cloud garde alors les dernieres valeurs, le cycle est masque.
import { log, sleep, withTimeout } from '../../core/outils.mjs';
import { HttpError } from '../../core/http.mjs';
import { routes as routesCompte } from './compte.mjs';
import { routes as routesFamilles, connus } from './familles.mjs';
import { ErreurST, appareils, statut, sante, versionSecrets, commande, choisirProgramme, reglerOption, droitCommande, etatCloud, surRetourCloud, cloudInjoignable } from './api.mjs';

const LENT = 120000, VIF = 30000, VUE = 60000, DECOUVERTE = 3600000, PERIME = 600000, ATTENTE_MAX = 600000;
const FIXES = new Set(['ST_CONFIG', 'ST_SECRET', 'ST_REAUTH', 'ST_DROITS', 'ST_ECRITURE']); // panne tout de suite, meme avec un etat connu
const ID_RE = /^[A-Za-z0-9-]{1,72}$/;

let machines = []; // [{ deviceId, name }]
let decouvert = 0, dernier = 0, essai = 0, echecs = 0, vue = 0, versionEchec = 0, versionLue = 0;
let etats = new Map(); // deviceId -> etat
let erreurDerniere = null, vol = null;

const val = (comp, cap, at) => { const a = comp && comp[cap] && comp[cap][at]; return a && typeof a === 'object' ? a.value : undefined; };
const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const texte = (v, n) => (typeof v === 'string' && v ? v.slice(0, n || 40) : null);
const OPERATION = { ready: 'pret', running: 'en_cours', paused: 'pause' };
const MACHINE = { run: 'en_cours', pause: 'pause', stop: 'pret' };
const SW = 'samsungce.washerOperatingState';
// Noms des programmes : aucune source officielle (capacite Samsung non documentee) ; table relevee a la main sur la machine, par table de reference.
// Code inconnu (autre table, nouveau programme) : affiche « code XX » dans la vue ; l'ajouter ici.
// Releve sur la machine (WW5000C, 01/11/2026). Programme telecharge (87) : programme envoye depuis l'application SmartThings, contenu variable.
const PROGRAMMES = {
  Table_02: {
    '1B': 'Coton', '1C': 'Eco 40-60', '25': 'Synthétiques', '20': 'Anti-allergènes', '08': 'Rinçage + Essorage', '74': 'Nettoyage tambour',
    '87': 'Programme téléchargé', '06': 'Draps', '7F': 'Laine/Délicat', '65': 'Couleurs', '8F': 'Intensif à froid', '96': 'Micro-plastiques',
    '34': 'Mix', 'A0': "Express 15'",
  },
};
// Programmes du selecteur : ceux que la machine declare (samsungce.washerCycle.supportedCycles, codes courts, dans son ordre = ordre du
// selecteur) et dont le nom est releve dans PROGRAMMES ; « Programme telecharge » (87, contenu variable) affiche mais jamais choisi (choix: false).
// Reglages par defaut du programme (supportedOptions.*.default) : temperature, essorage. Table : referenceTable, sinon celle du programme actuel.
function programmesDe(m) {
  const ref = val(m, 'samsungce.washerCycle', 'referenceTable');
  const t = (ref && typeof ref.id === 'string' && ref.id) || (/^(Table_[A-Za-z0-9]{1,8})_Course_/.exec(String(val(m, 'samsungce.washerCycle', 'washerCycle') || '')) || [])[1];
  const sup = val(m, 'samsungce.washerCycle', 'supportedCycles');
  if (!t || !PROGRAMMES[t] || !Array.isArray(sup)) return [];
  const vus = new Set(), o = [];
  for (const x of sup.slice(0, 40)) {
    const c = String((x && x.cycle) || '').toUpperCase();
    if (!/^[0-9A-F]{2}$/.test(c) || vus.has(c) || !PROGRAMMES[t][c]) continue;
    vus.add(c);
    const opt = (x && x.supportedOptions && typeof x.supportedOptions === 'object') ? x.supportedOptions : {};
    const def = (k) => texte(opt[k] && opt[k].default, 12);
    const permis = (k) => (opt[k] && Array.isArray(opt[k].options) ? opt[k].options.filter((v) => typeof v === 'string' && /^[A-Za-z0-9]{1,16}$/.test(v)).slice(0, 20) : []);
    o.push({ code: c, nom: PROGRAMMES[t][c], choix: c !== '87', temperature: def('waterTemperature'), essorage: def('spinLevel'), temperatures: permis('waterTemperature'), essorages: permis('spinLevel') });
  }
  return o;
}
function nomProgramme(v) {
  const m = /^(Table_[A-Za-z0-9]{1,8})_Course_([A-Za-z0-9]{1,4})$/.exec(typeof v === 'string' ? v : '');
  return (m && PROGRAMMES[m[1]] && PROGRAMMES[m[1]][m[2]]) || null;
}

const CONNEXIONS = ['ONLINE', 'UNHEALTHY', 'OFFLINE'];
function versEtat(s, h) {
  const m = (s && s.components && s.components.main) || {};
  const op = val(m, SW, 'operatingState'), ms = val(m, 'washerOperatingState', 'machineState');
  const connexion = h && CONNEXIONS.includes(h.state) ? h.state : null;
  const etat = connexion === 'OFFLINE' || connexion === 'UNHEALTHY' ? 'hors_ligne' : ((op === undefined || op === null ? MACHINE[ms] : OPERATION[op]) || 'autre');
  const actif = etat === 'en_cours' || etat === 'pause';
  const fin = val(m, 'washerOperatingState', 'completionTime');
  const lock = val(m, 'samsungce.kidsLock', 'lockState');
  const rc = val(m, 'remoteControlStatus', 'remoteControlEnabled');
  const ph = val(m, SW, 'scheduledPhases');
  return {
 etat, connexion, brut: texte(op) || texte(ms),
 programme: texte(val(m, 'samsungce.washerCycle', 'washerCycle'), 60),
    programmeNom: nomProgramme(val(m, 'samsungce.washerCycle', 'washerCycle')),
    temperature: texte(val(m, 'custom.washerWaterTemperature', 'washerWaterTemperature'), 12),
    essorage: texte(val(m, 'custom.washerSpinLevel', 'washerSpinLevel'), 12),
    restantMin: actif ? nombre(val(m, SW, 'remainingTime')) : null,
    progression: actif ? nombre(val(m, SW, 'progress')) : null,
    fin: actif && typeof fin === 'string' && !Number.isNaN(Date.parse(fin)) ? new Date(fin).toISOString() : null,
    phase: actif ? texte(val(m, SW, 'washerJobPhase')) : null,
    phases: Array.isArray(ph) ? ph.filter((x) => x && texte(x.phaseName)).slice(0, 10).map((x) => ({ nom: texte(x.phaseName), min: nombre(x.timeInMin) })) : [],
    verrouEnfant: lock === 'locked' ? true : lock === 'unlocked' ? false : null,
    programmes: programmesDe(m),
    telecommande: rc === 'true' || rc === true ? true : rc === 'false' || rc === false ? false : null,
  };
}
const estLave = (d) => (d.components || []).some((k) => k.id === 'main' && (k.capabilities || []).some((x) => x && (x.id === 'washerOperatingState' || x.id === SW)));

async function lire() {
  if (!machines.length || Date.now() - decouvert > DECOUVERTE) {
    machines = (await appareils()).filter((d) => d && ID_RE.test(String(d.deviceId)) && estLave(d))
      .map((d) => ({ deviceId: String(d.deviceId), name: String(d.label || d.name || 'Lave-linge').slice(0, 40) }));
    decouvert = Date.now();
  }
  const n = new Map();
 for (const x of machines) n.set(x.deviceId, versEtat(await statut(x.deviceId), await sante(x.deviceId)));
  etats = n; dernier = Date.now(); echecs = 0;
  if (erreurDerniere) log('smartthings : rétabli');
  erreurDerniere = null;
}
const tourne = () => [...etats.values()].some((s) => s.etat === 'en_cours' || s.etat === 'pause');
const cadence = () => (tourne() || Date.now() - vue < VUE ? VIF : LENT);
const attente = () => Math.min(ATTENTE_MAX, VIF * 2 ** Math.max(0, echecs - 1));
// Lance une lecture si elle est due (une seule a la fois) ; ne bloque jamais l'appelant.
function rafraichir() {
  if (vol) return vol;
  // Fichier des secrets change (connexion, deconnexion, renouvellement) : relecture tout de suite.
  const due = versionSecrets() !== versionLue || (erreurDerniere ? (Date.now() - essai >= attente() || versionSecrets() !== versionEchec) : Date.now() - dernier >= cadence());
  if (!due) return null;
  return lancer();
}
function lancer() {
  essai = Date.now(); versionLue = versionSecrets();
  vol = lire().catch((e) => {
    const err = e instanceof ErreurST ? e : new ErreurST('ST_INTERNE');
    echecs++; versionEchec = versionSecrets();
    if (err.code === 'ST_CONFIG') { machines = []; etats = new Map(); dernier = 0; } // compte non connecte : rien a afficher
    if (!erreurDerniere || erreurDerniere.code !== err.code) log('smartthings : échec de lecture', err.code, err.statutHttp || '');
    erreurDerniere = err;
  }).finally(() => { vol = null; });
  return vol;
}
// V1.7 : cloud de nouveau joignable (sonde TLS d'api.mjs) : relecture tout de suite, sans attendre l'espacement des essais
surRetourCloud(() => { echecs = 0; if (erreurDerniere && !vol) lancer(); });
// Lecture fraiche (commandes) : attend la lecture en cours, puis en lance une nouvelle.
async function relireMaintenant() { if (vol) await vol; await lancer(); }
// Commandes possibles (le serveur reverifie sur un etat frais avant tout envoi) : commande a distance ON, machine en ligne, etat compatible.
function capsDe(s, perime) {
  const ok = !perime && s.telecommande === true && s.etat !== 'hors_ligne';
  return { washer: true, pause: ok && s.etat === 'en_cours', reprise: ok && s.etat === 'pause', arret: ok && (s.etat === 'en_cours' || s.etat === 'pause'), programme: ok && s.etat === 'pret' && s.programmes.some((p) => p.choix) };
}
function liste() {
  const perime = !!erreurDerniere;
  return machines.filter((x) => etats.has(x.deviceId)).map((x) => ({
 id: 'st-' + x.deviceId, type: 'washer', name: x.name, room: null, reachable: !perime && etats.get(x.deviceId).etat !== 'hors_ligne',
    caps: capsDe(etats.get(x.deviceId), perime),
    state: Object.assign({}, etats.get(x.deviceId), { perime, maj: dernier ? new Date(dernier).toISOString() : null }),
  }));
}

export async function lister() {
  rafraichir();
  const e = erreurDerniere;
  if (e && e.code === 'ST_CONFIG') return []; // compte non connecte : pas une panne (icone compte de la carte SmartThings)
  if (cloudInjoignable()) throw new ErreurST('ST_RESEAU'); // V1.7 : cloud injoignable -> panne tout de suite (bandeau), appareils masques
  if (e && (FIXES.has(e.code) || !dernier || Date.now() - dernier > PERIME)) throw e;
  return liste();
}
export async function appliquer() { throw new ErreurST('ST_LECTURE'); }

const MESSAGES = {
  ST_CONFIG: [503, 'compte SmartThings non connecté'],
  ST_SECRET: [500, 'fichier donnees/smartthings.json illisible'],
  ST_REAUTH: [502, 'reconnexion nécessaire (icône compte de la carte SmartThings)'],
  ST_DROITS: [502, 'droits insuffisants : reconnecter (icône compte de la carte SmartThings)'],
  ST_ECRITURE: [500, 'enregistrement du jeton impossible'],
  ST_QUOTA: [503, 'quota du cloud atteint, nouvel essai plus tard'],
  ST_RESEAU: [502, 'cloud SmartThings injoignable (Internet ?)'],
  ST_DELAI: [504, 'le cloud SmartThings ne répond pas'],
  ST_TLS: [502, 'erreur de certificat TLS avec le cloud'],
  ST_HTTP: [502, 'réponse inattendue du cloud'],
  ST_REPONSE: [502, 'réponse trop grande du cloud'],
  ST_CHEMIN: [500, 'adresse refusée'],
  ST_INCONNU: [502, 'appareil introuvable dans SmartThings'],
  ST_LECTURE: [400, 'commande non gérée ici : utiliser la vue Électroménager'],
  ST_REFUS: [502, 'commande refusée par la machine ou le cloud'],
  ST_INCERTAIN: [504, 'pas de réponse du cloud : commande peut-être reçue, vérifier l\'état'],
  ST_INTERNE: [500, 'erreur interne de l\'adaptateur'],
};
export function erreur(e) { return (e instanceof ErreurST && MESSAGES[e.code]) || null; }

const versClient = (d) => Object.assign({ id: d.id, name: d.name, reachable: d.reachable, commandes: { pause: d.caps.pause, reprise: d.caps.reprise, arret: d.caps.arret, programme: d.caps.programme }, droits: droitCommande() }, d.state);
const reponse = () => { const e = erreurDerniere; return { washers: cloudInjoignable() ? [] : liste().map(versClient), panne: e && e.code !== 'ST_CONFIG' ? MESSAGES[e.code][1] : null, cloud: etatCloud(), time: new Date().toISOString() }; };
// Jamais de demarrage depuis l'arret : reprendre (run) seulement depuis la pause.
const ACTIONS = {
  pause: { si: ['en_cours'], etat: 'pause', refus: 'Pause possible seulement pendant un cycle en cours.' },
  reprendre: { si: ['pause'], etat: 'run', refus: 'Reprise possible seulement si le cycle est en pause.' },
  arreter: { si: ['en_cours', 'pause'], etat: 'stop', refus: 'Aucun cycle à arrêter.' },
};
let commandeEnCours = false;
const routesLave = [
  ['GET', '/api/washers', async () => {
    vue = Date.now();
    const change = versionSecrets() !== versionLue; // connexion ou deconnexion : reponse a jour, pas l'ancien etat
    const p = rafraichir();
    if (p && (!dernier || change)) await withTimeout(p, 15000).catch(() => {}); // toute premiere lecture : attendue 15 s au plus
    return reponse();
  }],
  // Actualisation manuelle : lecture fraiche (au plus une toutes les 5 s, 15 s d'attente au plus), meme reponse que GET.
  ['POST', '/api/washers/actualiser', async () => {
    vue = Date.now();
    if (Date.now() - essai >= 5000) await withTimeout(relireMaintenant(), 15000).catch(() => {});
    return reponse();
  }],
  // Reglages avant le depart (machine prete) : programme ?, temperature ?, essorage ? ; valeurs declarees par la machine pour le programme vise.
  // Envoi dans l'ordre programme (qui remet les reglages par defaut), temperature, essorage ; une seule commande a la fois, jamais renvoyee ;
  // envoi partiel signale (ce qui est parti n'est pas annule). Ne demarre jamais.
  ['POST', /^\/api\/washers\/(st-[A-Za-z0-9-]{1,72})\/reglages$/, async (c) => {
    const b = await c.corps();
    const lire = (v) => (v === undefined || v === null ? null : String(v).trim());
    const prog = lire(b.programme) === null ? null : lire(b.programme).toUpperCase(), temp = lire(b.temperature), spin = lire(b.essorage);
    if (prog !== null && !/^[0-9A-F]{2}$/.test(prog)) throw new HttpError(400, 'Programme inconnu.');
    if ((temp !== null && !/^[A-Za-z0-9]{1,16}$/.test(temp)) || (spin !== null && !/^[A-Za-z0-9]{1,16}$/.test(spin))) throw new HttpError(400, 'Réglage invalide.');
    if (prog === null && temp === null && spin === null) throw new HttpError(400, 'Rien à envoyer.');
    if (droitCommande() === false) throw new HttpError(403, 'Autorisation en lecture seule : icône compte de la carte SmartThings, Reconnecter avec les commandes.');
    if (commandeEnCours) throw new HttpError(409, 'Une commande est déjà en cours.');
    commandeEnCours = true;
    try {
      vue = Date.now();
      await relireMaintenant();
      if (erreurDerniere) throw erreurDerniere;
      const x = machines.find((m) => 'st-' + m.deviceId === c.m[1]);
      if (!x || !etats.has(x.deviceId)) throw new HttpError(404, 'Lave-linge inconnu.');
      const s = etats.get(x.deviceId);
      if (s.etat === 'hors_ligne') throw new HttpError(409, 'Machine hors ligne.');
      if (s.telecommande !== true) throw new HttpError(409, 'Commande à distance OFF : appui court sur Smart Control de la machine.');
      if (s.etat !== 'pret') throw new HttpError(409, 'Réglages possibles seulement machine allumée et à l\'arrêt.');
      const actuel = ((/_Course_([A-Za-z0-9]{1,4})$/.exec(s.programme || '') || [])[1] || '').toUpperCase();
      const changer = prog !== null && prog !== actuel;
      const p = s.programmes.find((y) => y.code === (changer ? prog : actuel) && y.choix);
      if (!p) throw new HttpError(409, 'Programme non proposé par la machine.');
      if (temp !== null && !p.temperatures.includes(temp)) throw new HttpError(409, 'Température non permise pour ce programme.');
      if (spin !== null && !p.essorages.includes(spin)) throw new HttpError(409, 'Essorage non permis pour ce programme.');
      const fait = [];
      try {
        if (changer) { log('smartthings : programme', prog, ':', await choisirProgramme(x.deviceId, prog)); fait.push('programme'); if (temp !== null || spin !== null) await sleep(2000); }
        if (temp !== null) { log('smartthings : temperature', temp, ':', await reglerOption(x.deviceId, 'temperature', temp)); fait.push('température'); }
        if (spin !== null) { log('smartthings : essorage', spin, ':', await reglerOption(x.deviceId, 'essorage', spin)); fait.push('essorage'); }
      } catch (e) {
        if (!fait.length) throw e;
        log('smartthings : reglages interrompus apres', fait.join(', '), (e && e.code) || '');
        await sleep(3000);
        await relireMaintenant();
        const m = e instanceof ErreurST && MESSAGES[e.code] ? MESSAGES[e.code][1] : 'erreur';
        throw new HttpError(502, 'Envoi partiel (' + fait.join(', ') + ' envoyé) : ' + m + '. Vérifier sur la machine.');
      }
      await sleep(3000);
      await relireMaintenant();
      return reponse();
    } finally { commandeEnCours = false; }
  }],
  // Commande : etat relu juste avant l'envoi (commande a distance ON, en ligne, etat compatible), une seule a la fois, relecture 3 s apres.
  ['POST', /^\/api\/washers\/(st-[A-Za-z0-9-]{1,72})\/commande$/, async (c) => {
    const body = await c.corps();
    const a = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!a) throw new HttpError(400, 'Action inconnue (pause, reprendre, arreter).');
    if (droitCommande() === false) throw new HttpError(403, 'Autorisation en lecture seule : icône compte de la carte SmartThings, Reconnecter avec les commandes.');
    if (commandeEnCours) throw new HttpError(409, 'Une commande est déjà en cours.');
    commandeEnCours = true;
    try {
      vue = Date.now();
      await relireMaintenant();
      if (erreurDerniere) throw erreurDerniere;
      const x = machines.find((m) => 'st-' + m.deviceId === c.m[1]);
      if (!x || !etats.has(x.deviceId)) throw new HttpError(404, 'Lave-linge inconnu.');
      const s = etats.get(x.deviceId);
      if (s.etat === 'hors_ligne') throw new HttpError(409, 'Machine hors ligne.');
      if (s.telecommande !== true) throw new HttpError(409, 'Commande à distance OFF : appui court sur Smart Control de la machine.');
      if (!a.si.includes(s.etat)) throw new HttpError(409, a.refus);
      log('smartthings : commande', body.action, ':', await commande(x.deviceId, a.etat));
      await sleep(3000);
      await relireMaintenant();
      return reponse();
    } finally { commandeEnCours = false; }
  }],
];
// Rangement local dans les pieces (V1.4, contrat « Pièces ») : lave-linge et familles, depuis les caches ; jamais d'ecriture vers le cloud.
export const rangement = {
  nom: 'SmartThings',
  async appareils() {
    rafraichir();
    if (cloudInjoignable()) return []; // V1.7 : masques des pieces tant que le cloud ne repond pas (leur rangement est garde : pieces-gestion.mjs)
    return machines.map((x) => ({ id: 'st-' + x.deviceId, nom: x.name, genre: 'Lave-linge', vue: 'electro' })).concat(await connus());
  },
};
export const routes = routesLave.concat(routesCompte, routesFamilles);
// FIN
