// @zone distribution | Mise a jour depuis l'application (V1.8) : GET /api/maj (version installee, version disponible, dernier resultat), POST /api/maj/verifier, /api/maj/appliquer, /api/maj/retour. Tout passe par maj.sh (info, application sans question, retour) : meme controle, meme retour automatique qu'en terminal.
// Reseau : seule la lecture du depot de distribution par git (maj.sh info ; exception ecrite dans CLAUDE.md) ; au plus une par minute a la demande, et une par 24 h a la
// lecture de GET /api/maj (aucune tache de fond). Rien n'est applique sans POST /appliquer confirme. gere_par : application (clone Git avec maj.sh),
// home_assistant (DOMOWA_GERE_PAR : l'image est mise a jour par Home Assistant), aucun (dossier qui n'est pas un clone).
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { HttpError } from '../core/http.mjs';
import { DIR, log } from '../core/outils.mjs';
import { toutArreter } from './animations-moteur.mjs';
import { verrou } from './pieces-creation.mjs';
import { appairageEnCours } from './hubs.mjs';

const SAUV = path.join(DIR, 'sauvegardes');
const RESULTAT = path.join(SAUV, 'maj-resultat.json');
const SORTIE = path.join(SAUV, 'maj-dernier.txt');
const JOUR = 24 * 3600 * 1000, MINUTE = 60 * 1000, DUREE_MAX = 5 * MINUTE;
const ETIQUETTE = /^v(\d+\.\d+)-(\d+)$/;
const maintenant = () => new Date().toISOString();

export const gerePar = () => (process.env.DOMOWA_GERE_PAR === 'home_assistant' ? 'home_assistant'
  : (fs.existsSync(path.join(DIR, '.git')) && fs.existsSync(path.join(DIR, 'maj.sh')) ? 'application' : 'aucun'));

// « v1.8-2 » -> {version: '1.8', revision: 2, nom: 'V1.8 révision 2'} ; autre : null
export function lireEtiquette(e) {
  const m = ETIQUETTE.exec(String(e || ''));
  if (!m) return null;
  const revision = Number(m[2]);
  return { version: m[1], revision, nom: 'V' + m[1] + (revision > 1 ? ' révision ' + revision : '') };
}
// Sortie de « maj.sh info » : lignes cle=valeur (cles en minuscules ; le reste est ignore)
export function lireInfo(txt) {
  const o = {};
  for (const l of String(txt || '').split('\n')) { const m = /^([a-z_]{1,20})=(.*)$/.exec(l); if (m) o[m[1]] = m[2].trim(); }
  return o;
}
// Nouveautes : premiere section « ## » d'HISTORIQUE.md (12 lignes de 300 caracteres au plus)
export function lireNotes(txt) {
  const out = []; let dans = false;
  for (const l of String(txt || '').split('\n')) {
    if (l.startsWith('## ')) { if (dans) break; dans = true; out.push(l.slice(3).trim()); continue; }
    if (dans && l.startsWith('- ')) out.push(l.slice(2).trim());
  }
  return out.slice(0, 12).map((l) => (l.length > 300 ? l.slice(0, 297) + '…' : l));
}

const lancer = (args, env, ms) => new Promise((resolve) => {
  execFile('bash', args, { cwd: DIR, env: { ...process.env, ...env }, timeout: ms, maxBuffer: 256 * 1024 }, (e, out) => resolve(e ? null : String(out)));
});
const git = (args) => lancer(['-c', 'git "$@"', 'git', ...args], { GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' }, 10000);

let reseau = null;      // derniere lecture du depot : {le (ms), info}
let lecture = null;     // lecture en cours (promesse)
let operation = null;   // {quoi: appliquer|retour, debut (ms)}
let echec = null;       // derniere operation finie sans redemarrage : {message, le}

function lireReseau() {
  if (!lecture) {
    lecture = lancer(['maj.sh', 'info'], {}, 45000).then((out) => {
      reseau = { le: Date.now(), info: out === null ? { joignable: 'non' } : lireInfo(out) };
      return reseau;
    }).finally(() => { lecture = null; });
  }
  return lecture;
}

function dernier() {
  try {
    const r = JSON.parse(fs.readFileSync(RESULTAT, 'utf8'));
    if (r && typeof r === 'object' && ['ok', 'retour_auto', 'echec'].includes(r.resultat)) {
      return { de: String(r.de || '').slice(0, 120), vers: String(r.vers || '').slice(0, 120), resultat: r.resultat, le: String(r.le || '').slice(0, 30) };
    }
  } catch { /* absent ou illisible : aucun resultat */ }
  return null;
}

async function etat() {
  const par = gerePar();
  const base = { installee: null, disponible: null, etat: 'inconnu', motif: null, gere_par: par, canal: null, retour: null, dernier: null, verifie_le: null, verification: false, time: maintenant() };
  let version = '';
  try { version = fs.readFileSync(path.join(DIR, 'VERSION'), 'utf8').trim(); } catch { /* sans VERSION */ }
  base.installee = { version, revision: null, nom: 'V' + version };
  if (par !== 'application') {
    base.motif = par === 'home_assistant' ? 'Cette installation se met à jour dans Home Assistant.' : 'Cette installation n\'est pas un clone du dépôt : mise à jour à la main.';
    return base;
  }
  const local = lireInfo(await lancer(['maj.sh', 'info'], { INFO_SANS_RESEAU: '1' }, 10000));
  base.canal = local.canal === 'public' ? 'public' : 'prive';
  const e = lireEtiquette(local.installee);
  if (e) base.installee = e; else if (local.commit) base.installee.nom += ' (étape ' + local.commit.slice(0, 7) + ')';
  if (local.retour) base.retour = { nom: (local.retour_nom || local.retour.slice(0, 7)).slice(0, 120) };
  base.dernier = dernier();
  if (echec) base.dernier = { de: '', vers: '', resultat: 'echec', message: echec.message, le: echec.le };
  if (operation && Date.now() - operation.debut < DUREE_MAX) { base.etat = 'en_cours'; return base; }
  operation = null;
  if (!reseau || Date.now() - reseau.le > JOUR) { lireReseau(); base.verification = true; }
  if (!reseau) return base;
  if (reseau.info.commit && reseau.info.commit !== local.commit) { reseau = null; lireReseau(); base.verification = true; return base; } // lu pour une autre version installee
  const i = reseau.info;
  base.verifie_le = new Date(reseau.le).toISOString();
  if (i.joignable !== 'oui') { base.motif = 'Dépôt injoignable (Internet ?).'; return base; }
  if (!i.disponible) {
    if (i.motif === 'suite') { base.motif = 'La version publiée ne prolonge pas la version installée.'; return base; }
    base.etat = 'a_jour'; return base;
  }
  if (i.signature === 'ko') { base.motif = 'Signature de la version publiée invalide : version refusée.'; return base; }
  const d = lireEtiquette(i.disponible);
  let notes = [];
  if (d) notes = lireNotes(await git(['show', i.disponible + ':HISTORIQUE.md']));
  else notes = String(await git(['log', '--reverse', '--format=%s', 'HEAD..' + i.cible]) || '').split('\n').filter(Boolean).slice(0, 12).map((l) => l.slice(0, 300));
  base.disponible = d ? { ...d, cle: i.disponible, notes } : { version, revision: null, nom: i.disponible + ' étape(s) du dépôt de travail', cle: i.cible, notes };
  base.etat = 'disponible';
  if (local.propre === 'non') base.motif = 'Des fichiers ont été modifiés à la main : mise à jour impossible (./maj.sh en terminal).';
  return base;
}

function libre() {
  if (gerePar() !== 'application') throw new HttpError(409, 'Cette installation ne se met pas à jour depuis l\'application.');
  if (operation && Date.now() - operation.debut < DUREE_MAX) throw new HttpError(409, 'Une mise à jour est déjà en cours.');
  if (appairageEnCours()) throw new HttpError(409, 'Un appairage de hub est en cours : réessayer ensuite.');
  if (verrou.pris) throw new HttpError(409, 'Une opération sur les pièces est en cours : réessayer ensuite.');
}

// maj.sh detache : il arrete ce serveur, applique, controle, redemarre (retour automatique si echec) ; sortie dans sauvegardes/maj-dernier.txt
function demarrer(quoi, args, env) {
  fs.mkdirSync(SAUV, { recursive: true, mode: 0o700 });
  toutArreter('mise à jour');
  echec = null;
  const fd = fs.openSync(SORTIE, 'w', 0o600);
  const p = spawn('bash', ['maj.sh', ...args], { cwd: DIR, detached: true, stdio: ['ignore', fd, fd],
    env: { ...process.env, MAJ_OUI: '1', MAJ_DEPUIS_APPLICATION: '1', MAJ_PID: String(process.pid), ...env } });
  fs.closeSync(fd);
  const op = { quoi, debut: Date.now() };
  operation = op;
  log('mise à jour :', quoi, 'lancée');
  p.on('error', () => { if (operation === op) operation = null; echec = { message: 'Lancement impossible (bash absent ?).', le: maintenant() }; });
  p.on('exit', (code) => { // encore en vie ici : maj.sh n'a pas redemarre le serveur (refus avant tout changement, ou rien a faire)
    if (operation === op) operation = null;
    reseau = null;
    let msg = '';
    try { msg = (fs.readFileSync(SORTIE, 'utf8').split('\n').find((l) => l.startsWith('ECHEC : ')) || '').slice(8, 308); } catch { /* sans sortie */ }
    const r = dernier(); // retour automatique : maj.sh a ecrit son resultat (plus precis que le seul code de sortie)
    const ecrit = r && Date.parse(r.le) >= op.debut - 1000;
    if (code !== 0 && !ecrit) echec = { message: msg || 'La mise à jour a échoué (sauvegardes/maj-dernier.txt).', le: maintenant() };
    log('mise à jour :', quoi, code === 0 ? 'terminée' : 'en échec');
  });
  p.unref();
}

let derniereDemande = 0;
export const routes = [
  ['GET', '/api/maj', async () => etat()],
  ['POST', '/api/maj/verifier', async () => {
    if (gerePar() === 'application' && Date.now() - derniereDemande >= MINUTE) { derniereDemande = Date.now(); await lireReseau(); }
    return etat();
  }],
  ['POST', '/api/maj/appliquer', async (c) => {
    const b = await c.corps();
    if (b.confirm !== true || typeof b.cle !== 'string' || !/^[A-Za-z0-9.-]{1,64}$/.test(b.cle)) throw new HttpError(400, 'Confirmation requise.');
    libre();
    await lireReseau();
    const e = await etat();
    if (e.etat !== 'disponible' || !e.disponible) throw new HttpError(409, e.motif || 'Aucune version disponible.');
    if (e.disponible.cle !== b.cle) throw new HttpError(409, 'La version disponible n\'est plus celle affichée : relire.');
    if (e.motif) throw new HttpError(409, e.motif);
    demarrer('appliquer', [], { MAJ_CIBLE: b.cle });
    c.envoyer(202, await etat());
  }],
  ['POST', '/api/maj/retour', async (c) => {
    const b = await c.corps();
    if (b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
    libre();
    const e = await etat();
    if (!e.retour) throw new HttpError(409, 'Aucune version précédente enregistrée.');
    demarrer('retour', ['retour'], {});
    c.envoyer(202, await etat());
  }],
];
// FIN
