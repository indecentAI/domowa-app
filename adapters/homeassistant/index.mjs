// @zone homeassistant | Adaptateur Home Assistant (V2.0) : lister (GET /api/states : lumieres et prises, modele.mjs, capacites projetees V2.1), relire (GET /api/states/<entite>), equipements (V2.1 : toutes les entites des domaines integres, registre WebSocket, registre.mjs), appliquer (etape 3 : light.turn_on / turn_off, switch.turn_on / turn_off, une action par commande, jamais renvoyee) ; connexion dans connexion.mjs, contrat hub dans hub.mjs. Interface : core/appareils.mjs.
import { HttpError } from '../../core/http.mjs';
import { log } from '../../core/outils.mjs';
import { obtenir, envoyer, erreur } from './connexion.mjs';
import { depuisEtats, versModele, versEquipements, retenue, entiteDe, actionDe, MAX_APPAREILS } from './modele.mjs';
import { lireRegistre } from './registre.mjs';
export { erreur };
export { hub } from './hub.mjs';

let signale = false;
export async function lister() {
  const etats = await obtenir('/api/states', { delai: 8000 });
  if (!Array.isArray(etats)) throw Object.assign(new Error('HA_REPONSE'), { code: 'HA_REPONSE' });
  const l = depuisEtats(etats);
  if (l.length >= MAX_APPAREILS && !signale) { signale = true; log('homeassistant :', MAX_APPAREILS, 'appareils au plus, les suivants sont ignorés'); }
  return l;
}
// V2.1 : equipements de Home Assistant decrits en capacites (vue Equipements : etape equipements-vue ; aucune route ne les sert encore). Unite de temperature : /api/config (facultatif).
// Registre facultatif : son echec (ou Node 20 sans WebSocket) donne une entite = un equipement, sans panne (journal une fois, code seulement). Rendu en memoire seulement (capacites privees comprises).
let regSignale = false;
export async function equipements() {
  const [e, c, r] = await Promise.allSettled([obtenir('/api/states', { delai: 8000 }), obtenir('/api/config', { delai: 4000 }), lireRegistre()]);
  if (e.status === 'rejected') throw e.reason;
  if (!Array.isArray(e.value)) throw Object.assign(new Error('HA_REPONSE'), { code: 'HA_REPONSE' });
  if (r.status === 'rejected') { if (!regSignale) { regSignale = true; log('homeassistant : registre illisible (' + String((r.reason && r.reason.code) || 'erreur') + '), une entite = un equipement'); } }
  else regSignale = false;
  const u = c.status === 'fulfilled' && c.value && c.value.unit_system && c.value.unit_system.temperature;
  return versEquipements(e.value, r.status === 'fulfilled' ? r.value : null, { uniteTemp: typeof u === 'string' && u ? u.slice(0, 8) : null });
}
export async function relire(d) {
  const e = entiteDe(d.id);
  if (!e) throw new HttpError(404, 'Appareil inconnu.');
  const st = await obtenir('/api/states/' + e, { delai: 6000 });
  if (!retenue(st)) throw Object.assign(new Error('HA_REPONSE'), { code: 'HA_REPONSE' });
  return versModele(st);
}
// Commande (V2.0 etape 3) : une action de Home Assistant, corps calcule par actionDe (modele.mjs : regles et documentation) ; rien a envoyer : rien.
export async function appliquer(n, st) {
  const a = actionDe(n, st);
  if (a) await envoyer(a.chemin, a.corps);
}
// FIN
