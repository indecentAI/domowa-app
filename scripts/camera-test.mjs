// @zone diagnostic
// camera-test.mjs : lit le flux RTSP avec ffprobe et affiche un résumé SANS identifiants. Usage : node scripts/camera-test.mjs [ip] [chemin] (défaut : 1re caméra de cameras.json ; identifiants : donnees/camera-secrets/<id>.json)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { DONNEES as DON } from '../core/outils.mjs'; // V1.8 : DOMOWA_DONNEES (choisirDonnees)
const cams = (() => { try { const j = JSON.parse(fs.readFileSync(path.join(DON, 'cameras.json'), 'utf8')); return Array.isArray(j) ? j : []; } catch (e) { return []; } })();
const HOST = process.argv[2] || (cams[0] && cams[0].host) || '';
const cam = cams.find((c) => c && c.host === HOST) || null;
const STREAM = process.argv[3] || (cam && cam.path) || 'stream2';
if (!/^[0-9.]{7,15}$/.test(HOST) || !/^[A-Za-z0-9_-]{1,40}$/.test(STREAM)) { console.log('Adresse ou chemin invalide.'); process.exit(1); }
const fsec = cam && /^[A-Za-z0-9_-]{1,80}$/.test(String(cam.id)) ? path.join(DON, 'camera-secrets', cam.id + '.json') : null;
let sec;
try { sec = JSON.parse(fs.readFileSync(fsec, 'utf8')); }
catch (e) { console.log('Identifiants introuvables pour ' + HOST + ' : ajouter d\'abord la caméra dans la fenêtre Caméras.'); process.exit(1); }
const mode = fs.statSync(fsec).mode & 0o777;
if (mode !== 0o600) console.log('Attention : droits du fichier secret =', mode.toString(8), '(600 attendu)');
const enc = encodeURIComponent;
const url = 'rtsp://' + enc(sec.user) + ':' + enc(sec.pwd) + '@' + HOST + ':554/' + STREAM;
const secrets = [url, sec.pwd, enc(sec.pwd), sec.user, enc(sec.user)].filter((s) => s && s.length > 2).sort((a, b) => b.length - a.length);
const mask = (t) => { let o = String(t); for (const s of secrets) o = o.split(s).join('***'); return o; };

const args = ['-v', 'error', '-rtsp_transport', 'tcp', '-analyzeduration', '4000000', '-probesize', '2000000', '-show_entries',
  'stream=codec_type,codec_name,profile,width,height,avg_frame_rate,sample_rate,channels', '-of', 'json', '-i', url];
const p = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
let out = '', err = '', done = false;
const timer = setTimeout(() => { if (!done) { console.log('Délai dépassé (20 s) : pas de réponse de ' + HOST + ' (vérifier le Wi-Fi, l\'IP).'); p.kill('SIGKILL'); } }, 20000);
p.stdout.on('data', (d) => { out += d; });
p.stderr.on('data', (d) => { err += d; });
p.on('error', (e) => { done = true; clearTimeout(timer); console.log('ffprobe introuvable ou non lançable :', mask(e.message)); });
p.on('close', (code) => {
  if (done) return; done = true; clearTimeout(timer);
  let j = null; try { j = JSON.parse(out); } catch (e) { /* erreur affichée ci-dessous */ }
  if (code !== 0 || !j) { console.log('Échec (code ' + code + ') :', mask(err).trim().split('\n').slice(0, 6).join(' | ')); process.exit(1); }
  const st = j.streams || [], v = st.filter((s) => s.codec_type === 'video'), a = st.filter((s) => s.codec_type === 'audio');
  console.log('Hôte :', HOST, '| chemin :', STREAM);
  v.forEach((s) => console.log('Vidéo :', s.codec_name, s.profile || '-', s.width + 'x' + s.height, s.avg_frame_rate + ' i/s'));
  if (!v.length) console.log('Vidéo : AUCUNE');
  a.forEach((s) => console.log('Son :', s.codec_name, s.sample_rate + ' Hz', s.channels + ' canal(aux)'));
  if (!a.length) console.log('Son : AUCUN (micro désactivé dans l\'application Tapo ?)');
});
// FIN
