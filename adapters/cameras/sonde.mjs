// @zone cameras | Joignabilite des cameras (V1.7) : connexion TCP seule au port RTSP (2 s au plus ; aucune requete RTSP, aucun identifiant), adresses privees du reseau local seulement (adresseLocale) ; resultat garde 30 s, une sonde par camera a la fois, aucune pendant un flux ni dans les 10 s qui suivent ; lancee seulement par la lecture de GET /api/cameras ou /api/cameras/list (jamais en tache de fond). Journal : changements d'etat seulement (identifiant, sans adresse).
import net from 'node:net';
import { adresseLocale } from '../../core/reseau.mjs';
import { log } from '../../core/outils.mjs';

export const DELAI = 2000, VALIDITE = 30000, REPOS = 10000, ATTENTE = 2500;
export const MOTIFS = {
  reseau: 'Hors du réseau local de cet appareil.',
  injoignable: 'Caméra injoignable (éteinte ou hors du Wi-Fi ?).',
  refus: 'La caméra refuse le flux vidéo (port RTSP fermé).',
};

// Connexion TCP ouverte puis refermee aussitot : 'ok' | 'refus' (port ferme : la camera repond mais pas de flux) | 'injoignable' (delai, reseau)
export function connecter(host, port, ms) {
  return new Promise((resolve) => {
    let fini = false;
    const s = net.connect({ host, port });
    const finir = (r) => { if (fini) return; fini = true; clearTimeout(t); s.destroy(); resolve(r); };
    const t = setTimeout(() => finir('injoignable'), ms);
    s.once('connect', () => finir('ok'));
    s.once('error', (e) => finir(e && e.code === 'ECONNREFUSED' ? 'refus' : 'injoignable'));
  });
}

// creerSonde({connecter, local, journal}) : dependances remplacables (essais unitaires) ; sonde = instance du serveur
export function creerSonde(o = {}) {
  const co = o.connecter || connecter, local = o.local || adresseLocale, journal = o.journal || log;
  const etats = new Map(); // id -> { etat, motif, t }
  const enCours = new Map(); // id -> promesse de la sonde en cours
  let occupee = () => false;
  const portDe = (c) => { const p = Number(c.rtsp_port); return Number.isInteger(p) && p > 0 && p < 65536 ? p : 554; };
  function noter(c, etat, motif) {
    const avant = etats.get(c.id);
    if (avant ? avant.etat !== etat : etat === 'hors_ligne') journal('camera', c.id, etat === 'en_ligne' ? 'en ligne' : 'hors ligne (' + motif + ')');
    etats.set(c.id, { etat, motif, t: Date.now() });
  }
  // etat(c) -> {etat: en_ligne|hors_ligne|inconnu, motif} depuis le cache, sans sonde
  function etat(c) {
    if (!local(String(c.host))) return { etat: 'hors_ligne', motif: MOTIFS.reseau };
    if (occupee(c.id)) return { etat: 'en_ligne', motif: null };
    const e = etats.get(c.id);
    return e ? { etat: e.etat, motif: e.motif } : { etat: 'inconnu', motif: null };
  }
  function sonder(c) {
    if (!local(String(c.host)) || occupee(c.id)) return Promise.resolve();
    if (enCours.has(c.id)) return enCours.get(c.id);
    const e = etats.get(c.id);
    if (e && Date.now() - e.t < VALIDITE) return Promise.resolve();
    const p = Promise.resolve().then(() => co(String(c.host), portDe(c), DELAI)).catch(() => 'injoignable').then((r) => {
      enCours.delete(c.id);
      if (occupee(c.id)) return; // un flux a commence pendant la sonde : son resultat ne compte pas
      if (r === 'ok') noter(c, 'en_ligne', null); else noter(c, 'hors_ligne', r === 'refus' ? MOTIFS.refus : MOTIFS.injoignable);
    });
    enCours.set(c.id, p);
    return p;
  }
  // actualiser(cams, attendre) : sondes dues lancees ; attendre : jusqu'a 2,5 s si une camera n'a encore aucun etat (premiere lecture)
  async function actualiser(cams, attendre) {
    const ps = cams.map(sonder);
    if (!attendre || !cams.some((c) => etat(c).etat === 'inconnu')) return;
    let t;
    await Promise.race([Promise.all(ps), new Promise((r) => { t = setTimeout(r, ATTENTE); })]);
    clearTimeout(t);
  }
  return {
    etat, actualiser,
    occupation(fn) { occupee = fn; }, // fn(id) -> vrai si un flux tourne ou vient de finir (REPOS)
    oublier(id) { etats.delete(id); },
  };
}
export const sonde = creerSonde();
// FIN
