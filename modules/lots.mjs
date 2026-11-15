// @zone lumieres | Commande groupee POST /api/lights/apply {ids, settings} et executer(items) : 10 envois en parallele, ecart 200 ms, ordre par colonnes puis lignes du plan, verification apres 1 s (core/confirmation.mjs). Utilise aussi par scenarios.mjs.
import { HttpError } from '../core/http.mjs';
import { sleep, log } from '../core/outils.mjs';
import { lister, appliquer } from '../core/appareils.mjs';
import { reglage, ID_RE } from '../core/modele.mjs';
import { confirmer } from '../core/confirmation.mjs';
import { lireLayout } from './plan.mjs';
import { liberer } from './animations-moteur.mjs';

const CONC = 10, STAGGER = 200, TOL = 2.5;

export function verifierIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 30 || !ids.every((i) => typeof i === 'string' && ID_RE.test(i))) {
    throw new HttpError(400, 'Liste de lumières invalide.');
  }
}

// Par piece : colonnes de droite a gauche (tolerance 2,5 %), puis de haut en bas ; les appareils non places a la fin.
function trier(items, devs) {
  const layout = lireLayout();
  const rows = items.map((it, i) => {
    const n = devs.find((l) => l.id === it.id);
    const room = n && n.room ? n.room.id : 'none';
    const pos = layout[room] && layout[room][it.id];
    return { it, i, room, x: pos ? pos.x : null, y: pos ? pos.y : null };
  });
  const out = [];
  for (const room of Array.from(new Set(rows.map((r) => r.room))).sort()) {
    const grp = rows.filter((r) => r.room === room);
    const cols = [];
    for (const r of grp.filter((q) => q.x !== null).sort((a, b) => b.x - a.x || a.i - b.i)) {
      const last = cols[cols.length - 1];
      if (last && last.ref - r.x <= TOL) last.items.push(r);
      else cols.push({ ref: r.x, items: [r] });
    }
    for (const c of cols) {
      c.items.sort((a, b) => a.y - b.y || a.i - b.i);
      for (const r of c.items) out.push(r.it);
    }
    for (const r of grp.filter((q) => q.x === null)) out.push(r.it);
  }
  return out;
}

// items = [{id, name?, st}] -> {failed, devices (format ancien), requested}
export async function executer(items) {
  liberer(items.map((it) => it.id)); // V1.5 : lampes retirees des animations en cours
  const devs = await lister();
  items = trier(items, devs);
  log("ordre d'envoi :", items.map((it) => { const q = devs.find((l) => l.id === it.id); return q ? q.name : it.id; }).join(' > '));
  const failed = [];
  const T0 = Date.now();
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next;
      const it = items[next++];
      if (idx > 0 && idx < CONC) await sleep(idx * STAGGER);
      const n = devs.find((l) => l.id === it.id);
      if (!n) { failed.push({ id: it.id, name: it.name || it.id, reason: 'lumière introuvable' }); continue; }
      if (!n.reachable) { failed.push({ id: n.id, name: n.name, reason: 'indisponible' }); continue; }
      const t0 = Date.now();
      try { await appliquer(n, it.st); console.log('  ' + n.name + ' : envoyé à +' + (t0 - T0) + ' ms, terminé en ' + (Date.now() - t0) + ' ms'); }
      catch (e) { failed.push({ id: n.id, name: n.name, reason: 'commande non reçue' }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, worker));
  // Verification 1 s apres (sans reprise) : etat ON/OFF demande et non confirme, appareil joignable et non deja en echec
  const { apres: after, restants } = await confirmer({
    cibles: items,
    enEcart: (it, cur) => it.st.on !== undefined && !!cur && cur.reachable && cur.isOn !== it.st.on && !failed.some((f) => f.id === it.id),
  });
  for (const it of restants) { const cur = after.find((a) => a.id === it.id); failed.push({ id: cur.id, name: cur.name, reason: 'état non confirmé' }); }
  return { failed, devices: after, requested: items.length };
}
export function repondre(c, r, plus) {
  c.envoyer(r.failed.length ? 207 : 200, { ...(plus || {}), ok: r.failed.length === 0, requested: r.requested, failed: r.failed, devices: r.devices });
}

export const routes = [
  ['POST', '/api/lights/apply', async (c) => {
    const body = await c.corps();
    verifierIds(body.ids);
    const st = reglage(body.settings);
    repondre(c, await executer(body.ids.map((id) => ({ id, st }))));
  }],
];
// FIN
