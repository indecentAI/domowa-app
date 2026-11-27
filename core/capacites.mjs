// @zone equipements | Referentiel des capacites (V2.1) : rang, famille, widget attendu, type de valeur, bornes par defaut ; validation d'une valeur contre son descripteur (valider), tri par rang (trier), absorption (absorber), composition (composer). Aucun nom de marque ni de type d'appareil.
// Descripteur d'une capacite (fourni par un adaptateur, contrat « Capacités » de .claude/rules/equipements.md) :
//   { cap, element, lecture: bool, ecriture: bool, sensible?: bool, valeur, unite?, min?, max?, pas?, options?: [{code, libelle}], disponible: bool, role?, associee?, libelle? }
//   cap : cle du referentiel ci-dessous ; element : identifiant de l'appareil existant qui porte la commande ; role (onoff seulement) : eclairage | prise | chauffage | appareil.
//   nature (configuration, diagnostic seulement) : capacite d'origine, valider la suit.
//   associee (facultatif) : cap absorbee par celle-ci, du meme element (consigne <- temperature mesuree) ; absorbee : affichee dans le widget de l'autre, jamais seule.
// Capacite non reconnue : dans inconnues [{cle, valeur}] de l'appareil, jamais ici (l'adaptateur ne fabrique rien : pas de capacite supposee).
import { HttpError } from './http.mjs';

// Familles (centaine du rang) et groupe d'affichage : 5xx sous « Mesures », 350 et 6xx dans la ligne d'informations
export const FAMILLES = { 1: 'commande', 2: 'reglage', 3: 'mode', 4: 'action', 5: 'mesure', 6: 'technique' };
// Types de valeur : booleen, nombre, plage ({bas, haut}), choix (code d'une option), couleur ({hue 0-359, sat 0-1}), texte, aucune (action ponctuelle)
// Drapeaux du referentiel (contrat « Capacités », .claude/rules/equipements.md) : secret (code d'appairage : affiche sur demande seulement, jamais dans une liste,
// un journal, un diagnostic, une capture ni le depot) ; prive (localisation, coordonnees GPS : a l'ecran seulement, jamais gardees sur disque, journalisees ni dans un diagnostic).
const R = (cap, rang, widget, type, libelle, o = {}) => ({ cap, rang, widget, type, libelle, ...o });
const PCT = { min: 0, max: 100, pas: 1, unite: '%' };
export const REFERENTIEL = Object.freeze([
  // 1xx - commande principale
  R('onoff', 100, 'onoff', 'booleen', 'ON / OFF'),
  R('ouverture', 110, 'ouverture', 'choix', 'Ouverture'),
  R('verrou', 120, 'choix', 'choix', 'Verrou'),
  R('alarme', 125, 'choix', 'choix', 'Alarme'),
  R('sirene', 130, 'onoff', 'booleen', 'Sirène'),
  R('cycle', 140, 'cycle', 'texte', 'Cycle'),
  R('lecture', 145, 'choix', 'choix', 'Lecture'),
  R('media', 146, 'valeur', 'texte', 'En cours'),
  R('robot', 150, 'choix', 'choix', 'Robot'),
  R('groupe_onoff', 160, 'onoff', 'booleen', 'Groupe commandé'),
  R('activite', 190, 'puce', 'texte', 'Activité en cours'),
  // 2xx - reglages continus
  R('luminosite', 200, 'curseur', 'nombre', 'Luminosité', { min: 1, max: 100, pas: 1, unite: '%' }),
  R('groupe_luminosite', 205, 'curseur', 'nombre', 'Luminosité du groupe', { min: 1, max: 100, pas: 1, unite: '%' }),
  R('position', 210, 'curseur', 'nombre', 'Position', PCT),
  R('inclinaison', 215, 'curseur', 'nombre', 'Inclinaison', PCT),
  R('consigne_temperature', 220, 'consigne', 'nombre', 'Consigne', { unite: '°C' }),
  R('consigne_plage', 222, 'consigne', 'plage', 'Plage de consigne', { unite: '°C' }),
  R('consigne_humidite', 225, 'consigne', 'nombre', 'Consigne d\'humidité', PCT),
  R('vitesse', 230, 'curseur', 'nombre', 'Vitesse', PCT),
  R('niveau', 240, 'curseur', 'nombre', 'Niveau'),
  R('volume', 250, 'curseur', 'nombre', 'Volume', PCT),
  R('muet', 255, 'onoff', 'booleen', 'Muet'),
  R('temperature_couleur', 260, 'curseur_k', 'nombre', 'Blanc', { min: 1801, max: 6535, pas: 1, unite: 'K' }),
  R('groupe_temperature', 265, 'curseur_k', 'nombre', 'Blanc du groupe', { min: 1801, max: 6535, pas: 1, unite: 'K' }),
  R('couleur', 270, 'couleur', 'couleur', 'Couleur'),
  R('texte', 280, 'texte', 'texte', 'Texte'),
  R('date_heure', 285, 'date', 'texte', 'Date et heure'),
  // 3xx - modes et selections (350 a 399 : options, ligne d'informations)
  R('mode', 300, 'segments', 'choix', 'Mode'),
  R('prereglage', 310, 'grille', 'choix', 'Préréglage'),
  R('vitesse_predefinie', 320, 'segments', 'choix', 'Vitesse'),
  R('source', 330, 'grille', 'choix', 'Source'),
  R('oscillation', 340, 'onoff', 'booleen', 'Oscillation'),
  R('sens', 340, 'choix', 'choix', 'Sens'),
  R('repetition', 345, 'choix', 'choix', 'Répétition'),
  R('aleatoire', 346, 'onoff', 'booleen', 'Lecture aléatoire'),
  R('absence', 348, 'onoff', 'booleen', 'Absence'),
  R('option', 350, 'info', 'booleen', 'Option'),
  R('verrou_enfant', 351, 'info', 'booleen', 'Verrou enfant'),
  R('voyant', 352, 'info', 'booleen', 'Voyant'),
  R('demarrage', 353, 'info', 'choix', 'Au retour du courant'),
  R('mode_commande', 355, 'info', 'choix', 'Commande'),
  R('duree_allumage', 356, 'info', 'nombre', 'Durée après détection', { min: 0, unite: 's' }),
  R('programmation', 357, 'info', 'booleen', 'Programmation horaire'),
  R('horaire', 358, 'info', 'texte', 'Horaire'),
  // Entite de configuration ou de diagnostic d'un appareil (Home Assistant, entity_category) dont la capacite d'origine n'est pas deja en 35x ou 6xx :
  // capacite d'origine dans le champ nature du descripteur (valeur, bornes et options de celle-ci) ; jamais une carte
  R('configuration', 359, 'info', 'texte', 'Configuration'),
  // 4xx - actions ponctuelles
  R('action', 400, 'bouton', 'aucune', 'Action'),
  R('identifier', 405, 'bouton', 'aucune', 'Identifier'),
  R('identifier_arret', 406, 'bouton', 'aucune', 'Arrêter l\'identification'),
  R('scene', 410, 'bouton', 'aucune', 'Scène'),
  R('remise_energie', 420, 'bouton', 'aucune', 'Remettre l\'énergie à zéro'),
  R('appui', 430, 'valeur', 'texte', 'Dernier appui'),
  R('maj_rechercher', 440, 'bouton', 'aucune', 'Rechercher une mise à jour'),
  R('maj_installer', 441, 'bouton', 'aucune', 'Installer la mise à jour', { sensible: true }),
  // V2.1 etape telecommande-lampes : ajoute une lampe (option = appareil du hub) aux appareils commandes par un mode d'une telecommande ; modifie la configuration du hub
  R('lier', 445, 'choix', 'choix', 'Ajouter une lampe', { sensible: true }),
  // 5xx - mesures (lecture seule)
  R('fuite', 500, 'valeur', 'booleen', 'Fuite'),
  R('fumee', 500, 'valeur', 'booleen', 'Fumée'),
  R('monoxyde', 500, 'valeur', 'booleen', 'Monoxyde de carbone'),
  R('gaz', 500, 'valeur', 'booleen', 'Gaz'),
  R('ouvert', 505, 'valeur', 'booleen', 'Ouverture'),
  R('presence', 510, 'valeur', 'booleen', 'Présence'),
  R('localisation', 515, 'valeur', 'texte', 'Localisation', { prive: true }),
  R('coordonnees', 516, 'valeur', 'texte', 'Coordonnées GPS', { prive: true }),
  R('soleil_coucher', 517, 'valeur', 'texte', 'Prochain coucher du soleil'),
  R('soleil_lever', 518, 'valeur', 'texte', 'Prochain lever du soleil'),
  R('temperature', 520, 'valeur', 'nombre', 'Température', { unite: '°C' }),
  R('humidite', 525, 'valeur', 'nombre', 'Humidité', { unite: '%' }),
  R('pm25', 530, 'valeur', 'nombre', 'PM2,5', { unite: 'µg/m³' }),
  R('pm10', 531, 'valeur', 'nombre', 'PM10', { unite: 'µg/m³' }),
  R('pm1', 532, 'valeur', 'nombre', 'PM1', { unite: 'µg/m³' }),
  R('co2', 535, 'valeur', 'nombre', 'CO₂', { unite: 'ppm' }),
  R('cov', 540, 'valeur', 'nombre', 'COV'),
  R('lux', 545, 'valeur', 'nombre', 'Luminosité ambiante', { unite: 'lx' }),
  R('pression', 548, 'valeur', 'nombre', 'Pression', { unite: 'hPa' }),
  R('son', 550, 'valeur', 'nombre', 'Son', { unite: 'dB' }),
  R('puissance', 560, 'valeur', 'nombre', 'Puissance', { unite: 'W' }),
  R('energie', 565, 'valeur', 'nombre', 'Énergie', { unite: 'kWh' }),
  R('courant', 570, 'valeur', 'nombre', 'Courant', { unite: 'A' }),
  R('tension', 571, 'valeur', 'nombre', 'Tension', { unite: 'V' }),
  R('mesure', 590, 'valeur', 'nombre', 'Mesure'),
  // 6xx - technique et identite (ligne discrete)
  R('batterie', 600, 'info', 'nombre', 'Batterie', { min: 0, max: 100, unite: '%' }),
  R('signal', 610, 'info', 'nombre', 'Signal'),
  R('filtre', 620, 'info', 'nombre', 'Filtre'),
  R('logiciel', 630, 'info', 'texte', 'Logiciel'),
  R('probleme', 640, 'info', 'booleen', 'Problème'),
  R('fabricant', 650, 'info', 'texte', 'Fabricant'),
  R('modele', 651, 'info', 'texte', 'Modèle'),
  R('serie', 652, 'info', 'texte', 'N° de série'),
  R('materiel', 653, 'info', 'texte', 'Version matérielle'),
  R('code_produit', 654, 'info', 'texte', 'Référence'),
  R('fuseau', 655, 'info', 'texte', 'Fuseau horaire'),
  R('code_appairage', 660, 'secret', 'texte', 'Code d\'appairage', { secret: true }),
  R('diagnostic', 690, 'info', 'texte', 'Diagnostic'),
].map(Object.freeze));
const PAR_CAP = new Map(REFERENTIEL.map((r, i) => [r.cap, { ...r, ordre: i }]));
export const ROLES = Object.freeze(['eclairage', 'prise', 'chauffage', 'appareil']);
// Capacites qui enveloppent une capacite d'origine (champ nature du descripteur)
export const ENVELOPPES = Object.freeze(['configuration', 'diagnostic']);

export const definition = (cap) => PAR_CAP.get(cap) || null;
export const connue = (cap) => PAR_CAP.has(cap);
export const secrete = (cap) => !!(PAR_CAP.get(cap) || {}).secret;
export const privee = (cap) => !!(PAR_CAP.get(cap) || {}).prive;
// Commande sensible (V2.1 etape ecriture-generique) : deux appuis cote client, confirm: true exige par la route d'ecriture (descripteur sensible ou referentiel)
export const sensible = (c) => !!(c && (c.sensible === true || (PAR_CAP.get(c.cap) || {}).sensible));
// Liste sans les capacites secretes (tout ce qui sort d'une liste ou part vers un journal passe par la)
export const sansSecret = (liste) => (liste || []).filter((c) => !(c && (c.secret || secrete(c.cap))));
export const famille = (cap) => { const r = PAR_CAP.get(cap); return r ? FAMILLES[Math.floor(r.rang / 100)] : null; };
// Groupe d'affichage de la carte (contrat « Capacités ») : principal, mesures, informations
export function groupe(cap) {
  const r = PAR_CAP.get(cap); if (!r) return null;
  if (r.rang >= 600 || (r.rang >= 350 && r.rang < 400)) return 'informations';
  return r.rang >= 500 ? 'mesures' : 'principal';
}
// Bornes effectives : celles du descripteur, sinon celles du referentiel (jamais inventees au-dela)
export function bornes(c) {
  const r = PAR_CAP.get(c && c.cap) || {};
  const v = (k) => (typeof c[k] === 'number' && Number.isFinite(c[k]) ? c[k] : (typeof r[k] === 'number' ? r[k] : null));
  return { min: v('min'), max: v('max'), pas: v('pas') };
}

// Validation d'une valeur a ecrire contre son descripteur : rend la valeur normalisee ou leve HttpError 400.
export function valider(c, valeur) {
  const r = c && PAR_CAP.get(c.cap);
  if (!r) throw new HttpError(400, 'Capacité inconnue.');
  // configuration, diagnostic : valides comme leur capacite d'origine (nature), jamais comme un texte libre
  if (ENVELOPPES.includes(c.cap)) {
    if (!connue(c.nature) || ENVELOPPES.includes(c.nature)) throw new HttpError(400, 'Capacité inconnue.');
    return valider({ ...c, cap: c.nature, nature: undefined }, valeur);
  }
  if (c.disponible === false) throw new HttpError(400, 'Appareil indisponible.');
  if (c.ecriture !== true) throw new HttpError(400, 'Capacité en lecture seule.');
  if (r.type === 'aucune') { if (valeur !== undefined && valeur !== null) throw new HttpError(400, 'Aucune valeur attendue.'); return null; }
  if (r.type === 'booleen') { if (typeof valeur !== 'boolean') throw new HttpError(400, 'Valeur ON/OFF attendue.'); return valeur; }
  if (r.type === 'choix') {
    const o = Array.isArray(c.options) ? c.options : [];
    if (!o.some((x) => x && x.code === valeur)) throw new HttpError(400, 'Choix inconnu.');
    return valeur;
  }
  if (r.type === 'plage') {
    const b = valeur && valeur.bas, h = valeur && valeur.haut;
    if (typeof b !== 'number' || typeof h !== 'number' || !Number.isFinite(b) || !Number.isFinite(h) || b > h) throw new HttpError(400, 'Plage invalide.');
    for (const v of [b, h]) valider({ ...c, cap: 'consigne_temperature' }, v);
    return { bas: b, haut: h };
  }
  if (r.type === 'texte') { if (typeof valeur !== 'string' || valeur.length > 255) throw new HttpError(400, 'Texte invalide.'); return valeur; }
  if (r.type === 'couleur') {
    const h = valeur && valeur.hue, s = valeur && valeur.sat;
    if (typeof h !== 'number' || typeof s !== 'number' || !(h >= 0 && h <= 360) || !(s >= 0 && s <= 1.01)) throw new HttpError(400, 'Couleur invalide.');
    return { hue: Math.min(359, Math.round(h)), sat: Math.min(1, Math.round(s * 100) / 100) };
  }
  // nombre
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) throw new HttpError(400, 'Nombre attendu.');
  const { min, max, pas } = bornes(c);
  if ((min !== null && valeur < min) || (max !== null && valeur > max)) throw new HttpError(400, 'Valeur hors bornes' + (min !== null && max !== null ? ' (' + min + ' à ' + max + ')' : '') + '.');
  if (pas) { const q = (valeur - (min || 0)) / pas; if (Math.abs(q - Math.round(q)) > 1e-9) throw new HttpError(400, 'Valeur hors du pas (' + pas + ').'); }
  return valeur;
}

// Tri (contrat « Capacités ») : rang, puis ordre du referentiel, puis libelle, puis element. Jamais l'ordre du hub. Capacite inconnue : en dernier. Rend une copie.
const cle = (c) => { const r = PAR_CAP.get(c.cap); return r ? [r.rang, r.ordre] : [9999, 9999]; };
const lib = (c) => String(c.libelle || (PAR_CAP.get(c.cap) || {}).libelle || c.cap || '');
export function trier(liste) {
  return [...(liste || [])].sort((a, b) => {
    const x = cle(a), y = cle(b);
    return x[0] - y[0] || x[1] - y[1] || lib(a).localeCompare(lib(b), 'fr') || String(a.element || '').localeCompare(String(b.element || ''));
  });
}

// Absorption (contrat « Capacités ») : une capacite qui declare associee (cap du meme element) l'affiche dans son widget ; ON/OFF absorbe par un mode du meme element dont une option a le code 'off'.
// Rend des copies : l'absorbante porte absorbees [capacite...], l'absorbee n'est plus dans la liste. Aucune entree n'est modifiee.
export function absorber(liste) {
  const l = (liste || []).map((c) => ({ ...c }));
  const prises = new Set();
  const prendre = (hote, cap) => {
    const i = l.findIndex((c, k) => !prises.has(k) && c !== hote && c.cap === cap && c.element === hote.element && !c.associee);
    if (i < 0) return; prises.add(i); hote.absorbees = (hote.absorbees || []).concat(l[i]);
  };
  for (const c of l) if (c.associee && connue(c.associee)) prendre(c, c.associee);
  for (const c of l) if (c.cap === 'mode' && Array.isArray(c.options) && c.options.some((o) => o && o.code === 'off')) prendre(c, 'onoff');
  return l.filter((c, k) => !prises.has(k));
}
export const composer = (liste) => trier(absorber(liste));

// Aides des modeles d'adaptateur (fonctions pures, sans marque) : valeurs lues du hub (nombre fini, texte non vide, booleen ; sinon null),
// copie d'une valeur inconnue (8 Ko au plus, sinon {tronque: true} ; contrat « Capacités »), coordonnees en texte (capacite privee, regle « Données sensibles »).
export const nb = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const tx = (v) => (typeof v === 'string' && v ? v : null);
export const bo = (v) => (typeof v === 'boolean' ? v : null);
export const MAX_INCONNUE = 8192;
export const copieInconnue = (v) => {
  if (v === undefined) return null;
  const j = JSON.stringify(v);
  return j === undefined || j.length > MAX_INCONNUE ? { tronque: true } : JSON.parse(j);
};
export const texteCoordonnees = (lat, lon, precision) => (Number.isFinite(lat) && Number.isFinite(lon)
  ? lat.toFixed(5) + ', ' + lon.toFixed(5) + (Number.isFinite(precision) ? ' (± ' + Math.round(precision) + ' m)' : '') : null);
// FIN
