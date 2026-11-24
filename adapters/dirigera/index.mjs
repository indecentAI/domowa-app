// @zone appareils | Adaptateur DIRIGERA : lister, relire (versModele de modele.mjs : capacites, V2.1), equipements (V2.1 : tout le hub en capacites), ecrire (V2.1 : ecriture generique, ecriture.mjs), appliquer (ON puis niveau puis couleur ou temperature), animer (V1.5 : une ecriture d'une valeur avec fondu), commande de piece ; connexion (adresse, jeton, client TLS strict, erreurs) dans connexion.mjs, contrat hub dans hub.mjs. Interface : core/appareils.mjs.
// Nouvelle commande d'ecriture : lire d'abord node_modules/dirigera/dist/api/*.js (le hub expose aussi blinds, capteurs, speakers...).
import { withTimeout } from '../../core/outils.mjs';
import { client, erreur } from './connexion.mjs';
import { iconeGenerique } from './pieces.mjs';
import { versModele, versEquipements } from './modele.mjs';
import { suivre, constater, heures } from './evenements.mjs';
export { erreur };
export { hub } from './hub.mjs';
export { gestionPieces } from './pieces.mjs';
export { ecrire } from './ecriture.mjs'; // V2.1 etape ecriture-generique : POST /api/equipements/:id/capacite
// Scenes du hub (V2.1 etape scenes-hub ; contrat « Scènes du hub » de .claude/rules/hubs.md) : liste (scenes.list), lancer (scenes.trigger), annuler (scenes.undo) ;
// POST jamais renvoye par got ; aucune modification de scene (application IKEA).
export const scenesHub = {
  lister: async () => (await auHub((c) => c.scenes.list())).filter((s) => s && typeof s.id === 'string' && s.info && typeof s.info.name === 'string')
    .map((s) => ({ id: s.id, nom: s.info.name, annulable: Number.isFinite(s.undoAllowedDuration) && s.undoAllowedDuration > 0 ? Math.min(600, Math.round(s.undoAllowedDuration)) : 0,
      lance_le: typeof s.lastTriggered === 'string' ? s.lastTriggered : null })),
  lancer: (id) => auHub((c) => c.scenes.trigger({ id })),
  annuler: (id) => auHub((c) => c.scenes.undo({ id })),
};

const TYPES = ['light', 'outlet'];
const auHub = async (fn) => withTimeout(fn(await client()));
// Hub non configure ou deconnecte : panne comme un hub injoignable (« Aucun hub configuré. », « Hub non connecté. ») ; s'il ne reste aucun appareil ON/OFF : « Hors ligne ».

// Evenements (V2.1) : ecoute du hub ouverte ou tenue a jour apres chaque lecture (evenements.mjs ; fermee si plus de hub configure)
const ecouter = () => { suivre(client().catch(() => null)); };
export async function lister() { try { return (await auHub((c) => c.devices.list())).filter((d) => TYPES.includes(d.type)).map(versModele); } finally { ecouter(); } }
// V2.1 : tous les appareils du hub et le hub, decrits en capacites (vue Equipements ; scenes du hub hors de cette vue : etape scenes-hub).
// Hub facultatif : son echec n'empeche pas la liste des appareils. Rendu en memoire seulement (capacites secretes et privees comprises : jamais journalise).
export async function equipements() {
  const [l, h] = await Promise.allSettled([auHub((c) => c.devices.list()), auHub((c) => c.hub.status())]);
  ecouter();
  if (l.status === 'rejected') throw l.reason;
  constater(l.value); // changement vu par la lecture et non par un evenement : sans heure
  return versEquipements(l.value, h.status === 'fulfilled' ? h.value : null, heures);
}
export async function relire(d) { return versModele(await auHub((c) => c.devices.get({ id: d.id }))); }
export async function pieces() { return (await auHub((c) => c.rooms.list())).map((r) => ({ id: r.id, name: r.name, icone: iconeGenerique(r.icon) })); }

// Commande de piece native du hub : ON/OFF seulement (le hub applique a toute la piece en une fois).
export async function piece(roomId, type, set) {
  if (Object.keys(set).join() !== 'on') throw new Error('commande de pièce : seul ON/OFF est géré');
  await auHub((c) => c.rooms.setAttributes({ id: roomId, deviceType: type, attributes: { isOn: set.on } }));
}

// Animations (V1.5, contrat animer de core/appareils.mjs) : une ecriture d'une seule valeur, par la fonction de la bibliotheque (api/lights.js : setIsOn, setLightLevel,
// setLightColor, setLightTemperature ; PATCH /devices/:id [{attributes, transitionTime}], transitionTime en ms, fondu fait par la lampe ; PATCH jamais renvoye par got).
// Une ecriture a plusieurs valeurs (luminosite et couleur) n'est appliquee qu'en partie par le hub (vu sur les lampes) : le moteur les envoie l'une apres l'autre (decouper). Refus du hub pour cet appareil (HTTP hors 401 et 403 :
// 503 injoignable, 400 attribut refuse) : erreur appareil (la lampe est ignoree, l'animation continue) ; reseau, delai, jeton : erreur du hub (animation suspendue).
export async function animer(n, c, ms) {
  const id = n.id, transitionTime = Math.max(0, Math.round(ms || 0));
  try {
    if (c.on !== undefined) await auHub((x) => x.lights.setIsOn({ id, isOn: c.on }));
    else if (c.level !== undefined) await auHub((x) => x.lights.setLightLevel({ id, lightLevel: c.level, transitionTime }));
    else if (c.hue !== undefined) await auHub((x) => x.lights.setLightColor({ id, colorHue: c.hue, colorSaturation: c.sat, transitionTime }));
    else if (c.kelvin !== undefined) await auHub((x) => x.lights.setLightTemperature({ id, colorTemperature: c.kelvin, transitionTime }));
  } catch (e) {
    const sc = e && e.response && e.response.statusCode;
    if (sc && sc !== 401 && sc !== 403) throw Object.assign(new Error('refus du hub pour cet appareil'), { appareil: true, motif: sc === 503 ? 'injoignable' : 'refusée par le hub (code ' + sc + ')' });
    throw e;
  }
}

export async function appliquer(n, st) {
  const id = n.id;
  if (n.type === 'outlet') {
    if (st.level !== undefined || st.mode !== undefined || st.on === undefined) return;
    await auHub((c) => c.outlets.setIsOn({ id, isOn: st.on }));
    return;
  }
  if (st.on === false) { await auHub((c) => c.lights.setIsOn({ id, isOn: false })); return; }
  if (st.on === true) await auHub((c) => c.lights.setIsOn({ id, isOn: true }));
  if (st.level !== undefined) await auHub((c) => c.lights.setLightLevel({ id, lightLevel: st.level }));
  if (st.mode === 'color') {
    if (!n.caps.color) throw new Error('couleur non gérée');
    await auHub((c) => c.lights.setLightColor({ id, colorHue: st.hue, colorSaturation: st.sat }));
  } else if (st.mode === 'temperature') {
    if (!n.caps.ctemp) throw new Error('température non gérée');
    await auHub((c) => c.lights.setLightTemperature({ id, colorTemperature: st.kelvin }));
  }
}

// FIN
