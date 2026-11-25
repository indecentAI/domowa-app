// @zone homeassistant equipements | Ecriture generique Home Assistant (V2.2 etape ha-ecriture ; contrat « Capacités ») : ecrire(element, cap, valeur, descripteur) traduit une capacite deja
// validee par le coeur (core/capacites.mjs valider : ecriture declaree, bornes, pas, options ; sensible : confirm exige) vers UNE action de Home Assistant, liste fermee T ci-dessous
// (domaine:capacite -> chemin et corps), envoyee une seule fois par envoyer de connexion.mjs (jamais renvoyee ; chemin aussi controle par ACTIONS de connexion.mjs).
// Actions lues dans le code de Home Assistant 2026.2.3 (paquet officiel : components/<domaine>/services.yaml et __init__.py ; components/api/__init__.py : POST /api/services/<domaine>/<action>,
// corps = donnees de l'action avec entity_id, appel bloquant, 400 si donnees invalides) : switch, input_boolean turn_on / turn_off ; number, input_number set_value {value} ; select,
// input_select select_option {option} ; text, input_text set_value {value} ; date set_value {date: AAAA-MM-JJ} ; time set_value {time: HH:MM[:SS]} ; datetime set_value {datetime:
// AAAA-MM-JJTHH:MM[:SS], sans fuseau : celui de Home Assistant} ; button, input_button press (button de device_class identify : Identifier) ; scene turn_on (sans transition) ; script turn_on
// (sans variables, n'attend pas la fin du script ; sensible) ; update install (sans version ni sauvegarde ; sensible ; appel bloquant jusqu'a la fin de l'installation, que Home Assistant
// poursuit si la connexion tombe : delai depasse = installation lancee). V2.2 ha-climat : climate (turn_on / turn_off, set_hvac_mode, set_temperature {temperature} ou {target_temp_low,
// target_temp_high}, refusee en mode off, set_humidity, set_fan_mode, set_preset_mode, set_swing_mode), water_heater (turn_on / turn_off, set_operation_mode, set_temperature {temperature},
// set_away_mode), humidifier (turn_on / turn_off, set_humidity, set_mode), fan (turn_on / turn_off, set_percentage entier, oscillate, set_direction, set_preset_mode).
// V2.2 ha-ouvrants (meme source : components/cover, valve, lock, alarm_control_panel, siren) : cover open_cover / close_cover / stop_cover, set_cover_position {position = 100 - valeur :
// 0 % = remonte dans l'application, 100 = ouvert pour Home Assistant}, set_cover_tilt_position {tilt_position} (lamelles ouvrir / fermer : non decrites) ; valve open_valve /
// close_valve / stop_valve, set_valve_position {position} ; lock lock / unlock {code?} (open : non propose) ; alarm_control_panel alarm_disarm, alarm_arm_home | away | night | vacation |
// custom_bypass {code?} (alarm_trigger : non propose) ; siren turn_on {tone?, volume_level 0-1?, duration s?} (seulement les parametres declares), turn_off. Code (options.code, tape a
// chaque fois) : exige quand code_format est declare (alarme : desarmer toujours, armer si code_arm_required n'est pas false), refuse sinon ; envoye une fois dans le corps, jamais journalise.
// Parametres (options) : liste fermee par action, autre cle -> 400 ; sans options : aucun parametre envoye.
// V2.2 ha-media-robots (meme source : components/media_player, remote, vacuum, lawn_mower) : media_player turn_on / turn_off, media_play | pause | stop | next_track | previous_track
// (lecture : play, pause, stop, next, previous), volume_set {volume_level 0-1}, volume_mute {is_volume_muted}, select_source {source}, select_sound_mode {sound_mode} (capacite mode),
// repeat_set {repeat}, shuffle_set {shuffle} ; remote turn_on / turn_off, turn_on {activity} (activite ; send_command non propose) ; vacuum start, pause, stop, return_to_base,
// clean_spot, locate, set_fan_speed {fan_speed} (send_command non propose) ; lawn_mower start_mowing, pause, dock.
// Capacites ecrivables declarees mais hors de T : rendues en lecture seule par masquer (vue Equipements : aucune commande construite, rien envoye), sauf celles des lumieres et prises
// (LUMIERES : commandees par les routes de la vue Lumieres, appliquer de index.mjs). Enveloppes configuration et diagnostic : traduites d'apres leur nature. Aucune valeur journalisee.
import { HttpError } from '../../core/http.mjs';
import { envoyer } from './connexion.mjs';
import { entiteDe } from './modele.mjs';

const ENVELOPPES = ['configuration', 'diagnostic'];
const effective = (c) => (c && ENVELOPPES.includes(c.cap) && typeof c.nature === 'string' ? c.nature : c && c.cap);
const action = (dom, act, donnees) => ({ chemin: '/api/services/' + dom + '/' + act, donnees: donnees || {} });
const nonPrise = () => new HttpError(400, 'Commande non prise en charge.');
// Parametres permis d'une commande (options validees par le coeur : texte, nombre ou booleen) : toute autre cle -> 400
const seules = (o, permises) => { for (const k of Object.keys(o || {})) if (!permises.includes(k)) throw new HttpError(400, 'Paramètre non pris en charge : ' + k + '.'); };
// Code d'alarme ou de serrure : exige si code_format est declare et requis pour cette commande ; refuse si l'equipement n'en declare pas ; -> {code} ou {}
function code(d, o, requis) {
  seules(o, ['code']);
  const c = o && typeof o.code === 'string' ? o.code : null;
  if (o && o.code !== undefined && c === null) throw new HttpError(400, 'Code invalide.');
  if (!d.code_format) { if (c !== null) throw new HttpError(400, 'Cet équipement ne demande pas de code.'); return {}; }
  if (c === null) { if (requis) throw new HttpError(400, 'Code requis.'); return {}; }
  return { code: c };
}
// Ouvrant (volet, vanne) : option choisie (open, close, stop) -> action du domaine
const ouvrant = (dom) => (v, d, o) => { seules(o, []); const a = { open: 'open_', close: 'close_', stop: 'stop_' }[v]; if (!a) throw nonPrise(); return action(dom, a + dom); };
// Choix -> action du domaine (liste fermee) ; code hors liste : 400
const parmi = (dom, t) => (v) => { if (!Object.prototype.hasOwnProperty.call(t, v)) throw nonPrise(); return action(dom, t[v]); };
const ALARME = { disarm: 'alarm_disarm', arm_home: 'alarm_arm_home', arm_away: 'alarm_arm_away', arm_night: 'alarm_arm_night', arm_vacation: 'alarm_arm_vacation', arm_custom_bypass: 'alarm_arm_custom_bypass' };
// Sirene : ton parmi ceux declares, volume en % (0-100, envoye 0-1), duree en secondes entieres (1-3600) ; seulement si declares (drapeaux TONES, VOLUME_SET, DURATION)
function sirene(v, d, o) {
  if (v !== true) { seules(o, []); return action('siren', 'turn_off'); }
  seules(o, ['ton', 'volume', 'duree']);
  const p = {};
  if (o && o.ton !== undefined) { if (!Array.isArray(d.tons) || !d.tons.some((t) => t && t.code === o.ton)) throw new HttpError(400, 'Ton inconnu.'); p.tone = o.ton; }
  if (o && o.volume !== undefined) { if (!d.volume_reglable || !Number.isInteger(o.volume) || o.volume < 0 || o.volume > 100) throw new HttpError(400, 'Volume invalide.'); p.volume_level = o.volume / 100; }
  if (o && o.duree !== undefined) { if (!d.duree_reglable || !Number.isInteger(o.duree) || o.duree < 1 || o.duree > 3600) throw new HttpError(400, 'Durée invalide.'); p.duration = o.duree; }
  return action('siren', 'turn_on', p);
}
const onoff = (dom) => (v) => action(dom, v === true ? 'turn_on' : 'turn_off');
const valeur = (dom) => (v) => action(dom, 'set_value', { value: v });
const option = (dom) => (v) => action(dom, 'select_option', { option: v });
const appui = (dom) => () => action(dom, 'press');
// Texte : longueurs declarees verifiees ici (Home Assistant les verifie aussi, comme le motif : refus 400 sinon)
const texte = (dom) => (v, d) => {
  const n = String(v).length;
  if ((typeof d.longueur_min === 'number' && n < d.longueur_min) || (typeof d.longueur_max === 'number' && n > d.longueur_max)) throw new HttpError(400, 'Longueur du texte hors bornes.');
  return action(dom, 'set_value', { value: v });
};
// Climat (decision de la specification V2.0) : consigne refusee en mode off ; humidite : entier (Home Assistant : vol.Coerce(int))
const horsOff = (d) => { if (d && d.en_off) throw new HttpError(409, 'Consigne indisponible en mode OFF.'); };
const entier = (v) => { if (!Number.isInteger(v)) throw new HttpError(400, 'Humidité entière attendue.'); return v; };
// Date, heure : formats que lisent dt_util.parse_date, parse_time et parse_datetime de Home Assistant ; date du calendrier verifiee
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/, HEURE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const dateValide = (s) => { const m = DATE.exec(s); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
export function dateHeure(format, v) {
  const s = String(v);
  if (format === 'date' && dateValide(s)) return s;
  if (format === 'time' && HEURE.test(s)) return s.length === 5 ? s + ':00' : s;
  if (format === 'datetime') { const [j, h] = s.split('T'); if (dateValide(j) && HEURE.test(h || '')) return j + 'T' + (h.length === 5 ? h + ':00' : h); }
  throw new HttpError(400, format === 'date' ? 'Date attendue (AAAA-MM-JJ).' : format === 'time' ? 'Heure attendue (HH:MM).' : 'Date et heure attendues (AAAA-MM-JJTHH:MM).');
}

// Liste fermee : domaine:capacite -> (valeur validee, descripteur) => {chemin, donnees}
const T = {
  'switch:onoff': onoff('switch'),
  'input_boolean:onoff': onoff('input_boolean'),
  'number:niveau': valeur('number'),
  'input_number:niveau': valeur('input_number'),
  'select:source': option('select'),
  'input_select:source': option('input_select'),
  'text:texte': texte('text'),
  'input_text:texte': texte('input_text'),
  'date:date_heure': (v) => action('date', 'set_value', { date: dateHeure('date', v) }),
  'time:date_heure': (v) => action('time', 'set_value', { time: dateHeure('time', v) }),
  'datetime:date_heure': (v) => action('datetime', 'set_value', { datetime: dateHeure('datetime', v) }),
  'button:action': appui('button'),
  'button:identifier': appui('button'),
  'input_button:action': appui('input_button'),
  'scene:scene': () => action('scene', 'turn_on'),
  'script:action': () => action('script', 'turn_on'),
  'update:maj_installer': () => action('update', 'install'),
  // V2.2 ha-climat (code de HA 2026.2.3 : components/climate, water_heater, humidifier, fan : services.yaml et __init__.py)
  'climate:onoff': onoff('climate'),
  'climate:mode': (v) => action('climate', 'set_hvac_mode', { hvac_mode: v }),
  'climate:consigne_temperature': (v, d) => { horsOff(d); return action('climate', 'set_temperature', { temperature: v }); },
  'climate:consigne_plage': (v, d) => { horsOff(d); return action('climate', 'set_temperature', { target_temp_low: v.bas, target_temp_high: v.haut }); },
  'climate:consigne_humidite': (v) => action('climate', 'set_humidity', { humidity: entier(v) }),
  'climate:vitesse_predefinie': (v) => action('climate', 'set_fan_mode', { fan_mode: v }),
  'climate:prereglage': (v) => action('climate', 'set_preset_mode', { preset_mode: v }),
  'climate:sens': (v, d) => { if (d.horizontal) throw new HttpError(400, 'Commande non prise en charge.'); return action('climate', 'set_swing_mode', { swing_mode: v }); },
  'water_heater:onoff': onoff('water_heater'),
  'water_heater:mode': (v) => action('water_heater', 'set_operation_mode', { operation_mode: v }),
  'water_heater:consigne_temperature': (v) => action('water_heater', 'set_temperature', { temperature: v }),
  'water_heater:absence': (v) => action('water_heater', 'set_away_mode', { away_mode: v }),
  'humidifier:onoff': onoff('humidifier'),
  'humidifier:consigne_humidite': (v) => action('humidifier', 'set_humidity', { humidity: entier(v) }),
  'humidifier:mode': (v) => action('humidifier', 'set_mode', { mode: v }),
  'fan:onoff': onoff('fan'),
  // percentage : entier 0-100 pour Home Assistant (vol.Coerce(int)) ; un pas declare non entier (33,33) donne la valeur arrondie
  'fan:vitesse': (v) => action('fan', 'set_percentage', { percentage: Math.round(v) }),
  'fan:oscillation': (v) => action('fan', 'oscillate', { oscillating: v }),
  'fan:sens': (v) => action('fan', 'set_direction', { direction: v }),
  'fan:prereglage': (v) => action('fan', 'set_preset_mode', { preset_mode: v }),
  // V2.2 ha-ouvrants (code de HA 2026.2.3 : components/cover, valve, lock, alarm_control_panel, siren : services.yaml et __init__.py)
  'cover:ouverture': ouvrant('cover'),
  'cover:position': (v, d, o) => { seules(o, []); return action('cover', 'set_cover_position', { position: 100 - v }); },
  'cover:inclinaison': (v, d, o) => { seules(o, []); return action('cover', 'set_cover_tilt_position', { tilt_position: v }); },
  'valve:ouverture': ouvrant('valve'),
  'valve:position': (v, d, o) => { seules(o, []); return action('valve', 'set_valve_position', { position: v }); },
  'lock:verrou': (v, d, o) => { if (v !== 'lock' && v !== 'unlock') throw nonPrise(); return action('lock', v, code(d, o, true)); },
  'alarm_control_panel:alarme': (v, d, o) => { const a = ALARME[v]; if (!a) throw nonPrise(); return action('alarm_control_panel', a, code(d, o, v === 'disarm' || d.code_requis !== false)); },
  'siren:sirene': sirene,
  // V2.2 ha-media-robots (code de HA 2026.2.3 : components/media_player, remote, vacuum, lawn_mower : services.yaml et __init__.py)
  'media_player:onoff': onoff('media_player'),
  'media_player:lecture': parmi('media_player', { play: 'media_play', pause: 'media_pause', stop: 'media_stop', next: 'media_next_track', previous: 'media_previous_track' }),
  // volume : 0-100 % dans l'application, volume_level 0-1 pour Home Assistant (cv.small_float)
  'media_player:volume': (v) => action('media_player', 'volume_set', { volume_level: Math.round(v) / 100 }),
  'media_player:muet': (v) => action('media_player', 'volume_mute', { is_volume_muted: v }),
  'media_player:source': (v) => action('media_player', 'select_source', { source: v }),
  'media_player:mode': (v) => action('media_player', 'select_sound_mode', { sound_mode: v }),
  'media_player:repetition': (v) => action('media_player', 'repeat_set', { repeat: v }),
  'media_player:aleatoire': (v) => action('media_player', 'shuffle_set', { shuffle: v }),
  'remote:onoff': onoff('remote'),
  'remote:source': (v) => action('remote', 'turn_on', { activity: v }),
  'vacuum:robot': parmi('vacuum', { start: 'start', pause: 'pause', stop: 'stop', return_to_base: 'return_to_base', clean_spot: 'clean_spot', locate: 'locate' }),
  'vacuum:vitesse_predefinie': (v) => action('vacuum', 'set_fan_speed', { fan_speed: v }),
  'lawn_mower:robot': parmi('lawn_mower', { start_mowing: 'start_mowing', pause: 'pause', dock: 'dock' }),
};
// Entrees de T (essais : chaque chemin produit figure dans ACTIONS de connexion.mjs, ecrite en toutes lettres, une action par ligne)
export const COMMANDES = Object.freeze(Object.keys(T));
// Lumieres et prises : commandees par la vue Lumieres (appliquer), gardees ecrivables
const LUMIERES = ['light:onoff', 'light:luminosite', 'light:couleur', 'light:temperature_couleur'];
const domaine = (element) => { const e = entiteDe(element); return e ? e.split('.')[0] : null; };
// Oscillation horizontale d'un climat : meme capacite (sens) que l'oscillation sur le meme element, que la route d'ecriture ne distingue pas (premiere trouvee) : lecture seule
export const ecrivable = (c) => { const d = domaine(c && c.element); return !!d && !(c && c.horizontal) && (!!T[d + ':' + effective(c)] || LUMIERES.includes(d + ':' + effective(c))); };

// Action d'une capacite (pure, essais unitaires) -> {chemin, corps} ; capacite hors de la liste : 400, rien envoye. o : parametres (V2.2 ha-ouvrants : code, ton, volume, duree),
// refuses par une action qui ne les lit pas (seules) ; les actions plus anciennes n'en lisent aucun : refus aussi
export function actionDe(element, cap, v, d, o) {
  const e = entiteDe(element), f = e && T[e.split('.')[0] + ':' + effective({ cap, nature: d && d.nature })];
  if (!f) throw nonPrise();
  if (f.length < 3) seules(o, []);
  const a = f(v, d || {}, o || {});
  return { chemin: a.chemin, corps: { entity_id: e, ...a.donnees } };
}
export async function ecrire(element, cap, v, d, o) {
  const a = actionDe(element, cap, v, d, o);
  try { await envoyer(a.chemin, a.corps); }
  catch (e) { if (!(a.chemin === '/api/services/update/install' && e && e.code === 'HA_DELAI')) throw e; }
}
// Equipements rendus (index.mjs) : capacite declaree ecrivable par Home Assistant mais sans action dans T -> lecture seule (copie ; rien d'autre ne change)
export function masquer(liste) {
  return (Array.isArray(liste) ? liste : []).map((q) => (q && Array.isArray(q.capacites) && q.capacites.some((c) => c && c.ecriture === true && !ecrivable(c))
    ? { ...q, capacites: q.capacites.map((c) => (c && c.ecriture === true && !ecrivable(c) ? { ...c, ecriture: false } : c)) } : q));
}
// FIN
