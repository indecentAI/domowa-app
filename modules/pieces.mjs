// @zone appareils | Route ON/OFF d'une piece {on, kind: light|outlet} : commande de piece native, relue apres 1 s, reprise appareil par appareil si besoin (core/confirmation.mjs) ; journal "room-power".
import { HttpError } from '../core/http.mjs';
import { log } from '../core/outils.mjs';
import { lister, appliquer, piece } from '../core/appareils.mjs';
import { estOnOff } from '../core/modele.mjs';
import { confirmer } from '../core/confirmation.mjs';
import { liberer } from './animations-moteur.mjs';

export const routes = [
  ['POST', /^\/api\/rooms\/([A-Za-z0-9_-]{1,80})\/power$/, async (c) => {
    const body = await c.corps();
    if (typeof body.on !== 'boolean') throw new HttpError(400, 'Valeur "on" booléenne requise.');
    if (body.kind !== undefined && body.kind !== 'light' && body.kind !== 'outlet') throw new HttpError(400, 'Type "light" ou "outlet" requis.');
    const kind = body.kind === 'outlet' ? 'outlet' : 'light';
    // Identifiant de piece valide contre l'inventaire : on ne commande que les appareils de ce type dans cette piece.
    const before = (await lister()).filter((d) => estOnOff(d) && d.type === kind && d.room && d.room.id === c.m[1]);
    if (!before.length) throw new HttpError(404, 'Pièce inconnue ou sans appareil de ce type.');
    liberer(before.map((d) => d.id)); // V1.5 : lampes de la piece retirees des animations
    let roomOk = true;
    try { await piece(before[0], kind, { on: body.on }); } catch (e) { roomOk = false; }
    // Commande de piece absente ou partielle : reprise appareil par appareil (une fois), apres une relecture 1 s apres l'envoi
    const { apres: after, restants: rest, relances } = await confirmer({
      cibles: before,
      enEcart: (t, cur) => t.reachable && (cur || {}).isOn !== body.on,
      reprendre: (t) => appliquer(t, { on: body.on }),
    });
    log('room-power', kind, body.on ? 'ON' : 'OFF', 'pièce:', roomOk, 'relances:', relances, 'échecs:', rest.length);
    c.envoyer(rest.length ? 207 : 200, {
      ok: rest.length === 0, requested: before.length,
      failed: rest.map((t) => ({ id: t.id, name: t.name, reason: 'état non confirmé' })), devices: after,
    });
  }],
];
// FIN
