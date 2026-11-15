// @zone pieces | DIRIGERA, pieces (contrat gestionPieces, CLAUDE.md « Pièces ») : icones generiques <-> liste fermee du hub, couleur choisie d'office,
// creer (POST /v1/rooms {name, icon, color}), deplacer (PATCH /v1/rooms/:id/devices {deviceIds}), modifier (PUT /v1/rooms/:id {name, icon, color} : les trois,
// couleur relue et renvoyee telle quelle, icone hors liste gardee), supprimer (DELETE /v1/rooms/:id), contenu (tous les appareils du hub, telecommandes comprises) ;
// formats de node_modules/dirigera/dist/api/rooms.js et types/Room.d.ts (2.0.2). PUT et DELETE : sans renvoi automatique (connexion.mjs, sansRenvoi).
// Un refus du hub (HTTP 4xx/5xx hors jeton) devient HttpError(502) ; les autres erreurs (reseau, jeton, delai) sont traduites par connexion.mjs (erreur).
import { HttpError } from '../../core/http.mjs';
import { withTimeout } from '../../core/outils.mjs';
import { client, sansRenvoi } from './connexion.mjs';

// Cle generique (dessin local, public/pieces.js) -> icone du hub (liste fermee de Room.d.ts)
const ICONES = {
  maison: 'rooms_home', canape: 'rooms_sofa', lit: 'rooms_bed', cuisine: 'rooms_pot_with_lid', repas: 'rooms_cutlery', bain: 'rooms_bathtub', bureau: 'rooms_desk',
  porte: 'rooms_door', enfant: 'rooms_teddy', voiture: 'rooms_car', plante: 'rooms_pot_plant', escalier: 'rooms_stairway', linge: 'rooms_washing_machine', atelier: 'rooms_wrench',
};
// Couleurs de Room.d.ts, dans l'ordre de la bibliotheque : la premiere qui n'est pas deja prise par une piece du hub (sinon la premiere).
const COULEURS = [
  'ikea_green_no_65', 'ikea_yellow_no_24', 'ncs_s_1020_r10b', 'ikea_red_no_39', 'ikea_blue_no_58', 'ikea_lilac_no_3',
  'ikea_orange_no_11', 'ikea_yellow_no_31', 'pantone_16_0230_tcx', 'ikea_brown_no_41', 'ikea_yellow_no_28', 'ikea_blue_no_63',
  'ikea_pink_no_4', 'ikea_beige_1', 'pantone_16_0940_tcx', 'pantone_15_0522_tcx', 'ikea_green_no_66', 'ikea_blue_no_60',
  'ikea_pink_no_6', 'ncs_s_4010_g10y', 'ikea_turquoise_5', 'ikea_beige_no_3', 'ikea_pink_no_8', 'ikea_yellow_no_27',
  'ikea_beige_no_4', 'ikea_blue_no_52', 'ikea_white_no_20', 'ikea_yellow_no_30', 'ikea_green_no_63',
];

// Icone du hub -> cle generique (null si l'icone n'est pas parmi les 14 proposees : gardee telle quelle a la modification)
const GENERIQUES = Object.fromEntries(Object.entries(ICONES).map(([k, v]) => [v, k]));
export const iconeGenerique = (icon) => GENERIQUES[icon] || null;

const auHub = async (fn) => withTimeout(fn(await client()));
const sansRenvoyer = async (fn) => withTimeout(fn(await sansRenvoi()));
function refus(e) {
  const s = e && e.response && e.response.statusCode;
  if (s >= 400 && s !== 401 && s !== 403) return new HttpError(502, 'Le hub a refusé la demande (code ' + s + ').');
  return e;
}

export const gestionPieces = {
  nom: 'IKEA DIRIGERA',
  icones: Object.keys(ICONES),
  async creer({ nom, icone }) {
    if (!ICONES[icone]) throw new HttpError(400, 'Icône inconnue.');
    try {
      const prises = new Set((await auHub((c) => c.rooms.list())).map((r) => r.color));
      const color = COULEURS.find((x) => !prises.has(x)) || COULEURS[0];
      const r = await auHub((c) => c.rooms.create({ name: nom, icon: ICONES[icone], color }));
      if (!r || typeof r.id !== 'string') throw new HttpError(502, 'Réponse du hub illisible (pièce).');
      return { id: r.id };
    } catch (e) { throw refus(e); }
  },
  async deplacer(pieceId, ids) {
    try { await auHub((c) => c.rooms.moveDevices({ id: pieceId, deviceIds: ids })); } catch (e) { throw refus(e); }
  },
  // Nom et icone (icone null : celle du hub gardee) ; la couleur, que l'application ne propose pas, est relue puis renvoyee telle quelle. Un seul envoi.
  async modifier(pieceId, { nom, icone }) {
    if (icone !== null && !ICONES[icone]) throw new HttpError(400, 'Icône inconnue.');
    try {
      const r = await auHub((c) => c.rooms.get({ id: pieceId }));
      if (!r || typeof r.color !== 'string' || typeof r.icon !== 'string') throw new HttpError(502, 'Réponse du hub illisible (pièce).');
      await sansRenvoyer((c) => c.rooms.update({ id: pieceId, name: nom, icon: icone ? ICONES[icone] : r.icon, color: r.color }));
    } catch (e) { throw refus(e); }
  },
  // Un seul envoi ; l'appelant a d'abord vide la piece (comportement du hub pour une piece non vide inconnu).
  async supprimer(pieceId) {
    try { await sansRenvoyer((c) => c.rooms.delete({ id: pieceId })); } catch (e) { throw refus(e); }
  },
  // Tous les appareils du hub (lumieres, prises, telecommandes, capteurs...) et leur piece : une piece n'est vide que sans aucun d'eux.
  async contenu() {
    const l = await auHub((c) => c.devices.list());
    return (Array.isArray(l) ? l : []).filter((d) => d && typeof d.id === 'string')
      .map((d) => ({ id: d.id, nom: (d.attributes && typeof d.attributes.customName === 'string' && d.attributes.customName) || d.deviceType || d.type || d.id, piece: d.room && typeof d.room.id === 'string' ? d.room.id : null }));
  },
};
// FIN
