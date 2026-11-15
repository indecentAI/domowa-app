// @zone lumieres | Couleurs personnalisees (colors.json [{id, hue 0-359, sat 0-100}], 7 max) : GET et POST /api/colors, POST /api/colors/:id/delete.
import { HttpError } from '../core/http.mjs';
import { lireJson, ecrireJson, nouvelId } from '../core/outils.mjs';

function lire() {
  const j = lireJson('colors.json', []);
  return Array.isArray(j) ? j.filter((c) => c && typeof c.id === 'string' && Number.isInteger(c.hue) && Number.isInteger(c.sat)).slice(0, 7) : [];
}

export const routes = [
  ['GET', '/api/colors', async () => ({ colors: lire() })],
  ['POST', '/api/colors', async (c) => {
    const body = await c.corps();
    if (!Number.isInteger(body.hue) || body.hue < 0 || body.hue > 359 || !Number.isInteger(body.sat) || body.sat < 0 || body.sat > 100) {
      throw new HttpError(400, 'Couleur invalide.');
    }
    const list = lire();
    if (list.length >= 7) throw new HttpError(400, 'Maximum 7 couleurs personnalisées.');
    if (list.some((x) => x.hue === body.hue && x.sat === body.sat)) throw new HttpError(400, 'Cette couleur est déjà enregistrée.');
    list.push({ id: nouvelId(), hue: body.hue, sat: body.sat });
    ecrireJson('colors.json', list);
    return { colors: list };
  }],
  ['POST', /^\/api\/colors\/([a-z0-9]{1,20})\/delete$/, async (c) => {
    const list = lire();
    const idx = list.findIndex((x) => x.id === c.m[1]);
    if (idx < 0) throw new HttpError(404, 'Couleur inconnue.');
    list.splice(idx, 1);
    ecrireJson('colors.json', list);
    return { colors: list };
  }],
];
// FIN
