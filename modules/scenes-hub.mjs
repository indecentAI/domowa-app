// @zone scenarios | Scenes du hub (V2.1 etape scenes-hub ; cartes §17, contrat « Scènes du hub » de .claude/rules/hubs.md) : GET /api/scenes-hub -> {scenes: [{id, adapter, nom,
// annulable (s), lance_le}], pannes, time} ; POST /api/scenes-hub/lancer {id}, POST /api/scenes-hub/annuler {id} -> {ok, time}. Vue Scenarios : tuiles marquees « hub » (public/scenes.js).
// Aucune modification de scene (application du hub). Le coeur (core/appareils.mjs) ne connait aucune marque.
import { HttpError } from '../core/http.mjs';
import { scenesHub, actionScene } from '../core/appareils.mjs';

const action = (nom) => async (c) => {
  const b = await c.corps();
  if (!b || typeof b.id !== 'string' || b.id.length > 220) throw new HttpError(400, 'Scène invalide.');
  await actionScene(b.id, nom);
  return { ok: true, time: new Date().toISOString() };
};
export const routes = [
  ['GET', '/api/scenes-hub', async () => ({ ...(await scenesHub()), time: new Date().toISOString() })],
  ['POST', '/api/scenes-hub/lancer', action('lancer')],
  ['POST', '/api/scenes-hub/annuler', action('annuler')],
];
// FIN
