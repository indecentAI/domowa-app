// @zone appareils | Registre des adaptateurs (adapters/<id>/manifest.json + module) : liste commune des appareils (cache 1 s, invalide a chaque commande, 10 s max par adaptateur, liste partielle + pannes(), caps et state toujours des objets, identifiants uniques entre adaptateurs), pieces (meme isolation), appliquer, relire, commande de piece. Ne connait aucune marque.
// Un adaptateur exporte : lister() -> [appareil] ; appliquer(appareil, set) ; facultatifs : relire(appareil), pieces() -> [{id, name}],
// piece(roomId, type, set) (commande groupee native), erreur(e) -> [statut, message] | null, routes (routes propres, chargees par le routeur ; l'ancien handle n'est plus lu, journal),
// animer(appareil, cible, ms) (V1.5, animations : une ecriture d'une seule valeur, {on} | {level} | {hue, sat 0-1} | {kelvin}, avec fondu de ms fait par l'appareil ; erreur avec appareil: true
// et motif si le refus ne concerne que cet appareil), hub (contrat des hubs, CLAUDE.md « Hubs » : routes generiques de modules/hubs.mjs), gestionPieces (creation de pieces, CLAUDE.md « Pièces » :
// {nom, icones: [cles generiques], creer({nom, icone}) -> {id}, deplacer(pieceId, ids)} ; exige pieces() ; routes de modules/pieces-creation.mjs).
// Manifeste : { id, nom, module, types, zone?, actif?, libelle? (nom affiche dans le bandeau de panne, sinon id) }. Refuse au chargement (journal) :
// manifeste illisible, identifiant invalide (ID_RE) ou deja pris, module illisible, lister ou appliquer absent ; erreur ignore s'il n'est pas une fonction.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIR, log, borne } from './outils.mjs';
import { ajouterTraducteur } from './http.mjs';
import { estOnOff, ID_RE } from './modele.mjs';

const adaptateurs = []; // { id, m: manifeste, a: module }
let pret = null;
// base : dossier des adaptateurs (adapters/ du projet ; un autre dossier pour les essais unitaires). Charge une seule fois par processus.
export function charger(base = path.join(DIR, 'adapters')) {
  if (!pret) pret = (async () => {
    for (const n of (fs.existsSync(base) ? fs.readdirSync(base).sort() : [])) {
      const fm = path.join(base, n, 'manifest.json');
      if (!fs.existsSync(fm)) continue;
      let m;
      try { m = JSON.parse(fs.readFileSync(fm, 'utf8')); } catch (e) { m = null; }
      if (!m || typeof m !== 'object' || Array.isArray(m)) { log('adaptateur', n, ': manifest.json illisible'); continue; }
      if (m.actif === false) continue;
      const id = m.id || n;
      if (typeof id !== 'string' || !ID_RE.test(id)) { log('adaptateur', n, ': identifiant invalide, ignoré'); continue; }
      if (adaptateurs.some((x) => x.id === id)) { log('adaptateur', n, ': identifiant', id, 'déjà pris, ignoré'); continue; }
      let a;
      try { a = await import(pathToFileURL(path.join(base, n, m.module || 'index.mjs')).href); } catch (e) { log('adaptateur', n, ': chargement impossible', e.code || e.name || ''); continue; }
      // Contrat minimal (CLAUDE.md) : lister() et appliquer() ; sinon l'adaptateur serait en panne a chaque lecture ou commande
      const manque = ['lister', 'appliquer'].filter((f) => typeof a[f] !== 'function');
      if (manque.length) { log('adaptateur', n, ': contrat incomplet (' + manque.join(', ') + '), ignoré'); continue; }
      if (typeof a.erreur === 'function') ajouterTraducteur(a.erreur);
      adaptateurs.push({ id, m, a });
    }
    log('adaptateurs :', adaptateurs.map((x) => x.id).join(', ') || 'aucun');
  })();
  return pret;
}
export const actifs = () => adaptateurs.map((x) => x.id);

export const extensions = () => adaptateurs.map((x) => ({ id: x.id, routes: x.a.routes, handle: x.a.handle })); // handle : signale par le routeur (format abandonne)
// Hubs (contrat : CLAUDE.md, « Hubs ») : adaptateurs qui exportent hub ; adressesHubs() : adresses declarees (repli reseau de core/reseau.mjs).
export const hubs = () => adaptateurs.filter((x) => x.a.hub && typeof x.a.hub === 'object').map((x) => ({ id: x.id, m: x.m, hub: x.a.hub }));
export function adressesHubs() {
  const r = [];
  for (const x of hubs()) { try { r.push(...(x.hub.adresses ? x.hub.adresses() : [])); } catch (e) { /* adaptateur fautif : ignore */ } }
  return r;
}

// Cache par adaptateur : une seule lecture en vol par generation ; toute commande change de generation (la lecture suivante est fraiche).
// Isolation des pannes : chaque adaptateur a DELAI ms au plus ; lister() rend la liste des adaptateurs qui ont repondu, pannes() dit lesquels manquent
// [{adapter, libelle, motif}] (motif = traduction de l'adaptateur, jamais e.message). S'il ne reste alors aucun appareil ON/OFF
// (ex. hub injoignable, tous en echec), l'erreur est levee comme avant. lister(id) : un seul adaptateur (erreur s'il echoue).
const DELAI = 10000;
let gen = 0;
// Appareil rendu par un adaptateur : caps et state toujours des objets (un adaptateur qui les omet ne fait pas tomber les routes communes).
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const normaliser = (l, id) => l.filter((d) => d && typeof d === 'object').map((d) => ({ ...d, caps: objet(d.caps), state: objet(d.state), adapter: id }));
const caches = new Map();
const enPanne = new Map(); // id -> { adapter, libelle, motif }
export function invalider() { gen++; }
function listerUn(x) {
  const c = caches.get(x.id) || {};
  caches.set(x.id, c);
  if (c.liste && c.gen === gen && Date.now() - c.t < 1000) return Promise.resolve(c.liste);
  if (c.vol && c.volGen === gen) return c.vol;
  const g = gen;
  const p = borne(() => x.a.lister(), DELAI)
    .then((l) => { const r = normaliser(l, x.id); if (g === gen) { c.liste = r; c.gen = g; c.t = Date.now(); } return r; });
  c.vol = p; c.volGen = g;
  p.then(() => { if (c.vol === p) c.vol = null; }, () => { if (c.vol === p) c.vol = null; });
  return p;
}
function motif(x, e) {
  let r = null;
  try { r = x.a.erreur ? x.a.erreur(e) : null; } catch (e2) { r = null; }
  if (r && typeof r[1] === 'string') return r[1];
  return (e && e.code) === 'ETIMEDOUT' ? 'délai dépassé' : 'lecture impossible';
}
function noter(x, e) {
  if (!e) { if (enPanne.delete(x.id)) log('adaptateur', x.id, ': rétabli'); return; }
  const p = { adapter: x.id, libelle: String(x.m.libelle || x.id), motif: motif(x, e) };
  const avant = enPanne.get(x.id);
  if (!avant || avant.motif !== p.motif) log('adaptateur', x.id, ': en panne', e.code || e.name || '');
  enPanne.set(x.id, p);
}
export const pannes = () => [...enPanne.values()].map((p) => ({ ...p }));
// Identifiants uniques entre adaptateurs (CLAUDE.md) : un appareil sans identifiant (texte non vide) ou dont l'identifiant est deja rendu
// (par un adaptateur charge avant, ou deux fois par le meme) est retire de la liste, journal une fois par cas. Sans cela, il serait
// affiche deux fois et ses commandes iraient au premier appareil de meme identifiant (trouver()).
const signales = new Set();
function signaler(cle, ...msg) { if (!signales.has(cle) && signales.size < 1000) { signales.add(cle); log(...msg); } }
export function uniques(l) {
  const vus = new Map(), out = [];
  for (const d of l) {
    if (typeof d.id !== 'string' || !d.id) { signaler('sansid ' + d.adapter, 'adaptateur', d.adapter, ': appareil sans identifiant ignoré'); continue; }
    const p = vus.get(d.id);
    if (p !== undefined) { signaler('doublon ' + d.adapter + ' ' + d.id, 'adaptateur', d.adapter, ': identifiant', d.id, 'déjà rendu par', p + ', appareil ignoré'); continue; }
    vus.set(d.id, d.adapter);
    out.push(d);
  }
  return out;
}
export async function lister(adapter) {
  await charger();
  const choisis = adaptateurs.filter((x) => !adapter || x.id === adapter);
  const res = await Promise.allSettled(choisis.map(listerUn));
  const liste = [];
  let err = null;
  res.forEach((r, i) => {
    const e = r.status === 'rejected' ? (r.reason || new Error('lecture impossible')) : null;
    noter(choisis[i], e);
    if (e) { if (!err) err = e; } else liste.push(...r.value);
  });
  const l = uniques(liste);
  if (err && !l.some(estOnOff)) throw err;
  return l;
}
export async function trouver(id, adapter) { return (await lister(adapter)).find((d) => d.id === id) || null; }

function de(d) {
  const x = adaptateurs.find((y) => y.id === d.adapter);
  if (!x) throw new Error('adaptateur absent : ' + d.adapter);
  return x.a;
}
export async function appliquer(d, set) { const a = de(d); invalider(); await a.appliquer(d, set); }
export async function relire(d) {
  const a = de(d);
  invalider();
  if (a.relire) return { ...(await a.relire(d)), adapter: d.adapter };
  return trouver(d.id);
}
// Animations (V1.5) : l'adaptateur de cet appareil sait-il animer ? animer : une commande avec fondu (contrat ci-dessus) ; adaptateur sans animer : erreur.
export function peutAnimer(d) { const x = adaptateurs.find((y) => y.id === (d && d.adapter)); return !!(x && typeof x.a.animer === 'function'); }
export async function animer(d, cible, ms) {
  const a = de(d);
  if (typeof a.animer !== 'function') throw Object.assign(new Error('animation non gérée'), { appareil: true, motif: 'non animable' });
  const sortes = ['on', 'level', 'hue', 'kelvin'].filter((k) => cible && cible[k] !== undefined);
  if (sortes.length !== 1) throw new Error('animer : une seule valeur par écriture');
  invalider();
  await a.animer(d, cible, ms);
}
// Commande groupee native d'une piece (d0 = un appareil de la piece) ; leve une erreur si l'adaptateur ne sait pas faire.
export async function piece(d0, type, set) {
  const a = de(d0);
  if (!a.piece) throw new Error('commande de pièce non gérée');
  invalider();
  await a.piece(d0.room.id, type, set);
}
// Adaptateurs qui savent creer une piece (gestionPieces avec creer et deplacer, et pieces() pour relire).
export const gestionsPieces = () => adaptateurs.filter((x) => x.a.gestionPieces && typeof x.a.gestionPieces.creer === 'function' && typeof x.a.gestionPieces.deplacer === 'function' && typeof x.a.pieces === 'function')
  .map((x) => ({ id: x.id, m: x.m, g: x.a.gestionPieces, a: x.a }));
// Adaptateurs dont les appareils (hors modele ON/OFF : lave-linge, cameras, familles...) se rangent localement dans les pieces (V1.4) :
// rangement = {nom (origine affichee), appareils() -> [{id, nom, genre}] (depuis son cache, jamais bloquant)}.
export const rangeables = () => adaptateurs.filter((x) => x.a.rangement && typeof x.a.rangement.appareils === 'function').map((x) => ({ id: x.id, m: x.m, r: x.a.rangement }));
// Pieces de tous les adaptateurs : DELAI ms au plus chacun, comme lister() ; un adaptateur en echec est ignore (journal), l'erreur n'est levee
// que si tous echouent.
export async function pieces() {
  await charger();
  const avec = adaptateurs.filter((x) => typeof x.a.pieces === 'function');
  const res = await Promise.allSettled(avec.map((x) => borne(() => x.a.pieces(), DELAI)));
  const liste = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') liste.push(...(Array.isArray(r.value) ? r.value : []));
    else log('adaptateur', avec[i].id, ': pièces illisibles', (r.reason && (r.reason.code || r.reason.name)) || '');
  });
  if (avec.length && res.every((r) => r.status === 'rejected')) throw res[0].reason || new Error('lecture impossible');
  return liste;
}
// FIN
