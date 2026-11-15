// @zone cameras-ajout
// decouverte.mjs : recherche des cameras IP du reseau local (ONVIF WS-Discovery, mDNS, SSDP, puis scan de ports).
// Aucun identifiant n'est utilise ici : seuls des sondages anonymes partent vers les appareils (OPTIONS RTSP, GetSystemDateAndTime ONVIF).
// Seules les adresses privees des sous-reseaux locaux de la tablette sont acceptees (pas de SSRF).
// Utilisation : const job = lancer(); liste(job) donne les resultats au fil de l'eau ; job.annuler() ; await job.promesse.
// Sources remplacables (essais unitaires, qualite 2026-11-11) : lancer({sources, balayage}) ; chaque source recoit le job et y ajoute ses resultats par ajoute().
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const DUREE_SOURCES_MS = 5000; // ONVIF, mDNS et SSDP en parallele
const PORTS = [554, 8554, 2020, 8000, 80, 8080];
const PORTS_RTSP = [554, 8554];
const SONDE_MS = 700;
const CONCURRENCE = 40;
const MOTIF_CAMERA = /camera|ipcam|onvif|netcam|networkvideo|tapo|reolink|hikvision|ezviz|dahua|imou|xiaomi|mijia/i;

// ---------- adresses ----------
// Outils communs (core/reseau.mjs, V1.2) : repli sur le /24 des hubs declares si Android refuse la liste des interfaces.
import { estIPv4, vers, depuis, reseaux, adresseLocale } from '../../core/reseau.mjs';
export { estIPv4, reseaux, adresseLocale };

// ---------- marques ----------
function marques() {
  try { const j = JSON.parse(fs.readFileSync(path.join(DIR, 'cameras-marques.json'), 'utf8')); return Array.isArray(j.marques) ? j.marques : []; } catch (e) { return []; }
}
const txt = (x) => (typeof x === 'string' ? x : x && typeof x._ === 'string' ? x._ : '');
const premier = (x) => (Array.isArray(x) ? x[0] : x);

// ---------- resultats ----------
function nouveauJob() {
  const ctrl = new AbortController();
  return { etat: 'en cours', etape: '', resultats: new Map(), erreurs: [], debut: Date.now(), fin: null, ctrl, marques: marques(), promesse: null, annuler: () => ctrl.abort() };
}
export function liste(job) {
  return Array.from(job.resultats.values()).sort((a, b) => vers(a.ip) - vers(b.ip));
}
function erreur(job, m) { if (job.erreurs.length < 20) job.erreurs.push(String(m).slice(0, 160)); }
export function ajoute(job, ip, source, infos) {
  if (job.ctrl.signal.aborted || !adresseLocale(ip)) return;
  let r = job.resultats.get(ip);
  if (!r) { r = { id: 'ip-' + ip.replace(/\./g, '-'), ip, onvifPort: null, rtspPort: null, marque: '', modele: '', nom: '', protocoles: [], sources: [] }; job.resultats.set(ip, r); }
  if (infos && infos.proto && r.protocoles.indexOf(infos.proto) < 0) r.protocoles.push(infos.proto);
  if (r.sources.indexOf(source) < 0) r.sources.push(source);
  if (infos) {
    if (infos.onvifPort && !r.onvifPort) r.onvifPort = infos.onvifPort;
    if (infos.rtspPort && !r.rtspPort) r.rtspPort = infos.rtspPort;
    if (infos.modele && !r.modele) r.modele = String(infos.modele).slice(0, 60);
    if (infos.nom && !r.nom) r.nom = String(infos.nom).slice(0, 60);
  }
  if (!r.marque) {
    const t = [r.nom, r.modele, infos && infos.texte].join(' ');
    for (const m of job.marques) { try { if (new RegExp(m.motif, 'i').test(t)) { r.marque = m.nom; break; } } catch (e) { /* motif invalide : ignore */ } }
  }
}
const attendre = (ms, signal) => new Promise((res) => { const t = setTimeout(res, ms); signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });

// ---------- source 1 : ONVIF WS-Discovery ----------
let onvifPret = false;
function wsd(job) {
  return new Promise((resolve) => {
    let D;
    try { D = require('onvif').Discovery; if (!onvifPret) { D.on('error', () => {}); onvifPret = true; } } catch (e) { erreur(job, 'ONVIF : bibliotheque "onvif" absente (npm install).'); return resolve(); }
    let fini = false;
    const sur = (data, rinfo) => {
      try {
        const m = premier(data && data.probeMatches && data.probeMatches.probeMatch);
        if (!m || !rinfo) return;
        let port = null;
        for (const u of txt(m.XAddrs).split(/\s+/)) { try { const U = new URL(u); if (U.hostname === rinfo.address) { port = Number(U.port) || 80; break; } } catch (e) { /* adresse ignoree */ } }
        const o = {};
        for (const s of txt(m.scopes).split(/\s+/)) {
          const k = /^onvif:\/\/www\.onvif\.org\/(name|hardware)\/(.+)$/.exec(s);
          if (k) { let v = k[2]; try { v = decodeURIComponent(v); } catch (e) { /* garde tel quel */ } o[k[1]] = v.replace(/_/g, ' '); }
        }
        ajoute(job, rinfo.address, 'onvif', { proto: 'onvif', onvifPort: port, modele: o.hardware, nom: o.name, texte: txt(m.scopes) });
      } catch (e) { /* reponse illisible */ }
    };
    const fin = () => { if (fini) return; fini = true; try { D.removeListener('device', sur); } catch (e) { /* rien */ } resolve(); };
    D.on('device', sur);
    try { D.probe({ timeout: DUREE_SOURCES_MS, resolve: false }, fin); } catch (e) { erreur(job, 'ONVIF : ' + (e && e.message)); fin(); }
    job.ctrl.signal.addEventListener('abort', fin, { once: true });
  });
}

// ---------- source 2 : mDNS (_rtsp._tcp et _http._tcp) ----------
function mdns(job) {
  return new Promise((resolve) => {
    let B, navs = [];
    try { const { Bonjour } = require('bonjour-service'); B = new Bonjour({}, () => {}); } catch (e) { erreur(job, 'mDNS : bibliotheque "bonjour-service" absente (npm install).'); return resolve(); }
    const fin = () => { try { navs.forEach((n) => n.stop()); B.destroy(); } catch (e) { /* rien */ } resolve(); };
    try {
      ['rtsp', 'http'].forEach((type) => {
        const nav = B.find({ type }, (s) => {
          try {
            const ip = (s.addresses || []).find((a) => estIPv4(a));
            if (!ip) return;
            const t = [s.name, s.host].join(' ');
            if (type === 'rtsp') ajoute(job, ip, 'mdns', { proto: 'rtsp', rtspPort: s.port, nom: s.name, texte: t });
            else if (job.resultats.has(ip) || MOTIF_CAMERA.test(t)) ajoute(job, ip, 'mdns', { nom: s.name, texte: t });
          } catch (e) { /* annonce illisible */ }
        });
        navs.push(nav);
      });
    } catch (e) { erreur(job, 'mDNS : ' + (e && e.message)); return fin(); }
    attendre(DUREE_SOURCES_MS - 1000, job.ctrl.signal).then(fin);
  });
}

// ---------- source 3 : SSDP ----------
function ssdp(job) {
  return new Promise((resolve) => {
    let c;
    try { const { Client } = require('node-ssdp'); c = new Client(); c.on('error', () => {}); } catch (e) { erreur(job, 'SSDP : bibliotheque "node-ssdp" absente (npm install).'); return resolve(); }
    const fin = () => { try { c.stop(); } catch (e) { /* rien */ } resolve(); };
    c.on('response', (h, code, rinfo) => {
      try {
        const t = [h.SERVER, h.ST, h.USN].join(' ');
        if (rinfo && (job.resultats.has(rinfo.address) || MOTIF_CAMERA.test(t))) ajoute(job, rinfo.address, 'ssdp', { proto: 'ssdp', texte: t });
      } catch (e) { /* reponse illisible */ }
    });
    try { c.search('ssdp:all'); } catch (e) { erreur(job, 'SSDP : ' + (e && e.message)); return fin(); }
    attendre(DUREE_SOURCES_MS - 1000, job.ctrl.signal).then(fin);
  });
}

// ---------- source 4 : scan des ports du sous-reseau ----------
function ouvert(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port }); let fin = false;
    const end = (v) => { if (!fin) { fin = true; s.destroy(); resolve(v); } };
    s.setTimeout(SONDE_MS, () => end(false)); s.on('error', () => end(false)); s.on('connect', () => end(true));
  });
}
function rtspRepond(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port }); let buf = '', fin = false;
    const end = (v) => { if (!fin) { fin = true; s.destroy(); resolve(v); } };
    s.setTimeout(1500, () => end(false)); s.on('error', () => end(false)); s.on('close', () => end(false));
    s.on('connect', () => s.write('OPTIONS rtsp://' + host + ':' + port + '/ RTSP/1.0\r\nCSeq: 1\r\n\r\n'));
    s.on('data', (d) => { buf += d.toString('latin1'); if (buf.length >= 8) end(buf.slice(0, 8) === 'RTSP/1.0'); });
  });
}
function onvifRepond(host, port) {
  return new Promise((resolve) => {
    const corps = Buffer.from('<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>');
    let fin = false;
    const end = (v) => { if (!fin) { fin = true; resolve(v); } };
    const r = http.request({ host, port, path: '/onvif/device_service', method: 'POST', timeout: 1500,
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': corps.length } }, (res) => {
      let b = ''; res.on('data', (d) => { if (b.length < 4000) b += d; }); res.on('end', () => end(/Envelope|onvif/i.test(b))); res.on('error', () => end(false));
    });
    r.on('timeout', () => { r.destroy(); end(false); }); r.on('error', () => end(false));
    r.end(corps);
  });
}
async function scan(job) {
  const hotes = [], vus = new Set();
  for (const r of reseaux()) for (let i = 1; i < 255; i++) { const ip = depuis(r.base24 + i); if (ip !== r.ip && !vus.has(ip)) { vus.add(ip); hotes.push(ip); } }
  let suivant = 0;
  async function sonde(ip) {
    const ouverts = (await Promise.all(PORTS.map((p) => ouvert(ip, p).then((o) => (o ? p : 0))))).filter(Boolean);
    if (!ouverts.length || job.ctrl.signal.aborted) return;
    for (const p of ouverts.filter((x) => PORTS_RTSP.indexOf(x) >= 0)) { if (await rtspRepond(ip, p)) { ajoute(job, ip, 'scan', { proto: 'rtsp', rtspPort: p }); break; } }
    for (const p of ouverts.filter((x) => PORTS_RTSP.indexOf(x) < 0)) { if (await onvifRepond(ip, p)) { ajoute(job, ip, 'scan', { proto: 'onvif', onvifPort: p }); break; } }
  }
  async function ouvrier() { while (suivant < hotes.length && !job.ctrl.signal.aborted) { const ip = hotes[suivant++]; try { await sonde(ip); } catch (e) { /* hote ignore */ } } }
  await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier));
}

// ---------- orchestration ----------
// sources : ONVIF, mDNS et SSDP en parallele (chacune rend une promesse) ; balayage : scan des ports ensuite, sauf annulation.
export function lancer({ sources = [wsd, mdns, ssdp], balayage = scan } = {}) {
  const job = nouveauJob();
  job.promesse = (async () => {
    try {
      job.etape = 'Recherche ONVIF, mDNS et SSDP...';
      await Promise.all(sources.map((s) => s(job)).map((p) => p.catch((e) => erreur(job, e && e.message))));
      if (!job.ctrl.signal.aborted) { job.etape = 'Scan des ports du reseau...'; await balayage(job); }
    } catch (e) { erreur(job, e && e.message); }
    job.etat = job.ctrl.signal.aborted ? 'annulee' : 'terminee';
    job.etape = ''; job.fin = Date.now();
  })();
  return job;
}
// FIN
