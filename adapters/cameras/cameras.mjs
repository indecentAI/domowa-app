// @zone cameras
// cameras.mjs : flux des caméras RTSP (Tapo) converti par ffmpeg en MP4 fragmenté H.264 + AAC, lu par une balise <video>.
// Routes : GET /api/cameras (id, nom, ptz, hd, etat en_ligne|hors_ligne|inconnu, motif (V1.7, sonde.mjs) ; sans IP ni mot de passe ; nom = title, sinon user du secret, sinon name), GET /api/cameras/:id/stream[?q=hd] (lecture seule ; HD si path_hd),
// POST /api/cameras/:id/move {dir: left|right|up|down|stop} : mouvement de la caméra par ONVIF (port 2020), liste fermée, vitesse fixe, arrêt automatique de sécurité.
// Recherche, ajout et secrets : cameras-gestion.mjs ; adaptateur (modele commun, routes) : index.mjs. Routes au format du routeur (core/routeur.mjs : routes = [[methode, chemin, async (c) => objet]],
// checkWrite automatique sur POST) ; le flux repond lui-meme sur c.res (aucun objet renvoye).
// Données : donnees/cameras.json (id, name, host, path, ptz, title?, path_hd?, rtsp_port?, onvif_port?), donnees/camera-secrets/<id>.json (user, pwd). Aucun mot de passe dans les réponses, les erreurs ni le journal.
// Le journal indique pourquoi chaque flux s'est arrêté : navigateur (page fermée ou flux remplacé), silence, démarrage trop long, ou fin de ffmpeg (avec les derniers avertissements de ffmpeg).
// Un nouveau flux d'une caméra ne démarre qu'une fois l'ancien ffmpeg terminé (une seule session RTSP à la fois : la caméra refuse les connexions rapprochées).
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { HttpError } from '../../core/http.mjs';
import { ID_RE } from '../../core/modele.mjs';
import { lireJson, log } from '../../core/outils.mjs';
import { PATH_RE, secretDe, nomDe, routesGestion } from './cameras-gestion.mjs';
import { sonde, REPOS } from './sonde.mjs';

export { nomDe };

// PATH_RE (chemin RTSP) : voir cameras-gestion.mjs
const MAX_FLUX = 2;
const DEMARRAGE_MS = 15000;
const SILENCE_MS = 7000; // ffmpeg n'envoie plus rien depuis 7 s (caméra déconnectée) : arrêt ; le compteur est suspendu tant que le navigateur ne lit pas
const HORLOGE = false; // true : horodatage par l'horloge de la tablette (à essayer si microcoupures ou son décalé)
const actifs = new Map(); // id caméra -> { proc, res }
const demandes = new Map(); // id caméra -> numéro de la dernière demande de flux (une demande plus récente annule la précédente)
let numero = 0;
const finis = new Map(); // id caméra -> fin du dernier flux (V1.7 : aucune sonde de joignabilité pendant un flux ni dans les 10 s qui suivent)
sonde.occupation((id) => actifs.has(id) || Date.now() - (finis.get(id) || 0) < REPOS);
const ONVIF_PORT = 2020;
const VITESSE = 0.5; // vitesse normalisée (0 à 1) ; si une direction est inversée sur une autre caméra, changer le signe ici
const DIRS = { left: [-VITESSE, 0], right: [VITESSE, 0], up: [0, VITESSE], down: [0, -VITESSE] };
const NS = { tds: 'http://www.onvif.org/ver10/device/wsdl', trt: 'http://www.onvif.org/ver10/media/wsdl', tptz: 'http://www.onvif.org/ver20/ptz/wsdl', tt: 'http://www.onvif.org/ver10/schema' };
const infosCache = new Map(); // id caméra -> { host, media, ptz, token, t }
const files = new Map(); // id caméra -> dernière commande en cours (les commandes d'une caméra partent dans l'ordre)

export function cameras() {
  const j = lireJson('cameras.json', null);
  if (!Array.isArray(j)) return [];
  return j.filter((c) => c && ID_RE.test(String(c.id)) && /^[0-9.]{7,15}$/.test(String(c.host)) && PATH_RE.test(String(c.path)));
}
// Chemin du flux haute définition (cameras.json : "path_hd": "stream1") ; null si absent ou invalide.
export function cheminHd(cam) { return typeof cam.path_hd === 'string' && PATH_RE.test(cam.path_hd) ? cam.path_hd : null; }
function input(cam, sec, chemin) {
  const enc = encodeURIComponent;
  return ['-rtsp_transport', 'tcp', '-fflags', '+nobuffer+genpts'].concat(
    HORLOGE ? ['-use_wallclock_as_timestamps', '1'] : [],
    ['-i', 'rtsp://' + enc(sec.user) + ':' + enc(sec.pwd) + '@' + cam.host + ':' + (Number(cam.rtsp_port) || 554) + '/' + chemin]);
}
function enveloppe(sec, corps) {
  const nonce = crypto.randomBytes(16), created = new Date().toISOString();
  const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(sec.pwd)])).digest('base64');
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return '<?xml version="1.0" encoding="utf-8"?><soap-env:Envelope xmlns:soap-env="http://www.w3.org/2003/05/soap-envelope"><soap-env:Header>' +
    '<Security xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><UsernameToken><Username>' + esc(sec.user) + '</Username>' +
    '<Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">' + digest + '</Password>' +
    '<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' + nonce.toString('base64') + '</Nonce>' +
    '<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">' + created + '</Created></UsernameToken></Security>' +
    '</soap-env:Header><soap-env:Body>' + corps + '</soap-env:Body></soap-env:Envelope>';
}
// Appel SOAP vers la caméra uniquement (l'adresse du service doit être celle de la caméra).
function soap(cam, sec, url, corps) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(new Error('URL de service invalide')); }
    if (u.hostname !== cam.host) return reject(new Error('adresse de service refusée'));
    const data = Buffer.from(enveloppe(sec, corps));
    const r = http.request({ host: cam.host, port: Number(u.port) || Number(cam.onvif_port) || ONVIF_PORT, path: u.pathname, method: 'POST', timeout: 8000,
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': data.length } }, (res) => {
      let b = ''; res.on('data', (d) => { if (b.length < 20000) b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('timeout', () => { r.destroy(new Error('délai dépassé')); });
    r.on('error', (e) => reject(new Error(e.code || e.message)));
    r.end(data);
  });
}
const xaddr = (b, bloc) => { const m = new RegExp('<[^>]*' + bloc + '[^>]*>[\\s\\S]*?XAddr>([^<]+)<').exec(b); return m ? m[1].trim() : null; };
async function onvifInfos(cam, sec) {
  const c = infosCache.get(cam.id);
  if (c && c.host === cam.host && Date.now() - c.t < 600000) return c;
  const cap = await soap(cam, sec, 'http://' + cam.host + ':' + (Number(cam.onvif_port) || ONVIF_PORT) + '/onvif/device_service', '<tds:GetCapabilities xmlns:tds="' + NS.tds + '"><tds:Category>All</tds:Category></tds:GetCapabilities>');
  if (cap.status !== 200) throw new Error('GetCapabilities HTTP ' + cap.status);
  const media = xaddr(cap.body, 'Media'), ptz = xaddr(cap.body, 'PTZ');
  if (!media || !ptz) throw new Error('services Media/PTZ introuvables');
  const prof = await soap(cam, sec, media, '<trt:GetProfiles xmlns:trt="' + NS.trt + '"/>');
  if (prof.status !== 200) throw new Error('GetProfiles HTTP ' + prof.status);
  const m = /Profiles[^>]*\stoken="([^"]+)"/.exec(prof.body);
  if (!m) throw new Error('aucun profil');
  const infos = { host: cam.host, media, ptz, token: m[1], t: Date.now() };
  infosCache.set(cam.id, infos);
  return infos;
}
async function commande(cam, sec, dir) {
  const i = await onvifInfos(cam, sec);
  const corps = dir === 'stop'
    ? '<tptz:Stop xmlns:tptz="' + NS.tptz + '"><tptz:ProfileToken>' + i.token + '</tptz:ProfileToken><tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>'
    : '<tptz:ContinuousMove xmlns:tptz="' + NS.tptz + '" xmlns:tt="' + NS.tt + '"><tptz:ProfileToken>' + i.token + '</tptz:ProfileToken><tptz:Velocity><tt:PanTilt x="' + DIRS[dir][0] + '" y="' + DIRS[dir][1] + '"/></tptz:Velocity><tptz:Timeout>PT3S</tptz:Timeout></tptz:ContinuousMove>';
  const r = await soap(cam, sec, i.ptz, corps);
  if (r.status !== 200) throw new Error('PTZ HTTP ' + r.status);
}
async function avecReprise(cam, fn) {
  try { return await fn(); } catch (e) { infosCache.delete(cam.id); return await fn(); } // adresse ou profil périmés : une redécouverte, un seul nouvel essai
}
async function commandeAvecReprise(cam, sec, dir) { await avecReprise(cam, () => commande(cam, sec, dir)); }
function enfiler(id, fn) {
  const p = (files.get(id) || Promise.resolve()).catch(() => {}).then(fn);
  files.set(id, p);
  return p;
}
// Coupe le flux en cours d'une caméra ; la promesse se termine quand ffmpeg a quitté (3 s au plus).
function stop(id) {
  const e = actifs.get(id);
  if (!e) return Promise.resolve();
  actifs.delete(id); finis.set(id, Date.now());
  e.res.destroy();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 3000);
    e.proc.once('close', () => { clearTimeout(t); resolve(); });
    e.proc.kill('SIGTERM');
    setTimeout(() => e.proc.kill('SIGKILL'), 2000).unref();
  });
}
function start(cam, sec, res, hd) {
  const args = ['-hide_banner', '-loglevel', 'warning', ...input(cam, sec, hd ? cheminHd(cam) : cam.path),
    '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '48k', '-ar', '16000', '-ac', '1',
    '-max_muxing_queue_size', '1024', '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '500000', '-flush_packets', '1', '-f', 'mp4', 'pipe:1'];
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const secrets = [sec.pwd, encodeURIComponent(sec.pwd), sec.user, encodeURIComponent(sec.user)].filter((s) => s.length > 2);
  const mask = (t) => { let o = String(t); for (const s of secrets) o = o.split(s).join('***'); return o; };
  const entry = { proc, res };
  const t0 = Date.now();
  let err = '', bytes = 0, started = false, timer = null, why = 'fin de ffmpeg';
  actifs.set(cam.id, entry);
  const kill = (w) => { if (why === 'fin de ffmpeg') why = w; proc.kill('SIGTERM'); setTimeout(() => proc.kill('SIGKILL'), 2000).unref(); };
  const arm = (ms, w) => { clearTimeout(timer); timer = setTimeout(() => kill(w), ms); };
  const fail = (status, message) => {
    if (res.headersSent) return res.end();
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: message }));
  };
  arm(DEMARRAGE_MS, 'démarrage trop long');
  proc.stdout.on('data', (d) => {
    arm(SILENCE_MS, 'silence de la caméra');
    bytes += d.length;
    if (!started) {
      started = true;
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none', 'X-Content-Type-Options': 'nosniff' });
    }
    if (!res.write(d)) {
      clearTimeout(timer); // le navigateur ne lit plus : ce n'est pas un silence de la caméra
      proc.stdout.pause();
      res.once('drain', () => { proc.stdout.resume(); arm(SILENCE_MS, 'silence de la caméra'); });
    }
  });
  proc.stderr.on('data', (d) => { err = (err + mask(d)).slice(-600); }); // garde la fin des avertissements de ffmpeg
  proc.on('error', () => { clearTimeout(timer); if (actifs.get(cam.id) === entry) actifs.delete(cam.id); fail(500, 'ffmpeg introuvable ou non lançable.'); });
  proc.on('close', (code, signal) => {
    clearTimeout(timer);
    if (actifs.get(cam.id) === entry) actifs.delete(cam.id);
    finis.set(cam.id, Date.now());
    if (!started) fail(504, 'La caméra ne répond pas (flux non reçu).'); else res.end();
    log('camera', cam.id + (hd ? ' (HD)' : ''), started ? 'fin' : 'échec', 'raison:', why, 'sortie:', code === null ? signal : code, 'octets:', bytes, 'durée:', Math.round((Date.now() - t0) / 1000) + ' s', mask(err).replace(/\s+/g, ' ').slice(-300));
  });
  res.on('close', () => kill('navigateur (page fermée, arrêt ou flux remplacé)'));
}

function secret(cam) {
  const sec = secretDe(cam.id);
  if (!sec) throw new HttpError(500, 'Identifiants de la caméra absents.');
  return sec;
}
const trouver = (id) => { const cam = cameras().find((c) => c.id === id); if (!cam) throw new HttpError(404, 'Caméra inconnue.'); return cam; };

async function flux(c) {
  const { req, res } = c;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Origine refusée.');
  const cam = trouver(c.m[1]);
  const sec = secret(cam);
  let q = null;
  try { q = new URL(req.url, 'http://x').searchParams.get('q'); } catch (e) { q = null; }
  const hd = q === 'hd';
  if (hd && !cheminHd(cam)) throw new HttpError(400, 'Flux haute définition non configuré pour cette caméra.');
  const mien = ++numero;
  demandes.set(cam.id, mien);
  await stop(cam.id);
  if (demandes.get(cam.id) !== mien || res.destroyed || req.destroyed) { res.destroy(); return; } // remplacée ou abandonnée pendant l'attente
  if (actifs.size >= MAX_FLUX) throw new HttpError(503, 'Trop de flux ouverts.');
  start(cam, sec, res, hd); // repond lui-meme (video/mp4, ou erreur JSON si ffmpeg echoue avant la premiere image)
}
async function mouvement(c) {
  const body = await c.corps();
  const cam = trouver(c.m[1]);
  if (cam.ptz === false) throw new HttpError(400, 'Cette caméra ne pivote pas.');
  if (typeof body.dir !== 'string' || !(body.dir === 'stop' || Object.prototype.hasOwnProperty.call(DIRS, body.dir))) throw new HttpError(400, 'Direction invalide (left, right, up, down ou stop).');
  const sec = secret(cam);
  try { await enfiler(cam.id, () => commandeAvecReprise(cam, sec, body.dir)); }
  catch (e) {
    const masque = String(e.message).split(sec.pwd).join('***').split(sec.user).join('***');
    log('camera', cam.id, 'mouvement', body.dir, 'refusé :', masque.slice(0, 200));
    throw new HttpError(502, 'La caméra n\'a pas accepté la commande de mouvement.');
  }
  return { ok: true };
}

// Recherche, ajout, renommage et suppression (cameras-gestion.mjs) d'abord, comme avant ; la suppression coupe le flux de la camera (stop).
export const routes = routesGestion(stop).concat([
  ['GET', '/api/cameras', async () => {
    const l = cameras();
    await sonde.actualiser(l, true); // V1.7 : etat de chaque camera (sonde.mjs) ; attente bornee a la premiere lecture seulement
    return { cameras: l.map((c) => Object.assign({ id: c.id, name: nomDe(c), ptz: c.ptz !== false, hd: cheminHd(c) !== null }, sonde.etat(c))) };
  }],
  ['GET', /^\/api\/cameras\/([A-Za-z0-9_-]{1,80})\/stream$/, flux],
  ['POST', /^\/api\/cameras\/([A-Za-z0-9_-]{1,80})\/move$/, mouvement],
]);
// FIN
