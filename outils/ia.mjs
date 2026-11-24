// @zone outils | Outil IA : INDEX.md genere, paquet minimal par zone pour un nouveau chat, controle avant/apres patch.
// node outils/ia.mjs              -> regenere INDEX.md (et index/<zone>.md s'il y a un dossier index/) : une ligne de sortie
// node outils/ia.mjs couts        -> cout (tokens) de CLAUDE.md, des regles de zone et de chaque paquet
// node outils/ia.mjs pack z1 [z2] -> ~/dirigera-ia-z1-z2.tgz = CLAUDE.md + regles de zone + INDEX.md + fichiers des zones ("tout" = tout le code)
// node outils/ia.mjs check        -> syntaxe, en-tetes @zone, droits des .sh, demarrage a blanc, index a jour, aucun secret ; avertissements (budget de CLAUDE.md, motifs de regles) jamais bloquants
// node outils/ia.mjs publier <dossier> -> arbre du depot public (V1.8) : code livre + node_modules, apres le controle de publication (aucune donnee personnelle)
// node outils/ia.mjs release      -> ~/dirigera-tablette-v<VERSION>.tgz : code, docs, polices, package-lock (sans donnees, secrets ni node_modules)
// Convention : chaque fichier de code a, sur sa 1re ligne (2e apres #! ou doctype), "@zone z1 [z2] | role" (role facultatif
// si la ligne de commentaire suivante le donne). Les secrets (jeton, mots de passe) ne sont jamais lus pour etre affiches.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = process.env.DT_SORTIE || os.homedir(); // paquets crees dans le dossier personnel Termux, hors du projet
const SKIP = new Set(['node_modules', 'sauvegardes', 'donnees', 'camera-secrets', 'fonts', '.git', 'build', '.gradle']); // build, .gradle : sorties de construction de l'APK (V1.9)
const ENV_DON = String(process.env.DOMOWA_DONNEES || '').trim(); // V1.8 : meme regle que core/outils.mjs (choisirDonnees)
const DON = ENV_DON && path.isAbsolute(ENV_DON) ? path.resolve(ENV_DON) : path.join(DIR, 'donnees'); // donnees et secrets : jamais indexes ni empaquetes
const CODE = new Set(['.mjs', '.js', '.css', '.html', '.sh', '.java', '.xml', '.gradle']); // .java, .xml, .gradle : APK (V1.9, zone apk ; syntaxe controlee par Gradle dans GitHub Actions, apk.yml)
const EXTRA = { 'adapters/cameras/cameras-marques.json': ['cameras-ajout', 'Base des marques de cameras : motif, chemins RTSP sd/hd, aide.'] };
const MANIFESTE = /^adapters\/[^/]+\/manifest\.json$/; // manifeste d'adaptateur : zone appareils, role = champ nom
const extra = (r) => EXTRA[r] || (MANIFESTE.test(r) ? ['appareils', null] : null);
const COMPACT = new Set(['diagnostic']); // zones listees sur une seule ligne (noms et tailles)
const ORDRE = ['socle', 'appareils', 'equipements', 'hubs', 'homeassistant', 'pieces', 'lumieres', 'plan', 'scenarios', 'animations', 'accueil', 'cameras', 'cameras-ajout', 'electromenager', 'telephone', 'distant', 'distribution', 'apk', 'diagnostic', 'outils'];
const BUDGET_CLAUDE = 30000; // octets : budget de CLAUDE.md a la racine (~9k tokens charges a chaque session) ; depasse : avertissement de check, jamais un echec
const BUDGET_REGLE = 40000; // octets : budget d'un fichier de regles (.claude/rules, android/CLAUDE.md, banc/CLAUDE.md) ; meme principe
const GROS = 20000; // octets : au-dela, l'index donne les reperes de fonctions (nom@ligne) du fichier
// Depot de travail : INDEX.md = carte des zones et detail dans index/<zone>.md (le dossier index/ fait foi). Arbre public, paquet sans index/ : un INDEX.md complet, comme avant.
const decoupe = () => fs.existsSync(path.join(DIR, 'index'));
const tok = (n) => Math.round(n / 3.3);
const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
const fin = (m) => { console.log(m); process.exit(1); };

function arbre(rel) {
  const out = [];
  for (const e of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...arbre(r)); }
    else if (CODE.has(path.extname(e.name)) || extra(r)) out.push(r);
  }
  return out.sort();
}

function lire(r) {
  const txt = fs.readFileSync(path.join(DIR, r), 'utf8');
  const f = { r, txt, taille: Buffer.byteLength(txt), zones: [], role: '', routes: [], expose: [], importe: [], reperes: [] };
  const x = extra(r);
  if (x) {
    f.zones = [x[0]];
    try { const j = JSON.parse(txt); if (!x[1] && j.zone) f.zones = [j.zone]; f.role = x[1] || 'Manifeste : ' + (j.nom || '?'); } catch (e) { f.role = 'Manifeste illisible'; }
    return f;
  }
  const tete = txt.split('\n').slice(0, 6);
  for (const l of tete) {
    const m = l.match(/@zone\s+([a-z0-9 -]+?)\s*(?:\|\s*(.*?))?\s*(?:\*\/|-->)?\s*$/);
    if (m) { f.zones = m[1].trim().split(/\s+/); f.role = m[2] || ''; break; }
  }
  if (!f.role) for (const l of tete) {
    const c = l.match(/^\s*(?:\/\/|\/\*|#(?!!)|<!--)\s*(.*?)\s*(?:\*\/|-->)?\s*$/);
    if (c && c[1] && !/@zone/.test(c[1])) { f.role = c[1].replace(/^[\w.-]+\.(?:mjs|js|css|html|sh)\s*:\s*/, ''); break; }
  }
  if (f.role.length > 110) f.role = f.role.slice(0, 107) + '...'; // la suite est dans l'en-tete du fichier
  const parMethode = {};
  for (const l of txt.split('\n')) {
    const mm = l.match(/req\.method === '([A-Z]+)'/) || l.match(/^\s*\['([A-Z]+)',\s*['\/]/);
    if (!mm) continue;
    let p = (l.match(/p === '([^']+)'/) || l.match(/^\s*\['[A-Z]+',\s*'([^']+)'/) || [])[1];
    if (!p) {
      const rx = (l.match(/p\.match\(\/\^(.+?)\$\/\)/) || l.match(/^\s*\['[A-Z]+',\s*\/\^(.+?)\$\//) || [])[1];
      if (rx) p = rx.replace(/\\\//g, '/').replace(/\(\[[^\]]*\](?:\{[^}]*\}|[+*])?\)/g, ':id').replace(/\(([^()]*)\)/g, '$1').replace(/\\/g, '');
    }
    if (p) (parMethode[mm[1]] = parMethode[mm[1]] || []).push(p.replace(/^\/api/, ''));
  }
  f.routes = Object.keys(parMethode).map((x) => x + ' ' + parMethode[x].join(' '));
  const ex = new Set();
  const fonctions = new Set([...txt.matchAll(/function\s+(\w+)/g)].map((m) => m[1]));
  for (const m of txt.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+)(\w+)/gm)) ex.add(m[1]);
  for (const m of txt.matchAll(/^export\s*\{([^}]+)\}/gm)) m[1].split(',').forEach((s) => ex.add(s.trim().split(/\s+as\s+/).pop()));
  for (const m of txt.matchAll(/\bAPP\.(\w+)\s*=\s*(?:function\b|\{\s*\w|(\w+)\s*;)/g)) if (!m[2] || fonctions.has(m[2])) ex.add('APP.' + m[1]);
  f.expose = [...ex];
  f.importe = [...new Set([...txt.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)].map((m) => m[1].replace(/^\.\//, '')))];
  if (f.taille >= GROS && /\.(m?js|java)$/.test(r)) f.reperes = reperes(txt, r.endsWith('.java'));
  return f;
}

// Reperes nom@ligne des fonctions d'un gros fichier (indentation de 2 espaces au plus : fonctions de premier niveau ou d'une enveloppe ; Java : membres de classe), 80 au plus.
const MOTS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'try', 'synchronized']);
function reperes(txt, java) {
  const out = [];
  txt.split('\n').forEach((l, i) => {
    const m = java
      ? l.match(/^ {2,4}(?:(?:public|private|protected|static|final|abstract)\s+)*[\w<>\[\],.?]+\s+(\w+)\s*\([^;]*\)\s*(?:throws [\w, .]+)?\s*\{\s*$/)
      : l.match(/^ {0,2}(?:export\s+)?(?:async\s+)?function\*?\s+(\w+)\s*\(/) || l.match(/^ {0,2}(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/);
    if (m && !MOTS.has(m[1])) out.push(m[1] + '@' + (i + 1));
  });
  return out.slice(0, 80);
}

function zonesDe(liste) {
  const z = {};
  for (const f of liste) for (const n of (f.zones.length ? f.zones : ['sans-zone'])) (z[n] = z[n] || []).push(f);
  return Object.keys(z).sort((a, b) => (ORDRE.indexOf(a) + 1 || 99) - (ORDRE.indexOf(b) + 1 || 99) || a.localeCompare(b)).map((n) => [n, z[n]]);
}

const LEGENDE = 'Tailles en tokens estimes (octets / 3,3). R = routes (sans le prefixe /api), E = expose, I = importe, L = reperes nom@ligne (fichiers de plus de 20 Ko : Read avec offset et limit).';

function blocZone(z, fs_, vu, compact) { // lignes d'une zone ; une zone « compacte » tient sur une ligne ; un fichier de plusieurs zones est detaille dans la premiere seulement
  const L = ['## ' + z + ' (~' + k(tok(fs_.reduce((s, f) => s + f.taille, 0))) + ' tok)'];
  if (compact) { L.push(fs_.map((f) => f.r + ' ' + k(tok(f.taille)) + (f.expose.some((e) => e.startsWith('APP.')) ? ' [' + f.expose.join(' ') + ']' : '')).join(', ')); L.push(''); return L; }
  for (const f of fs_) {
    if (vu[f.r]) { L.push('- ' + f.r + ' (voir ' + vu[f.r] + ')'); continue; }
    vu[f.r] = z;
    let l = '- ' + f.r + ' ' + k(tok(f.taille)) + ' : ' + (f.role || '?');
    if (f.routes.length) l += ' R: ' + f.routes.join(' ; ');
    if (f.expose.length) l += ' E: ' + f.expose.join(' ');
    if (f.importe.length) l += ' I: ' + f.importe.join(' ');
    if (f.reperes.length) l += ' L: ' + f.reperes.join(' ');
    L.push(l);
  }
  L.push('');
  return L;
}

function texteIndex(liste, garder) { // INDEX.md complet (arbre public, paquet) ; garder : zones detaillees (paquet), les autres tiennent sur une ligne
  const L = ['# INDEX.md - genere par "node outils/ia.mjs" (ne pas modifier a la main)', LEGENDE,
    'Un paquet = CLAUDE.md + regles de zone + INDEX.md + fichiers de la ou des zones demandees.', ''];
  const vu = {};
  for (const [z, fs_] of zonesDe(liste)) L.push(...blocZone(z, fs_, vu, COMPACT.has(z) || (garder && !garder.includes(z))));
  return L.join('\n');
}

// Fichiers d'index attendus {chemin: texte} : depot de travail (index/ present) = carte + un fichier par zone ; sinon INDEX.md complet.
function fichiersIndex(liste) {
  if (!decoupe()) return { 'INDEX.md': texteIndex(liste) };
  const carte = ['# INDEX.md - genere par "node outils/ia.mjs" (ne pas modifier a la main)',
    'Carte des zones (tokens estimes : octets / 3,3). Detail d\'une zone (fichier : role, routes, expose, importe, reperes de fonctions des gros fichiers) : index/<zone>.md ; lire seulement celui de la zone touchee. Zone d\'un fichier : sa 1re ligne @zone.', ''];
  const out = {}, vu = {};
  for (const [z, fs_] of zonesDe(liste)) {
    carte.push('- ' + z + ' : ' + fs_.length + ' fichiers, ~' + k(tok(fs_.reduce((s, f) => s + f.taille, 0))) + ' tok -> index/' + z + '.md');
    out['index/' + z + '.md'] = ['# index/' + z + '.md - genere par "node outils/ia.mjs" (ne pas modifier a la main)', LEGENDE, '', ...blocZone(z, fs_, vu, COMPACT.has(z))].join('\n');
  }
  out['INDEX.md'] = carte.join('\n') + '\n';
  return out;
}

function secrets() {
  const s = [];
  const essai = (fn) => { try { fn(); } catch (e) { /* absent : rien a proteger */ } };
  essai(() => { const t = fs.readFileSync(path.join(DON, 'dirigera-token.txt'), 'utf8').trim(); if (t.length >= 8) s.push(t); });
  essai(() => { const j = JSON.parse(fs.readFileSync(path.join(DON, 'smartthings.json'), 'utf8')); for (const c of ['client_secret', 'access_token', 'refresh_token']) if (j && typeof j[c] === 'string' && j[c].length >= 8) s.push(j[c]); });
  const pwd = (p) => essai(() => { const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (j && typeof j.pwd === 'string' && j.pwd.length >= 6) s.push(j.pwd); });
  essai(() => { for (const n of fs.readdirSync(path.join(DON, 'camera-secrets'))) pwd(path.join(DON, 'camera-secrets', n)); });
  return s;
}
const fuite = (txt, s) => s.some((x) => txt.includes(x));

function ecrireIndex(liste) {
  const m = fichiersIndex(liste);
  if (decoupe()) for (const n of fs.readdirSync(path.join(DIR, 'index'))) if (!(('index/' + n) in m)) fs.rmSync(path.join(DIR, 'index', n)); // zone disparue
  for (const [n, t] of Object.entries(m)) {
    const p = path.join(DIR, n);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== t) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p + '.tmp', t); fs.renameSync(p + '.tmp', p); }
  }
  return m;
}

// Motifs (globs) de la frontmatter « paths » d'un fichier de regles (.claude/rules/*.md) ; ** = tout, * = hors /
function motifsRegle(txt) {
  const fm = txt.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  return [...fm[1].matchAll(/^\s*-\s*"?([^"\n]+?)"?\s*$/gm)].map((m) => m[1]);
}
const globVersRegex = (g) => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*') + '$');
const taille = (r) => (fs.existsSync(path.join(DIR, r)) ? fs.statSync(path.join(DIR, r)).size : 0);
function fichiersRegles() { // regles de zone presentes : .claude/rules/*.md, android/CLAUDE.md, banc/CLAUDE.md
  const rd = path.join(DIR, '.claude', 'rules');
  const r = fs.existsSync(rd) ? fs.readdirSync(rd).filter((n) => n.endsWith('.md')).sort().map((n) => '.claude/rules/' + n) : [];
  return r.concat(['android/CLAUDE.md', 'banc/CLAUDE.md'].filter((n) => fs.existsSync(path.join(DIR, n))));
}
function reglesPour(choisis) { // regles qui visent les fichiers d'un paquet
  const out = [];
  for (const r of fichiersRegles()) {
    if (r.endsWith('/CLAUDE.md')) { if (choisis.some((f) => f.r.startsWith(path.dirname(r) + '/'))) out.push(r); continue; }
    const m = motifsRegle(fs.readFileSync(path.join(DIR, r), 'utf8')).map(globVersRegex);
    if (!m.length || choisis.some((f) => m.some((x) => x.test(f.r)))) out.push(r);
  }
  return out;
}
const choisisPour = (liste, demandes) => (demandes.includes('tout') ? liste : liste.filter((f) => f.zones.some((z) => demandes.includes(z))));

function couts(liste) {
  const regles = fichiersRegles();
  console.log('CLAUDE.md (charge a chaque session) : ~' + k(tok(taille('CLAUDE.md'))) + ' tok (budget ~' + k(tok(BUDGET_CLAUDE)) + ')');
  console.log('Regles de zone (a la demande, selon les fichiers lus) : ' + regles.length + ' fichiers, ~' + k(tok(regles.reduce((s, r) => s + taille(r), 0))) + ' tok au total');
  console.log('INDEX.md : ~' + k(tok(taille('INDEX.md'))) + ' tok ; index/<zone>.md : lu pour la zone touchee seulement');
  for (const [z, fs_] of zonesDe(liste)) {
    const ch = choisisPour(liste, [z]);
    console.log('  pack ' + z.padEnd(14) + fs_.length + ' fichiers  ~' + k(tok(taille('CLAUDE.md') + Buffer.byteLength(texteIndex(liste, [z])) + reglesPour(ch).reduce((s, r) => s + taille(r), 0) + fs_.reduce((s, f) => s + f.taille, 0))) + ' tok');
  }
}

function pack(demandes, liste) {
  const connues = zonesDe(liste).map((x) => x[0]);
  if (!demandes.length) fin('Indiquer une ou plusieurs zones : ' + connues.join(', ') + ' (ou tout).');
  const inconnues = demandes.filter((d) => d !== 'tout' && !connues.includes(d));
  if (inconnues.length) fin('Zone inconnue : ' + inconnues.join(', ') + '. Zones : ' + connues.join(', ') + '.');
  const tout = demandes.includes('tout');
  const choisis = choisisPour(liste, demandes);
  const s = secrets();
  for (const f of choisis) if (fuite(f.txt, s)) fin('REFUS : ' + f.r + ' contient un secret (jeton ou mot de passe). Aucun paquet cree.');
  const noms = ['CLAUDE.md'].concat(reglesPour(choisis), choisis.map((f) => f.r)).filter((r) => fs.existsSync(path.join(DIR, r)));
  // Copie de travail : INDEX.md du paquet = detail des zones demandees, simple liste pour les autres (un seul fichier, sans index/).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dirigera-paquet-')), racine = path.join(tmp, path.basename(DIR));
  for (const n of noms) { fs.mkdirSync(path.dirname(path.join(racine, n)), { recursive: true }); fs.copyFileSync(path.join(DIR, n), path.join(racine, n)); }
  fs.writeFileSync(path.join(racine, 'INDEX.md'), tout ? texteIndex(liste) : texteIndex(liste, demandes));
  noms.splice(1, 0, 'INDEX.md');
  const out = path.join(SORTIE, 'dirigera-ia-' + (tout ? 'tout' : demandes.join('-')) + '.tgz');
  const r = spawnSync('tar', ['czf', out, '-C', tmp].concat(noms.map((n) => path.basename(DIR) + '/' + n)), { encoding: 'utf8' });
  const octets = noms.reduce((t, n) => t + fs.statSync(path.join(racine, n)).size, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) fin('tar a echoue : ' + (r.stderr || r.error));
  console.log('Paquet : ' + out + ' (' + noms.length + ' fichiers, ~' + k(tok(octets)) + ' tok)');
  const dl = path.join(os.homedir(), 'storage', 'downloads');
  if (fs.existsSync(dl)) { fs.copyFileSync(out, path.join(dl, path.basename(out))); console.log('Copie : ' + path.join(dl, path.basename(out))); }
}

// Syntaxe des .mjs en un seul processus (vm.SourceTextModule : analyse sans execution) ; null si ce controle groupe est indisponible
// (option retiree d'une future version de Node...) : chaque fichier est alors controle par node --check, comme avant.
function syntaxeModules(ps) {
  const js = "const vm=require('node:vm'),fs=require('node:fs');const ko={};for(const p of JSON.parse(process.argv[1])){try{new vm.SourceTextModule(fs.readFileSync(p,'utf8'),{identifier:p});}catch(e){ko[p]=String(e&&e.stack||e).split('\\n').slice(0,5).join('\\n');}}console.log('SYNTAXE '+JSON.stringify(ko));";
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '-e', js, JSON.stringify(ps)], { encoding: 'utf8', timeout: 60000 });
  const l = String(r.stdout || '').split('\n').find((x) => x.startsWith('SYNTAXE '));
  if (r.status !== 0 || !l) return null;
  try { return JSON.parse(l.slice(8)); } catch (e) { return null; }
}

function check(liste) {
  let n = 0;
  const ko = (m) => { n++; console.log('ECHEC ' + m); };
  const mods = syntaxeModules(liste.filter((f) => path.extname(f.r) === '.mjs').map((f) => path.join(DIR, f.r)));
  for (const f of liste) {
    if (!f.zones.length) ko(f.r + ' : en-tete @zone absent');
    const ext = path.extname(f.r), p = path.join(DIR, f.r);
    let r = null;
    if (ext === '.mjs' && mods) {
      if (mods[p]) { r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' }); if (r.status === 0) r = { status: 1, stderr: mods[p] }; } // message avec la ligne : node --check du seul fichier en faute
    }
    else if (ext === '.js') { try { new vm.Script(f.txt, { filename: p }); } catch (e) { r = { status: 1, stderr: String(e.stack || e) }; } }
    else if (ext === '.mjs') r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    else if (ext === '.sh') {
      r = spawnSync('bash', ['-n', p], { encoding: 'utf8' });
      if (!(fs.statSync(p).mode & 0o100)) ko(f.r + ' : pas executable (corriger : chmod 700 ' + f.r + ')');
    }
    else if (ext === '.json') { try { JSON.parse(f.txt); } catch (e) { ko(f.r + ' : JSON illisible'); } }
    if (r && r.status !== 0) ko(f.r + ' : syntaxe\n' + String(r.stderr || r.error).split('\n').slice(0, 5).join('\n'));
  }
  for (const j of ['package.json', 'donnees/scenarios.json', 'donnees/layout.json', 'donnees/colors.json', 'donnees/cameras.json']) {
    const p = j.startsWith('donnees/') ? path.join(DON, j.slice(8)) : path.join(DIR, j);
    if (fs.existsSync(p)) { try { JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { ko(j + ' : JSON illisible'); } }
  }
  // Donnees : dossier 700, secrets 600, aucune donnee restee a la racine.
  const droits = (p) => fs.statSync(p).mode & 0o777;
  if (fs.existsSync(DON) && droits(DON) !== 0o700) ko('donnees/ : droits ' + droits(DON).toString(8) + ' (700 attendu : chmod 700 donnees)');
  const secs = ['dirigera-token.txt', 'smartthings.json', 'clients.json', 'tls/cle.pem'].concat(fs.existsSync(path.join(DON, 'camera-secrets')) ? fs.readdirSync(path.join(DON, 'camera-secrets')).map((n) => 'camera-secrets/' + n) : []);
  if (fs.existsSync(path.join(DON, 'tls')) && droits(path.join(DON, 'tls')) !== 0o700) ko('donnees/tls/ : droits ' + droits(path.join(DON, 'tls')).toString(8) + ' (700 attendu)'); // V1.8 : cle TLS du mode distant
  for (const r of secs) if (fs.existsSync(path.join(DON, r)) && droits(path.join(DON, r)) !== 0o600) ko('donnees/' + r + ' : droits ' + droits(path.join(DON, r)).toString(8) + ' (600 attendu)');
  for (const r of ['dirigera-token.txt', 'smartthings.json', 'scenarios.json', 'layout.json', 'colors.json', 'cameras.json', 'camera-secrets']) if (fs.existsSync(path.join(DIR, r))) ko(r + ' est encore a la racine : sa place est dans donnees/');
  const s = secrets();
  const servis = arbreTout('public');
  for (const r of new Set(liste.map((f) => f.r).concat(servis))) {
    if (fs.statSync(path.join(DIR, r)).size > 2e6) continue;
    if (fuite(fs.readFileSync(path.join(DIR, r), 'utf8'), s)) ko(r + ' contient un secret (jeton ou mot de passe)');
  }
  if (fs.existsSync(path.join(DIR, 'core', 'routeur.mjs'))) { // demarrage a blanc : modules et adaptateurs se chargent (aucun appel au hub)
    const js = "import('./core/routeur.mjs').then(async (m) => { await m.preparer(); console.log(m.inventaire().join('\\n')); process.exit(0); })" +
      ".catch((e) => { console.log('ECHEC ' + (e.code || e.name) + ' ' + String(e.stack || '').split('\\n').slice(0, 3).join(' | ')); process.exit(1); })";
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', js], { cwd: DIR, encoding: 'utf8', timeout: 60000 });
    const lignes = String(r.stdout || '').trim().split('\n').filter((l) => /^(GET|POST) /.test(l));
    if (r.status !== 0) ko('chargement des modules : ' + String(r.stdout || r.stderr || r.error).trim().split('\n').pop());
    else console.log('Modules charges : ' + lignes.length + ' routes.');
  }
  const att = fichiersIndex(liste);
  for (const [nom, t] of Object.entries(att)) { const p = path.join(DIR, nom); if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== t) ko(nom + ' pas a jour : lancer "node outils/ia.mjs"'); }
  if (decoupe()) for (const nom of fs.readdirSync(path.join(DIR, 'index'))) if (!(('index/' + nom) in att)) ko('index/' + nom + ' : zone disparue (lancer "node outils/ia.mjs")');
  if (fs.existsSync(path.join(DIR, '.claude', 'settings.json'))) { try { JSON.parse(fs.readFileSync(path.join(DIR, '.claude', 'settings.json'), 'utf8')); } catch (e) { ko('.claude/settings.json : JSON illisible'); } }
  const av = avertissements();
  for (const m of av) console.log('AVERTISSEMENT ' + m); // jamais bloquant : ni ko(), ni code de sortie
  console.log(n ? n + ' probleme(s).' : 'OK : ' + liste.length + ' fichiers controles, aucun secret, index a jour' + (av.length ? ' (' + av.length + ' avertissement(s))' : '') + '.');
  process.exitCode = n ? 1 : 0;
}

// Avertissements (jamais bloquants) : budget de CLAUDE.md et des regles ; motif d'une regle qui ne correspond a aucun fichier
function avertissements() {
  const w = [];
  const c = taille('CLAUDE.md');
  if (c > BUDGET_CLAUDE) w.push('CLAUDE.md : ' + c + ' octets (~' + k(tok(c)) + ' tok charges a chaque session), budget ' + BUDGET_CLAUDE + ' : deplacer du detail vers .claude/rules/, android/CLAUDE.md ou banc/CLAUDE.md (non bloquant).');
  const regles = fichiersRegles();
  for (const r of regles) if (taille(r) > BUDGET_REGLE) w.push(r + ' : ' + taille(r) + ' octets, budget ' + BUDGET_REGLE + ' (non bloquant).');
  const fichiers = regles.some((r) => !r.endsWith('/CLAUDE.md')) ? arbreRelatif('') : [];
  for (const r of regles.filter((x) => !x.endsWith('/CLAUDE.md'))) {
    const ms = motifsRegle(fs.readFileSync(path.join(DIR, r), 'utf8'));
    if (!ms.length) w.push(r + ' : aucun motif « paths » (charge a chaque session).');
    for (const m of ms) if (!fichiers.some((f) => globVersRegex(m).test(f))) w.push(r + ' : le motif « ' + m + ' » ne correspond a aucun fichier.');
  }
  return w;
}
function arbreRelatif(rel) { // tous les fichiers du depot (hors dossiers ignores, donnees, copies du banc)
  const out = [];
  for (const e of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP.has(e.name) && e.name !== 'captures' && !/^copie/.test(e.name) && !(rel === '' && e.name === '.claude')) out.push(...arbreRelatif(r)); }
    else out.push(r);
  }
  return out;
}
function arbreTout(rel) {
  const out = [];
  if (!fs.existsSync(path.join(DIR, rel))) return out;
  for (const e of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
    const r = rel + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'fonts') out.push(...arbreTout(r)); } else out.push(r);
  }
  return out;
}

// Paquet de version : tout le code + documentation + public/ complet (polices) ; jamais les donnees, secrets, journaux, sauvegardes.
const RACINE_VERSION = ['CLAUDE.md', 'INDEX.md', 'README.md', 'HISTORIQUE.md', 'VERSION', 'package.json', 'package-lock.json', 'scripts/homeassistant-diagnostic.txt']; // V2.0 : modele de diagnostic a coller dans Home Assistant (pas du code, livre tel quel)
const PUBLIC_OK = new Set(['.html', '.css', '.js', '.woff2', '.png', '.svg', '.ico', '.webmanifest']);
// Fichiers d'une version (paquet et depot public) : code indexe, documentation, public/ complet (polices)
function nomsVersion(liste) {
  const pub = arbreTout('public').concat(fs.existsSync(path.join(DIR, 'public', 'fonts')) ? fs.readdirSync(path.join(DIR, 'public', 'fonts')).map((n) => 'public/fonts/' + n) : [])
    .filter((r) => PUBLIC_OK.has(path.extname(r)) && !/\.(bak|tmp|avant)/.test(r));
  const code = liste.map((f) => f.r).filter((r) => !r.startsWith('android/')); // V1.9 : source de l'APK jamais livree (le depot public recoit l'APK construit, dans sa version)
  return [...new Set(RACINE_VERSION.filter((r) => fs.existsSync(path.join(DIR, r))).concat(code, pub))].sort();
}

// Depot public (V1.8) : meme arbre que le depot de travail, sans banc/ ni .github/, avec node_modules (aucun npm a l'installation) et son .gitignore.
// Controle de publication, bloquant : ce qui est publie ne se retire pas. Aucune adresse IPv4 privee (sauf l'exemple des champs de saisie), adresse de
// courriel, identifiant d'appareil (UUID) ni adresse materielle (MAC) ; le README ne decrit plus la cle de deploiement (inutile au lecteur du depot public).
const IP_EXEMPLE = new Set(['192.168.1.20']); // exemple affiche dans les champs d'adresse (hubs.js, cameras-ajout.js, appairage.mjs)
const PUBLIC_EN_PLUS = ['distribution', 'domo-wa']; // dossiers publies en entier (cle publique de signature, app Home Assistant) ; et repository.yaml
const GITIGNORE_PUBLIC = '# Depot public de distribution : donnees, sauvegardes et journaux restent sur l\'appareil\ndonnees/\nsauvegardes/\n*.log\n*.log.old\nserver.pid\n';
const TEXTE = new Set(['.mjs', '.js', '.css', '.html', '.sh', '.json', '.md', '.yaml', '.yml', '.pem', '.txt', '.svg', '.webmanifest', '']);
function fuitesPubliques(r, txt) {
  const p = [];
  const vu = (motif, quoi, garde) => { for (const m of txt.matchAll(motif)) if (!garde || garde(m[0])) { p.push(r + ' : ' + quoi + ' (ligne ' + txt.slice(0, m.index).split('\n').length + ')'); break; } };
  vu(/\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g, 'adresse IPv4 privee', (x) => !IP_EXEMPLE.has(x));
  vu(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,}\b/g, 'adresse de courriel', (x) => !/^git@github\.com$/.test(x) && !/@users\.noreply\.github\.com$/.test(x) && !/@(?:\d+x)?\.(?:png|svg)$/.test(x));
  vu(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'identifiant d\'appareil (UUID)');
  vu(/\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g, 'adresse materielle (MAC)');
  if (r === 'README.md') vu(/github-domo-wa|Deploy keys?|git@github/g, 'installation par cle de deploiement (depot prive) encore decrite');
  return p;
}
function arbreEntier(rel) { // tous les fichiers d'un dossier publie en entier
  const out = [];
  if (!fs.existsSync(path.join(DIR, rel))) return out;
  for (const e of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
    const r = rel + '/' + e.name;
    if (e.isDirectory()) out.push(...arbreEntier(r)); else if (e.isFile()) out.push(r);
  }
  return out;
}
// Refus de publier, avant toute lecture de l'arbre (V1.9 revision 2 : lance a la racine du depot de travail, la lecture parcourait banc/, dont les
// copies changent pendant le banc : erreur au lieu du refus, vu deux fois au banc). Rend le dossier de publication (chemin absolu).
function prealablePublier(dest) {
  if (!dest) fin('Usage : node outils/ia.mjs publier <dossier> (dossier absent ou vide, hors du projet)');
  dest = path.resolve(dest);
  if (dest === DIR || dest.startsWith(DIR + path.sep)) fin('REFUS : le dossier de publication doit etre hors du projet.');
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) fin('REFUS : ' + dest + ' n\'est pas vide.');
  if (fs.existsSync(path.join(DIR, 'banc'))) fin('REFUS : a lancer sur une copie sans banc/ (comme tout ia.mjs).');
  return dest;
}
function publier(liste, dest) {
  check(liste);
  if (process.exitCode) fin('Publication refusee : corriger d\'abord les problemes ci-dessus.');
  const version = fs.readFileSync(path.join(DIR, 'VERSION'), 'utf8').trim();
  if (!/^\d+\.\d+$/.test(version)) fin('VERSION invalide : ' + version + ' (deux chiffres, ex. 1.0)');
  const nm = path.join(DIR, 'node_modules');
  if (!fs.existsSync(path.join(nm, '.package-lock.json'))) fin('REFUS : node_modules absent (npm ci --omit=dev --ignore-scripts avant de publier).');
  const noms = [...new Set(nomsVersion(liste).concat(...PUBLIC_EN_PLUS.map(arbreEntier), fs.existsSync(path.join(DIR, 'repository.yaml')) ? ['repository.yaml'] : []))].sort();
  const s = secrets(); const pb = [];
  for (const r of noms) {
    if (!TEXTE.has(path.extname(r))) continue;
    const txt = fs.readFileSync(path.join(DIR, r), 'utf8');
    if (fuite(txt, s)) pb.push(r + ' : contient un secret');
    pb.push(...fuitesPubliques(r, txt));
  }
  if (pb.length) { for (const l of pb) console.log('  ' + l); fin('PUBLICATION REFUSEE : ' + pb.length + ' probleme(s) ci-dessus. Rien n\'a ete ecrit.'); }
  for (const r of noms) { fs.mkdirSync(path.dirname(path.join(dest, r)), { recursive: true }); fs.copyFileSync(path.join(DIR, r), path.join(dest, r)); }
  for (const r of noms) if (r.endsWith('.sh')) fs.chmodSync(path.join(dest, r), 0o755);
  fs.writeFileSync(path.join(dest, 'INDEX.md'), texteIndex(liste.filter((f) => !f.r.startsWith('android/')))); // V1.9 : INDEX.md de l'arbre public sans la source de l'APK (non livree)
  // dependances : fichiers seulement (ni .bin, liens vers les memes fichiers, ni liens symboliques)
  let n = 0;
  const copier = (rel) => {
    for (const e of fs.readdirSync(path.join(nm, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink() || (!rel && e.name === '.bin')) continue;
      if (e.isDirectory()) { fs.mkdirSync(path.join(dest, 'node_modules', r), { recursive: true }); copier(r); }
      else if (e.isFile()) { fs.copyFileSync(path.join(nm, r), path.join(dest, 'node_modules', r)); n++; }
    }
  };
  fs.mkdirSync(path.join(dest, 'node_modules'), { recursive: true }); copier('');
  fs.writeFileSync(path.join(dest, '.gitignore'), GITIGNORE_PUBLIC);
  console.log('Arbre public V' + version + ' : ' + dest + ' (' + noms.length + ' fichiers, ' + n + ' fichiers de dependances). Controle de publication : rien a signaler.');
}

function release(liste) {
  check(liste);
  if (process.exitCode) fin('Paquet de version refuse : corriger d\'abord les problemes ci-dessus.');
  const version = fs.readFileSync(path.join(DIR, 'VERSION'), 'utf8').trim();
  if (!/^\d+\.\d+$/.test(version)) fin('VERSION invalide : ' + version + ' (deux chiffres, ex. 1.0)');
  const noms = nomsVersion(liste).concat(decoupe() ? fs.readdirSync(path.join(DIR, 'index')).filter((n) => n !== 'apk.md').map((n) => 'index/' + n) : []); // index/ du depot de travail (sans la zone apk, non livree)
  const s = secrets();
  for (const r of noms) if (!r.endsWith('.woff2') && fuite(fs.readFileSync(path.join(DIR, r), 'utf8'), s)) fin('REFUS : ' + r + ' contient un secret. Aucun paquet cree.');
  const out = path.join(SORTIE, 'dirigera-tablette-v' + version + '.tgz');
  const r = spawnSync('tar', ['czf', out, '-C', path.dirname(DIR)].concat(noms.map((n) => path.basename(DIR) + '/' + n)), { encoding: 'utf8' });
  if (r.status !== 0) fin('tar a echoue : ' + (r.stderr || r.error));
  console.log('Paquet de version : ' + out + ' (' + noms.length + ' fichiers, ' + Math.round(fs.statSync(out).size / 1024) + ' Ko)');
  const dl = path.join(os.homedir(), 'storage', 'downloads');
  if (fs.existsSync(dl)) { fs.copyFileSync(out, path.join(dl, path.basename(out))); console.log('Copie : ' + path.join(dl, path.basename(out))); }
}

const [cmd, ...args] = process.argv.slice(2);
const destPublier = cmd === 'publier' ? prealablePublier(args[0]) : null;
const liste = arbre('').map(lire);
if (cmd === 'check') check(liste);
else if (cmd === 'pack') { ecrireIndex(liste); pack(args, liste); }
else if (cmd === 'release') { ecrireIndex(liste); release(liste); }
else if (cmd === 'publier') publier(liste, destPublier);
else if (cmd === 'couts') couts(liste);
else if (!cmd) { ecrireIndex(liste); console.log('Index a jour (' + liste.length + ' fichiers' + (decoupe() ? ' : INDEX.md et index/' : '') + ').'); }
else fin('Usage : node outils/ia.mjs [couts | pack zone... | check | release | publier <dossier>]');
// FIN
