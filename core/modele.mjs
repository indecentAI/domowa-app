// @zone appareils | Modele commun d'un appareil (ID_RE, estOnOff), validation d'un reglage (reglage) et conversion vers le format de l'ancienne API /api/devices (ancien).
// Appareil (fourni par un adaptateur, le coeur ajoute adapter) :
//   { id, adapter, type: 'light'|'outlet'|..., name, room: {id, name}|null, reachable,
//     caps: { onoff, level, color, ctemp, ctempMin, ctempMax }, state: { on, level, colorMode, hue, sat, ctemp } }
//   caps.* : booleen (sauf ctempMin/ctempMax en kelvins ou null) ; state.* : valeur ou null. Camera : type 'camera', caps { stream, ptz, hd }, state {}.
// Lave-linge (generique, toute marque) : type 'washer', caps { washer, pause, reprise, arret }, state { etat: pret|en_cours|pause|hors_ligne|autre, connexion: ONLINE|UNHEALTHY|OFFLINE|null, brut, programme,
// restantMin, progression 0-100, fin (ISO), phase (ces quatre : null hors cycle), phases [{nom, min}], programmeNom, temperature ('40', 'cold'...),
// essorage ('1200', 'noSpin'...), verrouEnfant, telecommande, perime, maj (ISO) }.
//     Jamais de champ on ni de caps.onoff : ni pourClient, ni Tout OFF, ni les pieces ne le touchent ; routes propres (/api/washers).
// Reglage (set) : { on?, level? 1-100, mode?: 'color'|'temperature', hue? 0-359, sat? 0-1, kelvin? 1801-6535 }.
// V2.1 (capacites, core/capacites.mjs) : un adaptateur migre decrit l'appareil par capacites [descripteur] (+ inconnues, modeCouleur) et appelle projeter(d), qui CALCULE caps et state
// (source unique : jamais de double description). DIRIGERA et Home Assistant migres (V2.1) ; un appareil sans capacites (camera, washer) garde caps/state ecrits par son adaptateur : les deux formes sont acceptees.
import { HttpError } from './http.mjs';

export const KELVIN_MIN = 1801, KELVIN_MAX = 6535;
// Identifiant d'appareil, de piece ou de camera (routes, fichiers de donnees) : lettres, chiffres, _ et -, 80 au plus.
export const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
// Appareil commandable ON/OFF (seuls ceux-ci vont dans /api/devices, Tout OFF et les commandes de piece) : regle de role (contrat « Capacités ») :
// capacite onoff de role eclairage ou prise ; un chauffage, une vanne, un appareil quelconque ont onoff mais n'y entrent jamais. Appareil sans capacites (forme ancienne) : caps.onoff.
export const ROLES_ONOFF = ['eclairage', 'prise'];
const onoffCommun = (l) => l.find((c) => c && c.cap === 'onoff' && ROLES_ONOFF.includes(c.role));
export const estOnOff = (d) => !!(d && (Array.isArray(d.capacites) ? onoffCommun(d.capacites) : d.caps && d.caps.onoff));

export function reglage(s) {
  if (!s || typeof s !== 'object') throw new HttpError(400, 'Réglages requis.');
  const o = {};
  if (s.on !== undefined) {
    if (typeof s.on !== 'boolean') throw new HttpError(400, 'Valeur "on" invalide.');
    o.on = s.on;
  }
  if (s.level !== undefined) {
    if (!Number.isInteger(s.level) || s.level < 1 || s.level > 100) throw new HttpError(400, 'Luminosité invalide (1 à 100).');
    o.level = s.level;
  }
  if (s.mode === 'color') {
    if (typeof s.hue !== 'number' || typeof s.sat !== 'number' || !(s.hue >= 0 && s.hue <= 360) || !(s.sat >= 0 && s.sat <= 1.01)) {
      throw new HttpError(400, 'Couleur invalide.');
    }
    o.mode = 'color';
    o.hue = Math.min(359, Math.round(s.hue));
    o.sat = Math.min(1, Math.round(s.sat * 100) / 100);
  } else if (s.mode === 'temperature') {
    if (!Number.isInteger(s.kelvin) || s.kelvin < KELVIN_MIN || s.kelvin > KELVIN_MAX) throw new HttpError(400, 'Température invalide.');
    o.mode = 'temperature';
    o.kelvin = s.kelvin;
  } else if (s.mode !== undefined) {
    throw new HttpError(400, 'Mode invalide.');
  }
  return o;
}

// Le reglage demande-t-il une capacite que l'appareil n'a pas ? (renvoie le nom de la capacite manquante ou null)
export function manque(d, set) {
  const c = d.caps || {};
  if (set.on !== undefined && !c.onoff) return 'ON/OFF';
  if (set.level !== undefined && !c.level) return 'luminosité';
  if (set.mode === 'color' && !c.color) return 'couleur';
  if (set.mode === 'temperature' && !c.ctemp) return 'température';
  return null;
}

// Liste envoyee au client : appareils ON/OFF seulement (les cameras ont leurs routes), au format ancien.
export const pourClient = (l) => l.filter(estOnOff).map(ancien);

const nb = (v) => (typeof v === 'number' ? v : null);
// Projection des capacites vers caps/state (format booleen lu par Tout OFF, confirmation, scenarios, animations, lots, pieces). Rend l'appareil complete, sans le modifier.
// onoff de role eclairage|prise -> caps.onoff, state.on ; luminosite -> caps.level (ecrivable et role eclairage), state.level ; couleur {hue, sat} -> caps.color (ecrivable), state.hue/sat ;
// temperature_couleur -> caps.ctemp (ecrivable), ctempMin/ctempMax (min/max du descripteur), state.ctemp ; modeCouleur de l'appareil -> state.colorMode. Le reste n'a pas de forme ancienne.
export function projeter(d) {
  const l = Array.isArray(d.capacites) ? d.capacites : [];
  const de = (cap) => l.find((c) => c && c.cap === cap);
  const o = onoffCommun(l), lu = de('luminosite'), co = de('couleur'), k = de('temperature_couleur');
  const cv = (co && co.valeur) || {};
  return {
    ...d,
    caps: {
      onoff: !!o, level: !!(lu && lu.ecriture && o && o.role === 'eclairage'), color: !!(co && co.ecriture), ctemp: !!(k && k.ecriture),
      ctempMin: k ? nb(k.min) : null, ctempMax: k ? nb(k.max) : null,
    },
    state: {
      on: o && typeof o.valeur === 'boolean' ? o.valeur : null, level: lu ? nb(lu.valeur) : null, colorMode: d.modeCouleur || null,
      hue: nb(cv.hue), sat: nb(cv.sat), ctemp: k ? nb(k.valeur) : null,
    },
  };
}
export function ancien(d) {
  const c = d.caps || {}, s = d.state || {};
  return {
    id: d.id, name: d.name, kind: d.type, room: d.room, isOn: typeof s.on === 'boolean' ? s.on : null, reachable: d.reachable,
    level: nb(s.level), canDim: !!c.level, colorMode: s.colorMode || null, hue: nb(s.hue), sat: nb(s.sat), temp: nb(s.ctemp),
    tempLo: nb(c.ctempMin), tempHi: nb(c.ctempMax), canColor: !!c.color, canTemp: !!c.ctemp,
  };
}
// FIN
