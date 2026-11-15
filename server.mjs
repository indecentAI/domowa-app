// @zone socle | Point d'entree : ecoute locale HTTP 127.0.0.1:8080 (controle Host, sans appairage) et, en mode distant (V1.8, donnees/serveur.json), ecoute reseau HTTPS sur l'adresse privee du serveur (TLS 1.2 au moins, jeton exige : core/acces.mjs ; sans jeton : page d'appairage seule), fichiers statiques public/, /api/* -> core/routeur.mjs, rotation du journal (1 Mo), Node 20 exige (V1.8), erreurs non rattrapees journalisees sans arreter le serveur.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { LOCAL_HOST, LOCAL_PORT } from './config.mjs';
import { HttpError, send, describe, hoteValide, reglerReseau } from './core/http.mjs';
import { DIR, log } from './core/outils.mjs';
import { api, preparer } from './core/routeur.mjs';
import { lireConfig, certificat, declarer } from './core/serveur.mjs';
import { acces } from './core/acces.mjs';
import { demarrer as annoncer } from './core/annonce.mjs';

// V1.8 : Node 20 au moins (mesure le 11/11/2026 : sous Node 18 la bibliotheque du hub ne se charge pas, le serveur demarrerait sans hub).
const NODE_MIN = 20;
if (Number(process.versions.node.split('.')[0]) < NODE_MIN) {
  console.error('Node ' + process.versions.node + ' : version trop ancienne, Node ' + NODE_MIN + ' ou plus est nécessaire. Le serveur ne démarre pas.');
  process.exit(1);
}

const PUBLIC = path.join(DIR, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'URL invalide.'); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) throw new HttpError(403, 'Accès refusé.');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, 'Page introuvable.');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// V1.8, ecoute reseau : sans jeton valide, seuls la page d'appairage, ses deux fichiers et POST /api/appairage repondent ;
// une page demandee renvoie vers appairage.html, le reste : 401. Journal : identifiant du client seulement (jamais le cookie).
const LIBRES = new Set(['/appairage.html', '/appairage.js', '/appairage.css']);
const libre = (req, p) => ((req.method === 'GET' || req.method === 'HEAD') && LIBRES.has(p)) || (req.method === 'POST' && p === '/api/appairage');
const traiter = (distant) => async (req, res) => {
  req.distant = distant; req.client = null;
  try {
    if (!hoteValide(req)) throw new HttpError(403, 'Hôte non autorisé.');
    const url = new URL(req.url, 'http://local');
    if (distant) {
      req.client = acces.authentifier(req.headers.cookie);
      if (!req.client && !libre(req, url.pathname)) {
        if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname.endsWith('.html'))) { res.writeHead(302, { Location: '/appairage.html', 'Cache-Control': 'no-store' }); return res.end(); }
        throw new HttpError(401, 'Appareil non autorisé.');
      }
    }
    if (url.pathname.startsWith('/api/')) await api(req, res, url.pathname);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else throw new HttpError(405, 'Méthode non autorisée.');
  } catch (e) {
    const [status, message] = describe(e);
    if (distant) log(req.method, String(req.url).split('?')[0], status, e.code || e.name || '', 'client=' + (req.client ? req.client.id : '-'));
    else log(req.method, req.url, status, e.code || e.name || '');
    if (!res.headersSent) send(res, status, { error: message });
    else res.end();
  }
};
const server = http.createServer(traiter(false));

// Erreur hors requete : journalisee (type, code, ligne ; jamais le message, qui peut contenir une adresse avec identifiants), le serveur continue.
const trace = (e) => [e && e.name, e && e.code, String((e && e.stack) || '').split('\n').find((l) => l.includes(' at ')) || ''].join(' ').trim();
process.on('unhandledRejection', (e) => log('ERREUR non rattrapée (promesse) :', trace(e)));
process.on('uncaughtException', (e) => log('ERREUR non rattrapée :', trace(e)));

// Rotation du journal : au-dela de 1 Mo, copie en server.log.old puis vidage (le journal est ouvert en ajout par start.sh).
const LOG = path.join(DIR, 'server.log');
function rotateLog() {
  try {
    if (fs.statSync(LOG).size > 1048576) { fs.copyFileSync(LOG, LOG + '.old'); fs.truncateSync(LOG, 0); }
  } catch { /* pas de journal : rien a faire */ }
}
rotateLog();
setInterval(rotateLog, 600000).unref();

await preparer(); // modules et adaptateurs ; une erreur ici arrete le demarrage (cause dans server.log)
server.listen(LOCAL_PORT, LOCAL_HOST, () => {
  console.log('Serveur prêt : http://' + LOCAL_HOST + ':' + LOCAL_PORT);
});
// V1.8, mode distant : ecoute reseau en plus de l'ecoute locale (jamais 0.0.0.0). Un echec (certificat, adresse absente de la machine, port pris)
// est journalise sans adresse et laisse l'ecoute locale en service.
const config = lireConfig();
if (config.invalide) log('serveur.json illisible ou invalide : mode local (fichier laissé tel quel ; le refaire : node scripts/serveur.mjs)');
if (config.mode === 'distant') {
  declarer({ mode: 'distant', adresse: config.adresse, port: config.port });
  try {
    const c = certificat(config.adresse);
    if (c.cree) log('mode distant : certificat créé (donnees/tls/)');
    // L'adresse peut ne pas etre encore celle de la machine au demarrage (Wi-Fi pas encore connecte, tablette qui sort de veille) : nouvel essai
    // toutes les 30 s, sans limite, journal au premier echec et a l'ouverture seulement. Une fois ouverte, l'ecoute survit a une coupure du Wi-Fi.
    let essais = 0;
    const ouvrir = () => {
    essais++;
    const reseau = https.createServer({ key: c.key, cert: c.cert, minVersion: 'TLSv1.2' }, traiter(true));
    reseau.on('error', (e) => {
      const absente = e.code === 'EADDRNOTAVAIL';
      const motif = absente ? 'L\'adresse choisie n\'est pas celle de cette machine pour l\'instant (Wi-Fi connecté ?) : nouvel essai toutes les 30 s.' : e.code === 'EADDRINUSE' ? 'Le port choisi est déjà pris.' : 'L\'accès réseau n\'a pas pu s\'ouvrir.';
      declarer({ ecoute: false, motif }); reglerReseau(null);
      if (essais === 1) log('mode distant : écoute réseau impossible (' + (e.code || e.name) + ') : ' + motif + ' Si l\'adresse a changé : node scripts/serveur.mjs');
      try { reseau.close(); } catch (x) { /* jamais ouverte */ }
      if (absente) setTimeout(ouvrir, 30000);
    });
    // Diagnostic (jamais d'adresse) : premiere connexion recue apres le demarrage, et negociations TLS en echec (code seul ; une ligne par code et par minute
    // au plus, avec leur nombre). Un navigateur qui affiche l'avertissement de certificat produit un echec « certificat inconnu » : c'est normal.
    let premiere = true; const echecs = new Map();
    reseau.on('connection', () => { if (premiere) { premiere = false; log('mode distant : première connexion reçue par l\'écoute réseau'); } });
    reseau.on('tlsClientError', (e) => {
      const code = String((e && (e.code || e.reason)) || 'inconnu').replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 60), t = Date.now(), x = echecs.get(code) || { n: 0, le: 0 };
      x.n++;
      if (t - x.le >= 60000) { log('mode distant : négociation TLS en échec (' + code + ')' + (x.n > 1 ? ' x' + x.n : '')); x.le = t; x.n = 0; }
      echecs.set(code, x);
      if (echecs.size > 20) echecs.clear();
    });
    reseau.listen(config.port, config.adresse, () => {
      reglerReseau(config.adresse, config.port);
      declarer({ ecoute: true, empreinte: c.empreinte, motif: null });
      annoncer({ adresse: config.adresse, port: config.port }); // V1.9 : annonce mDNS (recherche de l'APK) tant que l'ecoute est ouverte ; echec : journal, rien d'autre
      console.log('Accès réseau prêt (HTTPS, port ' + config.port + ')' + (essais > 1 ? ' après ' + essais + ' essais.' : '.'));
    });
    };
    ouvrir();
  } catch (e) {
    declarer({ ecoute: false, motif: 'Le certificat n\'a pas pu être créé (openssl est-il installé ?).' });
    log('mode distant : certificat impossible (' + (e.code || e.name) + ') : accès réseau fermé');
  }
}
// FIN
