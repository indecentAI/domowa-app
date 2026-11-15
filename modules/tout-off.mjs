// @zone appareils | Route Tout OFF {confirm: true} : une commande de piece par piece pour les lumieres, puis appareil par appareil (prises, sans piece, pieces en echec), relue apres 1 s, reprise une fois (core/confirmation.mjs) ; journal "all-off".
import { HttpError } from '../core/http.mjs';
import { log } from '../core/outils.mjs';
import { lister, appliquer, piece } from '../core/appareils.mjs';
import { confirmer } from '../core/confirmation.mjs';
import { toutArreter } from './animations-moteur.mjs';

export const routes = [
  ['POST', '/api/actions/all-off', async (c) => {
    const body = await c.corps();
    if (body.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
    toutArreter('Tout OFF'); // V1.5 : toutes les animations arretees, sans retour a l'etat de depart
    const targets = (await lister()).filter((d) => d.state.on === true);
    // Lumieres : UNE commande par piece (le hub les applique toutes ensemble : ~90 ms mesure).
    const parPiece = new Map();
    for (const t of targets) if (t.type === 'light' && t.reachable && t.room && !parPiece.has(t.room.id)) parPiece.set(t.room.id, t);
    const roomOk = {};
    await Promise.all([...parPiece].map(async ([rid, d0]) => {
      try { await piece(d0, 'light', { on: false }); roomOk[rid] = true; } catch (e) { roomOk[rid] = false; }
    }));
    const failed = [];
    let individuels = 0;
    for (const t of targets) { // prises, lumieres sans piece, pieces en echec : une commande par appareil
      if (t.type === 'light' && t.reachable && t.room && roomOk[t.room.id]) continue;
      individuels++;
      try {
        if (!t.reachable) throw new Error('indisponible');
        await appliquer(t, { on: false });
      } catch (e) { failed.push({ id: t.id, name: t.name, reason: 'commande non reçue' }); }
    }
    // Commande de piece partielle : reprise appareil par appareil (une fois), apres une relecture 1 s apres l'envoi
    const { apres: after, restants, relances } = await confirmer({
      cibles: targets,
      enEcart: (t, cur) => !!cur && cur.isOn === true && !failed.some((f) => f.id === t.id),
      reprendre: (t) => appliquer(t, { on: false }),
    });
    restants.forEach((t) => failed.push({ id: t.id, name: t.name, reason: 'toujours ON' }));
    log('all-off pièces:', parPiece.size, 'individuels:', individuels, 'relances:', relances, 'échecs:', failed.length);
    c.envoyer(failed.length ? 207 : 200, { ok: failed.length === 0, requested: targets.length, failed, devices: after });
  }],
];
// FIN
