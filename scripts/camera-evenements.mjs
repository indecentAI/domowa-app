// @zone diagnostic | Diagnostic des alertes ONVIF d'une caméra (V1.9) : liste des sujets annoncés (GetEventProperties : mouvement, personne, son…), puis écoute des alertes reçues (abonnement PullPoint, retiré à la fin ou à Ctrl+C). Lecture seule : aucun réglage de la caméra n'est changé. Sortie sans adresse, identifiant ni mot de passe (à coller telle quelle). Usage : node scripts/camera-evenements.mjs [id de caméra] [secondes d'écoute : 60 par défaut, 0 = liste seulement, 600 au plus] ; identifiants : donnees/camera-secrets/<id>.json. Serveur en marche ou arrêté.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { soap, xaddr, capacites, CORPS, ACTIONS, lireSujets, lireAbonnement, lireMessages, lireErreur } from '../adapters/cameras/onvif.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_DON = String(process.env.DOMOWA_DONNEES || '').trim(); // V1.8 : meme regle que core/outils.mjs (choisirDonnees)
const DON = ENV_DON && path.isAbsolute(ENV_DON) ? path.resolve(ENV_DON) : path.join(DIR, 'donnees');
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const cams = (() => { try { const j = JSON.parse(fs.readFileSync(path.join(DON, 'cameras.json'), 'utf8')); return Array.isArray(j) ? j.filter((c) => c && ID_RE.test(String(c.id)) && /^[0-9.]{7,15}$/.test(String(c.host))) : []; } catch (e) { return []; } })();
const fin = (code, t) => { if (t) console.log(t); process.exit(code); };
if (!cams.length) fin(1, 'Aucune caméra dans donnees/cameras.json : ajouter d\'abord la caméra dans la fenêtre Caméras.');
const ID = process.argv[2] || cams[0].id;
const cam = cams.find((c) => c.id === ID);
if (!cam) fin(1, 'Caméra inconnue. Caméras : ' + cams.map((c) => c.id).join(', '));
const SEC_S = process.argv[3] === undefined ? 60 : Number(process.argv[3]);
if (!Number.isInteger(SEC_S) || SEC_S < 0 || SEC_S > 600) fin(1, 'Durée d\'écoute invalide (0 à 600 secondes).');
let sec;
try { sec = JSON.parse(fs.readFileSync(path.join(DON, 'camera-secrets', cam.id + '.json'), 'utf8')); if (!sec || typeof sec.user !== 'string' || typeof sec.pwd !== 'string') throw new Error(); }
catch (e) { fin(1, 'Identifiants introuvables pour ' + cam.id + ' : supprimer puis ré-ajouter la caméra dans la fenêtre Caméras.'); }

// Masque : identifiants, adresses IPv4, adresses MAC, identifiants d'appareil (UUID) ; valeurs coupées à 60 caractères.
const secrets = [sec.pwd, encodeURIComponent(sec.pwd), sec.user, encodeURIComponent(sec.user)].filter((s) => s && s.length > 2).sort((a, b) => b.length - a.length);
function propre(t, max = 60) {
  let o = String(t === null || t === undefined ? '' : t);
  for (const s of secrets) o = o.split(s).join('***');
  o = o.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<adresse>').replace(/\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b/g, '<mac>')
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<uuid>').replace(/[\u0000-\u001f]/g, ' ');
  return o.length > max ? o.slice(0, max) + '…' : o;
}
const motif = (r) => 'HTTP ' + r.status + (lireErreur(r.body) ? ' (' + propre(lireErreur(r.body), 120) + ')' : '');
const heure = (iso) => { const d = iso ? new Date(iso) : new Date(); return (isNaN(d) ? new Date() : d).toLocaleTimeString('fr-FR'); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let abonnement = null, arret = false;
async function desabonner() {
  if (!abonnement) return;
  const a = abonnement; abonnement = null;
  try { const r = await soap(cam, sec, a, CORPS.desabonner, { action: ACTIONS.desabonner, delai: 5000 }); console.log(r.status === 200 ? 'Abonnement retiré.' : 'Retrait de l\'abonnement refusé (' + motif(r) + ') : il expirera seul.'); }
  catch (e) { console.log('Retrait de l\'abonnement impossible (' + propre(e.message) + ') : il expirera seul.'); }
}
process.on('SIGINT', () => { if (arret) process.exit(130); arret = true; console.log('\nArrêt demandé…'); });

try {
  console.log('Caméra :', cam.id);
  const cap = await soap(cam, sec, capacites(cam), CORPS.capacites);
  if (cap.status !== 200) fin(1, 'La caméra refuse GetCapabilities : ' + motif(cap) + ' (identifiants du compte de la caméra ?).');
  const ev = xaddr(cap.body, 'Events');
  if (!ev) fin(2, 'La caméra n\'annonce aucun service d\'événements ONVIF.');
  const pr = await soap(cam, sec, ev, CORPS.proprietes, { action: ACTIONS.proprietes });
  if (pr.status !== 200) console.log('GetEventProperties refusé : ' + motif(pr));
  else {
    const sujets = lireSujets(pr.body);
    console.log('Sujets annoncés (' + sujets.length + ') :');
    for (const s of sujets) console.log('  - ' + propre(s.sujet, 120) + (s.donnees.length ? ' (' + s.donnees.map((x) => propre(x, 40)).join(', ') + ')' : ''));
  }
  if (!SEC_S) fin(0);
  const ab = await soap(cam, sec, ev, CORPS.abonner(SEC_S + 60), { action: ACTIONS.abonner });
  abonnement = ab.status === 200 ? lireAbonnement(ab.body) : null;
  if (!abonnement) fin(1, 'Abonnement aux alertes refusé : ' + motif(ab));
  console.log('Écoute pendant ' + SEC_S + ' s (Ctrl+C pour arrêter) : bougez devant la caméra, passez devant, faites du bruit près du micro (enregistrement de pleurs de bébé, par exemple).');
  const finEcoute = Date.now() + SEC_S * 1000, vus = new Map();
  let n = 0, echecs = 0;
  while (!arret && Date.now() < finEcoute) {
    const t0 = Date.now(), attente = Math.max(1, Math.min(10, Math.ceil((finEcoute - t0) / 1000)));
    let r;
    try { r = await soap(cam, sec, abonnement, CORPS.tirer(attente, 20), { action: ACTIONS.tirer, delai: (attente + 10) * 1000 }); }
    catch (e) { r = { status: 0, body: '', erreur: e.message }; }
    if (r.status !== 200) {
      console.log('PullMessages en échec : ' + (r.status ? motif(r) : propre(r.erreur)));
      if (++echecs >= 3) break;
      await pause(2000); continue;
    }
    echecs = 0;
    const msgs = lireMessages(r.body);
    for (const m of msgs) {
      n++; vus.set(m.sujet, (vus.get(m.sujet) || 0) + 1);
      const donnees = Object.entries(m.donnees).map(([k, v]) => propre(k, 40) + '=' + propre(v, 40)).join(', ');
      console.log('[' + heure(m.heure) + '] ' + propre(m.sujet, 120) + (m.operation ? ' (' + propre(m.operation, 20) + ')' : '') + (donnees ? ' : ' + donnees : ''));
    }
    if (!msgs.length && Date.now() - t0 < 1000) await pause(1000); // caméra qui répond sans attendre : pas de rafale de demandes
  }
  await desabonner();
  console.log('Fin de l\'écoute : ' + n + ' message(s)' + (vus.size ? ', sujets reçus : ' + [...vus].map(([s, k]) => propre(s, 120) + ' x' + k).join(' ; ') : '') + '.');
  process.exit(0);
} catch (e) {
  await desabonner();
  fin(1, 'Échec : ' + propre(e.message, 120) + ' (caméra allumée, même Wi-Fi, port ONVIF 2020 ?)');
}
// FIN
