// @zone homeassistant equipements | Home Assistant, fonctions pures (sans reseau ni fichier) : identifiant d'appareil <-> entite (domaines integres), description en capacites de toute entite (decrire, V2.1),
// lumieres et prises vers le modele commun (versModele : caps/state calcules par projeter de core/modele.mjs), equipements (versEquipements : regroupement par appareil du registre), commandes de la vue Lumieres (actionLumiere ; ecriture generique : actionDe de ecriture.mjs). Essais : banc/unitaires/homeassistant.test.mjs, capacites.test.mjs.
// Etat d'une entite (API REST) : {entity_id, state, attributes, last_updated...}. Lecture et ecriture d'apres supported_features (drapeaux du code de HA, *EntityFeature, lus le 19/11/2026),
// supported_color_modes, listes d'options (hvac_modes, preset_modes, fan_modes, source_list, options...) et min, max, pas declares ; une action que HA enregistre sans drapeau requis
// (services.py du domaine : light et switch turn_on/off, humidifier, remote, lock lock/unlock, alarm disarm, set_hvac_mode, number, select, text, date, time, datetime, button, scene) : ecrivable.
// Jamais d'apres le domaine seul ; le domaine ne donne que le role de onoff (light : eclairage ; switch outlet : prise ; climate, water_heater : chauffage ; le reste : appareil).
// Rien n'est jete : tout attribut sans capacite va dans inconnues [{cle, valeur}] (copie, 8 Ko au plus) ; image d'entite (jeton dans l'adresse) : {masque: true} ; position et identifiants reseau
// d'un traceur : capacite ou inconnue privee (contrat « Données sensibles »). Identifiant : « ha-<domaine>-<objet> » (ID_RE : ni point ni plus de 80 caracteres).
import { projeter } from '../../core/modele.mjs';
import { sansSecret, groupe, nb, tx, bo, copieInconnue as copie, texteCoordonnees } from '../../core/capacites.mjs';

// Domaines integres (conception v2.1 §9 ; V2.2 ha-ecriture : entrees de Home Assistant input_boolean, input_number, input_select, input_text, input_button et script, jusque-la
// en lecture seule comme domaines inconnus, memes identifiants) ; exclus : calendar, todo, notify, tts, stt, conversation, assist_satellite, wake_word, ai_task, image_processing, geo_location, weather,
// infrared, radio_frequency, zone ; camera et image : plus tard. Ordre : choix de l'element principal d'un equipement.
export const DOMAINES = Object.freeze(['light', 'switch', 'climate', 'water_heater', 'humidifier', 'fan', 'cover', 'valve', 'lock', 'alarm_control_panel', 'siren', 'media_player', 'remote',
  'vacuum', 'lawn_mower', 'number', 'select', 'text', 'date', 'time', 'datetime', 'button', 'scene', 'input_boolean', 'input_number', 'input_select', 'input_text', 'input_button', 'script',
  'sensor', 'binary_sensor', 'air_quality', 'event', 'update', 'device_tracker', 'person']);
const DOM = DOMAINES.join('|');
const ENTITE = new RegExp('^(' + DOM + ')\\.([a-z0-9_]{1,70})$');
const ID = new RegExp('^ha-(' + DOM + ')-([a-z0-9_]{1,70})$');
const COULEUR = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
export const MAX_APPAREILS = 500;
const MAX_ENTITES = 3000;

export function idDe(entite) { const m = ENTITE.exec(String(entite)); const id = m ? 'ha-' + m[1] + '-' + m[2] : null; return id && id.length <= 80 ? id : null; }
// Repli des domaines inconnus (decision du 19/11, etape equipements-vue) : entite d'un domaine hors DOMAINES et hors EXCLUS -> equipement en lecture seule (etat en capacite mesure,
// attributs dans inconnues) ; meme forme d'identifiant (ha-<domaine>-<objet>), jamais converti en entite par entiteDe : jamais commandable, jamais dans lister ni /api/devices.
const EXCLUS = Object.freeze(['calendar', 'todo', 'notify', 'tts', 'stt', 'conversation', 'assist_satellite', 'wake_word', 'ai_task', 'image_processing', 'geo_location', 'weather',
  'infrared', 'radio_frequency', 'zone', 'camera', 'image']);
const ENTITE_TOUT = /^([a-z0-9_]{1,40})\.([a-z0-9_]{1,70})$/;
export function idLecture(entite) {
  const m = ENTITE_TOUT.exec(String(entite));
  if (!m || DOMAINES.includes(m[1]) || EXCLUS.includes(m[1])) return null;
  const id = 'ha-' + m[1] + '-' + m[2];
  return id.length <= 80 ? id : null;
}
export function entiteDe(id) { const m = String(id).length <= 80 ? ID.exec(String(id)) : null; return m ? m[1] + '.' + m[2] : null; }

const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const liste = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
const a_ = (a, k) => Object.hasOwn(a, k);
const domaineDe = (e) => String(e).split('.')[0];
const nomDe = (st) => { const a = objet(st.attributes); return typeof a.friendly_name === 'string' && a.friendly_name.trim() ? a.friendly_name.trim().slice(0, 60) : String(st.entity_id); };

// Entite gardee par lister : lumiere qui n'est pas un groupe (ses lampes sont deja listees) ; interrupteur declare comme prise (device_class outlet : les autres
// switch.* sont souvent des reglages d'integrations) ; identifiant convertible.
export function retenue(st) {
  if (!st || typeof st !== 'object' || !idDe(st.entity_id)) return false;
  const a = objet(st.attributes), d = domaineDe(st.entity_id);
  if (d === 'light') return !Array.isArray(a.entity_id);
  return d === 'switch' && a.device_class === 'outlet';
}

// Libelles des codes d'options connus (sinon le code tel quel)
const LIBELLES = {
  off: 'OFF', on: 'ON', heat: 'Chauffe', cool: 'Climatisation', heat_cool: 'Chaud / froid', auto: 'Auto', dry: 'Déshumidification', fan_only: 'Ventilation',
  eco: 'Éco', away: 'Absent', boost: 'Boost', comfort: 'Confort', home: 'Maison', sleep: 'Nuit', activity: 'Activité', none: 'Aucun', low: 'Faible', medium: 'Moyenne', high: 'Forte',
  forward: 'Avant', reverse: 'Arrière', all: 'Tout', one: 'Un seul', electric: 'Électrique', gas: 'Gaz', heat_pump: 'Pompe à chaleur', high_demand: 'Forte demande', performance: 'Performance',
  // V2.2 ha-climat : libelles de la specification V2.0 du climat (mode heat « Chauffe », prereglages)
  frost_protection: 'Hors-gel', 'comfort-1': 'Confort −1', 'comfort-2': 'Confort −2', external: 'Externe', prog: 'Programme',
};
const options = (l) => liste(l).map((code) => ({ code, libelle: LIBELLES[code] || code }));
// Options fixees par drapeaux : [[drapeau, code, libelle]] -> celles que le hub declare
const parDrapeaux = (f, l) => l.filter(([b]) => !b || (f & b) === b).map(([, code, libelle]) => ({ code, libelle }));
const bit = (f, n) => (f & n) === n;

// Declarations consommees mais gardees aussi en copie (rien n'est jete) ; adresses d'image (jeton d'acces dans l'URL) masquees ; donnees de position et identifiants reseau : prives
const GARDES = ['supported_features', 'supported_color_modes', 'device_class'];
const MASQUES = ['entity_picture', 'entity_picture_local', 'access_token'];
const COORDONNEES = ['latitude', 'longitude', 'gps_accuracy']; // toujours privees
const PRIVEES = ['latitude', 'longitude', 'gps_accuracy', 'altitude', 'course', 'speed', 'vertical_accuracy', 'ip', 'mac', 'host_name', 'user_id', 'in_zones'];
const TRACEURS = ['device_tracker', 'person'];
// Capacites dont le sens tient au nom de l'entite (number, select, mesure quelconque...) : libelle = nom de l'entite
const GENERIQUES = ['mesure', 'niveau', 'source', 'texte', 'date_heure', 'action', 'probleme', 'appui'];
const SENSOR = { temperature: 'temperature', humidity: 'humidite', pm25: 'pm25', pm10: 'pm10', pm1: 'pm1', carbon_dioxide: 'co2', volatile_organic_compounds: 'cov',
  volatile_organic_compounds_parts: 'cov', illuminance: 'lux', pressure: 'pression', atmospheric_pressure: 'pression', sound_pressure: 'son', power: 'puissance', energy: 'energie',
  current: 'courant', voltage: 'tension', battery: 'batterie', signal_strength: 'signal' };
const BINAIRE = { moisture: 'fuite', smoke: 'fumee', carbon_monoxide: 'monoxyde', gas: 'gaz', door: 'ouvert', window: 'ouvert', opening: 'ouvert', garage_door: 'ouvert',
  motion: 'presence', occupancy: 'presence', presence: 'presence', problem: 'probleme', safety: 'probleme', tamper: 'probleme', battery: 'probleme' };
const AIR = [['particulate_matter_2_5', 'pm25'], ['particulate_matter_10', 'pm10'], ['carbon_dioxide', 'co2'], ['particulate_matter_0_1', 'mesure', 'PM0,1'],
  ['air_quality_index', 'mesure', 'Indice de qualité de l\'air'], ['carbon_monoxide', 'mesure', 'Monoxyde de carbone'], ['nitrogen_oxide', 'mesure', 'Protoxyde d\'azote'],
  ['nitrogen_monoxide', 'mesure', 'Monoxyde d\'azote'], ['nitrogen_dioxide', 'mesure', 'Dioxyde d\'azote'], ['ozone', 'mesure', 'Ozone'], ['sulphur_dioxide', 'mesure', 'Dioxyde de soufre']];
const PCT = { min: 0, max: 100, pas: 1, unite: '%' };
// V2.2 ha-depuis : capacites d'un capteur binaire qui portent « depuis… » ; horodatage ISO lisible ou null
const DEPUIS = ['ouvert', 'fuite', 'fumee', 'monoxyde', 'gaz', 'probleme'];
const horodatage = (v) => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null);
const nombre = (s) => { if (typeof s !== 'string' || !s.trim()) return null; const v = Number(s); return Number.isFinite(v) ? v : null; };
// Clavier du code (V2.2 ha-ouvrants) : alarme : code_format number -> chiffres ; serrure : expression de chiffres seuls (^\d{4}$, ^\d+$, ^[0-9]{4,6}$) -> chiffres ; sinon texte
const clavierCode = (cf, alarme) => (cf === null ? null : (alarme ? cf === 'number' : /^\^?(\\d|\[0-9\])(\{\d+(,\d*)?\}|[+*])?\$?$/.test(cf)) ? 'chiffres' : 'texte');
const connu = (s) => (typeof s === 'string' && s && s !== 'unknown' && s !== 'unavailable' ? s : null);
const coordonnees = (a) => texteCoordonnees(a.latitude, a.longitude, a.gps_accuracy);

// Description par domaine. x : {a (attributs), s (etat), f (supported_features), on, aj(cap, valeur, champs), pris(cles...), ctx, nom}
const D = {
  light(x) {
    const { a } = x;
    const modes = liste(a.supported_color_modes);
    x.pris('color_mode', 'brightness', 'hs_color', 'color_temp_kelvin', 'effect', 'effect_list');
    x.aj('onoff', x.on, { ecriture: true, role: 'eclairage' });
    const variable = modes.some((m) => m !== 'onoff');
    if (variable || a_(a, 'brightness')) {
      const b = nb(a.brightness);
      x.aj('luminosite', b === null ? null : Math.min(100, Math.max(1, Math.round(b * 100 / 255))), { ecriture: variable, min: 1, max: 100, pas: 1, unite: '%' });
    }
    const coul = modes.some((m) => COULEUR.includes(m));
    if (coul || a_(a, 'hs_color')) {
      const hs = Array.isArray(a.hs_color) ? a.hs_color.map(nb) : [];
      const ok = hs.length === 2 && hs[0] !== null && hs[1] !== null;
      x.aj('couleur', { hue: ok ? Math.round(hs[0]) % 360 : null, sat: ok ? Math.min(1, Math.max(0, Math.round(hs[1]) / 100)) : null }, { ecriture: coul });
    }
    const blanc = modes.includes('color_temp');
    if (blanc || a_(a, 'color_temp_kelvin')) {
      const lo = nb(a.min_color_temp_kelvin), hi = nb(a.max_color_temp_kelvin), k = nb(a.color_temp_kelvin);
      const o = { ecriture: blanc, pas: 1, unite: 'K' };
      // bornes seulement pour un blanc reglable (format ancien : tempLo/tempHi null sinon) ; sinon gardees dans inconnues
      if (blanc && lo !== null && hi !== null) { x.pris('min_color_temp_kelvin', 'max_color_temp_kelvin'); o.min = Math.round(Math.min(lo, hi)); o.max = Math.round(Math.max(lo, hi)); }
      x.aj('temperature_couleur', k === null ? null : Math.round(k), o);
    }
    if (bit(x.f, 4) || a_(a, 'effect')) x.aj('prereglage', tx(a.effect), { libelle: 'Effet', ecriture: bit(x.f, 4) && liste(a.effect_list).length > 0, options: options(a.effect_list) });
    return { modeCouleur: COULEUR.includes(a.color_mode) ? 'color' : a.color_mode === 'color_temp' ? 'temperature' : null };
  },
  switch(x) { x.aj('onoff', x.on, { ecriture: true, role: x.a.device_class === 'outlet' ? 'prise' : 'appareil' }); },
  fan(x) {
    const { a, f } = x;
    x.pris('percentage', 'percentage_step', 'oscillating', 'direction', 'preset_mode', 'preset_modes');
    if (bit(f, 16) || bit(f, 32) || x.on !== null) x.aj('onoff', x.on, { ecriture: bit(f, 16) && bit(f, 32), role: 'appareil' });
    if (bit(f, 1) || a_(a, 'percentage')) x.aj('vitesse', nb(a.percentage), { ecriture: bit(f, 1), min: 0, max: 100, unite: '%', ...(nb(a.percentage_step) ? { pas: a.percentage_step } : { pas: 1 }) });
    if (bit(f, 2) || a_(a, 'oscillating')) x.aj('oscillation', bo(a.oscillating), { ecriture: bit(f, 2) });
    if (bit(f, 4) || a_(a, 'direction')) x.aj('sens', tx(a.direction), { ecriture: bit(f, 4), options: options(['forward', 'reverse']) });
    if (bit(f, 8) || a_(a, 'preset_mode')) x.aj('prereglage', tx(a.preset_mode), { ecriture: bit(f, 8) && liste(a.preset_modes).length > 0, options: options(a.preset_modes) });
  },
  climate(x) {
    const { a, f, s } = x, u = x.ctx.uniteTemp ? { unite: x.ctx.uniteTemp } : {};
    // V2.2 ha-climat (decision du 24/11) : pas de la consigne 0,5 quand l'entite n'en declare pas ; consigne en mode off : en_off (commande refusee, ecriture.mjs)
    const modes = liste(a.hvac_modes), bornes = { min: nb(a.min_temp), max: nb(a.max_temp), pas: nb(a.target_temp_step) === null ? 0.5 : a.target_temp_step };
    for (const k of ['min', 'max']) if (bornes[k] === null) delete bornes[k];
    if (s === 'off') bornes.en_off = true;
    x.pris('hvac_modes', 'min_temp', 'max_temp', 'target_temp_step', 'temperature', 'target_temp_low', 'target_temp_high', 'target_humidity', 'min_humidity', 'max_humidity',
      'target_humidity_step', 'current_temperature', 'current_humidity', 'fan_mode', 'fan_modes', 'preset_mode', 'preset_modes', 'swing_mode', 'swing_modes', 'swing_horizontal_mode',
      'swing_horizontal_modes', 'hvac_action');
    if (bit(f, 128) || bit(f, 256)) x.aj('onoff', s === 'off' ? false : connu(s) ? true : null, { ecriture: bit(f, 128) && bit(f, 256), role: 'chauffage' });
    if (modes.length || connu(s)) x.aj('mode', connu(s), { ecriture: modes.length > 0, options: options(modes) });
    if (bit(f, 1)) x.aj('consigne_temperature', nb(a.temperature), { ecriture: true, ...bornes, ...u, associee: 'temperature' });
    if (bit(f, 2)) x.aj('consigne_plage', { bas: nb(a.target_temp_low), haut: nb(a.target_temp_high) }, { ecriture: true, ...bornes, ...u, ...(bit(f, 1) ? {} : { associee: 'temperature' }) });
    if (bit(f, 4)) {
      const h = { min: nb(a.min_humidity), max: nb(a.max_humidity), pas: nb(a.target_humidity_step) };
      for (const k of ['min', 'max', 'pas']) if (h[k] === null) delete h[k];
      x.aj('consigne_humidite', nb(a.target_humidity), { ecriture: true, unite: '%', ...h, associee: 'humidite' });
    }
    if (a_(a, 'current_temperature')) x.aj('temperature', nb(a.current_temperature), u);
    if (a_(a, 'current_humidity')) x.aj('humidite', nb(a.current_humidity), { unite: '%' });
    if (bit(f, 8) || a_(a, 'fan_mode')) x.aj('vitesse_predefinie', tx(a.fan_mode), { ecriture: bit(f, 8) && liste(a.fan_modes).length > 0, options: options(a.fan_modes) });
    if (bit(f, 16) || a_(a, 'preset_mode')) x.aj('prereglage', tx(a.preset_mode), { ecriture: bit(f, 16) && liste(a.preset_modes).length > 0, options: options(a.preset_modes) });
    // swing_mode : liste d'options (pas un ON/OFF) -> sens, libelle « Oscillation » (jamais mode : une option off y absorberait le ON/OFF)
    if (bit(f, 32) || a_(a, 'swing_mode')) x.aj('sens', tx(a.swing_mode), { libelle: 'Oscillation', ecriture: bit(f, 32) && liste(a.swing_modes).length > 0, options: options(a.swing_modes) });
    if (bit(f, 512) || a_(a, 'swing_horizontal_mode')) x.aj('sens', tx(a.swing_horizontal_mode), { libelle: 'Oscillation horizontale', horizontal: true, ecriture: bit(f, 512) && liste(a.swing_horizontal_modes).length > 0, options: options(a.swing_horizontal_modes) });
    if (a_(a, 'hvac_action')) x.aj('activite', tx(a.hvac_action));
  },
  water_heater(x) {
    const { a, f, s } = x, u = x.ctx.uniteTemp ? { unite: x.ctx.uniteTemp } : {};
    const bornes = { min: nb(a.min_temp), max: nb(a.max_temp), pas: nb(a.target_temp_step) };
    for (const k of ['min', 'max', 'pas']) if (bornes[k] === null) delete bornes[k];
    x.pris('min_temp', 'max_temp', 'target_temp_step', 'temperature', 'target_temp_low', 'target_temp_high', 'current_temperature', 'operation_mode', 'operation_list', 'away_mode');
    if (bit(f, 8)) x.aj('onoff', s === 'off' ? false : connu(s) ? true : null, { ecriture: true, role: 'chauffage' });
    if (bit(f, 2) || a_(a, 'operation_mode')) x.aj('mode', tx(a.operation_mode), { ecriture: bit(f, 2) && liste(a.operation_list).length > 0, options: options(a.operation_list) });
    if (bit(f, 1) || a_(a, 'temperature')) x.aj('consigne_temperature', nb(a.temperature), { ecriture: bit(f, 1), ...bornes, ...u, associee: 'temperature' });
    if (nb(a.target_temp_low) !== null && nb(a.target_temp_high) !== null) x.aj('consigne_plage', { bas: a.target_temp_low, haut: a.target_temp_high }, { ecriture: bit(f, 1), ...bornes, ...u });
    if (a_(a, 'current_temperature')) x.aj('temperature', nb(a.current_temperature), u);
    if (bit(f, 4) || a_(a, 'away_mode')) x.aj('absence', a.away_mode === 'on' ? true : a.away_mode === 'off' ? false : null, { ecriture: bit(f, 4) });
  },
  humidifier(x) {
    const { a, f } = x;
    const h = { min: nb(a.min_humidity), max: nb(a.max_humidity), pas: nb(a.target_humidity_step) };
    for (const k of ['min', 'max', 'pas']) if (h[k] === null) delete h[k];
    x.pris('humidity', 'min_humidity', 'max_humidity', 'target_humidity_step', 'current_humidity', 'mode', 'available_modes', 'action');
    x.aj('onoff', x.on, { ecriture: true, role: 'appareil' });
    x.aj('consigne_humidite', nb(a.humidity), { ecriture: true, unite: '%', ...h, associee: 'humidite' });
    if (a_(a, 'current_humidity')) x.aj('humidite', nb(a.current_humidity), { unite: '%' });
    if (bit(f, 1) || a_(a, 'mode')) x.aj('mode', tx(a.mode), { ecriture: bit(f, 1) && liste(a.available_modes).length > 0, options: options(a.available_modes) });
    if (a_(a, 'action')) x.aj('activite', tx(a.action));
  },
  cover(x) {
    const { a, f, s } = x, sensible = ['garage', 'gate'].includes(a.device_class) ? { sensible: true } : {};
    x.pris('current_position', 'current_tilt_position');
    const o = parDrapeaux(f, [[1, 'open', 'Ouvrir'], [8, 'stop', 'Arrêt'], [2, 'close', 'Fermer']]);
    x.aj('ouverture', connu(s), { ecriture: o.length > 0, options: o, ...sensible });
    x.aj('activite', s === 'opening' || s === 'closing' ? s : null);
    // Position d'un ouvrant (V2.1, cartes) : 0 % = remonte (ouvert), 100 % = entierement descendu ; Home Assistant documente l'inverse (current_position 100 = ouvert) :
    // valeur convertie ici (sens: 'inverse' : ecriture.mjs convertit de meme, position = 100 - valeur)
    if (bit(f, 4) || a_(a, 'current_position')) x.aj('position', nb(a.current_position) === null ? null : 100 - nb(a.current_position), { ecriture: bit(f, 4), ...PCT, ...sensible, sens: 'inverse' });
    // V2.2 ha-ouvrants : lamelles ouvrir / fermer / arreter (open_cover_tilt...) non decrites : sans etat propre, et une seconde capacite ouverture du meme element serait
    // prise pour celle du volet (premiere trouvee, ordre des libelles) ; l'inclinaison en % est commandee
    if (bit(f, 128) || a_(a, 'current_tilt_position')) x.aj('inclinaison', nb(a.current_tilt_position), { ecriture: bit(f, 128), ...PCT, ...sensible });
  },
  valve(x) {
    const { a, f, s } = x;
    x.pris('current_position');
    const o = parDrapeaux(f, [[1, 'open', 'Ouvrir'], [8, 'stop', 'Arrêt'], [2, 'close', 'Fermer']]);
    // V2.2 ha-ouvrants : vanne marquee (famille « vanne » de la vue Equipements : piste Ouverte / Fermee, et non un store) ; position : 100 = ouverte (sens de Home Assistant, non inverse)
    x.aj('ouverture', connu(s), { ecriture: o.length > 0, options: o, sensible: true, vanne: true });
    if (bit(f, 4) || a_(a, 'current_position')) x.aj('position', nb(a.current_position), { ecriture: bit(f, 4), ...PCT, sensible: true, vanne: true });
  },
  // V2.2 ha-ouvrants (decisions du 24-25/11) : ouverture de la porte (lock.open, drapeau OPEN) et declenchement de l'alarme (alarm_trigger) non proposes ; clavier du code
  // (clavierCode : chiffres ou texte) d'apres code_format (serrure : expression reguliere ; alarme : number | text) ; le code lui-meme n'est jamais recu ni garde
  lock(x) {
    x.pris('code_format');
    const cf = tx(x.a.code_format);
    x.aj('verrou', connu(x.s), { ecriture: true, sensible: true, options: [{ code: 'lock', libelle: 'Verrouiller' }, { code: 'unlock', libelle: 'Déverrouiller' }], code_format: cf, clavier_code: clavierCode(cf, false) });
  },
  alarm_control_panel(x) {
    x.pris('code_format', 'code_arm_required');
    const o = parDrapeaux(x.f, [[0, 'disarm', 'Désarmer'], [1, 'arm_home', 'Armer (présence)'], [2, 'arm_away', 'Armer (absence)'], [4, 'arm_night', 'Armer (nuit)'],
      [32, 'arm_vacation', 'Armer (vacances)'], [16, 'arm_custom_bypass', 'Armer (personnalisé)']]);
    const cf = tx(x.a.code_format);
    x.aj('alarme', connu(x.s), { ecriture: true, sensible: true, options: o, code_format: cf, code_requis: bo(x.a.code_arm_required), clavier_code: clavierCode(cf, true) });
  },
  siren(x) {
    const { a, f } = x;
    x.pris('available_tones');
    // Tons : liste, ou dictionnaire {cle: nom} dont Home Assistant accepte le nom (process_turn_on_params de components/siren) : code = nom (une cle entiere ne survit pas au JSON)
    const tons = Array.isArray(a.available_tones) ? options(a.available_tones) : Object.values(objet(a.available_tones)).filter((l) => typeof l === 'string' && l).map((l) => ({ code: l, libelle: l }));
    x.aj('sirene', x.on, { ecriture: bit(f, 1) && bit(f, 2), sensible: true, ...(bit(f, 4) ? { tons } : {}), volume_reglable: bit(f, 8), duree_reglable: bit(f, 16) });
  },
  media_player(x) {
    const { a, f, s } = x;
    x.pris('volume_level', 'is_volume_muted', 'source', 'source_list', 'sound_mode', 'sound_mode_list', 'media_title', 'media_artist', 'repeat', 'shuffle');
    if (bit(f, 128) || bit(f, 256)) x.aj('onoff', s === 'off' || s === 'standby' ? false : connu(s) ? true : null, { ecriture: bit(f, 128) && bit(f, 256), role: 'appareil' });
    const o = parDrapeaux(f, [[16384, 'play', 'Lecture'], [1, 'pause', 'Pause'], [4096, 'stop', 'Arrêt'], [16, 'previous', 'Précédent'], [32, 'next', 'Suivant']]);
    if (o.length || ['playing', 'paused', 'idle', 'buffering'].includes(s)) x.aj('lecture', connu(s), { ecriture: o.length > 0, options: o });
    if (bit(f, 4) || a_(a, 'volume_level')) x.aj('volume', nb(a.volume_level) === null ? null : Math.round(a.volume_level * 100), { ecriture: bit(f, 4), ...PCT, pas_a_pas: bit(f, 1024) });
    if (bit(f, 8) || a_(a, 'is_volume_muted')) x.aj('muet', bo(a.is_volume_muted), { ecriture: bit(f, 8) });
    if (bit(f, 2048) || a_(a, 'source')) x.aj('source', tx(a.source), { ecriture: bit(f, 2048) && liste(a.source_list).length > 0, options: options(a.source_list) });
    // V2.2 ha-media-robots : mode sonore en capacite mode (une seconde source du meme element serait prise pour la source : premiere trouvee, ordre des libelles)
    if (bit(f, 65536) || a_(a, 'sound_mode')) x.aj('mode', tx(a.sound_mode), { libelle: 'Mode sonore', ecriture: bit(f, 65536) && liste(a.sound_mode_list).length > 0, options: options(a.sound_mode_list) });
    if (a_(a, 'media_title') || a_(a, 'media_artist')) x.aj('media', [a.media_title, a.media_artist].filter(tx).join(' — ') || null);
    if (bit(f, 262144) || a_(a, 'repeat')) x.aj('repetition', tx(a.repeat), { ecriture: bit(f, 262144), options: options(['off', 'all', 'one']) });
    if (bit(f, 32768) || a_(a, 'shuffle')) x.aj('aleatoire', bo(a.shuffle), { ecriture: bit(f, 32768) });
  },
  remote(x) {
    const { a, f } = x;
    x.pris('current_activity', 'activity_list');
    x.aj('onoff', x.on, { ecriture: true, role: 'appareil' });
    if (a_(a, 'activity_list') || a_(a, 'current_activity')) x.aj('source', tx(a.current_activity), { libelle: 'Activité', ecriture: bit(f, 4) && liste(a.activity_list).length > 0, options: options(a.activity_list) });
  },
  vacuum(x) {
    const { a, f } = x;
    x.pris('fan_speed', 'fan_speed_list', 'battery_level');
    const o = parDrapeaux(f, [[8192, 'start', 'Démarrer'], [4, 'pause', 'Pause'], [8, 'stop', 'Arrêt'], [16, 'return_to_base', 'Retour à la base'], [1024, 'clean_spot', 'Nettoyage localisé'], [512, 'locate', 'Localiser']]);
    x.aj('robot', connu(x.s), { ecriture: o.length > 0, options: o });
    if (bit(f, 32) || a_(a, 'fan_speed')) x.aj('vitesse_predefinie', tx(a.fan_speed), { ecriture: bit(f, 32) && liste(a.fan_speed_list).length > 0, options: options(a.fan_speed_list) });
    if (a_(a, 'battery_level')) x.aj('batterie', nb(a.battery_level), { unite: '%' });
  },
  lawn_mower(x) {
    // LawnMowerEntityFeature (code de HA 2026.2.3) : START_MOWING 1, PAUSE 2, DOCK 4 ; aucun arret
    const o = parDrapeaux(x.f, [[1, 'start_mowing', 'Démarrer'], [2, 'pause', 'Pause'], [4, 'dock', 'Retour à la base']]);
    x.aj('robot', connu(x.s), { ecriture: o.length > 0, options: o });
  },
  number(x) { niveau(x); },
  select(x) { choix(x); },
  text(x) { texte(x); },
  date(x) { x.aj('date_heure', connu(x.s), { ecriture: true, format: 'date' }); },
  time(x) { x.aj('date_heure', connu(x.s), { ecriture: true, format: 'time' }); },
  datetime(x) { x.aj('date_heure', connu(x.s), { ecriture: true, format: 'datetime' }); },
  // depuis : etat de Home Assistant = heure du dernier appui (bouton) ou de la derniere activation (scene) ; « unknown » ou illisible : null
  button(x) { x.aj(x.a.device_class === 'identify' ? 'identifier' : 'action', null, { ecriture: true, depuis: horodatage(connu(x.s)) }); },
  scene(x) { x.aj('scene', null, { ecriture: true, depuis: horodatage(connu(x.s)) }); },
  // V2.2 ha-ecriture : entrees (code de HA 2026.2, components/input_*/__init__.py : actions enregistrees sans drapeau) ; editable (modifiable par l'interface de HA) garde en inconnue
  input_boolean(x) { x.aj('onoff', x.on, { ecriture: true, role: 'appareil' }); },
  input_number(x) { x.pris('mode'); niveau(x); },
  input_select(x) { choix(x); },
  input_text(x) { texte(x); },
  input_button(x) { x.aj('action', null, { ecriture: true, depuis: horodatage(connu(x.s)) }); },
  // Script : lance sans variables (script.turn_on n'attend pas sa fin) ; sensible (deux appuis) : un script peut tout commander, verrous compris
  script(x) { x.pris('last_triggered', 'mode', 'current', 'max'); x.aj('action', null, { ecriture: true, sensible: true, depuis: horodatage(x.a.last_triggered), en_cours: x.s === 'on', script: true }); },
  sensor(x) {
    const { a } = x, cap = SENSOR[a.device_class] || 'mesure', o = {};
    if (tx(a.unit_of_measurement)) o.unite = a.unit_of_measurement;
    x.pris('unit_of_measurement');
    if (a.device_class === 'enum') { x.pris('options'); o.options = options(a.options); }
    const v = nombre(x.s);
    // valeur non numerique (enum, texte) : gardee telle quelle
    x.aj(cap, v !== null ? v : connu(x.s), o);
  },
  // V2.2 ha-depuis : heure du dernier changement d'etat (last_changed, tenue par Home Assistant) : depuis pour une ouverture ou une alerte (« depuis 12 min »),
  // derniere pour un mouvement (« vu à 08:15 » : debut s'il dure, fin sinon) ; absente ou illisible : rien (jamais inventee)
  binary_sensor(x) {
    const cap = BINAIRE[x.a.device_class] || 'mesure', o = x.a.device_class === 'battery' ? { libelle: 'Batterie faible' } : {};
    if (x.change && x.on !== null) { if (cap === 'presence') o.derniere = x.change; else if (DEPUIS.includes(cap)) o.depuis = x.change; }
    x.aj(cap, x.on, o);
  },
  air_quality(x) {
    const { a } = x, u = tx(a.unit_of_measurement);
    x.pris('unit_of_measurement');
    for (const [k, cap, libelle] of AIR) {
      if (!a_(a, k)) continue;
      x.pris(k); x.aj(cap, nb(a[k]), { ...(libelle ? { libelle } : {}), ...(k === 'particulate_matter_2_5' && u ? { unite: u } : {}) });
    }
    // l'etat d'une entite air_quality est sa mesure de PM2,5
    if (!a_(a, 'particulate_matter_2_5')) x.aj('pm25', nombre(x.s), u ? { unite: u } : {});
  },
  event(x) { x.pris('event_type', 'event_types'); x.aj('appui', tx(x.a.event_type), { options: options(x.a.event_types), depuis: connu(x.s) }); },
  // Mise a jour : version en information (lecture) ; installer (maj_installer, sensible) seulement si INSTALL (1) est declare, une mise a jour disponible (etat on) et aucune en cours
  // (update.install refuse sinon : components/update/__init__.py async_install)
  update(x) {
    const { a } = x;
    x.pris('installed_version', 'latest_version', 'in_progress', 'update_percentage');
    x.aj('logiciel', tx(a.installed_version), { derniere: tx(a.latest_version), maj: x.on, en_cours: a.in_progress === true, progression: nb(a.update_percentage) });
    if (bit(x.f, 1) && x.s === 'on' && a.in_progress !== true) x.aj('maj_installer', null, { lecture: false, ecriture: true, sensible: true });
  },
  device_tracker(x) { traceur(x); if (a_(x.a, 'battery_level')) { x.pris('battery_level'); x.aj('batterie', nb(x.a.battery_level), { unite: '%' }); } },
  person(x) { traceur(x, true); },
};
// Nombre (number, input_number) : bornes et pas declares, unite
function niveau(x) {
  const { a } = x, o = { ecriture: true };
  for (const [k, c] of [['min', 'min'], ['max', 'max'], ['step', 'pas']]) if (nb(a[k]) !== null) o[c] = a[k];
  if (tx(a.unit_of_measurement)) o.unite = a.unit_of_measurement;
  x.pris('min', 'max', 'step', 'unit_of_measurement');
  x.aj('niveau', nombre(x.s), o);
}
// Liste (select, input_select) : options declarees
function choix(x) { x.pris('options'); x.aj('source', connu(x.s), { ecriture: liste(x.a.options).length > 0, options: options(x.a.options) }); }
// Texte (text, input_text) : longueurs et motif declares ; mode password : valeur secrete (jamais dans une liste ni un journal, jamais ecrite : contrat « Capacités »)
function texte(x) {
  const { a } = x;
  x.pris('min', 'max', 'pattern', 'mode');
  x.aj('texte', x.s === 'unknown' || x.s === 'unavailable' ? null : (typeof x.s === 'string' ? x.s : null), { ecriture: true, longueur_min: nb(a.min), longueur_max: nb(a.max), motif: tx(a.pattern), ...(a.mode === 'password' ? { secret: true } : {}) });
}
// Traceur, personne : zone (localisation) et coordonnees GPS, capacites privees (a l'ecran seulement)
// V2.2 ha-localisation : personne (person) marquee personne (resume « Présence » de l'accueil) ; maison : etat home
function traceur(x, personne) {
  const s = x.s;
  x.pris('latitude', 'longitude', 'gps_accuracy');
  x.aj('localisation', s === 'home' ? 'À la maison' : s === 'not_home' ? 'Absent' : connu(s), { prive: true, maison: s === 'home', ...(personne ? { personne: true } : {}) });
  const c = coordonnees(x.a);
  if (c !== null) x.aj('coordonnees', c, { prive: true });
}

// Domaine inconnu : l'etat seul, en mesure (nombre si l'etat en est un, sinon texte), unite declaree s'il y en a une ; libelle = nom de l'entite (GENERIQUES) ; tous les attributs
// dans inconnues (memes masques et donnees privees que les domaines integres)
function inconnu(x) {
  const u = tx(x.a.unit_of_measurement);
  if (u) x.pris('unit_of_measurement');
  const v = connu(x.s);
  x.aj('mesure', nombre(v) !== null ? nombre(v) : v, u ? { unite: u.slice(0, 16) } : {});
}

// Capacites, inconnues et mode de couleur d'une entite d'un domaine integre (ctx : {uniteTemp} de /api/config). Domaine inconnu (idLecture) : etat en mesure, lecture seule.
// Domaine exclu ou identifiant invalide : rien.
export function decrire(st, ctx = {}) {
  const e = String(st && st.entity_id), dom = domaineDe(e), element = idDe(e) || idLecture(e);
  if (!element) return { capacites: [], inconnues: [], modeCouleur: null };
  const a = objet(st.attributes), s = st.state;
  const f = Number.isInteger(a.supported_features) ? a.supported_features : 0;
  const disponible = s !== 'unavailable', nom = nomDe(st);
  const capacites = [], vus = new Set(['friendly_name', ...GARDES]);
  const x = {
    a, s, f, ctx: ctx || {}, nom, on: s === 'on' ? true : s === 'off' ? false : null, change: horodatage(st.last_changed),
    pris: (...k) => k.forEach((c) => vus.add(c)),
    aj: (cap, valeur, o = {}) => capacites.push({ cap, element, lecture: true, ecriture: false, disponible, valeur, ...(GENERIQUES.includes(cap) && !o.libelle ? { libelle: nom } : {}), ...o }),
  };
  const r = (D[dom] || inconnu)(x) || {};
  const prive = TRACEURS.includes(dom) || !D[dom]; // domaine inconnu : identifiants reseau et position prives, comme un traceur
  const inconnues = Object.keys(a).filter((k) => !vus.has(k) || GARDES.includes(k)).sort().map((k) => {
    if (MASQUES.includes(k)) return { cle: k, valeur: { masque: true } };
    const i = { cle: k, valeur: copie(a[k]) };
    return (prive ? PRIVEES : COORDONNEES).includes(k) ? { ...i, prive: true } : i;
  });
  return { capacites, inconnues, modeCouleur: r.modeCouleur || null };
}

// Lumieres et prises (lister, relire) : caps et state calcules par projeter (capacites seule source), sans capacite secrete
export function versModele(st) {
  const { capacites, inconnues, modeCouleur } = decrire(st);
  return projeter({
    id: idDe(st.entity_id), type: domaineDe(st.entity_id) === 'light' ? 'light' : 'outlet', name: nomDe(st), room: null, reachable: st.state !== 'unavailable',
    capacites: sansSecret(capacites), inconnues, modeCouleur,
  });
}

// Commande du modele commun (reglage valide par core/modele.mjs, capacites controlees par la route) -> action de Home Assistant {chemin, corps} | null (rien a envoyer).
// Documentation (home-assistant.io, actions light.turn_on, light.turn_off, switch.turn_on ; API REST : corps = donnees de l'action, entity_id compris) : brightness_pct 0-100,
// hs_color [teinte 0-360, saturation 0-100] entiers, color_temp_kelvin entier ; une seule couleur par action. Une seule action par commande : ON, luminosite et couleur ensemble
// (Home Assistant ignore ce qu'une lampe ne sait pas faire). Prise (switch) : ON/OFF seulement. Jamais de ON implicite : luminosite ou couleur sans on: true sur une lampe OFF -> rien
// (Home Assistant la passerait ON). Couleur ou blanc demandes a une lampe qui ne les a pas : erreur (la route le refuse deja). Entite hors light et switch : rien (ecriture generique : actionDe de ecriture.mjs).
export function actionLumiere(n, st) {
  const e = entiteDe(n && n.id);
  if (!e || !st || !/^(light|switch)\./.test(e)) return null;
  if (e.startsWith('switch.')) return st.on === undefined ? null : { chemin: '/api/services/switch/' + (st.on ? 'turn_on' : 'turn_off'), corps: { entity_id: e } };
  if (st.on === false) return { chemin: '/api/services/light/turn_off', corps: { entity_id: e } };
  const corps = { entity_id: e }, caps = (n && n.caps) || {};
  if (st.level !== undefined) corps.brightness_pct = Math.min(100, Math.max(1, Math.round(st.level)));
  if (st.mode === 'color') {
    if (!caps.color) throw new Error('couleur non gérée');
    corps.hs_color = [Math.round(st.hue) % 360, Math.min(100, Math.max(0, Math.round(st.sat * 100)))];
  } else if (st.mode === 'temperature') {
    if (!caps.ctemp) throw new Error('température non gérée');
    corps.color_temp_kelvin = Math.round(st.kelvin);
  }
  const reglages = Object.keys(corps).length > 1;
  if (st.on !== true && (!reglages || (n.state && n.state.on === false))) return null;
  return { chemin: '/api/services/light/turn_on', corps };
}

// Liste de GET /api/states -> appareils (entites retenues, identifiants uniques, MAX_APPAREILS au plus).
export function depuisEtats(etats) {
  const vus = new Set(), out = [];
  for (const st of Array.isArray(etats) ? etats : []) {
    if (!retenue(st)) continue;
    const d = versModele(st);
    if (vus.has(d.id) || out.length >= MAX_APPAREILS) continue;
    vus.add(d.id); out.push(d);
  }
  return out;
}

// Equipements (conception v2.1 §3, §6) : un par appareil du registre (device_id), sans registre une entite = un equipement. Exclus : domaines EXCLUS (domaine inconnu : lecture seule, idLecture), entites masquees (hb),
// groupes de lumieres, entites d'un appareil desactive (les entites desactivees ne sont ni dans /api/states ni dans list_for_display). Entite de categorie config ou diagnostic (ec) :
// ses capacites vont en 35x/6xx de son appareil (configuration, diagnostic, capacite d'origine dans nature, sauf si elle y est deja), jamais une carte (sans appareil : ecartee).
// registre : {entites: resultat de config/entity_registry/list_for_display, appareils: config/device_registry/list, zones: config/area_registry/list} | null. Ordre stable (nom puis id).
// Equipement : {id, hub: 'homeassistant', idNatif, nom, type, piece, joignable, vu_le, elements, capacites, inconnues}. En memoire seulement (capacites privees comprises : jamais journalise).
export function versEquipements(etats, registre, ctx = {}) {
  const R = objet(registre), RE = objet(R.entites);
  const cat = objet(RE.entity_categories);
  const ent = new Map((Array.isArray(RE.entities) ? RE.entities : []).filter((x) => x && typeof x.ei === 'string').map((x) => [x.ei, x]));
  const app = new Map((Array.isArray(R.appareils) ? R.appareils : []).filter((d) => d && typeof d.id === 'string').map((d) => [d.id, d]));
  const zones = new Map((Array.isArray(R.zones) ? R.zones : []).filter((z) => z && typeof z.area_id === 'string').map((z) => [z.area_id, tx(z.name) || z.area_id]));
  const groupes = new Map(), vus = new Set();
  let n = 0;
  for (const st of Array.isArray(etats) ? etats : []) {
    if (!st || typeof st !== 'object') continue;
    const e = st.entity_id, id = idDe(e) || idLecture(e);
    if (!id || vus.has(id) || n >= MAX_ENTITES) continue;
    const dom = domaineDe(e), a = objet(st.attributes);
    if (dom === 'light' && Array.isArray(a.entity_id)) continue;
    const r = ent.get(e) || null;
    if (r && r.hb) continue;
    const di = r && typeof r.di === 'string' ? r.di : null;
    if (di && app.has(di) && app.get(di).disabled_by) continue;
    const categorie = r && r.ec !== undefined && r.ec !== null ? (tx(cat[r.ec]) || 'diagnostic') : null;
    if (categorie && !di) continue;
    vus.add(id); n++;
    const k = di ? 'a:' + di : 'e:' + e;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push({ st, r, di, dom, id, categorie, nom: (r && tx(r.en)) || nomDe(st) });
  }
  const rangDom = (d) => (DOMAINES.includes(d) ? DOMAINES.indexOf(d) : DOMAINES.length); // domaine inconnu : apres les domaines integres
  const liste = [];
  for (const [k, membres] of groupes) {
    membres.sort((x, y) => (!!x.categorie - !!y.categorie) || rangDom(x.dom) - rangDom(y.dom) || x.id.localeCompare(y.id));
    const p = membres[0], di = p.di, dev = di ? app.get(di) || null : null;
    const principaux = membres.filter((m) => !m.categorie);
    const capacites = [], inconnues = [];
    for (const m of membres) {
      const d = decrire(m.st, ctx);
      for (const c of d.capacites) {
        // installer une mise a jour : jamais enveloppee (commande de l'equipement, entite update souvent de categorie config)
        if (m.categorie && groupe(c.cap) !== 'informations' && c.cap !== 'maj_installer') capacites.push({ ...c, cap: m.categorie === 'config' ? 'configuration' : 'diagnostic', nature: c.cap, categorie: m.categorie, libelle: c.libelle || m.nom });
        else capacites.push(m.categorie ? { ...c, categorie: m.categorie } : c);
      }
      inconnues.push(...d.inconnues.map((x) => ({ ...x, element: m.id })));
      if (m.r) {
        const { ei, di: _d, ai, ec, hb, ...reste } = m.r;
        if (Object.keys(reste).length) inconnues.push({ cle: 'registre', valeur: copie(reste), element: m.id });
      }
    }
    // meme capacite portee par plusieurs entites : libelle = nom de l'entite (sinon deux « ON / OFF » sans nom)
    const compte = {};
    for (const c of capacites) compte[c.cap] = (compte[c.cap] || 0) + 1;
    for (let i = 0; i < capacites.length; i++) {
      const c = capacites[i];
      if (compte[c.cap] > 1 && !c.libelle) { const m = membres.find((x) => x.id === c.element); capacites[i] = { ...c, libelle: m ? m.nom : undefined }; }
    }
    if (dev) {
      // Identite (registre des appareils, code de HA helpers/device_registry.py dict_repr) : capacites 65x en lecture, element principal ; le reste (identifiants, connexions) : inconnue privee
      for (const [c, cap] of [['manufacturer', 'fabricant'], ['model', 'modele'], ['serial_number', 'serie'], ['hw_version', 'materiel'], ['model_id', 'code_produit'], ['sw_version', 'logiciel']]) {
        if (tx(dev[c])) capacites.push({ cap, element: p.id, lecture: true, ecriture: false, disponible: true, valeur: dev[c] });
      }
      const { id, name, name_by_user, manufacturer, model, serial_number, hw_version, model_id, sw_version, area_id, disabled_by, ...reste } = dev;
      inconnues.push({ cle: 'appareil', valeur: copie(reste), element: p.id, prive: true });
    }
    const zone = (dev && tx(dev.area_id)) || (p.r && tx(p.r.ai)) || null;
    const vu = membres.map((m) => tx(m.st.last_updated)).filter(Boolean).sort().pop() || null;
    liste.push({
      id: 'homeassistant:' + (di || p.st.entity_id), hub: 'homeassistant', idNatif: di || p.st.entity_id,
      nom: (dev && (tx(dev.name_by_user) || tx(dev.name))) || nomDe(p.st), type: p.dom,
      piece: zone ? { id: zone, name: zones.get(zone) || zone } : null,
      joignable: (principaux.length ? principaux : membres).every((m) => m.st.state !== 'unavailable'), vu_le: vu,
      elements: membres.map((m) => m.id), capacites, inconnues,
    });
  }
  return liste.sort((x, y) => x.nom.localeCompare(y.nom, 'fr') || x.id.localeCompare(y.id));
}
// FIN
