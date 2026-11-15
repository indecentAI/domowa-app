// @zone cameras | Adaptateur cameras IP : chaque camera de donnees/cameras.json devient un appareil de type camera (caps stream, ptz, hd ; reachable : dernier etat de sonde.mjs) ; apporte ses routes /api/cameras (routes de cameras.mjs, format du routeur). Aucune commande ON/OFF.
import { cameras, cheminHd, nomDe } from './cameras.mjs';
import { sonde } from './sonde.mjs';

export { routes } from './cameras.mjs';

export async function lister() {
  return cameras().map((c) => ({
    id: c.id, type: 'camera', name: nomDe(c), room: null, reachable: sonde.etat(c).etat !== 'hors_ligne', // V1.7 : dernier etat connu, sans sonde
    caps: { stream: true, ptz: c.ptz !== false, hd: !!cheminHd(c) }, state: {},
  }));
}
// Rangement local dans les pieces (V1.4, contrat « Pièces ») : les cameras de donnees/cameras.json (nom comme dans lister)
export const rangement = {
  nom: 'Caméras',
  async appareils() { return (await lister()).map((d) => ({ id: d.id, nom: d.name, genre: 'Caméra', vue: 'home' })); },
};
export async function appliquer() { throw new Error('caméra : aucune commande de réglage (routes /api/cameras)'); }
// FIN
