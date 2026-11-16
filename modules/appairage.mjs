// @zone distant | Routes du mode distant (V1.8) : POST /api/appairage {code, nom} (ecoute reseau, sans jeton : pose le cookie « domowa »), POST /api/appairage/code (ecoute locale ou client autorise : code a 8 chiffres, 5 min), GET /api/clients (mode, adresse a ouvrir, empreinte du certificat, version installee, appareils autorises), POST /api/clients/:id/revoquer {confirm: true}. Regles : core/acces.mjs ; etat de l'ecoute : core/serveur.mjs.
import { HttpError } from '../core/http.mjs';
import { acces, cookie, cookieEfface, MAX_CLIENTS } from '../core/acces.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { etat } from '../core/serveur.mjs';
import { DIR } from '../core/outils.mjs';

// V1.9 (revision) : version installee (VERSION, lue au demarrage) aussi dans GET /api/clients : l'APK la lit ici, car GET /api/status
// repond 409 tant qu'aucun hub n'est configure (serveur neuf). Sans VERSION : null.
let VERSION = null;
try { VERSION = fs.readFileSync(path.join(DIR, 'VERSION'), 'utf8').trim().slice(0, 20) || null; } catch { /* sans VERSION */ }

const maintenant = () => new Date().toISOString();
// Reponse de GET /api/clients (et des ecritures) : sans secret. distant : la demande vient de l'ecoute reseau.
function reponse(req) {
  const e = etat();
  return {
    serveur: { mode: e.mode, ecoute: e.ecoute, url: e.mode === 'distant' ? e.url : null, empreinte: e.ecoute ? e.empreinte : null, motif: e.motif, version: VERSION },
    distant: !!req.distant, clients: acces.lister(req.client ? req.client.id : null), max: MAX_CLIENTS, lisible: acces.lisible(), code: acces.codeEnCours(), time: maintenant(),
  };
}
const ouvert = () => { const e = etat(); if (e.mode !== 'distant') throw new HttpError(409, 'Mode local : aucun autre appareil ne peut se connecter.'); if (!e.ecoute) throw new HttpError(409, e.motif || 'L\'accès réseau n\'est pas ouvert.'); };

export const routes = [
  ['POST', '/api/appairage', async (c) => {
    if (!c.req.distant) throw new HttpError(400, 'Sur la machine du serveur, aucun appairage n\'est nécessaire.');
    if (c.req.client) throw new HttpError(409, 'Cet appareil est déjà autorisé.');
    const b = await c.corps();
    const r = acces.appairer(b.code, b.nom);
    c.res.setHeader('Set-Cookie', cookie(r.jeton));
    return { ok: true, client: r.client, time: maintenant() };
  }],
  ['POST', '/api/appairage/code', async (c) => { await c.corps(); ouvert(); return { ...acces.demanderCode(), time: maintenant() }; }],
  ['GET', '/api/clients', async (c) => reponse(c.req)],
  ['POST', /^\/api\/clients\/([a-z0-9]{8})\/revoquer$/, async (c) => {
    const b = await c.corps();
    if (b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
    acces.revoquer(c.m[1]);
    if (c.req.client && c.req.client.id === c.m[1]) { c.res.setHeader('Set-Cookie', cookieEfface()); c.req.client = null; }
    return reponse(c.req);
  }],
];
// FIN
