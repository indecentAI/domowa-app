// @zone appareils equipements | Adaptateur DIRIGERA : description en capacites de tout appareil et du hub de la bibliotheque dirigera 2.0.2 (types dist/types/device/*.d.ts) ;
// versModele (lumieres et prises : caps/state calcules par projeter de core/modele.mjs), versEquipements (tous les appareils regroupes par relationId, hub ; liens remoteLinks en lecture), sans acces au hub (essais unitaires).
// Lecture et ecriture d'apres capabilities.canReceive seulement (jamais d'apres le type) ; le type ne donne que le role de onoff (light -> eclairage, outlet -> prise, autre -> appareil).
// Une capacite n'existe que si le hub la montre (attribut present ou cle dans canReceive) : l'adaptateur ne fabrique rien. Tout attribut ou cle de canReceive sans capacite : inconnues [{cle, valeur}]
// (rien n'est jete ; valeur de plus de 8 Ko : {tronque: true}, copieInconnue de core/capacites.mjs). Code d'appairage (setupCode, qrCode) : capacite secrete ; coordonnees du hub : capacite privee (contrat « Capacités »).
import { projeter } from '../../core/modele.mjs';
import { sansSecret, nb, tx, bo, copieInconnue as copie, texteCoordonnees } from '../../core/capacites.mjs';
import { HttpError } from '../../core/http.mjs';

const ROLE = { light: 'eclairage', outlet: 'prise' };
const opts = (l) => l.map(([code, libelle]) => ({ code, libelle }));
const DEMARRAGE = opts([['startOn', 'ON'], ['startPrevious', 'État précédent'], ['startToggle', 'Inverser']]);
const FAN = opts([['auto', 'Auto'], ['low', 'Bas'], ['medium', 'Moyen'], ['high', 'Haut'], ['on', 'Manuel'], ['off', 'OFF']]);
// Condition d'un horaire du capteur de mouvement (sensorConfig.schedule.onCondition / offCondition {time: hh:mm | sunset | sunrise, offset? en min}) : copie sure
const cond = (c) => (c && typeof c.time === 'string' ? { time: c.time, offset: typeof c.offset === 'number' ? c.offset : 0 } : null);
const STORE = opts([['up', 'Monter'], ['stopped', 'Arrêt'], ['down', 'Descendre']]);
const LECTURE = opts([['playbackPlaying', 'Lecture'], ['playbackPaused', 'Pause'], ['playbackIdle', 'Arrêt'], ['playbackNext', 'Suivant'], ['playbackPrevious', 'Précédent'], ['playbackBuffering', 'Chargement']]);
const COMMANDE = opts([['light', 'Lumières'], ['speaker', 'Enceinte'], ['blind', 'Stores'], ['shortcut', 'Raccourci']]);
// Attribut -> capacite. ecr : cles de canReceive qui rendent la capacite ecrivable (toutes requises) ; pris : autres attributs consommes.
// v(a) : valeur ; o : champs du descripteur. Ordre sans importance (core/capacites.mjs trie).
const TABLE = [
  ['isOn', 'onoff', { ecr: ['isOn'], v: (a) => (bo(a.isOn)) }],
  ['lightLevel', 'luminosite', { ecr: ['lightLevel'], v: (a) => nb(a.lightLevel), o: { min: 1, max: 100, pas: 1, unite: '%' } }],
  ['colorHue|colorSaturation', 'couleur', { ecr: ['colorHue', 'colorSaturation'], v: (a) => ({ hue: nb(a.colorHue), sat: nb(a.colorSaturation) }) }],
  ['colorTemperature|colorTemperatureMin|colorTemperatureMax', 'temperature_couleur', { ecr: ['colorTemperature'], v: (a) => nb(a.colorTemperature), o: (a) => {
    // Le vrai hub declare colorTemperatureMin > colorTemperatureMax : min/max des deux
    const lo = Math.min(a.colorTemperatureMin, a.colorTemperatureMax), hi = Math.max(a.colorTemperatureMin, a.colorTemperatureMax);
    return { min: Number.isFinite(lo) ? lo : null, max: Number.isFinite(hi) ? hi : null, unite: 'K' };
  } }],
  ['startupOnOff', 'demarrage', { ecr: ['startupOnOff'], v: (a) => tx(a.startupOnOff), o: { options: DEMARRAGE } }],
  ['blindsCurrentLevel|blindsTargetLevel', 'position', { ecr: ['blindsTargetLevel'], v: (a) => nb(a.blindsCurrentLevel), o: (a) => ({ min: 0, max: 100, pas: 1, unite: '%', cible: nb(a.blindsTargetLevel), sens: 'a_verifier' }) }],
  ['blindsState', 'ouverture', { ecr: ['blindsState'], v: (a) => tx(a.blindsState), o: { options: STORE } }],
  ['fanMode', 'vitesse_predefinie', { ecr: ['fanMode'], v: (a) => tx(a.fanMode), o: { options: FAN } }],
  // Vitesse manuelle : 0 a 50 (decision des cartes du 21/11, section 9 ; la bibliotheque ne declare aucune borne : a verifier sur un vrai purificateur)
  ['motorState', 'niveau', { ecr: ['motorState'], v: (a) => nb(a.motorState), o: { min: 0, max: 50, pas: 1, libelle: 'Vitesse manuelle' } }],
  ['motorRuntime', 'mesure', { v: (a) => nb(a.motorRuntime), o: { libelle: 'Durée de fonctionnement', unite: 'min' } }],
  // Filtre : duree de vie (valeur, min) et temps d'usage (utilise, min) dans un seul descripteur (barre d'usure, jours restants)
  ['filterLifetime|filterElapsedTime', 'filtre', { v: (a) => nb(a.filterLifetime), o: (a) => ({ unite: 'min', utilise: nb(a.filterElapsedTime) }) }],
  ['filterAlarmStatus', 'probleme', { v: (a) => (bo(a.filterAlarmStatus)), o: { libelle: 'Filtre à changer' } }],
  ['childLock', 'verrou_enfant', { ecr: ['childLock'], v: (a) => (bo(a.childLock)) }],
  ['statusLight', 'voyant', { ecr: ['statusLight'], v: (a) => (bo(a.statusLight)) }],
  ['currentTemperature', 'temperature', { v: (a) => nb(a.currentTemperature), o: { unite: '°C' } }],
  ['currentRH', 'humidite', { v: (a) => nb(a.currentRH), o: { unite: '%' } }],
  // Min / max mesures (capteur d'air) : champs propres mini / maxi (periode a verifier sur un vrai capteur)
  ['currentPM25', 'pm25', { v: (a) => nb(a.currentPM25), o: (a) => ({ unite: 'µg/m³', mini: nb(a.minMeasuredPM25), maxi: nb(a.maxMeasuredPM25) }), pris: ['minMeasuredPM25', 'maxMeasuredPM25'] }],
  ['currentCO2', 'co2', { v: (a) => nb(a.currentCO2), o: (a) => ({ unite: 'ppm', mini: nb(a.minMeasuredCO2), maxi: nb(a.maxMeasuredCO2) }), pris: ['minMeasuredCO2', 'maxMeasuredCO2'] }],
  ['vocIndex', 'cov', { v: (a) => nb(a.vocIndex) }],
  ['illuminance', 'lux', { v: (a) => nb(a.illuminance), o: { unite: 'lx' } }],
  ['currentActivePower', 'puissance', { v: (a) => nb(a.currentActivePower), o: { unite: 'W' } }],
  ['totalEnergyConsumed', 'energie', { v: (a) => nb(a.totalEnergyConsumed), o: { unite: 'kWh' } }],
  ['energyConsumedAtLastReset', 'remise_energie', { ecr: ['energyConsumedAtLastReset'], v: () => null, o: (a) => ({ depuis: tx(a.timeOfLastEnergyReset), mesure: nb(a.energyConsumedAtLastReset) }), pris: ['timeOfLastEnergyReset'] }],
  ['currentAmps', 'courant', { v: (a) => nb(a.currentAmps), o: { unite: 'A' } }],
  ['currentVoltage', 'tension', { v: (a) => nb(a.currentVoltage), o: { unite: 'V' } }],
  ['batteryPercentage', 'batterie', { v: (a) => nb(a.batteryPercentage), o: { unite: '%' } }],
  ['isDetected', 'presence', { v: (a) => (bo(a.isDetected)) }],
  ['isOpen', 'ouvert', { v: (a) => (bo(a.isOpen)) }],
  ['windowOpen', 'ouvert', { v: (a) => (bo(a.windowOpen)), o: { libelle: 'Fenêtre ouverte' } }],
  ['waterLeakDetected', 'fuite', { v: (a) => (bo(a.waterLeakDetected)) }],
  ['playback', 'lecture', { ecr: ['playback'], v: (a) => tx(a.playback), o: { options: LECTURE } }],
  ['volume', 'volume', { ecr: ['volume'], v: (a) => nb(a.volume), o: { min: 0, max: 100, pas: 1, unite: '%' } }],
  ['isMuted', 'muet', { ecr: ['isMuted'], v: (a) => (bo(a.isMuted)) }],
  ['playbackAudio', 'media', { v: (a) => { const i = a.playbackAudio && a.playbackAudio.playItem; return i ? [i.title, i.artist].filter(tx).join(' — ') || null : null; } }],
  ['playbackModes', 'repetition', { v: (a) => tx(a.playbackModes && a.playbackModes.repeat) }],
  // Aleatoire : ecrivable si playbackModes est dans canReceive (objet complet renvoye, shuffle change ; ecriture.mjs). Repetition : valeurs de repeat non documentees par la bibliotheque : lecture seule
  ['playbackModes', 'aleatoire', { ecr: ['playbackModes'], v: (a) => (a.playbackModes && typeof a.playbackModes.shuffle === 'boolean' ? a.playbackModes.shuffle : null) }],
  ['controlMode', 'mode_commande', { ecr: ['controlMode'], v: (a) => tx(a.controlMode), o: { options: COMMANDE } }],
  ['sensorConfig', 'duree_allumage', { ecr: ['sensorConfig'], v: (a) => nb(a.sensorConfig && a.sensorConfig.onDuration), o: { unite: 's' } }],
  ['sensorConfig', 'programmation', { ecr: ['sensorConfig'], v: (a) => (a.sensorConfig && typeof a.sensorConfig.scheduleOn === 'boolean' ? a.sensorConfig.scheduleOn : null) }],
  ['sensorConfig', 'horaire', { ecr: ['sensorConfig'], v: (a) => { const s = a.sensorConfig && a.sensorConfig.schedule; return s && s.onCondition && s.offCondition ? s.onCondition.time + ' – ' + s.offCondition.time : null; },
    o: (a) => { const s = a.sensorConfig && a.sensorConfig.schedule; return { debut: cond(s && s.onCondition), fin: cond(s && s.offCondition) }; } }],
  // Identifier (devices.startIdentifying : 30 s ; stopIdentifying) ; debut et periode : compte a rebours du client
  ['identifyPeriod|identifyStarted', 'identifier', { ecr: ['identifyPeriod'], v: () => null, o: (a) => ({ debut: tx(a.identifyStarted), periode: nb(a.identifyPeriod) }) }],
  ['identifyPeriod|identifyStarted', 'identifier_arret', { ecr: ['identifyPeriod'], v: () => null }],
  ['firmwareVersion', 'logiciel', { v: (a) => tx(a.firmwareVersion), o: (a) => ({ etat: tx(a.otaStatus), etape: tx(a.otaState), progression: nb(a.otaProgress) }), pris: ['otaStatus', 'otaState', 'otaProgress'] }],
  ['manufacturer', 'fabricant', { v: (a) => tx(a.manufacturer) }],
  ['model', 'modele', { v: (a) => tx(a.model) }],
  ['serialNumber', 'serie', { v: (a) => tx(a.serialNumber) }],
  ['hardwareVersion', 'materiel', { v: (a) => tx(a.hardwareVersion) }],
  ['productCode', 'code_produit', { v: (a) => tx(a.productCode) }],
  ['setupCode', 'code_appairage', { v: (a) => tx(a.setupCode), o: { secret: true } }],
  ['qrCode', 'code_appairage', { v: (a) => tx(a.qrCode), o: { secret: true, libelle: 'QR code d\'appairage' } }],
  ['nextSunSet', 'soleil_coucher', { v: (a) => tx(a.nextSunSet) }],
  ['nextSunRise', 'soleil_lever', { v: (a) => tx(a.nextSunRise) }],
  ['timezone', 'fuseau', { v: (a) => tx(a.timezone) }],
  ['coordinates', 'coordonnees', { v: (a) => { const c = a.coordinates; return c ? texteCoordonnees(c.latitude, c.longitude, c.accuracy) : null; }, o: { prive: true } }],
];
// Cles consommees sans capacite propre (le nom, le mode de couleur porte par l'appareil)
const PRIS = ['customName', 'colorMode'];
// Objets composes dont une partie seulement fait une capacite : copie complete gardee aussi dans inconnues (rien n'est jete)
const GARDES = ['playbackAudio', 'playbackModes', 'sensorConfig'];

// Capacites, inconnues et mode de couleur d'un appareil du hub (tout type)
export function decrire(d) {
  const a = d.attributes || {};
  const cr = crDe(d);
  const a_ = (k) => Object.hasOwn(a, k);
  const disponible = d.isReachable !== false, element = d.id;
  const capacites = [], vus = new Set(PRIS);
  for (const [cles, cap, t] of TABLE) {
    const ks = cles.split('|');
    const ecr = t.ecr || [];
    // onoff : seulement s'il est montre ; lumiere et prise : toujours (format ancien : caps.onoff vrai)
    const montre = ks.some(a_) || ecr.some((k) => cr.includes(k)) || (cap === 'onoff' && ROLE[d.type]);
    if (!montre) continue;
    ks.concat(t.pris || []).forEach((k) => vus.add(k)); ecr.forEach((k) => vus.add(k));
    const o = typeof t.o === 'function' ? t.o(a) : (t.o || {});
    const c = { cap, element, lecture: true, ecriture: ecr.length > 0 && ecr.every((k) => cr.includes(k)), disponible, valeur: t.v(a), ...o };
    if (cap === 'onoff') c.role = ROLE[d.type] || 'appareil';
    capacites.push(c);
  }
  // Hub (gateway) : mise a jour du logiciel du hub (hub.checkFirmwareUpdate, hub.installFirmwareUpdate : routes du hub, sans canReceive) ; installer seulement si une mise a jour est annoncee
  if (d.type === 'gateway' && a_('otaStatus')) {
    capacites.push({ cap: 'maj_rechercher', element, lecture: false, ecriture: true, disponible, valeur: null });
    if (a.otaStatus === 'updateAvailable') capacites.push({ cap: 'maj_installer', element, lecture: false, ecriture: true, disponible, valeur: null, sensible: true });
  }
  const inconnues = [...new Set(Object.keys(a).concat(cr.filter((k) => typeof k === 'string')))].filter((k) => !vus.has(k) || GARDES.includes(k)).sort()
    .map((k) => ({ cle: k, valeur: copie(a[k]) }));
  return { capacites, inconnues, modeCouleur: a.colorMode || null };
}

// Lumieres et prises (lister, relire) : sans capacite secrete
export function versModele(d) {
  const { capacites, inconnues, modeCouleur } = decrire(d);
  const a = d.attributes || {};
  return projeter({
    id: d.id, type: d.type, name: a.customName || '(sans nom)',
    room: d.room ? { id: d.room.id, name: d.room.name } : null, reachable: d.isReachable !== false,
    capacites: sansSecret(capacites), inconnues, modeCouleur,
  });
}

// Equipements (conception v2.1 §3) : appareils regroupes par relationId (produit physique) et le hub. Ordre stable (nom puis id).
// Scenes du hub : hors de la vue Equipements (cartes du 21/11, section 17 ; vue Scenarios : etape scenes-hub).
// Equipement : {id, hub: 'dirigera', idNatif, nom, type, piece, joignable, vu_le, elements, capacites, inconnues, lies?}
// lies (V2.1, lecture) : appareils du hub dont remoteLinks nomme un element de l'equipement (lampes d'une telecommande, d'un capteur de mouvement) [{element, nom, par}]
// heures (V2.1 etape evenements, facultatif) : heures(idAppareil) -> {isOpen: {depuis}, waterLeakDetected: {depuis}, isDetected: {derniere}} retenues par evenements.mjs ;
// posees en champs propres : ouvert.depuis, fuite.depuis, presence.derniere (ISO ; null ou absent : inconnues, jamais inventees)
const HEURES = { ouvert: ['isOpen', 'depuis'], fuite: ['waterLeakDetected', 'depuis'], presence: ['isDetected', 'derniere'] };
export function versEquipements(appareils, hub, heures) {
  const groupes = new Map();
  for (const d of appareils || []) {
    if (!d || typeof d.id !== 'string') continue;
    const k = d.relationId || d.id;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(d);
  }
  if (hub && hub.id && ![...groupes.values()].some((l) => l.some((d) => d.id === hub.id))) groupes.set(hub.relationId || hub.id, [hub]);
  const liste = [];
  for (const [k, l] of groupes) {
    l.sort((x, y) => x.id.localeCompare(y.id));
    const p = l.find((d) => d.attributes && d.attributes.customName) || l[0];
    const capacites = [], inconnues = [];
    for (const d of l) {
      const r = decrire(d);
      if (typeof heures === 'function') {
        const h = heures(d.id) || {};
        for (const c of r.capacites) { const x = HEURES[c.cap], v = x && h[x[0]] && h[x[0]][x[1]]; if (v) c[x[1]] = v; }
      }
      capacites.push(...r.capacites);
      inconnues.push(...r.inconnues.map((x) => ({ ...x, element: d.id })));
      for (const c of ['type', 'deviceType', 'createdAt', 'isHidden', 'remoteLinks', 'adaptiveProfile', 'dynamicFeatures']) if (d[c] !== undefined) inconnues.push({ cle: c, valeur: copie(d[c]), element: d.id });
      if (Array.isArray(d.deviceSet) && d.deviceSet.length) inconnues.push({ cle: 'deviceSet', valeur: copie(d.deviceSet), element: d.id });
    }
    liste.push({
      id: 'dirigera:' + k, hub: 'dirigera', idNatif: k, nom: (p.attributes && p.attributes.customName) || '(sans nom)', type: p.deviceType || p.type || null,
      piece: p.room ? { id: p.room.id, name: p.room.name } : null, joignable: l.every((d) => d.isReachable !== false), vu_le: tx(p.lastSeen),
      elements: l.map((d) => d.id), capacites, inconnues,
      ...(({ lies: li, caps: lc }) => { capacites.push(...lc); return li ? { lies: li } : {}; })(lies(appareils, l)),
      // V2.1 : famille « hub » posee pour l'equipement du hub lui-meme (tuile et configuration du hub de la vue Equipements) ; les autres familles se deduisent des capacites
      ...(hub && hub.id && l.some((d) => d.id === hub.id) ? { famille: 'hub' } : {}),
    });
  }
  return liste.sort((x, y) => x.nom.localeCompare(y.nom, 'fr') || x.id.localeCompare(y.id));
}
// Appareils lies a un equipement par remoteLinks (liens faits dans l'application IKEA) : {element (l'appareil lie), nom, par (elements de l'equipement qui le commandent : modes d'une
// telecommande, V2.1 etape telecommande-lampes)}, tries par nom.
// Par element de l'equipement (mode d'une telecommande, capteur) : groupe du hub commun a tous ses appareils lies (deviceSet ; mesure du 22/11 : une lampe n'est que dans un groupe) ->
// groupe_onoff (deviceSets.setIsOn ; vrai si tous ON, faux si tous OFF, null sinon), groupe_luminosite et groupe_temperature si TOUS les membres connus du groupe declarent
// lightLevel / colorTemperature dans canReceive (deviceSets.setAttributes ; valeur : moyenne arrondie des membres, bornes de temperature communes). Sans groupe commun : aucune.
// Element de type controller (telecommande) : lier (ajout d'un appareil lie, ecriture.mjs ; options : lumieres et prises du hub non liees a ce mode, triees par nom ; jamais de retrait :
// aucune fonction de la bibliotheque, application IKEA).
const crDe = (d) => (d && d.capabilities && Array.isArray(d.capabilities.canReceive) ? d.capabilities.canReceive : []);
const nomDe = (d) => (d.attributes && d.attributes.customName) || '(sans nom)';
function lies(appareils, l) {
  const ids = new Set(l.map((d) => d.id)), tous = (appareils || []).filter((d) => d && typeof d.id === 'string');
  const ap = tous.filter((d) => !ids.has(d.id) && Array.isArray(d.remoteLinks) && d.remoteLinks.some((x) => ids.has(x)));
  const r = ap.map((d) => ({ element: d.id, nom: nomDe(d), par: d.remoteLinks.filter((x) => ids.has(x)).sort() }))
    .sort((x, y) => x.nom.localeCompare(y.nom, 'fr') || x.element.localeCompare(y.element));
  const caps = [];
  for (const e of l) {
    const lp = ap.filter((d) => d.remoteLinks.includes(e.id));
    if (e.type === 'controller') {
      const options = tous.filter((d) => (d.type === 'light' || d.type === 'outlet') && !lp.includes(d)).map((d) => ({ code: d.id, libelle: nomDe(d) }))
        .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr') || x.code.localeCompare(y.code));
      caps.push({ cap: 'lier', element: e.id, lecture: false, ecriture: true, disponible: true, valeur: null, options, sensible: true });
    }
    if (!lp.length) continue;
    const sets = lp.map((d) => new Set((Array.isArray(d.deviceSet) ? d.deviceSet : []).map((s) => s && s.id).filter((x) => typeof x === 'string')));
    const commun = [...sets[0]].filter((x) => sets.every((s) => s.has(x))).sort()[0];
    if (!commun) continue;
    const s0 = (lp[0].deviceSet || []).find((s) => s && s.id === commun) || {};
    const membres = tous.filter((d) => (d.deviceSet || []).some((s) => s && s.id === commun));
    const dispo = membres.some((d) => d.isReachable !== false), libelle = 'Groupe commandé' + (typeof s0.name === 'string' && s0.name ? ' : ' + s0.name : '');
    const on = membres.map((d) => d.attributes && d.attributes.isOn === true);
    caps.push({ cap: 'groupe_onoff', element: e.id, lecture: true, ecriture: true, disponible: dispo, valeur: on.every(Boolean) ? true : on.some(Boolean) ? null : false, groupe: commun, libelle });
    const moy = (k) => { const v = membres.map((d) => d.attributes && d.attributes[k]).filter((x) => typeof x === 'number' && isFinite(x)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    if (membres.every((d) => crDe(d).includes('lightLevel'))) caps.push({ cap: 'groupe_luminosite', element: e.id, lecture: true, ecriture: true, disponible: dispo, valeur: moy('lightLevel'), min: 1, max: 100, pas: 1, unite: '%', groupe: commun });
    if (membres.every((d) => crDe(d).includes('colorTemperature'))) {
      const bornes = membres.map((d) => { const a = d.attributes || {}; return [Math.min(a.colorTemperatureMin, a.colorTemperatureMax), Math.max(a.colorTemperatureMin, a.colorTemperatureMax)]; });
      const lo = Math.max(...bornes.map((b) => b[0])), hi = Math.min(...bornes.map((b) => b[1]));
      if (isFinite(lo) && isFinite(hi) && lo < hi) { const v = moy('colorTemperature'); caps.push({ cap: 'groupe_temperature', element: e.id, lecture: true, ecriture: true, disponible: dispo, valeur: v === null ? null : Math.max(lo, Math.min(hi, v)), min: lo, max: hi, pas: 1, unite: 'K', groupe: commun }); }
    }
  }
  return { ...(r.length ? { lies: r } : {}), caps };
}
// V2.1 etape telecommande-lampes (pur ; ecriture.mjs, lier) : ajout de l'appareil id aux appareils commandes par l'element (mode) d'une telecommande. Seul chemin de la bibliotheque :
// remoteLinkIds d'un groupe (deviceSets.updateConfiguration ; mesure du 22/11 : liens existants gardes, lien garde apres suppression du groupe). Une lampe n'etant que dans un groupe,
// la passer dans le groupe temporaire la retire du sien : groupes a remettre = chaque groupe de l'appareil avec sa liste complete de membres (deviceIds remplace la liste).
// -> {groupes: [{id, deviceIds}]} ; ou {erreur} (l'appelant leve la HttpError) : 'telecommande' (element absent ou pas une telecommande), 'appareil' (absent, ni lumiere ni prise), 'deja'.
export function planLier(appareils, element, id) {
  const tous = (appareils || []).filter((d) => d && typeof d.id === 'string');
  const t = tous.find((d) => d.id === element), d = tous.find((x) => x.id === id);
  if (!t || t.type !== 'controller') return { erreur: 'telecommande' };
  if (!d || (d.type !== 'light' && d.type !== 'outlet')) return { erreur: 'appareil' };
  if ((d.remoteLinks || []).includes(element)) return { erreur: 'deja' };
  const gids = [...new Set((d.deviceSet || []).map((s) => s && s.id).filter((x) => typeof x === 'string'))].sort();
  return { groupes: gids.map((g) => ({ id: g, deviceIds: tous.filter((x) => (x.deviceSet || []).some((s) => s && s.id === g)).map((x) => x.id).sort() })) };
}
// V2.1 etape ecriture-generique (pur, sans acces au hub ; ecriture.mjs) : horaire du capteur de mouvement (texte « debut|fin », condition = HH:MM ou sunset / sunrise avec decalage en minutes signe) -> schedule {onCondition, offCondition}
const COND = /^(?:([01]\d|2[0-3]):([0-5]\d)|(sunset|sunrise)([+-]\d{1,3})?)$/;
export function horaire(texte) {
  const p = typeof texte === 'string' ? texte.split('|') : [];
  if (p.length !== 2) throw new HttpError(400, 'Horaire invalide.');
  const c = p.map((x) => {
    const m = COND.exec(x);
    if (!m) throw new HttpError(400, 'Horaire invalide.');
    if (m[1]) return { time: m[1] + ':' + m[2] };
    const o = m[4] ? Number(m[4]) : 0;
    if (Math.abs(o) > 180) throw new HttpError(400, 'Décalage hors bornes (180 min).');
    return o ? { time: m[3], offset: o } : { time: m[3] };
  });
  return { onCondition: c[0], offCondition: c[1] };
}

// FIN
