// @zone appareils equipements | Registre des adaptateurs (adapters/<id>/manifest.json + module) : liste commune des appareils (cache 1 s, invalide a chaque commande, 10 s max par adaptateur, liste partielle + pannes(), caps et state toujours des objets, identifiants uniques entre adaptateurs), pieces (meme isolation), appliquer, relire, commande de piece ; equipements (V2.1 : cache 5 s, pannes a part, capacites composees, sans secret) et code d'appairage sur demande. Ne connait aucune marque.
// Un adaptateur exporte : lister() -> [appareil] ; appliquer(appareil, set) ; facultatifs : relire(appareil), pieces() -> [{id, name}],
// piece(roomId, type, set) (commande groupee native), equipements() -> [equipement] (V2.1, contrat « Capacités » de .claude/rules/equipements.md), erreur(e) -> [statut, message] | null, routes (routes propres, chargees par le routeur ; l'ancien handle n'est plus lu, journal),
// animer(appareil, cible, ms) (V1.5, animations : une ecriture d'une seule valeur, {on} | {level} | {hue, sat 0-1} | {kelvin}, avec fondu de ms fait par l'appareil ; erreur avec appareil: true
// et motif si le refus ne concerne que cet appareil), hub (contrat « Hubs » de .claude/rules/hubs.md : routes generiques de modules/hubs.mjs), gestionPieces (creation de pieces, contrat « Pièces » de .claude/rules/pieces.md :
// {nom, icones: [cles generiques], creer({nom, icone}) -> {id}, deplacer(pieceId, ids)} ; exige pieces() ; routes de modules/pieces-creation.mjs).
// Delais : lister, pieces, equipements, scenesHub et ecrire sont bornes ici (borne, 10 s) ; appliquer, relire, piece et animer non : l'adaptateur borne lui-meme ses commandes.
// Manifeste : { id, nom, module, types (informatif : jamais lu), zone?, actif?, libelle? (nom affiche dans le bandeau de panne, sinon id) }. Refuse au chargement (journal) :
// manifeste illisible, identifiant invalide (ID_RE) ou deja pris, module illisible, lister ou appliquer absent ; erreur ignore s'il n'est pas une fonction.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIR, log, borne, sleep } from './outils.mjs';
import { ajouterTraducteur, HttpError } from './http.mjs';
import { estOnOff, ID_RE } from './modele.mjs';
import { composer, sansSecret, secrete, definition, groupe, ENVELOPPES, valider, sensible } from './capacites.mjs';

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
export const actifs = () => adaptateurs.map((x) => x.id); // pour le banc (essais d'interface et unitaires) : identifiants des adaptateurs charges

export const extensions = () => adaptateurs.map((x) => ({ id: x.id, routes: x.a.routes, handle: x.a.handle })); // handle : signale par le routeur (format abandonne)
// Hubs (contrat « Hubs » de .claude/rules/hubs.md) : adaptateurs qui exportent hub ; adressesHubs() : adresses declarees (repli reseau de core/reseau.mjs).
export const hubs = () => adaptateurs.filter((x) => x.a.hub && typeof x.a.hub === 'object').map((x) => ({ id: x.id, m: x.m, hub: x.a.hub }));
export function adressesHubs() {
  const r = [];
  for (const x of hubs()) { try { r.push(...(x.hub.adresses ? x.hub.adresses() : [])); } catch (e) { /* adaptateur fautif : ignore */ } }
  return r;
}
// Un hub a la fois (V2.0, contrat « Hubs » de .claude/rules/hubs.md) : un adaptateur de hub dit par hub.utilise() (synchrone, sans reseau) s'il porte un jeton (connecte ou en erreur).
// Un hub non utilise est « en retrait » (ni interroge par lister() et pieces(), ni panne, ni gestion des pieces) quand un autre hub est utilise ; si aucun ne l'est,
// seul le premier qui a une adresse (sinon le premier charge) reste interroge : il porte « Aucun hub configuré. » ou « Hub non connecté. », comme avant.
// hubBloque(id) : nom du hub utilise par un autre adaptateur (son appairage est alors refuse par modules/hubs.mjs), sinon null. Adaptateur sans utilise : jamais en retrait.
const avecUtilise = (x) => !!(x.a.hub && typeof x.a.hub === 'object' && typeof x.a.hub.utilise === 'function');
const sur = (f, defaut) => { try { return f(); } catch (e) { return defaut; } };
const utilise = (x) => avecUtilise(x) && sur(() => x.a.hub.utilise() === true, false);
function retrait(x) {
  if (!avecUtilise(x) || utilise(x)) return false;
  const hs = adaptateurs.filter(avecUtilise);
  if (hs.some(utilise)) return true;
  const garde = hs.find((y) => sur(() => (y.a.hub.adresses ? y.a.hub.adresses() : []).length > 0, false)) || hs[0];
  return garde !== x;
}
export const enRetrait = (id) => { const x = adaptateurs.find((y) => y.id === id); return !!x && retrait(x); };
export function hubBloque(id) {
  const autre = adaptateurs.find((y) => y.id !== id && utilise(y));
  return autre ? String(autre.a.hub.nom || autre.id) : null;
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
  c.volGen = g;
  return enVol(c, p);
}
// Lecture en vol : partagee par les appels simultanes, oubliee des qu'elle aboutit ou echoue.
function enVol(c, p) {
  c.vol = p;
  const fin = () => { if (c.vol === p) c.vol = null; };
  p.then(fin, fin);
  return p;
}
function motif(x, e) {
  let r = null;
  try { r = x.a.erreur ? x.a.erreur(e) : null; } catch (e2) { r = null; }
  if (r && typeof r[1] === 'string') return r[1];
  return (e && e.code) === 'ETIMEDOUT' ? 'délai dépassé' : 'lecture impossible';
}
const panne = (x, e) => ({ adapter: x.id, libelle: String(x.m.libelle || x.id), motif: motif(x, e) });
function noter(x, e) {
  if (!e) { if (enPanne.delete(x.id)) log('adaptateur', x.id, ': rétabli'); return; }
  const p = panne(x, e);
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
  for (const x of adaptateurs) if (retrait(x)) noter(x, null); // hub en retrait : plus une panne
  const choisis = adaptateurs.filter((x) => (!adapter || x.id === adapter) && !retrait(x));
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
export const gestionsPieces = () => adaptateurs.filter((x) => x.a.gestionPieces && typeof x.a.gestionPieces.creer === 'function' && typeof x.a.gestionPieces.deplacer === 'function' && typeof x.a.pieces === 'function' && !retrait(x))
  .map((x) => ({ id: x.id, m: x.m, g: x.a.gestionPieces, a: x.a }));
// Adaptateurs dont les appareils (hors modele ON/OFF : lave-linge, cameras, familles...) se rangent localement dans les pieces (V1.4) :
// rangement = {nom (origine affichee), appareils() -> [{id, nom, genre}] (depuis son cache, jamais bloquant)}.
export const rangeables = () => adaptateurs.filter((x) => x.a.rangement && typeof x.a.rangement.appareils === 'function').map((x) => ({ id: x.id, m: x.m, r: x.a.rangement }));
// Pieces de tous les adaptateurs : DELAI ms au plus chacun, comme lister() ; un adaptateur en echec est ignore (journal), l'erreur n'est levee
// que si tous echouent.
export async function pieces() {
  await charger();
  const avec = adaptateurs.filter((x) => typeof x.a.pieces === 'function' && !retrait(x));
  const res = await Promise.allSettled(avec.map((x) => borne(() => x.a.pieces(), DELAI)));
  const liste = [];
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') liste.push(...(Array.isArray(r.value) ? r.value : []));
    else log('adaptateur', avec[i].id, ': pièces illisibles', (r.reason && (r.reason.code || r.reason.name)) || '');
  });
  if (avec.length && res.every((r) => r.status === 'rejected')) throw res[0].reason || new Error('lecture impossible');
  return liste;
}
// Equipements (V2.1, contrat « Capacités », vue Equipements) : chaque adaptateur qui exporte equipements() et n'est pas en retrait, DELAI ms au plus, isolation des pannes
// comme lister() mais pannes rendues a part (jamais d'erreur levee : une liste vide et les pannes). Cache court par adaptateur (CACHE_EQUIP : un appel Home Assistant = /api/states
// + WebSocket), une seule lecture en vol ; la liste brute (codes d'appairage et donnees privees compris) reste en memoire seulement, jamais journalisee.
// Rendu : equipement {id, adapter, origine (nom du hub affiche), hub, idNatif, nom, type, piece, joignable, vu_le, elements, capacites (composees : absorbees puis triees, presentees), codes: [{element, cap, libelle}]
// (capacites secretes : jamais leur valeur), inconnues (nombre)}. Les donnees privees (localisation, coordonnees) restent pour l'ecran seulement.
export const CACHE_EQUIP = 5000;
const cachesEq = new Map();
// Identifiant d'un equipement ou d'une scene du hub : « <adaptateur>:<identifiant natif> ».
const ID_ADAPTE = /^[a-z0-9_-]{1,40}:[A-Za-z0-9_.:-]{1,160}$/;
// Adaptateur d'equipements (hors retrait) proprietaire d'un identifiant d'equipement, ou undefined.
const proprietaire = (id) => adaptateurs.find((y) => typeof y.a.equipements === 'function' && !retrait(y) && String(id).startsWith(y.id + ':'));
function equipUn(x, frais) {
  const c = cachesEq.get(x.id) || {};
  cachesEq.set(x.id, c);
  if (!frais && c.liste && Date.now() - c.t < CACHE_EQUIP) return Promise.resolve(c.liste);
  if (c.vol) return c.vol;
  const origine = String((x.a.hub && typeof x.a.hub.nom === 'string' && x.a.hub.nom) || x.m.libelle || x.id).slice(0, 40); // nom affiche (puce de la tuile)
  const p = borne(() => x.a.equipements(), DELAI).then((l) => {
    const r = (Array.isArray(l) ? l : []).filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && ID_ADAPTE.test(e.id) && e.id.startsWith(x.id + ':')).map((e) => ({ ...e, adapter: x.id, origine: origine }));
    c.liste = r; c.t = Date.now(); return r;
  });
  return enVol(c, p);
}
// Capacite presentee au client : rang, widget, type et groupe du referentiel (enveloppe : type et widget de sa nature), libelle et unite par defaut ; absorbees de meme.
function presenter(c) {
  const d = definition(c.cap) || {}, n = ENVELOPPES.includes(c.cap) ? definition(c.nature) || {} : null;
  const o = { ...c, rang: d.rang, widget: d.widget, type: (n || d).type, groupe: groupe(c.cap), libelle: c.libelle || (n && n.libelle) || d.libelle || c.cap };
  if (o.unite === undefined && ((n || d).unite !== undefined)) o.unite = (n || d).unite;
  if (Array.isArray(c.absorbees)) o.absorbees = c.absorbees.map(presenter);
  delete o.secret;
  return o;
}
// Equipement rendu (sans secret) : les capacites secretes ne laissent que {element, cap, libelle} dans codes.
function composerEquipement(e) {
  const caps = Array.isArray(e.capacites) ? e.capacites.filter((c) => c && typeof c === 'object' && typeof c.cap === 'string') : [];
  const codes = caps.filter((c) => c.secret || secrete(c.cap)).filter((c) => typeof c.valeur === 'string' && c.valeur)
    .map((c) => ({ element: String(c.element), cap: c.cap, libelle: c.libelle || (definition(c.cap) || {}).libelle || c.cap }));
  const { capacites, inconnues, ...reste } = e;
  return { ...reste, capacites: composer(sansSecret(caps)).map(presenter), codes, inconnues: Array.isArray(inconnues) ? inconnues.length : 0 };
}
// -> {equipements, pannes: [{adapter, libelle, motif}], repondu: [ids des adaptateurs qui ont repondu]} ; frais : sans le cache court (actualisation demandee).
export async function equipements(frais) {
  await charger();
  const choisis = adaptateurs.filter((x) => typeof x.a.equipements === 'function' && !retrait(x));
  const res = await Promise.allSettled(choisis.map((x) => equipUn(x, frais)));
  const liste = [], pannesEq = [], repondu = [];
  res.forEach((r, i) => {
    const x = choisis[i];
    if (r.status === 'fulfilled') { liste.push(...r.value); repondu.push(x.id); return; }
    pannesEq.push(panne(x, r.reason));
  });
  const vus = new Set();
  const equip = liste.filter((e) => !vus.has(e.id) && vus.add(e.id)).map(composerEquipement);
  return { equipements: equip, pannes: pannesEq, repondu };
}
// Code d'appairage d'un element d'un equipement (route sur demande, ecoute locale seulement) : valeur de la capacite secrete, depuis le cache (ou une lecture) ; null s'il n'y en a pas.
// Jamais journalise ni garde ailleurs que dans le cache de l'adaptateur.
export async function codeAppairage(id, element, cap) {
  await charger();
  const x = proprietaire(id);
  if (!x) return null;
  const e = (await equipUn(x, false)).find((y) => y.id === id);
  const c = e && Array.isArray(e.capacites) ? e.capacites.find((k) => k && (k.secret || secrete(k.cap)) && k.element === element && k.cap === cap) : null;
  return c && typeof c.valeur === 'string' && c.valeur ? { cap: c.cap, element: c.element, libelle: c.libelle || (definition(c.cap) || {}).libelle, valeur: c.valeur } : null;
}
// Scenes du hub (V2.1 etape scenes-hub ; contrat « Scènes du hub ») : adaptateurs qui exportent scenesHub {lister, lancer(id), annuler(id)}, hors retrait.
// scenesHub() -> {scenes: [{id: '<adaptateur>:<id>', adapter, nom, annulable (s), lance_le}], pannes} (jamais d'erreur levee) ; actionScene(id, 'lancer' | 'annuler') : 404 inconnue, borne 10 s.
export async function scenesHub() {
  await charger();
  const choisis = adaptateurs.filter((x) => x.a.scenesHub && typeof x.a.scenesHub.lister === 'function' && !retrait(x));
  const res = await Promise.allSettled(choisis.map((x) => borne(() => x.a.scenesHub.lister(), DELAI)));
  const scenes = [], pannesS = [];
  res.forEach((r, i) => {
    const x = choisis[i];
    if (r.status === 'rejected') { pannesS.push(panne(x, r.reason)); return; }
    for (const s of Array.isArray(r.value) ? r.value : []) {
      const id = s && typeof s.id === 'string' ? x.id + ':' + s.id : '';
      if (!ID_ADAPTE.test(id) || typeof s.nom !== 'string') continue;
      scenes.push({ id, adapter: x.id, nom: s.nom.slice(0, 60), annulable: Number.isFinite(s.annulable) ? Math.max(0, Math.min(600, s.annulable)) : 0, lance_le: typeof s.lance_le === 'string' ? s.lance_le : null });
    }
  });
  scenes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id));
  return { scenes, pannes: pannesS };
}
export async function actionScene(id, action) {
  await charger();
  if (typeof id !== 'string' || !ID_ADAPTE.test(id) || (action !== 'lancer' && action !== 'annuler')) throw new HttpError(400, 'Scène invalide.');
  const x = adaptateurs.find((y) => y.a.scenesHub && !retrait(y) && id.startsWith(y.id + ':'));
  if (!x || typeof x.a.scenesHub[action] !== 'function') throw new HttpError(404, 'Scène inconnue.');
  const natif = id.slice(x.id.length + 1);
  const l = await borne(() => x.a.scenesHub.lister(), DELAI);
  if (!(Array.isArray(l) ? l : []).some((s) => s && s.id === natif)) throw new HttpError(404, 'Scène inconnue.');
  await borne(() => x.a.scenesHub[action](natif), DELAI);
}
// Ecriture generique (V2.1 etape ecriture-generique ; contrat « Capacités ») : une capacite d'un equipement, validee par son descripteur (valider : ecriture declaree,
// bornes, pas, options), commande sensible : confirm exige ; une commande a la fois par equipement (409 sinon) ; l'adaptateur traduit (ecrire(element, cap, valeur, descripteur) :
// sa liste fermee) ; relu 1 s apres (sans cache), jamais renvoye. -> equipement compose relu, ou null s'il a disparu. Adaptateur sans ecrire : 501.
// V2.2 ha-ouvrants : parametres d'une commande (options : code d'alarme ou de serrure, ton, volume, duree d'une sirene), objet plat de 4 cles au plus, valeurs texte (64 caracteres
// imprimables au plus), nombre fini ou booleen ; transmis tels quels a l'adaptateur (ecrire(element, cap, valeur, descripteur, options) : sa liste fermee les verifie) ; jamais gardes,
// journalises ni renvoyes (le code d'alarme est tape a chaque fois).
const enCours = new Set();
const RELECTURE_MS = 1000;
const OPTION_CLE = /^[a-z_]{1,20}$/, OPTION_TEXTE = /^[\x20-\x7e\u00a0-\uffff]{1,64}$/;
export function optionsCommande(o) {
  if (o === undefined || o === null) return {};
  if (typeof o !== 'object' || Array.isArray(o) || Object.getPrototypeOf(o) !== Object.prototype) throw new HttpError(400, 'Paramètres de commande invalides.');
  const k = Object.keys(o);
  if (k.length > 4) throw new HttpError(400, 'Paramètres de commande invalides.');
  const r = {};
  for (const c of k) {
    const v = o[c];
    if (!OPTION_CLE.test(c) || !((typeof v === 'string' && OPTION_TEXTE.test(v)) || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean')) throw new HttpError(400, 'Paramètres de commande invalides.');
    r[c] = v;
  }
  return r;
}
export async function ecrireCapacite(id, element, cap, valeur, confirm, options) {
  const o = optionsCommande(options);
  await charger();
  const x = proprietaire(id);
  if (!x) throw new HttpError(404, 'Équipement inconnu.');
  if (typeof x.a.ecrire !== 'function') throw new HttpError(501, 'Commandes pas encore disponibles pour ce hub.');
  const e = (await equipUn(x, false)).find((y) => y.id === id);
  if (!e) throw new HttpError(404, 'Équipement inconnu.');
  const c = (Array.isArray(e.capacites) ? e.capacites : []).find((k) => k && k.element === element && k.cap === cap && !(k.secret || secrete(k.cap)));
  if (!c) throw new HttpError(404, 'Commande inconnue pour cet équipement.');
  const v = valider(c, valeur);
  if (sensible(c) && confirm !== true) throw new HttpError(409, 'Confirmation requise.');
  if (enCours.has(id)) throw new HttpError(409, 'Une commande est déjà en cours pour cet équipement.');
  enCours.add(id);
  try {
    await borne(() => x.a.ecrire(element, cap, v, c, o), DELAI);
    await sleep(RELECTURE_MS);
    const apres = (await equipUn(x, true)).find((y) => y.id === id);
    return apres ? composerEquipement(apres) : null;
  } finally { enCours.delete(id); }
}
// FIN
