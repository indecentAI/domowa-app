// @zone distant | Routes du mode distant (V1.8) : POST /api/appairage {code, nom} (ecoute reseau, sans jeton : pose le cookie « domowa »), POST /api/appairage/code (ecoute locale ou client autorise : code a 8 chiffres, 5 min), GET /api/clients (mode, adresse a ouvrir, empreinte du certificat, version installee, appareils autorises), POST /api/clients/:id/revoquer {confirm: true}, POST /api/serveur/mode {mode, adresse?, port?, confirm} (V1.9 revision 2 : ecoute locale seulement, sans redemarrage). Regles : core/acces.mjs ; etat de l'ecoute : core/serveur.mjs.
import { HttpError } from '../core/http.mjs';
import { acces, cookie, cookieEfface, MAX_CLIENTS } from '../core/acces.mjs';
import { etat, changerEcoute, adressesMachine, privee, portValide, PORT_DEFAUT } from '../core/serveur.mjs';
import { versionInstallee } from '../core/outils.mjs';

// V1.9 (revision) : version installee (VERSION, lue au demarrage) aussi dans GET /api/clients : l'APK la lit ici, car GET /api/status
// repond 409 tant qu'aucun hub n'est configure (serveur neuf). Sans VERSION : null.
const VERSION = versionInstallee();

const maintenant = () => new Date().toISOString();
// Reponse de GET /api/clients (et des ecritures) : sans secret. distant : la demande vient de l'ecoute reseau.
// V1.9 revision 2 : modifiable (le mode se change d'ici : ecoute locale, machine du serveur), adresses (IPv4 privees de la machine, proposees ;
// [] si le systeme refuse la liste, Android) et port ; seulement pour l'ecoute locale.
function reponse(req) {
  const e = etat(), local = !req.distant;
  return {
    serveur: { mode: e.mode, ecoute: e.ecoute, url: e.mode === 'distant' ? e.url : null, empreinte: e.ecoute ? e.empreinte : null, motif: e.motif, version: VERSION,
      modifiable: local, adresses: local ? adressesMachine() : null, port: e.mode === 'distant' ? e.port : PORT_DEFAUT },
    distant: !!req.distant, clients: acces.lister(req.client ? req.client.id : null), max: MAX_CLIENTS, lisible: acces.lisible(), code: acces.codeEnCours(), time: maintenant(),
  };
}
// POST /api/serveur/mode {mode: local | distant, adresse?, port? (8443 par defaut), confirm: true} (V1.9 revision 2) : ecoute locale seulement (403 depuis
// un autre appareil) ; distant : adresse IPv4 privee de cette machine (si le systeme donne la liste), port de 1024 a 65535 ; changement sans redemarrage
// (core/serveur.mjs changerEcoute) ; refus : 409 avec le motif, rien n'est change. Rend la reponse de GET /api/clients.
async function changerMode(c) {
  const b = await c.corps();
  if (c.req.distant) throw new HttpError(403, 'Le mode se change sur la machine du serveur, pas depuis un autre appareil.');
  if (b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
  const e = etat();
  let cible;
  if (b.mode === 'local') {
    if (e.mode === 'local') throw new HttpError(409, 'Le serveur est déjà réservé à cette machine.');
    cible = { mode: 'local' };
  } else if (b.mode === 'distant') {
    const adresse = typeof b.adresse === 'string' ? b.adresse.trim() : '', port = b.port === undefined || b.port === null || b.port === '' ? PORT_DEFAUT : Number(b.port);
    if (!privee(adresse)) throw new HttpError(400, 'Adresse refusée : il faut l\'adresse de cette machine sur le Wi-Fi de la maison, une adresse privée (exemple : 192.168.1.20).');
    if (!portValide(port)) throw new HttpError(400, 'Port refusé : nombre entier de 1024 à 65535 (8443 par défaut).');
    const dispo = adressesMachine();
    if (dispo.length && !dispo.includes(adresse)) throw new HttpError(409, 'Cette adresse n\'est pas celle de cette machine (' + dispo.join(', ') + '). Rien n\'a été changé.');
    if (e.mode === 'distant' && e.ecoute && e.adresse === adresse && e.port === port) throw new HttpError(409, 'Le serveur est déjà ouvert à cette adresse et sur ce port.');
    cible = { mode: 'distant', adresse, port };
  } else throw new HttpError(400, 'Mode inconnu.');
  const r = await changerEcoute(cible);
  if (!r.ok) throw new HttpError(409, r.motif);
  return reponse(c.req);
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
  ['POST', '/api/serveur/mode', changerMode],
  ['POST', /^\/api\/clients\/([a-z0-9]{8})\/revoquer$/, async (c) => {
    const b = await c.corps();
    if (b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
    acces.revoquer(c.m[1]);
    if (c.req.client && c.req.client.id === c.m[1]) { c.res.setHeader('Set-Cookie', cookieEfface()); c.req.client = null; }
    return reponse(c.req);
  }],
];
// FIN
