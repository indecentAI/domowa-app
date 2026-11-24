// @zone homeassistant | Registre de Home Assistant par l'API WebSocket (V2.1), lecture seule : entites (config/entity_registry/list_for_display, documente), appareils (config/device_registry/list)
// et zones (config/area_registry/list) : ces deux-la absents de la page officielle, lus dans le code de HA (components/config/device_registry.py, area_registry.py, 19/11/2026 : listes sans
// droit d'administration ; champs : helpers/device_registry.py dict_repr, helpers/area_registry.py json_fragment). Documentation de l'API WebSocket (contributors.home-assistant.io,
// core/internals/websocket-api, lue le 19/11/2026) : /api/websocket, auth_required -> {type: 'auth', access_token} -> auth_ok | auth_invalid, puis commandes {id croissant, type} -> {id, type: 'result', success, result}.
// Toujours avec jeton (cible() de connexion.mjs : sans jeton, aucune connexion) ; auth est le premier message envoye. Une connexion a la fois (appels simultanes : meme reponse), delai court
// (6 s), message de 8 Mo au plus, ferme apres les trois reponses. Erreurs : codes HA_* sans message d'origine (jamais le jeton ni l'adresse). WebSocket global (Node 22) ; absent (Node 20) : null.
import { cible, portValide } from './connexion.mjs';
import { privee } from '../../core/reseau.mjs';

export const COMMANDES = Object.freeze({ 1: ['entites', 'config/entity_registry/list_for_display'], 2: ['appareils', 'config/device_registry/list'], 3: ['zones', 'config/area_registry/list'] });
const MAX = 8 * 1024 * 1024;
const erreurCode = (code) => Object.assign(new Error(code), { code });

// Dialogue avec un serveur WebSocket de Home Assistant (url ws://adresse:port/api/websocket) -> {entites, appareils, zones} (null pour une commande refusee ; entites refusees : HA_REFUS).
export function dialoguer(url, jeton, { delai = 6000, WS = globalThis.WebSocket } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof jeton !== 'string' || !jeton) { reject(erreurCode('HA_JETON_ABSENT')); return; }
    if (typeof WS !== 'function') { reject(erreurCode('HA_WEBSOCKET')); return; }
    let ws = null, fini = false, auth = false;
    const res = {};
    const fin = (e, v) => {
      if (fini) return; fini = true; clearTimeout(minuteur);
      try { if (ws) ws.close(); } catch (x) { /* deja fermee */ }
      if (e) reject(e); else resolve(v);
    };
    const minuteur = setTimeout(() => fin(erreurCode('HA_DELAI')), delai);
    try { ws = new WS(url); } catch (e) { fin(erreurCode('HA_RESEAU')); return; }
    ws.onerror = () => fin(erreurCode('HA_RESEAU'));
    ws.onclose = () => fin(erreurCode('HA_RESEAU'));
    ws.onmessage = (ev) => {
      const t = typeof ev.data === 'string' ? ev.data : null;
      if (t === null) { fin(erreurCode('HA_REPONSE')); return; }
      if (t.length > MAX) { fin(erreurCode('HA_TROP')); return; }
      let m;
      try { m = JSON.parse(t); } catch (e) { fin(erreurCode('HA_REPONSE')); return; }
      if (!m || typeof m !== 'object') { fin(erreurCode('HA_REPONSE')); return; }
      if (!auth) {
        if (m.type === 'auth_required') { ws.send(JSON.stringify({ type: 'auth', access_token: jeton })); return; }
        if (m.type === 'auth_ok') { auth = true; for (const [id, [, type]] of Object.entries(COMMANDES)) ws.send(JSON.stringify({ id: Number(id), type })); return; }
        fin(erreurCode(m.type === 'auth_invalid' ? 'HA_JETON' : 'HA_REPONSE')); return;
      }
      const c = m.type === 'result' && COMMANDES[m.id];
      if (!c) return;
      if (m.success !== true && c[0] === 'entites') { fin(erreurCode('HA_REFUS')); return; }
      res[c[0]] = m.success === true ? m.result : null;
      if (Object.keys(res).length === Object.keys(COMMANDES).length) fin(null, res);
    };
  });
}

// Registre du Home Assistant configure ; null sans WebSocket global (Node 20 : repli sans registre). Erreur (code HA_*) sinon : l'appelant se replie sans registre.
let enCours = null;
export function lireRegistre(opts = {}) {
  if (typeof (opts.WS || globalThis.WebSocket) !== 'function') return Promise.resolve(null);
  if (enCours) return enCours;
  enCours = (async () => {
    const t = cible();
    if (!privee(t.adresse) || !portValide(t.port)) throw erreurCode('HA_ADRESSE');
    return dialoguer('ws://' + t.adresse + ':' + t.port + '/api/websocket', t.jeton, opts);
  })().finally(() => { enCours = null; });
  return enCours;
}
// FIN
