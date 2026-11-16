// @zone socle distant | Controle d'entree de chaque requete (V1.8 ; extrait de server.mjs en qualite 2026-11-12, dependances injectees pour les essais) : Host de l'ecoute, ecoute reseau sans jeton valide (page d'appairage seule : une page demandee -> 302 vers appairage.html, le reste 401), /api/* -> routeur, fichiers statiques (chemin borne au dossier public), erreur -> statut et message (jamais e.message d'une erreur non HttpError), journal sans cookie (identifiant du client seulement) ; diagnostic de l'ecoute reseau (premiere connexion, echecs TLS : code seul, une ligne par code et par minute au plus).
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, send, describe } from './http.mjs';

export const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

// Fichiers statiques du dossier donne (GET et HEAD) : chemin decode puis normalise, refuse s'il sort du dossier.
export function statique(dossier) {
  return (req, res, url) => {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'URL invalide.'); }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(dossier, rel));
    if (!file.startsWith(dossier + path.sep)) throw new HttpError(403, 'Accès refusé.');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, 'Page introuvable.');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  };
}

// V1.8, ecoute reseau : sans jeton valide, seuls la page d'appairage, ses deux fichiers et POST /api/appairage repondent.
export const LIBRES = new Set(['/appairage.html', '/appairage.js', '/appairage.css']);
export const libre = (req, p) => ((req.method === 'GET' || req.method === 'HEAD') && LIBRES.has(p)) || (req.method === 'POST' && p === '/api/appairage');

// d = {hoteValide(req), authentifier(enTeteCookie) -> {id, nom} | null, api(req, res, chemin), statique(req, res, url), journal(...)} ; erreurs traduites par describe (core/http.mjs).
// Rend traiter(distant) -> gestionnaire de requete de l'ecoute (distant : ecoute reseau). Pose req.distant et req.client ({id, nom} | null).
export function portier(d) {
  return (distant) => async (req, res) => {
    req.distant = distant; req.client = null;
    try {
      if (!d.hoteValide(req)) throw new HttpError(403, 'Hôte non autorisé.');
      const url = new URL(req.url, 'http://local');
      if (distant) {
        req.client = d.authentifier(req.headers.cookie);
        if (!req.client && !libre(req, url.pathname)) {
          if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname.endsWith('.html'))) { res.writeHead(302, { Location: '/appairage.html', 'Cache-Control': 'no-store' }); return res.end(); }
          throw new HttpError(401, 'Appareil non autorisé.');
        }
      }
      if (url.pathname.startsWith('/api/')) await d.api(req, res, url.pathname);
      else if (req.method === 'GET' || req.method === 'HEAD') d.statique(req, res, url);
      else throw new HttpError(405, 'Méthode non autorisée.');
    } catch (e) {
      const [status, message] = describe(e);
      if (distant) d.journal(req.method, String(req.url).split('?')[0], status, e.code || e.name || '', 'client=' + (req.client ? req.client.id : '-'));
      else d.journal(req.method, req.url, status, e.code || e.name || '');
      if (!res.headersSent) send(res, status, { error: message });
      else res.end();
    }
  };
}

// Diagnostic de l'ecoute reseau (jamais d'adresse) : premiere connexion recue apres le demarrage, et negociations TLS en echec (code seul, nettoye et borne ;
// une ligne par code et par minute au plus, avec le nombre d'echecs depuis la ligne precedente ; plus de 20 codes suivis : oubli). Un navigateur qui affiche
// l'avertissement de certificat produit un echec « certificat inconnu » : c'est normal.
export function diagnosticReseau({ journal, maintenant = Date.now }) {
  let premiere = true; const echecs = new Map();
  return {
    connexion() { if (premiere) { premiere = false; journal('mode distant : première connexion reçue par l\'écoute réseau'); } },
    echecTls(e) {
      const code = String((e && (e.code || e.reason)) || 'inconnu').replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 60), t = maintenant(), x = echecs.get(code) || { n: 0, le: 0 };
      x.n++;
      if (t - x.le >= 60000) { journal('mode distant : négociation TLS en échec (' + code + ')' + (x.n > 1 ? ' x' + x.n : '')); x.le = t; x.n = 0; }
      echecs.set(code, x);
      if (echecs.size > 20) echecs.clear();
    },
  };
}
// FIN
