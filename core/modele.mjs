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
import { HttpError } from './http.mjs';

export const KELVIN_MIN = 1801, KELVIN_MAX = 6535;
// Identifiant d'appareil, de piece ou de camera (routes, fichiers de donnees) : lettres, chiffres, _ et -, 80 au plus.
export const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
// Appareil commandable ON/OFF (seuls ceux-ci vont dans /api/devices, Tout OFF et les commandes de piece)
export const estOnOff = (d) => !!(d && d.caps && d.caps.onoff);

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
export function ancien(d) {
  const c = d.caps || {}, s = d.state || {};
  return {
    id: d.id, name: d.name, kind: d.type, room: d.room, isOn: typeof s.on === 'boolean' ? s.on : null, reachable: d.reachable,
    level: nb(s.level), canDim: !!c.level, colorMode: s.colorMode || null, hue: nb(s.hue), sat: nb(s.sat), temp: nb(s.ctemp),
    tempLo: nb(c.ctempMin), tempHi: nb(c.ctempMax), canColor: !!c.color, canTemp: !!c.ctemp,
  };
}
// FIN
