// @zone scenarios | Scenarios (scenarios.json, 30 max) : GET et POST /api/scenarios (capture l'etat des lumieres choisies), POST /api/scenarios/:id/apply|rename|delete|icon|fav. SCENE_ICONS = ICONS de public/scenes.js (aussi icones des animations).
// V1.5 : un scenario n'a pas d'animation (l'animation porte tout : lampes, etats, favori) ; un champ animation laisse par une version de travail est ignore.
import { HttpError } from '../core/http.mjs';
import { lireJson, ecrireJson, nouvelId } from '../core/outils.mjs';
import { lister } from '../core/appareils.mjs';
import { pourClient, reglage, KELVIN_MIN, KELVIN_MAX } from '../core/modele.mjs';
import { executer, repondre, verifierIds } from './lots.mjs';

export const SCENE_ICONS = ['sun', 'moon', 'meal', 'tv', 'film', 'book', 'music', 'heart', 'sparkles', 'bed', 'laptop', 'flame', 'home', 'door', 'bulb', 'leaf', 'coffee', 'wine', 'gift', 'gamepad', 'sofa', 'bath', 'sunrise', 'sunset', 'phone', 'power', 'lock', 'bell', 'clock', 'palette', 'cloud', 'zap', 'users', 'dumbbell', 'tree', 'wind', 'camera', 'chef', 'plug'];

function lire() { const j = lireJson('scenarios.json', []); return Array.isArray(j) ? j : []; }
const ecrire = (list) => ecrireJson('scenarios.json', list, 1);

function cleanName(v) {
  if (typeof v !== 'string') throw new HttpError(400, 'Nom requis.');
  const n = v.trim();
  if (n.length < 1 || n.length > 40) throw new HttpError(400, 'Le nom doit faire 1 à 40 caractères.');
  return n;
}
function capture(n) {
  const o = { id: n.id, name: n.name, on: n.isOn === true };
  if (n.level !== null) o.level = Math.max(1, Math.min(100, Math.round(n.level)));
  if (n.colorMode === 'color' && n.hue !== null && n.sat !== null) {
    o.mode = 'color';
    o.hue = Math.min(359, Math.round(n.hue));
    o.sat = Math.min(1, Math.round(n.sat * 100) / 100);
  } else if (n.colorMode === 'temperature' && n.temp !== null) {
    o.mode = 'temperature';
    o.kelvin = Math.max(KELVIN_MIN, Math.min(KELVIN_MAX, Math.round(n.temp)));
  }
  return o;
}

export const routes = [
  ['GET', '/api/scenarios', async () => ({ scenarios: lire() })],
  ['POST', '/api/scenarios', async (c) => {
    const body = await c.corps();
    const name = cleanName(body.name);
    verifierIds(body.ids);
    const scenes = lire();
    if (scenes.length >= 30) throw new HttpError(400, 'Maximum 30 scénarios.');
    const lights = pourClient(await lister());
    const chosen = body.ids.map((id) => lights.find((l) => l.id === id));
    if (chosen.some((x) => !x)) throw new HttpError(404, 'Lumière inconnue.');
    const scene = { id: nouvelId(), name, lights: chosen.map(capture) };
    scenes.push(scene);
    ecrire(scenes);
    return { scene, scenarios: scenes };
  }],
  ['POST', /^\/api\/scenarios\/([a-z0-9]{1,20})\/(apply|rename|delete|icon|fav)$/, async (c) => {
    const scenes = lire();
    const idx = scenes.findIndex((s) => s.id === c.m[1]);
    if (idx < 0) throw new HttpError(404, 'Scénario inconnu.');
    const action = c.m[2];
    if (action === 'apply') {
      const items = scenes[idx].lights.map((l) => ({
        id: l.id, name: l.name,
        st: reglage({ on: l.on, level: l.level, mode: l.mode, hue: l.hue, sat: l.sat, kelvin: l.kelvin }),
      }));
      repondre(c, await executer(items));
      return;
    }
    if (action === 'delete') scenes.splice(idx, 1);
    else {
      const body = await c.corps();
      if (action === 'rename') scenes[idx].name = cleanName(body.name);
      else if (action === 'icon') {
        if (body.icon === null || body.icon === '') delete scenes[idx].icon;
        else if (typeof body.icon === 'string' && SCENE_ICONS.includes(body.icon)) scenes[idx].icon = body.icon;
        else throw new HttpError(400, 'Icône inconnue.');
      } else {
        if (typeof body.fav !== 'boolean') throw new HttpError(400, 'Valeur "fav" booléenne requise.');
        if (body.fav) scenes[idx].fav = true; else delete scenes[idx].fav;
      }
    }
    ecrire(scenes);
    return { scenarios: scenes };
  }],
];
// FIN
