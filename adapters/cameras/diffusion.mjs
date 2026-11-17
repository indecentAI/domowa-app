// @zone cameras | Flux partagé d'une caméra (V1.9) : un seul ffmpeg (une seule session RTSP) par caméra, sa sortie MP4 fragmentée envoyée à chaque appareil qui regarde (4 au plus par caméra, 2 caméras à la fois). Un appareil qui arrive en cours reçoit l'en-tête gardé (ftyp, moov) puis commence au prochain fragment qui s'ouvre sur une image clé (mp4.mjs) ; un appareil en retard (plus de 1,5 Mo en attente d'envoi) saute des fragments et reprend à une image clé, coupé après 20 s de retard ; il ne ralentit jamais les autres. Qualité : une demande sans choix rejoint le flux en cours, quelle que soit sa qualité ; un choix explicite (choix=1, bouton SD/HD) d'une autre qualité relance ffmpeg pour tous (les autres se reconnectent d'eux-mêmes) ; un appareil seul change toujours de qualité. Identifiant de lecteur v (une carte de l'accueil) : sa nouvelle demande remplace l'ancienne. Dernier appareil parti : ffmpeg arrêté ; un nouveau ffmpeg ne démarre qu'une fois l'ancien terminé (3 s au plus). Journal : fin de chaque flux et sa raison, nombre d'appareils au plus ; jamais d'adresse ni d'identifiant. Dépendances remplaçables (lancer, journal) ; essais : banc/unitaires/diffusion.test.mjs.
import { HttpError } from '../../core/http.mjs';
import { creerDecoupeur, pisteVideo, imageCle } from './mp4.mjs';

export const MAX_FLUX = 2; // caméras regardées en même temps (un ffmpeg chacune)
export const MAX_APPAREILS = 4; // appareils qui regardent une même caméra
export const DEMARRAGE_MS = 15000;
export const SILENCE_MS = 7000; // ffmpeg n'envoie plus rien depuis 7 s (caméra déconnectée) : arrêt
export const RETARD_MAX = 1.5 * 1024 * 1024; // octets en attente d'envoi vers un appareil au-delà desquels il saute des fragments
export const RETARD_FIN_MS = 20000; // appareil en retard depuis 20 s : coupé (son lecteur se reconnecte)
const INIT_MAX = 1024 * 1024; // en-tête (ftyp, moov...) de plus de 1 Mo : flux illisible
const ARRET_MS = 3000;
const ENTETES = { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none', 'X-Content-Type-Options': 'nosniff' };
const NAVIGATEUR = 'navigateur (page fermée, arrêt ou flux remplacé)';

// lancer(cam, sec, hd) -> {proc (stdout, stderr, kill, on), masquer(texte)} ; journal(...morceaux).
export function creerDiffusions({ lancer, journal }) {
  const actives = new Map(); // id caméra -> diffusion en cours
  const dernieres = new Map(); // id caméra -> dernière diffusion lancée (attendre la fin de son ffmpeg)
  const finis = new Map(); // id caméra -> fin du dernier ffmpeg
  const chaines = new Map(); // id caméra -> dernière demande traitée (demandes d'une caméra une à la fois, dans l'ordre)

  function enfiler(id, fn) {
    const p = (chaines.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    chaines.set(id, p);
    return p;
  }
  function echec(c, status, message) {
    if (c.res.destroyed) return;
    if (c.res.headersSent) { c.res.end(); return; }
    c.res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    c.res.end(JSON.stringify({ error: message }));
  }
  function entetes(c) { if (!c.res.headersSent && !c.res.destroyed) c.res.writeHead(200, ENTETES); }
  function ecrire(c, bufs) { for (const b of bufs) c.res.write(b); }

  function couper(D, why) {
    if (actives.get(D.cam.id) === D) actives.delete(D.cam.id);
    if (D.coupe) return;
    D.coupe = true;
    if (D.why === 'fin de ffmpeg') D.why = why;
    clearTimeout(D.timer);
    try { D.proc.kill('SIGTERM'); } catch (e) { /* déjà terminé */ }
    setTimeout(() => { try { D.proc.kill('SIGKILL'); } catch (e) { /* déjà terminé */ } }, 2000).unref();
  }
  function quitter(D, c) {
    if (c.parti) return;
    c.parti = true;
    D.clients.delete(c);
    if (!D.clients.size && actives.get(D.cam.id) === D) couper(D, NAVIGATEUR);
  }
  function retard(D, c) {
    c.attente = true;
    if (!c.retardDepuis) c.retardDepuis = Date.now();
    else if (Date.now() - c.retardDepuis > RETARD_FIN_MS) {
      journal('camera', D.cam.id + (D.hd ? ' (HD)' : ''), 'appareil coupé : en retard depuis', Math.round(RETARD_FIN_MS / 1000) + ' s');
      quitter(D, c);
      c.res.destroy();
    }
  }
  // Un fragment (moof, mdat et boîtes qui suivent) à chaque appareil : en attente, seulement s'il s'ouvre sur une image clé (en-tête d'abord).
  function distribuer(D, frag) {
    const ouvrable = frag.cle !== false;
    for (const c of [...D.clients]) {
      if (c.res.destroyed || !c.res.headersSent) continue;
      if (c.res.writableLength > RETARD_MAX) { retard(D, c); continue; }
      if (c.attente) {
        if (!ouvrable) continue;
        if (!c.initEnvoye) { ecrire(c, D.init); c.initEnvoye = true; }
        c.attente = false;
      }
      c.retardDepuis = 0;
      ecrire(c, frag.bufs);
    }
  }
  function boite(D, b) {
    if (!D.initPret && b.type !== 'moof') {
      D.init.push(b.buf); D.tailleInit += b.buf.length;
      if (b.type === 'moov') D.piste = pisteVideo(b.buf);
      if (D.tailleInit > INIT_MAX) couper(D, 'flux illisible (en-tête trop grand)');
      return;
    }
    D.initPret = true;
    if (b.type === 'moof') {
      if (D.frag) distribuer(D, D.frag);
      D.frag = { bufs: [b.buf], cle: imageCle(b.buf, D.piste) };
    } else if (D.frag) {
      D.frag.bufs.push(b.buf);
      if (b.type === 'mdat') { distribuer(D, D.frag); D.frag = null; }
    } else distribuer(D, { bufs: [b.buf], cle: false });
  }

  function demarrer(cam, sec, hd) {
    const { proc, masquer } = lancer(cam, sec, hd);
    let resoudre;
    const D = { cam, hd, proc, clients: new Set(), decoupeur: creerDecoupeur(), init: [], tailleInit: 0, initPret: false, piste: null, frag: null,
      started: false, coupe: false, termine: false, why: 'fin de ffmpeg', timer: null, t0: Date.now(), bytes: 0, max: 0, err: '',
      fin: new Promise((r) => { resoudre = r; }) };
    actives.set(cam.id, D); dernieres.set(cam.id, D);
    const arm = (ms, w) => { clearTimeout(D.timer); D.timer = setTimeout(() => couper(D, w), ms); };
    arm(DEMARRAGE_MS, 'démarrage trop long');
    const terminer = (code, signal, status, message) => {
      if (D.termine) return;
      D.termine = true;
      clearTimeout(D.timer);
      if (actives.get(cam.id) === D) actives.delete(cam.id);
      finis.set(cam.id, Date.now());
      for (const c of D.clients) { c.parti = true; if (D.started) { if (!c.res.destroyed) c.res.end(); } else echec(c, status, message); }
      D.clients.clear();
      resoudre();
      journal('camera', cam.id + (hd ? ' (HD)' : ''), D.started ? 'fin' : 'échec', 'raison:', D.why, 'sortie:', code === null ? signal : code, 'octets:', D.bytes,
        'durée:', Math.round((Date.now() - D.t0) / 1000) + ' s', 'appareils:', D.max, masquer(D.err).replace(/\s+/g, ' ').slice(-300));
    };
    proc.stdout.on('data', (d) => {
      if (D.termine || D.coupe) return;
      arm(SILENCE_MS, 'silence de la caméra');
      D.bytes += d.length;
      if (!D.started) { D.started = true; for (const c of D.clients) entetes(c); }
      for (const b of D.decoupeur.pousser(d)) { boite(D, b); if (D.coupe) break; }
      if (D.decoupeur.erreur) couper(D, 'flux illisible (' + D.decoupeur.erreur + ')');
    });
    proc.stderr.on('data', (d) => { D.err = (D.err + masquer(d)).slice(-600); }); // garde la fin des avertissements de ffmpeg
    proc.on('error', () => { D.why = 'ffmpeg introuvable ou non lançable'; terminer(null, null, 500, 'ffmpeg introuvable ou non lançable.'); });
    proc.on('close', (code, signal) => terminer(code, signal, 504, 'La caméra ne répond pas (flux non reçu).'));
    return D;
  }
  function rejoindre(D, res, v) {
    const c = { res, v, attente: true, initEnvoye: false, retardDepuis: 0, parti: false };
    D.clients.add(c);
    D.max = Math.max(D.max, D.clients.size);
    if (D.started) entetes(c);
    res.on('close', () => quitter(D, c));
    if (D.clients.size > 1) journal('camera', D.cam.id + (D.hd ? ' (HD)' : ''), 'flux partagé :', D.clients.size, 'appareils');
  }
  function attendreFin(id) {
    const D = dernieres.get(id);
    if (!D || D.termine) return Promise.resolve();
    return Promise.race([D.fin, new Promise((r) => setTimeout(r, ARRET_MS).unref())]);
  }

  return {
    // Demande d'un appareil ; répond lui-même sur res (video/mp4, ou erreur JSON si ffmpeg échoue avant la première image) ; HttpError 503 au-delà des plafonds.
    demander(cam, sec, req, res, { hd = false, v = null, choix = false } = {}) {
      return enfiler(cam.id, async () => {
        if (res.destroyed || req.destroyed) { res.destroy(); return; }
        let D = actives.get(cam.id);
        if (D && v) for (const c of [...D.clients]) if (c.v === v) { c.parti = true; D.clients.delete(c); c.res.destroy(); } // même lecteur : l'ancienne demande est remplacée
        if (D && (D.hd === hd || (D.clients.size && !choix))) {
          if (D.clients.size >= MAX_APPAREILS) throw new HttpError(503, 'Trop d\'appareils regardent déjà cette caméra (' + MAX_APPAREILS + ' au plus).');
          rejoindre(D, res, v);
          return;
        }
        if (D) couper(D, D.clients.size ? 'qualité changée par un autre appareil' : NAVIGATEUR);
        await attendreFin(cam.id);
        if (res.destroyed || req.destroyed) { res.destroy(); return; } // abandonnée pendant l'attente
        if (actives.size >= MAX_FLUX) throw new HttpError(503, 'Trop de flux ouverts.');
        D = demarrer(cam, sec, hd);
        rejoindre(D, res, v);
      });
    },
    // Coupe le flux d'une caméra pour tous ses appareils (suppression de la caméra) ; la promesse se termine quand ffmpeg a quitté (3 s au plus).
    arreter(id) {
      const D = actives.get(id);
      if (D) couper(D, 'caméra supprimée');
      return attendreFin(id);
    },
    occupe: (id) => actives.has(id) || !!(dernieres.get(id) && !dernieres.get(id).termine),
    finiLe: (id) => finis.get(id) || 0,
    etat(id) { const D = actives.get(id); return D ? { qualite: D.hd ? 'hd' : 'sd', appareils: D.clients.size } : null; },
  };
}
// FIN
