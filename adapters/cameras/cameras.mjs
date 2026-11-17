// @zone cameras
// cameras.mjs : flux des caméras RTSP (Tapo) converti par ffmpeg en MP4 fragmenté H.264 + AAC, lu par une balise <video>.
// Routes : GET /api/cameras (id, nom, ptz, hd, etat en_ligne|hors_ligne|inconnu, motif (V1.7, sonde.mjs), diffusion {qualite: sd|hd, appareils} | null (V1.9) ; sans IP ni mot de passe ; nom = title, sinon user du secret, sinon name),
// GET /api/cameras/:id/stream[?q=hd][&v=<lecteur>][&choix=1] (lecture seule ; HD si path_hd ; flux partagé entre les appareils : diffusion.mjs),
// POST /api/cameras/:id/move {dir: left|right|up|down|stop} : mouvement de la caméra par ONVIF (port 2020), liste fermée, vitesse fixe, arrêt automatique de sécurité.
// Recherche, ajout et secrets : cameras-gestion.mjs ; adaptateur (modele commun, routes) : index.mjs. Routes au format du routeur (core/routeur.mjs : routes = [[methode, chemin, async (c) => objet]],
// checkWrite automatique sur POST) ; le flux repond lui-meme sur c.res (aucun objet renvoye).
// Données : donnees/cameras.json (id, name, host, path, ptz, title?, path_hd?, rtsp_port?, onvif_port?), donnees/camera-secrets/<id>.json (user, pwd). Aucun mot de passe dans les réponses, les erreurs ni le journal.
// Le journal indique pourquoi chaque flux s'est arrêté : navigateur (dernier appareil parti, ou flux remplacé), silence, démarrage trop long, flux illisible, qualité changée, ou fin de ffmpeg (avec les derniers avertissements de ffmpeg).
// Un seul ffmpeg par caméra, partagé par les appareils qui regardent ; un nouveau ne démarre qu'une fois l'ancien terminé (une seule session RTSP à la fois : la caméra refuse les connexions rapprochées).
import { spawn } from 'node:child_process';
import { HttpError } from '../../core/http.mjs';
import { ID_RE } from '../../core/modele.mjs';
import { lireJson, log } from '../../core/outils.mjs';
import { PATH_RE, secretDe, nomDe, routesGestion } from './cameras-gestion.mjs';
import { sonde, REPOS } from './sonde.mjs';
import { creerDiffusions } from './diffusion.mjs';
import { SORTIE } from './mp4.mjs';
import { NS, soap, xaddr, capacites, CORPS } from './onvif.mjs'; // appels SOAP vers la caméra (V1.9 : partagés avec le diagnostic des événements)

export { nomDe };

// PATH_RE (chemin RTSP) : voir cameras-gestion.mjs ; plafonds et délais du flux : diffusion.mjs
const HORLOGE = false; // true : horodatage par l'horloge de la tablette (à essayer si microcoupures ou son décalé)
const VITESSE = 0.5; // vitesse normalisée (0 à 1) ; si une direction est inversée sur une autre caméra, changer le signe ici
const DIRS = { left: [-VITESSE, 0], right: [VITESSE, 0], up: [0, VITESSE], down: [0, -VITESSE] };
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
async function onvifInfos(cam, sec) {
  const c = infosCache.get(cam.id);
  if (c && c.host === cam.host && Date.now() - c.t < 600000) return c;
  const cap = await soap(cam, sec, capacites(cam), CORPS.capacites);
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
// Flux partagé (V1.9, diffusion.mjs) : un ffmpeg par caméra, sa sortie envoyée à chaque appareil qui regarde.
function lancer(cam, sec, hd) {
  const args = ['-hide_banner', '-loglevel', 'warning', ...input(cam, sec, hd ? cheminHd(cam) : cam.path), ...SORTIE]; // SORTIE : MP4 fragmenté lu par diffusion.mjs (mp4.mjs)
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const secrets = [sec.pwd, encodeURIComponent(sec.pwd), sec.user, encodeURIComponent(sec.user)].filter((s) => s.length > 2);
  const masquer = (t) => { let o = String(t); for (const s of secrets) o = o.split(s).join('***'); return o; };
  return { proc, masquer };
}
const diffusions = creerDiffusions({ lancer, journal: log });
sonde.occupation((id) => diffusions.occupe(id) || Date.now() - diffusions.finiLe(id) < REPOS); // V1.7 : aucune sonde pendant un flux ni dans les 10 s qui suivent
// Coupe le flux d'une caméra pour tous ses appareils (suppression) ; la promesse se termine quand ffmpeg a quitté (3 s au plus).
const stop = (id) => diffusions.arreter(id);

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
  let p = null;
  try { p = new URL(req.url, 'http://x').searchParams; } catch (e) { p = null; }
  const hd = !!p && p.get('q') === 'hd';
  if (hd && !cheminHd(cam)) throw new HttpError(400, 'Flux haute définition non configuré pour cette caméra.');
  const v = p && /^[A-Za-z0-9]{1,32}$/.test(p.get('v') || '') ? p.get('v') : null; // lecteur (une carte de l'accueil) : sa nouvelle demande remplace l'ancienne
  const choix = !!p && p.get('choix') === '1'; // qualité choisie par le bouton SD/HD : relance le flux pour tous
  await diffusions.demander(cam, sec, req, res, { hd, v, choix }); // répond lui-même (video/mp4, ou erreur JSON si ffmpeg échoue avant la première image)
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
    return { cameras: l.map((c) => Object.assign({ id: c.id, name: nomDe(c), ptz: c.ptz !== false, hd: cheminHd(c) !== null }, sonde.etat(c), { diffusion: diffusions.etat(c.id) })) };
  }],
  ['GET', /^\/api\/cameras\/([A-Za-z0-9_-]{1,80})\/stream$/, flux],
  ['POST', /^\/api\/cameras\/([A-Za-z0-9_-]{1,80})\/move$/, mouvement],
]);
// FIN
