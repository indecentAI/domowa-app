// @zone distant | Mode du serveur (V1.8) : donnees/serveur.json {v: 1, mode: local | distant, adresse (IPv4 privee), port} (absent = local ; invalide : mode local, fichier jamais reecrit), certificat TLS de l'ecoute reseau (donnees/tls/, cree par openssl, recree seulement si l'adresse change), ouverture de l'ecoute reseau (ouvrirEcouteReseau : nouvel essai toutes les 30 s si l'adresse est absente), etat de l'ecoute reseau (etat, declarer) lu par les routes ; V1.9 revision 2 : changerEcoute (mode change depuis l'application, sans redemarrage, rien de change si l'ecoute ne s'ouvre pas).
// L'ecoute locale 127.0.0.1:8080 (HTTP, sans appairage) existe toujours ; l'ecoute reseau (HTTPS, jeton exige : core/acces.mjs) seulement en mode distant.
// L'appartenance de l'adresse a la machine est verifiee par l'ouverture de l'ecoute elle-meme (EADDRNOTAVAIL) : Android peut refuser la liste des interfaces.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { DONNEES } from './outils.mjs';
import { privee } from './ipv4.mjs';

export const PORT_DEFAUT = 8443;
export const FICHIER = 'serveur.json';
const TLS = () => path.join(DONNEES, 'tls');
// privee() : meme definition que core/reseau.mjs (core/ipv4.mjs, sans dependance : ce fichier sert aussi aux scripts, sans charger le registre des adaptateurs)
export { privee };
export const portValide = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;

// Contenu de serveur.json -> {mode: 'local'} | {mode: 'distant', adresse, port} ; null si invalide.
export function valider(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  if (j.mode === 'local') return { mode: 'local' };
  if (j.mode !== 'distant') return null;
  const port = j.port === undefined ? PORT_DEFAUT : j.port;
  if (!privee(j.adresse) || !portValide(port)) return null;
  return { mode: 'distant', adresse: j.adresse, port };
}
// Fichier absent : mode local. Illisible ou invalide : mode local, invalide: true (le fichier n'est jamais reecrit par le serveur).
export function lireConfig(dossier = DONNEES) {
  const f = path.join(dossier, FICHIER);
  if (!fs.existsSync(f)) return { mode: 'local' };
  let j = null;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* illisible */ }
  return valider(j) || { mode: 'local', invalide: true };
}
// Ecrit par scripts/serveur.mjs (serveur arrete) et par changerEcoute (V1.9 revision 2 : POST /api/serveur/mode, ecoute locale seulement). Sans secret.
export function ecrireConfig(c, dossier = DONNEES) {
  const v = valider(c);
  if (!v) throw new Error('configuration invalide');
  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
  const f = path.join(dossier, FICHIER);
  fs.writeFileSync(f + '.tmp', JSON.stringify({ v: 1, ...v }, null, 1));
  fs.renameSync(f + '.tmp', f);
  return v;
}
// Adresses IPv4 privees de la machine ([] si le systeme refuse la liste : Android)
export function adressesMachine() {
  const r = [];
  try {
    const ifs = os.networkInterfaces();
    for (const n of Object.keys(ifs)) for (const a of ifs[n] || []) if (a.family === 'IPv4' && !a.internal && privee(a.address) && !r.includes(a.address)) r.push(a.address);
  } catch (e) { /* liste refusee */ }
  return r;
}

// Certificat en place s'il porte cette adresse, correspond a sa cle et n'expire pas dans le mois ; sinon null.
function lireCertificat(adresse, dossier = TLS()) {
  try {
    const key = fs.readFileSync(path.join(dossier, 'cle.pem')), cert = fs.readFileSync(path.join(dossier, 'certificat.pem'));
    const x = new crypto.X509Certificate(cert);
    if (!String(x.subjectAltName || '').split(', ').includes('IP Address:' + adresse)) return null;
    if (new Date(x.validTo).getTime() < Date.now() + 30 * 86400000) return null;
    if (!x.checkPrivateKey(crypto.createPrivateKey(key))) return null;
    return { key, cert, empreinte: x.fingerprint256 };
  } catch (e) { return null; }
}
// Cle (600) et certificat autosigne (ECDSA P-256, 10 ans, adresse du serveur en subjectAltName) dans donnees/tls/ (700). Rend {key, cert, empreinte (SHA-256), cree}.
// Erreur (openssl absent...) : code TLS_CREATION, sans message d'origine.
// V1.9 revision 2 : essai (dossier autre que donnees/tls/, changement de mode depuis l'application) : le certificat en place sert s'il convient ;
// sinon le nouveau est cree dans ce dossier ({..., essai: dossier}) et n'est mis en place (installerCertificat) que si l'ecoute s'ouvre.
export function certificat(adresse, dossier = TLS()) {
  if (!privee(adresse)) throw Object.assign(new Error('adresse'), { code: 'TLS_ADRESSE' });
  const la = lireCertificat(adresse);
  if (la) return { ...la, cree: false };
  const d = dossier, essai = dossier !== TLS();
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  fs.chmodSync(d, 0o700);
  const k = path.join(d, 'cle.pem'), c = path.join(d, 'certificat.pem');
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', k + '.tmp', '-out', c + '.tmp', '-days', '3650',
      '-subj', '/CN=Domowa', '-addext', 'subjectAltName=IP:' + adresse, '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'keyUsage=critical,digitalSignature',
      '-addext', 'extendedKeyUsage=serverAuth'], { stdio: 'ignore', timeout: 60000 });
    fs.chmodSync(k + '.tmp', 0o600); fs.chmodSync(c + '.tmp', 0o600);
    fs.renameSync(k + '.tmp', k); fs.renameSync(c + '.tmp', c);
  } catch (e) {
    for (const f of [k + '.tmp', c + '.tmp']) { try { fs.unlinkSync(f); } catch (x) { /* absent */ } }
    throw Object.assign(new Error('certificat'), { code: 'TLS_CREATION' });
  }
  const neuf = lireCertificat(adresse, d);
  if (!neuf) throw Object.assign(new Error('certificat'), { code: 'TLS_CREATION' });
  return essai ? { ...neuf, cree: true, essai: d } : { ...neuf, cree: true };
}
// Certificat d'essai mis en place dans donnees/tls/ (cle puis certificat, renommages), dossier d'essai retire.
export function installerCertificat(dossier) {
  const d = TLS();
  for (const f of ['cle.pem', 'certificat.pem']) fs.renameSync(path.join(dossier, f), path.join(d, f));
  try { fs.rmdirSync(dossier); } catch (e) { /* deja retire */ }
}
// Empreinte du certificat en place pour cette adresse (scripts ; null si absent)
export const empreinteDe = (adresse) => { const c = lireCertificat(adresse); return c ? c.empreinte : null; };

// Ecoute reseau du mode distant (qualite 2026-11-14 : extraite de server.mjs pour etre essayee sans reseau ; comportement inchange).
// config : resultat de lireConfig(). Dependances : traiter (gestionnaire des requetes de l'ecoute reseau), reglerReseau (core/http.mjs), journal (log),
// diagnostic() -> {connexion(), echecTls(e)} (core/portier.mjs) ; remplacables pour les essais : creer (https.createServer), certificat, declarer,
// afficher (console.log : ligne lue dans server.log, sans adresse), attendre (setTimeout), annoncer({adresse, port}) (V1.9 : core/annonce.mjs, appele a l'ouverture).
// Mode local : rien n'est ouvert. Echec du certificat : motif, journal, ecoute fermee. Adresse pas encore celle de la machine (EADDRNOTAVAIL : Wi-Fi pas
// encore connecte, sortie de veille) : nouvel essai toutes les 30 s, sans limite ; autre echec (port pris...) : pas de nouvel essai. Journal au premier
// echec seulement (code, jamais l'adresse) ; l'ouverture est affichee avec le nombre d'essais. Une fois ouverte, l'ecoute survit a une coupure du Wi-Fi.
export const REESSAI_RESEAU = 30000;
export function motifEcoute(code) {
  if (code === 'EADDRNOTAVAIL') return 'L\'adresse choisie n\'est pas celle de cette machine pour l\'instant (Wi-Fi connecté ?) : nouvel essai toutes les 30 s.';
  if (code === 'EADDRINUSE') return 'Le port choisi est déjà pris.';
  return 'L\'accès réseau n\'a pas pu s\'ouvrir.';
}
export function ouvrirEcouteReseau(config, d) {
  const o = { certificat, declarer, afficher: (...x) => console.log(...x), attendre: (f, ms) => setTimeout(f, ms), creer: (opts, h) => https.createServer(opts, h), annoncer: () => {}, ...d };
  branche = { o, suivi: null }; // V1.9 revision 2 : dependances gardees pour changerEcoute (aussi en mode local)
  if (config.invalide) o.journal('serveur.json illisible ou invalide : mode local (fichier laissé tel quel ; le refaire : node scripts/serveur.mjs)');
  if (config.mode !== 'distant') return null;
  o.declarer({ mode: 'distant', adresse: config.adresse, port: config.port });
  const suivi = nouveauSuivi();
  branche.suivi = suivi;
  let c;
  const ouvrir = () => {
    if (suivi.ferme) return; // ecoute remplacee ou fermee depuis l'application : plus de nouvel essai
    suivi.essais++;
    const reseau = o.creer({ key: c.key, cert: c.cert, minVersion: 'TLSv1.2' }, o.traiter);
    suivi.serveur = reseau;
    reseau.on('error', (e) => {
      if (suivi.ferme) return;
      const absente = e.code === 'EADDRNOTAVAIL', motif = motifEcoute(e.code);
      o.declarer({ ecoute: false, motif }); o.reglerReseau(null);
      if (suivi.essais === 1) o.journal('mode distant : écoute réseau impossible (' + (e.code || e.name) + ') : ' + motif + ' Si l\'adresse a changé : node scripts/serveur.mjs');
      try { reseau.close(); } catch (x) { /* jamais ouverte */ }
      if (absente) o.attendre(ouvrir, REESSAI_RESEAU);
    });
    // Diagnostic (jamais d'adresse) : premiere connexion recue, negociations TLS en echec (code seul, une ligne par code et par minute au plus).
    const diag = o.diagnostic();
    reseau.on('connection', () => diag.connexion());
    reseau.on('tlsClientError', (e) => diag.echecTls(e));
    reseau.listen(config.port, config.adresse, () => {
      if (suivi.ferme) { fermerServeur(reseau); return; }
      ouverte(o, config, c, suivi);
    });
  };
  // Comme avant l'extraction : une erreur synchrone du premier essai (certificat, creation de l'ecoute) ferme l'acces reseau avec ce motif.
  try {
    c = o.certificat(config.adresse);
    if (c.cree) o.journal('mode distant : certificat créé (donnees/tls/)');
    ouvrir();
  } catch (e) {
    o.declarer({ ecoute: false, motif: 'Le certificat n\'a pas pu être créé (openssl est-il installé ?).' });
    o.journal('mode distant : certificat impossible (' + ((e && (e.code || e.name)) || 'inconnu') + ') : accès réseau fermé');
    return null;
  }
  return suivi;
}

// Ecoute ouverte : Host et Origin de l'ecoute reseau, etat, annonce mDNS (V1.9 : recherche de l'APK, tant que l'ecoute est ouverte ; echec : journal, rien d'autre).
function ouverte(o, config, c, suivi) {
  o.reglerReseau(config.adresse, config.port);
  o.declarer({ ecoute: true, empreinte: c.empreinte, motif: null });
  suivi.annonce = o.annoncer({ adresse: config.adresse, port: config.port });
  o.afficher('Accès réseau prêt (HTTPS, port ' + config.port + ')' + (suivi.essais > 1 ? ' après ' + suivi.essais + ' essais.' : '.'));
}
function fermerServeur(s) { try { s.close(); if (s.closeAllConnections) s.closeAllConnections(); } catch (e) { /* deja ferme */ } }
// Suivi d'une ecoute reseau : {essais, serveur, annonce, ferme, fermer()} ; fermer : plus de nouvel essai, ecoute et connexions fermees, annonce arretee.
function nouveauSuivi() {
  const s = { essais: 0, serveur: null, annonce: null, ferme: false };
  s.fermer = () => {
    s.ferme = true;
    if (s.serveur) fermerServeur(s.serveur);
    Promise.resolve(s.annonce).then((a) => { if (a && a.arreter) a.arreter(); }).catch(() => {});
  };
  return s;
}

// V1.9 revision 2 : changement de mode sans redemarrage (POST /api/serveur/mode, ecoute locale seulement : modules/appairage.mjs). Une demande a la fois.
// local : serveur.json ecrit, ecoute reseau et annonce fermees. distant : l'ecoute est d'abord essayee sur la nouvelle adresse (certificat d'essai si
// l'adresse change) ; echec (adresse qui n'est pas celle de la machine, port pris, openssl absent) : rien n'est change (ecoute, certificat et fichier
// gardes), motif rendu ; reussite : certificat mis en place, serveur.json ecrit, ancienne ecoute fermee, nouvelle ecoute en service. Rend {ok, motif?}.
// Dependances : celles de ouvrirEcouteReseau (gardees au demarrage), remplacables par d (essais) : ecrireConfig, installerCertificat, dossierEssai.
let branche = null, changement = false;
export function motifChangement(code) {
  if (code === 'EADDRNOTAVAIL') return 'Cette adresse n\'est pas celle de cette machine en ce moment (Wi-Fi connecté ? adresse recopiée sans erreur ?). Rien n\'a été changé.';
  if (code === 'EADDRINUSE') return 'Ce port est déjà pris par un autre programme de cette machine : choisissez-en un autre (8443 par défaut). Rien n\'a été changé.';
  if (code === 'TLS_CREATION') return 'Le certificat n\'a pas pu être créé (openssl est-il installé ? Termux : pkg install openssl-tool). Rien n\'a été changé.';
  return 'L\'accès réseau n\'a pas pu s\'ouvrir. Rien n\'a été changé.';
}
export async function changerEcoute(cible, d = {}) {
  if (!branche) return { ok: false, motif: 'Le serveur n\'est pas prêt : réessayer dans un instant.' };
  if (changement) return { ok: false, motif: 'Un changement de mode est déjà en cours.' };
  changement = true;
  try { return await changer(cible, { ecrireConfig, installerCertificat, dossierEssai: path.join(TLS(), 'essai'), ...branche.o, ...d }); } finally { changement = false; }
}
async function changer(cible, o) {
  const ancien = branche.suivi;
  if (cible.mode === 'local') {
    o.ecrireConfig({ mode: 'local' });
    if (ancien) ancien.fermer();
    branche.suivi = null;
    o.reglerReseau(null);
    o.declarer({ mode: 'local', ecoute: false, adresse: null, port: null, url: null, empreinte: null, motif: null });
    o.journal('mode local (choisi dans l\'application) : accès réseau fermé');
    return { ok: true };
  }
  let c;
  try { c = o.certificat(cible.adresse, o.dossierEssai); } catch (e) {
    o.journal('changement de mode refusé : certificat impossible (' + ((e && (e.code || e.name)) || 'inconnu') + '), rien n\'a été changé');
    return { ok: false, motif: motifChangement('TLS_CREATION') };
  }
  const suivi = nouveauSuivi();
  const r = await new Promise((resolve) => {
    const s = o.creer({ key: c.key, cert: c.cert, minVersion: 'TLSv1.2' }, o.traiter);
    suivi.serveur = s;
    s.once('error', (e) => { fermerServeur(s); resolve({ ok: false, code: e.code }); });
    s.listen(cible.port, cible.adresse, () => resolve({ ok: true }));
  });
  if (!r.ok) {
    if (c.essai) { for (const f of ['cle.pem', 'certificat.pem']) { try { fs.unlinkSync(path.join(c.essai, f)); } catch (e) { /* absent */ } } try { fs.rmdirSync(c.essai); } catch (e) { /* absent */ } }
    o.journal('changement de mode refusé : écoute réseau impossible (' + (r.code || 'inconnu') + '), rien n\'a été changé');
    return { ok: false, motif: motifChangement(r.code) };
  }
  if (c.essai) o.installerCertificat(c.essai);
  o.ecrireConfig({ mode: 'distant', adresse: cible.adresse, port: cible.port });
  if (ancien) ancien.fermer();
  branche.suivi = suivi;
  // Ensuite comme une ecoute ouverte au demarrage : erreur (rare, apres ouverture) -> ecoute fermee avec son motif ; diagnostic ; annonce.
  suivi.serveur.on('error', (e) => { if (suivi.ferme) return; o.declarer({ ecoute: false, motif: motifEcoute(e.code) }); o.reglerReseau(null); fermerServeur(suivi.serveur); });
  const diag = o.diagnostic();
  suivi.serveur.on('connection', () => diag.connexion());
  suivi.serveur.on('tlsClientError', (e) => diag.echecTls(e));
  suivi.essais = 1;
  o.declarer({ mode: 'distant', adresse: cible.adresse, port: cible.port });
  ouverte(o, cible, c, suivi);
  o.journal('mode distant (choisi dans l\'application) : accès réseau ouvert' + (c.cree ? ', certificat créé' : ''));
  return { ok: true };
}

// Etat de l'ecoute reseau, pose par server.mjs au demarrage, lu par les routes (modules/appairage.mjs, GET /api/status). Sans secret.
// {mode, ecoute (l'ecoute reseau est ouverte), adresse, port, url, empreinte, motif (texte si l'ecoute a echoue)}
const courant = { mode: 'local', ecoute: false, adresse: null, port: null, url: null, empreinte: null, motif: null };
export const etat = () => ({ ...courant });
export function declarer(e) { Object.assign(courant, e); if (courant.adresse && courant.port) courant.url = 'https://' + courant.adresse + ':' + courant.port; return etat(); }
// FIN
