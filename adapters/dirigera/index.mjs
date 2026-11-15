// @zone appareils | Adaptateur DIRIGERA : versModele, lister, appliquer (ON puis niveau puis couleur ou temperature), animer (V1.5 : une ecriture d'une valeur avec fondu), commande de piece ; connexion (adresse, jeton, client TLS strict, erreurs) dans connexion.mjs, contrat hub dans hub.mjs. Interface : core/appareils.mjs.
// Nouvelle commande d'ecriture : lire d'abord node_modules/dirigera/dist/api/*.js (le hub expose aussi blinds, capteurs, speakers...).
import { withTimeout } from '../../core/outils.mjs';
import { client, erreur } from './connexion.mjs';
import { iconeGenerique } from './pieces.mjs';
export { erreur };
export { hub } from './hub.mjs';
export { gestionPieces } from './pieces.mjs';

const TYPES = ['light', 'outlet'];
const auHub = async (fn) => withTimeout(fn(await client()));
// Hub non configure ou deconnecte : panne comme un hub injoignable (« Aucun hub configuré. », « Hub non connecté. ») ; s'il ne reste aucun appareil ON/OFF : « Hors ligne ».

const nb = (v) => (typeof v === 'number' ? v : null);
function versModele(d) {
  const a = d.attributes || {};
  const cr = (d.capabilities && d.capabilities.canReceive) || [];
  const peut = (k) => Array.isArray(cr) && cr.includes(k);
  const lo = Math.min(a.colorTemperatureMin, a.colorTemperatureMax), hi = Math.max(a.colorTemperatureMin, a.colorTemperatureMax);
  return {
    id: d.id, type: d.type, name: a.customName || '(sans nom)',
    room: d.room ? { id: d.room.id, name: d.room.name } : null, reachable: d.isReachable !== false,
    caps: {
      onoff: true, level: d.type === 'light' && peut('lightLevel'), color: peut('colorHue') && peut('colorSaturation'), ctemp: peut('colorTemperature'),
      ctempMin: Number.isFinite(lo) ? lo : null, ctempMax: Number.isFinite(hi) ? hi : null,
    },
    state: {
      on: typeof a.isOn === 'boolean' ? a.isOn : null, level: nb(a.lightLevel), colorMode: a.colorMode || null,
      hue: nb(a.colorHue), sat: nb(a.colorSaturation), ctemp: nb(a.colorTemperature),
    },
  };
}

export async function lister() { return (await auHub((c) => c.devices.list())).filter((d) => TYPES.includes(d.type)).map(versModele); }
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
