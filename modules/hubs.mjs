// @zone hubs | Routes generiques des hubs (contrat : CLAUDE.md, « Hubs » ; aucun nom de marque) : GET /api/hubs (types declares par les adaptateurs, hubs et leur etat, champs en liste blanche, sans secret), POST /api/hubs/:id/deconnexion {confirm: true},
// POST /api/hubs/recherche {type} (reseau local, adresses privees), appairage guide : POST /api/hubs/appairage {type, champs}, GET /api/hubs/appairage, POST /api/hubs/appairage/annuler.
// Les champs saisis (dont les secrets, type secret) ne sont jamais renvoyes, gardes ni journalises ; le jeton obtenu reste dans l'adaptateur.
import { HttpError, describe } from '../core/http.mjs';
import { log, borne } from '../core/outils.mjs';
import { hubs, invalider } from '../core/appareils.mjs';
import { privee } from '../core/reseau.mjs';

const ETATS = ['connecte', 'deconnecte', 'erreur'];
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const texte = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
// Proprietaire d'un identifiant de hub : l'adaptateur dont « <id>- » est le plus long prefixe (identifiants uniques par construction).
const proprietaire = (id) => hubs().filter((x) => id.startsWith(x.id + '-')).sort((a, b) => b.id.length - a.id.length)[0] || null;

async function lireUn(x) {
  try {
    const l = await borne(() => x.hub.etat(), 6000);
    const r = (Array.isArray(l) ? l : []).filter((h) => h && ID.test(String(h.id)) && (proprietaire(h.id) || {}).id === x.id);
    return { hubs: r.map((h) => ({ id: h.id, type: x.id, nom: texte(h.nom, 60) || texte(x.hub.nom, 60) || x.id, adresse: texte(h.adresse, 64), etat: ETATS.includes(h.etat) ? h.etat : 'erreur', motif: texte(h.motif, 120) })), panne: null };
  } catch (e) {
    return { hubs: [], panne: (e && e.code) === 'ETIMEDOUT' ? 'Délai dépassé.' : 'Lecture impossible.' };
  }
}
const TYPES_CHAMP = ['adresse', 'texte', 'secret'];
function champsDe(x) {
  const a = x.hub.appairage;
  if (!a || typeof a.appairer !== 'function' || typeof a.verifier !== 'function' || !Array.isArray(a.champs)) return null;
  return a.champs.filter((c) => c && /^[a-z_]{1,30}$/.test(c.cle) && TYPES_CHAMP.includes(c.type)).map((c) => ({ cle: c.cle, libelle: texte(c.libelle, 60) || c.cle, type: c.type }));
}
// Aide propre au type (fenetre « Hubs », aide « ? ») : [{titre, lignes}] ; 10 sections, 12 lignes de 400 caracteres au plus.
function aideDe(x) {
  const a = Array.isArray(x.hub.aide) ? x.hub.aide : [];
  return a.slice(0, 10).filter((s) => s && texte(s.titre, 80) && Array.isArray(s.lignes)).map((s) => ({ titre: texte(s.titre, 80), lignes: s.lignes.slice(0, 12).map((l) => texte(l, 400)).filter(Boolean) }));
}
const typeDe = (t) => hubs().find((x) => x.id === t) || null;
export async function etatHubs() {
  const xs = hubs();
  const lus = await Promise.all(xs.map(lireUn));
  return {
    types: xs.map((x, i) => ({ type: x.id, nom: texte(x.hub.nom, 60) || x.id, max: Number.isInteger(x.hub.max) && x.hub.max > 0 ? x.hub.max : 1, nb: lus[i].hubs.length, panne: lus[i].panne, recherche: typeof x.hub.rechercher === 'function', champs: champsDe(x), aide: aideDe(x) })),
    hubs: lus.flatMap((l) => l.hubs),
    time: new Date().toISOString(),
  };
}

// Recherche sur le reseau local : une a la fois, 10 s au plus ; adresses IPv4 privees seulement (filtre repete ici, quel que soit l'adaptateur).
let enRecherche = false;
async function rechercher(c) {
  const body = await c.corps();
  const x = typeDe(body.type);
  if (!x || typeof x.hub.rechercher !== 'function') throw new HttpError(404, 'Type de hub inconnu ou sans recherche.');
  if (enRecherche) throw new HttpError(409, 'Une recherche est déjà en cours.');
  enRecherche = true;
  const ctrl = new AbortController();
  let l;
  try { l = await borne(() => x.hub.rechercher({ signal: ctrl.signal }), 10000); } catch (e) { if (e instanceof HttpError) throw e; l = []; } finally { ctrl.abort(); enRecherche = false; }
  let connues = [];
  try { connues = x.hub.adresses ? x.hub.adresses() : []; } catch (e) { connues = []; }
  const vus = new Set(), resultats = [];
  for (const r of Array.isArray(l) ? l : []) {
    if (!r || !privee(r.adresse) || vus.has(r.adresse)) continue;
    vus.add(r.adresse);
    resultats.push({ adresse: r.adresse, nom: texte(r.nom, 60), connu: connues.includes(r.adresse) });
    if (resultats.length >= 20) break;
  }
  return { type: x.id, resultats, time: new Date().toISOString() };
}

// Appairage guide : une seule session a la fois (garde apres la fin pour l'affichage) ; etapes {texte, delai? (s, compte a rebours)} fournies par
// l'adaptateur ; 120 s au plus. Message d'echec : HttpError de l'adaptateur ou traduction (describe), jamais e.message.
let session = null;
export const appairageEnCours = () => !!(session && session.etat === 'en_cours'); // V1.8 : modules/maj.mjs refuse une mise a jour pendant un appairage
const vue = (s) => (s ? { id: s.id, type: s.type, etat: s.etat, etape: s.etape, message: s.message, hub: s.hub, debut: s.debut } : null);
function finir(s, etat, message) {
  if (s.etat !== 'en_cours') return false;
  clearTimeout(s.minuteur);
  s.etat = etat; s.etape = null; s.message = message;
  return true;
}
async function appairer(c) {
  const body = await c.corps();
  const x = typeDe(body.type), def = x && champsDe(x);
  if (!def) throw new HttpError(404, 'Type de hub inconnu ou sans appairage.');
  if (session && session.etat === 'en_cours') throw new HttpError(409, 'Un appairage est déjà en cours.');
  const brut = body.champs && typeof body.champs === 'object' ? body.champs : {}, champs = {};
  for (const d of def) if (typeof brut[d.cle] === 'string') champs[d.cle] = brut[d.cle].slice(0, 512);
  const params = x.hub.appairage.verifier(champs); // HttpError 400 si refuse
  const ctrl = new AbortController();
  const s = { id: Date.now().toString(36), type: x.id, etat: 'en_cours', etape: null, message: null, hub: null, debut: new Date().toISOString(), ctrl };
  session = s;
  s.minuteur = setTimeout(() => { if (finir(s, 'echec', 'Délai dépassé.')) ctrl.abort(); }, 120000);
  const etape = (e) => {
    if (session !== s || s.etat !== 'en_cours' || !e) return;
    const d = Number(e.delai);
    s.etape = { texte: texte(e.texte, 200) || '…', delai: d > 0 ? Math.round(d) : null, fin: d > 0 ? new Date(Date.now() + d * 1000).toISOString() : null };
  };
  log('hubs : appairage commence', x.id);
  const reponse = { session: vue(s), time: new Date().toISOString() };
  Promise.resolve().then(() => x.hub.appairage.appairer(params, { etape, signal: ctrl.signal })).then((r) => {
    if (!r) { finir(s, 'echec', 'Appairage interrompu.'); return; }
    if (!finir(s, 'reussi', 'Hub connecté.')) return;
    s.hub = ID.test(String(r.id)) ? r.id : null;
    invalider();
    log('hubs : appairage reussi', x.id);
  }, (e) => {
    if (finir(s, 'echec', describe(e)[1])) log('hubs : appairage en echec', x.id, (e && (e.code || e.name)) || '');
  });
  return reponse;
}

export const routes = [
  ['POST', '/api/hubs/recherche', rechercher],
  ['POST', '/api/hubs/appairage', appairer],
  ['GET', '/api/hubs/appairage', async () => ({ session: vue(session), time: new Date().toISOString() })],
  ['POST', '/api/hubs/appairage/annuler', async () => {
    if (session && finir(session, 'annule', 'Appairage annulé.')) { session.ctrl.abort(); log('hubs : appairage annule', session.type); }
    return { session: vue(session), time: new Date().toISOString() };
  }],
  ['GET', '/api/hubs', etatHubs],
  ['POST', /^\/api\/hubs\/([a-z0-9][a-z0-9-]{0,39})\/deconnexion$/, async (c) => {
    const body = await c.corps();
    if (body.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
    const x = proprietaire(c.m[1]);
    if (!x || typeof x.hub.deconnecter !== 'function') throw new HttpError(404, 'Hub inconnu.');
    await x.hub.deconnecter(c.m[1]);
    invalider();
    log('hubs : deconnexion', c.m[1]);
    return etatHubs();
  }],
];
// FIN
