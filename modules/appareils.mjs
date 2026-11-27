// @zone appareils | Routes appareils : etat (V1.8 : mode local | distant du serveur, distant = demande arrivee par l'ecoute reseau ; V1.9 : version), liste des appareils ON/OFF (format ancien ; les cameras ont leurs routes) + pannes partielles, pieces ; commande d'un appareil : power, brightness (anciennes) et cmd {set} (generique, controlee contre caps). Reponse {device} relue apres 700 ms.
import { HttpError } from '../core/http.mjs';
import { sleep, versionInstallee } from '../core/outils.mjs';
import { lister, trouver, appliquer, relire, pieces, pannes } from '../core/appareils.mjs';
import { ancien, pourClient, reglage, manque, estOnOff } from '../core/modele.mjs';
import { liberer } from './animations-moteur.mjs';
import { etat } from '../core/serveur.mjs';

// V1.9 : version installee (VERSION, lue au demarrage), donnee par /api/status (APK anterieures a v1.8-2 ; les suivantes la lisent dans GET /api/clients). Sans VERSION : null.
const VERSION = versionInstallee();

const maintenant = () => new Date().toISOString();

export const routes = [
  ['GET', '/api/status', async (c) => ({ ok: true, hub: 'connecté', commandables: (await lister()).filter(estOnOff).length, mode: etat().mode, distant: !!c.req.distant, version: VERSION, time: maintenant() })],
 ['GET', '/api/devices', async () => { const devices = pourClient(await lister()); return { devices, pannes: pannes(), time: maintenant() }; }],
  ['GET', '/api/rooms', async () => ({ rooms: await pieces() })],
  ['POST', /^\/api\/devices\/([A-Za-z0-9_-]{1,80})\/(power|brightness|cmd)$/, async (c) => {
    const body = await c.corps();
    const d = await trouver(c.m[1]);
    if (!d) throw new HttpError(404, 'Appareil inconnu.');
    let set;
    if (c.m[2] === 'power') {
      if (typeof body.on !== 'boolean') throw new HttpError(400, 'Valeur "on" booléenne requise.');
      set = { on: body.on };
    } else if (c.m[2] === 'brightness') {
      if (!d.caps.level) throw new HttpError(400, 'Cet appareil ne gère pas la luminosité.');
      const lvl = body.level;
      if (!Number.isInteger(lvl) || lvl < 1 || lvl > 100) throw new HttpError(400, 'Luminosité entière entre 1 et 100 requise.');
      set = { level: lvl };
    } else {
      set = reglage(body.set);
      const x = manque(d, set);
      if (x) throw new HttpError(400, 'Cet appareil ne gère pas : ' + x + '.');
    }
    liberer([d.id]); // V1.5 : commande manuelle -> lampe retiree des animations
    await appliquer(d, set);
    await sleep(700);
    return { device: ancien(await relire(d)) };
  }],
];
// FIN
