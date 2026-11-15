// @zone plan | Plan des pieces (layout.json {piece: {appareil: {x, y}}}, positions 0-100 %) : GET et POST /api/layout ; expose lireLayout (ordre d'envoi des commandes groupees).
import { HttpError } from '../core/http.mjs';
import { lireJson, ecrireJson } from '../core/outils.mjs';
import { ID_RE } from '../core/modele.mjs';

export function lireLayout() {
  const j = lireJson('layout.json', {});
  return (j && typeof j === 'object' && !Array.isArray(j)) ? j : {};
}

export const routes = [
  ['GET', '/api/layout', async () => ({ layout: lireLayout() })],
  ['POST', '/api/layout', async (c) => {
    const body = await c.corps();
    const room = body.room;
    if (typeof room !== 'string' || !ID_RE.test(room) || room === '__proto__') throw new HttpError(400, 'Pièce invalide.');
    const pos = body.positions;
    if (!pos || typeof pos !== 'object' || Array.isArray(pos)) throw new HttpError(400, 'Positions invalides.');
    const keys = Object.keys(pos);
    if (keys.length > 40) throw new HttpError(400, 'Trop de positions.');
    const clean = {};
    for (const k of keys) {
      const v = pos[k];
      if (!ID_RE.test(k) || k === '__proto__' || !v || typeof v.x !== 'number' || typeof v.y !== 'number' ||
          !(v.x >= 0 && v.x <= 100 && v.y >= 0 && v.y <= 100)) throw new HttpError(400, 'Position invalide.');
      clean[k] = { x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10 };
    }
    const layout = lireLayout();
    if (keys.length) {
      if (!layout[room] && Object.keys(layout).length >= 50) throw new HttpError(400, 'Trop de pièces.');
      layout[room] = clean;
    } else delete layout[room];
    ecrireJson('layout.json', layout);
    return { layout };
  }],
];
// FIN
