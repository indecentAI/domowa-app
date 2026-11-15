// @zone cameras-ajout
// cameras-gestion.mjs : gestion des cameras (recherche, ajout, renommage, suppression) et secrets par camera.
// Donnees : donnees/cameras.json (sans secret) ; donnees/camera-secrets/<id>.json (user, pwd ; dossier 700, fichiers 600 ; jamais servi, journalise ni archive).
// Routes (routesGestion(stopFlux), ajoutees par cameras.mjs ; format du routeur, checkWrite automatique sur POST) : POST|GET /api/cameras/discover, POST /api/cameras/discover/cancel, GET /api/cameras/list (V1.7 : etat, motif de sonde.mjs),
// POST /api/cameras/add {ip, user, pwd, title?, chemin?, rtspPort?, onvifPort?, test?}, POST /api/cameras/:id/rename {title}, POST /api/cameras/:id/delete {confirm}.
// Le mot de passe n'apparait dans aucune reponse ni dans le journal (il est dans la ligne de commande de ffprobe pendant le test, comme pour ffmpeg).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../../core/http.mjs';
import { ID_RE } from '../../core/modele.mjs';
import { DONNEES, lireJson, log } from '../../core/outils.mjs';
import { lancer, liste, adresseLocale, estIPv4 } from './decouverte.mjs';
import { sonde as joignabilite } from './sonde.mjs';

const require = createRequire(import.meta.url);
const ICI = path.dirname(fileURLToPath(import.meta.url)); // adapters/cameras/ (cameras-marques.json)
const SECRETS = path.join(DONNEES, 'camera-secrets');
export const PATH_RE = /^(?!.*\.\.)[A-Za-z0-9_\-\/.?=&]{1,100}$/;
let jobCourant = null;
let ajoutEnCours = false;

// ---------- fichiers ----------
function ecrire(fichier, texte, mode) { const t = fichier + '.tmp'; fs.writeFileSync(t, texte, { mode }); fs.renameSync(t, fichier); }
function lireCameras() { const j = lireJson('cameras.json', null); return Array.isArray(j) ? j.filter((c) => c && ID_RE.test(String(c.id))) : []; }
function ecrireCameras(l) { ecrire(path.join(DONNEES, 'cameras.json'), JSON.stringify(l, null, 1) + '\n', 0o644); }
const fichierSecret = (id) => (ID_RE.test(String(id)) ? path.join(SECRETS, id + '.json') : null);
export function secretDe(id) {
  const f = fichierSecret(id); if (!f) return null;
  try { const s = JSON.parse(fs.readFileSync(f, 'utf8')); return s && typeof s.user === 'string' && typeof s.pwd === 'string' && s.user && s.pwd ? s : null; } catch (e) { return null; }
}
function ecrireSecret(id, sec) {
  fs.mkdirSync(SECRETS, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(SECRETS, 0o700); } catch (e) { /* droits deja bons ou non modifiables */ }
  ecrire(fichierSecret(id), JSON.stringify({ user: sec.user, pwd: sec.pwd }) + '\n', 0o600);
}
function supprimerSecret(id) { const f = fichierSecret(id); if (f) { try { fs.unlinkSync(f); } catch (e) { /* deja absent */ } } }

// ---------- test d'une camera (ONVIF puis RTSP) ----------
const erreurTest = (code, message) => { const e = new Error(message); e.code = code; return e; };
function classer(e) {
  const m = String((e && e.message) || e);
  if (/unauthor|not authori|sender not|\b401\b|auth/i.test(m)) return erreurTest('auth', 'Identifiants refus\u00e9s');
  if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNRESET|timeout|timed out/i.test(m)) return erreurTest('injoignable', 'Cam\u00e9ra injoignable');
  return erreurTest('autre', 'R\u00e9ponse ONVIF inattendue');
}
function onvifProfils(host, port, sec) {
  return new Promise((resolve, reject) => {
    let Cam; try { Cam = require('onvif').Cam; } catch (e) { return reject(erreurTest('lib', 'Biblioth\u00e8que onvif absente.')); }
    let fini = false;
    const fin = (e, v) => { if (fini) return; fini = true; clearTimeout(t); if (e) reject(e); else resolve(v); };
    const t = setTimeout(() => fin(erreurTest('injoignable', 'Cam\u00e9ra injoignable')), 20000);
    const cam = new Cam({ hostname: host, port, username: sec.user, password: sec.pwd, timeout: 8000 }, function (e) {
      if (e) return fin(classer(e));
      const tous = cam.profiles || [];
      const h264 = tous.filter((p) => p && p.videoEncoderConfiguration && /h\.?264/i.test(String(p.videoEncoderConfiguration.encoding)));
      const aire = (p) => { const r = p.videoEncoderConfiguration.resolution || {}; return (Number(r.width) || 0) * (Number(r.height) || 0); };
      h264.sort((a, b) => aire(a) - aire(b));
      if (!h264.length) return fin(erreurTest('codec', 'Aucun flux H.264'));
      const choix = [h264[0]]; if (h264.length > 1 && aire(h264[h264.length - 1]) > aire(h264[0])) choix.push(h264[h264.length - 1]);
      const ptz = tous.some((p) => p && p.PTZConfiguration);
      const uris = [];
      const suite = (i) => {
        if (i >= choix.length) return fin(null, { ptz, sd: uris[0] || null, hd: uris[1] || null });
        cam.getStreamUri({ protocol: 'RTSP', profileToken: choix[i].$ && choix[i].$.token }, function (err, st) {
          if (err || !st || !st.uri) return fin(classer(err || 'GetStreamUri'));
          try { const U = new URL(String(st.uri)); uris.push({ chemin: (U.pathname.replace(/^\//, '') + U.search).slice(0, 100), port: Number(U.port) || 554 }); } catch (x) { return fin(erreurTest('autre', 'Adresse de flux invalide')); }
          suite(i + 1);
        });
      };
      suite(0);
    });
  });
}
function sonde(host, port, chemin, sec) {
  return new Promise((resolve) => {
    const enc = encodeURIComponent;
    const url = 'rtsp://' + enc(sec.user) + ':' + enc(sec.pwd) + '@' + host + ':' + port + '/' + chemin;
    execFile('ffprobe', ['-v', 'error', '-rtsp_transport', 'tcp', '-print_format', 'json', '-show_streams', '-i', url], { timeout: 20000, maxBuffer: 1 << 20 }, (e, out, err) => {
      const texte = String(err || '');
      if (e) return resolve({ ok: false, auth: /401|unauthori/i.test(texte), absent: e.code === 'ENOENT' });
      try {
        const v = (JSON.parse(out).streams || []).find((s) => s.codec_type === 'video');
        resolve({ ok: !!v, codec: v && v.codec_name });
      } catch (x) { resolve({ ok: false }); }
    });
  });
}
function marqueDe(texte) {
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(ICI, 'cameras-marques.json'), 'utf8')); } catch (e) { j = null; }
  const l = j && Array.isArray(j.marques) ? j.marques : [];
  for (const m of l) { try { if (new RegExp(m.motif, 'i').test(texte || '')) return m; } catch (e) { /* motif invalide */ } }
  return null;
}
const AIDE = 'Cr\u00e9ez un compte de cam\u00e9ra dans l\'application du fabricant et activez ONVIF/RTSP s\'ils sont d\u00e9sactiv\u00e9s.';
async function tester(host, sec, o) {
  const marque = marqueDe(o.indice);
  const aide = marque && marque.aide ? marque.aide : AIDE;
  let onvif = null, auth = false;
  for (const port of (o.onvifPort ? [o.onvifPort] : [2020, 80, 8000])) {
    try { onvif = await onvifProfils(host, port, sec); onvif.port = port; break; }
    catch (e) { if (e.code === 'auth') { auth = true; break; } if (e.code === 'codec') throw new Error('Cette cam\u00e9ra n\'envoie pas de flux H.264 (H.265 non lisible dans Chrome). Choisissez H.264 dans ses r\u00e9glages.'); }
  }
  if (auth) throw new Error('Identifiants refus\u00e9s par la cam\u00e9ra. ' + aide);
  let sd = onvif && onvif.sd ? onvif.sd : null, hd = onvif && onvif.hd ? onvif.hd : null;
  const candidats = [];
  if (sd) candidats.push({ chemin: sd.chemin, port: sd.port });
  else {
    const port = o.rtspPort || 554;
    if (o.chemin) candidats.push({ chemin: o.chemin, port });
    else if (marque) for (const r of marque.rtsp || []) candidats.push({ chemin: r.chemin, port, qualite: r.qualite });
  }
  if (!candidats.length) throw new Error('Flux vid\u00e9o introuvable : chemin RTSP inconnu pour cette cam\u00e9ra. Utilisez \u00ab Ajouter manuellement \u00bb avec son chemin RTSP. ' + aide);
  let ok = null, vu401 = false, hors = false;
  for (const c of candidats) {
    if (!PATH_RE.test(c.chemin)) continue;
    const r = await sonde(host, c.port, c.chemin, sec);
    if (r.absent) throw new Error('ffprobe introuvable : installer le paquet ffmpeg dans Termux.');
    if (r.auth) vu401 = true;
    if (r.ok && r.codec === 'h264') { ok = c; break; }
    if (r.ok) hors = true;
  }
  if (!ok) {
    if (vu401) throw new Error('Identifiants refus\u00e9s par la cam\u00e9ra. ' + aide);
    if (hors) throw new Error('Cette cam\u00e9ra n\'envoie pas de flux H.264 (H.265 non lisible dans Chrome). Choisissez H.264 dans ses r\u00e9glages.');
    throw new Error('Cam\u00e9ra injoignable ou flux refus\u00e9 (port ' + candidats[0].port + '). V\u00e9rifiez qu\'elle est allum\u00e9e, sur le m\u00eame Wi-Fi, avec RTSP activ\u00e9. ' + aide);
  }
  if (!sd && !o.chemin && marque) { // flux HD du mod\u00e8le de la marque, s'il diff\u00e8re
    const h = (marque.rtsp || []).find((r) => r.qualite === 'hd' && r.chemin !== ok.chemin);
    if (h) hd = { chemin: h.chemin, port: ok.port };
  }
  return { path: ok.chemin, pathHd: hd && hd.chemin !== ok.chemin && PATH_RE.test(hd.chemin) ? hd.chemin : null, rtspPort: ok.port, onvifPort: onvif ? onvif.port : null, ptz: !!(onvif && onvif.ptz) };
}

// ---------- routes ----------
const texte = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max && !/[\u0000-\u001f<>]/.test(v);
const portOk = (v) => Number.isInteger(v) && v >= 1 && v <= 65535;
// Nom affiche d'une camera : title, sinon user du secret, sinon name (40 caracteres) ; jamais l'adresse ni le mot de passe.
export const nomDe = (c) => { const s = secretDe(c.id); return String(c.title || (s && s.user) || c.name || c.id).slice(0, 40); };

function etatRecherche() {
  if (!jobCourant) return { etat: 'aucune', etape: '', appareils: [], erreurs: [] };
  const hotes = lireCameras().map((c) => c.host);
  return { etat: jobCourant.etat, etape: jobCourant.etape, secondes: Math.round(((jobCourant.fin || Date.now()) - jobCourant.debut) / 1000), erreurs: jobCourant.erreurs,
    appareils: liste(jobCourant).map((r) => ({ id: r.id, ip: r.ip, onvifPort: r.onvifPort, rtspPort: r.rtspPort, marque: r.marque, modele: r.modele, nom: r.nom, protocoles: r.protocoles, ajoutee: hotes.indexOf(r.ip) >= 0 })) };
}
// Champs de POST /api/cameras/add ; HttpError 400 au premier refus.
function verifierAjout(b) {
  if (!estIPv4(b.ip) || !adresseLocale(b.ip)) throw new HttpError(400, 'Adresse refusée : seules les adresses du réseau local sont acceptées.');
  if (!texte(b.user, 64) || !texte(b.pwd, 64)) throw new HttpError(400, 'Identifiant et mot de passe requis (64 caractères au plus).');
  if (b.title !== undefined && b.title !== '' && !texte(b.title, 40)) throw new HttpError(400, 'Nom invalide (40 caractères au plus).');
  if (b.chemin !== undefined && b.chemin !== '' && !(typeof b.chemin === 'string' && PATH_RE.test(b.chemin))) throw new HttpError(400, 'Chemin RTSP invalide.');
  for (const k of ['rtspPort', 'onvifPort']) if (b[k] !== undefined && b[k] !== null && !portOk(b[k])) throw new HttpError(400, 'Port invalide.');
}
async function ajouter(c) {
  const b = await c.corps();
  verifierAjout(b);
  const essai = b.test === true;
  if (!essai && lireCameras().some((x) => x.host === b.ip)) throw new HttpError(409, 'Cette caméra est déjà ajoutée.');
  if (ajoutEnCours) throw new HttpError(409, 'Un test est déjà en cours.');
  ajoutEnCours = true;
  let r;
  try { r = await tester(b.ip, { user: b.user, pwd: b.pwd }, { chemin: b.chemin || null, rtspPort: b.rtspPort || null, onvifPort: b.onvifPort || null, indice: String(b.indice || '') }); }
  catch (e) { throw new HttpError(422, String((e && e.message) || 'Test impossible.').split(b.pwd).join('***')); }
  finally { ajoutEnCours = false; }
  if (essai) return { ok: true, test: true, path: r.path, pathHd: r.pathHd, ptz: r.ptz, hd: !!r.pathHd, rtspPort: r.rtspPort, onvifPort: r.onvifPort };
  const cams = lireCameras();
  let id; do { id = 'cam-' + crypto.randomBytes(3).toString('hex'); } while (cams.some((x) => x.id === id));
  const cam = { id, name: 'Caméra ' + b.ip.split('.')[3], host: b.ip, path: r.path, ptz: r.ptz };
  if (b.title) cam.title = b.title;
  if (r.pathHd) cam.path_hd = r.pathHd;
  if (r.rtspPort !== 554) cam.rtsp_port = r.rtspPort;
  if (r.onvifPort && r.onvifPort !== 2020) cam.onvif_port = r.onvifPort;
  ecrireSecret(id, { user: b.user, pwd: b.pwd });
  try { cams.push(cam); ecrireCameras(cams); } catch (e) { supprimerSecret(id); throw new HttpError(500, 'Enregistrement impossible.'); }
  log('cameras : ajout de', id, '(' + b.ip + ', PTZ ' + (r.ptz ? 'oui' : 'non') + ', HD ' + (r.pathHd ? 'oui' : 'non') + ')');
  return { ok: true, id, ptz: r.ptz, hd: !!r.pathHd };
}
async function renommerOuSupprimer(c, stopFlux) {
  const b = await c.corps();
  const cams = lireCameras(), cam = cams.find((x) => x.id === c.m[1]);
  if (!cam) throw new HttpError(404, 'Caméra inconnue.');
  if (c.m[2] === 'rename') {
    if (typeof b.title !== 'string' || (b.title !== '' && !texte(b.title, 40))) throw new HttpError(400, 'Nom invalide (40 caractères au plus).');
    if (b.title) cam.title = b.title; else delete cam.title;
    ecrireCameras(cams);
    return { ok: true };
  }
  if (b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
  await stopFlux(cam.id);
  ecrireCameras(cams.filter((x) => x.id !== cam.id));
  supprimerSecret(cam.id);
  joignabilite.oublier(cam.id);
  log('cameras : suppression de', cam.id);
  return { ok: true };
}
// stopFlux(id) : coupe le flux de la camera (cameras.mjs), avant sa suppression. Corps lu (JSON exige) meme quand il ne sert pas, comme avant.
export const routesGestion = (stopFlux) => [
  ['POST', '/api/cameras/discover', async (c) => {
    await c.corps();
    if (jobCourant && jobCourant.etat === 'en cours') jobCourant.annuler();
    jobCourant = lancer();
    return { ok: true };
  }],
  ['POST', '/api/cameras/discover/cancel', async (c) => {
    await c.corps();
    if (jobCourant && jobCourant.etat === 'en cours') jobCourant.annuler();
    return { ok: true };
  }],
  ['GET', '/api/cameras/discover', async () => etatRecherche()],
  ['GET', '/api/cameras/list', async () => {
    const l = lireCameras();
    await joignabilite.actualiser(l, true); // V1.7 : etat et motif de chaque camera (sonde.mjs), comme GET /api/cameras
    return { cameras: l.map((c) => Object.assign({ id: c.id, title: nomDe(c), host: String(c.host || ''), ptz: c.ptz !== false, hd: !!c.path_hd, secret: !!secretDe(c.id) }, joignabilite.etat(c))) };
  }],
  ['POST', '/api/cameras/add', ajouter],
  ['POST', /^\/api\/cameras\/([A-Za-z0-9_-]{1,80})\/(rename|delete)$/, (c) => renommerOuSupprimer(c, stopFlux)],
];
// FIN
