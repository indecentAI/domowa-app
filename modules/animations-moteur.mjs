// @zone animations | Moteur des animations (V1.5, serveur, en memoire seulement : rien ne reprend apres un redemarrage) : lancer, arreter, liberer (commande manuelle sur une lampe animee), toutArreter (Tout OFF), etat. File unique de changements (envois, core/file.mjs) : 4 ecritures au hub par seconde au plus (un envoi = 1 a 3 ecritures d'une valeur chacune, decouper(), parties l'une apres l'autre et reservees ensemble), un envoi a la fois par lampe, 0,5 s au moins entre deux envois a une lampe, envoi en retard abandonne (sans rattrapage).
// Pannes : lampe injoignable ou refusee par le hub -> ignoree et signalee, l'animation continue ; hub injoignable -> animation suspendue et signalee, sonde toutes les 5 s, reprise
// sans rattrapage, arret apres 5 min. Lampe passee OFF hors de l'application (relue toutes les 5 s) -> retiree. Commandes : animer() du registre (contrat animer de l'adaptateur).
import { log, borne } from '../core/outils.mjs';
import { HttpError, describe } from '../core/http.mjs';
import { lister, animer, peutAnimer, invalider } from '../core/appareils.mjs';
import { estOnOff } from '../core/modele.mjs';
import { creerFile } from '../core/file.mjs';
import { LIMITES, verifier, compiler, retour, decouper } from './animations-plan.mjs';

const PLAFOND = LIMITES.plafond, ECART = LIMITES.ecart * 1000, CONTROLE = 5000, PANNE_MAX = 5 * 60 * 1000, DELAI_ENVOI = 5000;
const runs = new Map(); // cle (id de l'animation, ou « essai ») -> marche
const finies = []; // 5 dernieres marches terminees (affichage)
let controleT = null;
const appareils = new Map(); // id -> appareil du registre (derniere lecture)

// Une lampe animable : ON/OFF avec luminosite, couleur ou blanc, et adaptateur qui sait animer (les prises sont ignorees)
export const animable = (d) => estOnOff(d) && !!(d.caps.level || d.caps.color || d.caps.ctemp) && peutAnimer(d);
const etatDe = (d) => ({ on: d.state.on, level: d.state.level, mode: d.state.colorMode || null, hue: d.state.hue, sat: d.state.sat, kelvin: d.state.ctemp, caps: { level: !!d.caps.level, color: !!d.caps.color, ctemp: !!d.caps.ctemp, ctempMin: d.caps.ctempMin, ctempMax: d.caps.ctempMax } });
const nomDe = (id) => (appareils.get(id) || {}).name || id;
const tolerance = (ms) => Math.min(1000, Math.max(300, ms / 2));

// Les ecritures d'un envoi partent l'une apres l'autre (la suivante a la reponse de la precedente) ; chacune garde sa place dans la fenetre
// de la file, datee de son envoi reel (marquer). Une ecriture refusee : les suivantes ne partent pas.
function envoyer(c, marquer) {
  const d = appareils.get(c.lampe), parts = decouper(c.cible, c.ms);
  const r = c.run;
  return (async () => {
    for (let i = 0; i < parts.length; i++) {
      marquer(i);
      await borne(() => animer(d, parts[i].cible, parts[i].ms), DELAI_ENVOI);
      if (r) { r.envoyees++; if (parts[i].cible.on !== undefined) r.attenduOn.set(c.lampe, parts[i].cible.on); }
    }
  })().then(() => {}, (e) => {
    if (!r || runs.get(r.cle) !== r) return;
    if (e && e.appareil) ignorer(r, c.lampe, e.motif || 'refusée par le hub');
    else suspendre(r, (describe(e) || [0, 'Hub injoignable.'])[1]);
  });
}
// File unique des changements (core/file.mjs) : plafond de 4 ecritures par seconde, un envoi a la fois par lampe, 0,5 s entre deux envois a une lampe,
// envoi en retard abandonne (compte dans sautees de son animation).
const file = creerFile({ plafond: PLAFOND, ecart: ECART, cleDe: (c) => c.lampe, ecritures: (c) => decouper(c.cible, c.ms).length, envoyer, abandon: (c) => { if (c.run) c.run.sautees++; } });

function etatsActifs(r, source) { const m = new Map(); for (const id of r.lampes) if (source.has(id)) m.set(id, source.get(id)); return m; }
function planifier(r, apres) {
  const l = [];
  for (const c of r.cmds) {
    const due = r.T0 + Math.round(c.t * 1000);
    if (due < apres || !r.lampes.has(c.lampe)) continue;
    l.push({ due, limite: due + tolerance(c.ms), run: r, lampe: c.lampe, cible: c.cible, ms: c.ms });
  }
  file.ajouter(l);
}
function cycle(r, T0) {
  const x = compiler(r.anim, etatsActifs(r, r.etats));
  r.T0 = T0; r.cycleMs = Math.round(x.cycle * 1000); r.cmds = x.commandes; r.etatsFin = x.etats; r.cycleN++;
  planifier(r, 0);
  clearTimeout(r.timer);
  r.timer = setTimeout(() => finCycle(r), Math.max(0, T0 + r.cycleMs - Date.now()));
}
function finCycle(r) {
  if (runs.get(r.cle) !== r || r.etat !== 'en_cours') return;
  // Sans boucle : fin quand les dernieres commandes (OFF d'une etape OFF au dernier instant...) sont parties ou abandonnees
  if (!r.anim.boucle) {
    if ((file.contient((c) => c.run === r) || [...r.lampes].some((id) => file.occupe(id))) && Date.now() < r.T0 + r.cycleMs + 2000) { r.timer = setTimeout(() => finCycle(r), 100); return; }
    terminer(r, 'fin', r.anim.reset, null); return;
  }
  r.etats = r.etatsFin;
  cycle(r, Math.max(Date.now(), r.T0 + r.cycleMs));
}
const retirerFile = (pred) => file.retirer(pred);

function ignorer(r, id, motif) {
  if (!r.lampes.has(id)) return;
  r.lampes.delete(id);
  r.ignorees.set(id, motif);
  retirerFile((c) => c.run === r && c.lampe === id);
  log('animation', JSON.stringify(r.nom), ': lampe ignorée (' + motif + ')');
  if (!r.lampes.size) terminer(r, 'vide', false, 'Plus aucune lampe à animer.');
}
function suspendre(r, motif) {
  if (r.etat === 'suspendue') return;
  r.etat = 'suspendue'; r.motif = motif; r.depuis = Date.now();
  clearTimeout(r.timer);
  retirerFile((c) => c.run === r);
  log('animation', JSON.stringify(r.nom), ': suspendue (hub)');
  r.sonde = setInterval(() => sonder(r), CONTROLE);
}
async function sonder(r) {
  if (runs.get(r.cle) !== r || r.etat !== 'suspendue' || r.sondeEnCours) return;
  if (Date.now() - r.depuis > PANNE_MAX) { terminer(r, 'panne', false, 'Hub injoignable depuis 5 min : animation arrêtée.'); return; }
  r.sondeEnCours = true;
  try { const l = await lister(); for (const d of l) appareils.set(d.id, d); if (runs.get(r.cle) === r && r.etat === 'suspendue') reprendre(r); } catch (e) { /* toujours en panne */ } finally { r.sondeEnCours = false; }
}
// Reprise sans rattrapage : la suite du cycle en cours (commandes encore a venir), ou un nouveau cycle si celui-ci est passe
function reprendre(r) {
  clearInterval(r.sonde); r.sonde = null;
  r.etat = 'en_cours'; r.motif = null; r.reprises++;
  log('animation', JSON.stringify(r.nom), ': reprise');
  const now = Date.now();
  if (now < r.T0 + r.cycleMs) {
    planifier(r, now);
    r.timer = setTimeout(() => finCycle(r), r.T0 + r.cycleMs - now);
  } else if (r.anim.boucle) { r.etats = r.etatsFin; cycle(r, now); } else terminer(r, 'fin', r.anim.reset, null);
}
function terminer(r, raison, reset, motif) {
  if (runs.get(r.cle) !== r) return;
  clearTimeout(r.timer); clearInterval(r.sonde);
  retirerFile((c) => c.run === r);
  runs.delete(r.cle);
  finies.unshift({ cle: r.cle, id: r.id, nom: r.nom, raison, motif, fin: new Date().toISOString() });
  finies.length = Math.min(finies.length, 5);
  log('animation', JSON.stringify(r.nom), ': arrêtée (' + raison + ')', reset ? 'avec retour à l\'état de départ' : '');
  if (reset) {
    const now = Date.now();
    file.ajouter(retour(etatsActifs(r, r.initial)).map((x) => ({ due: now, limite: now + 10000, run: null, lampe: x.lampe, cible: x.cible, ms: x.ms })));
  }
  if (!runs.size) { clearInterval(controleT); controleT = null; }
}
// Toutes les 5 s (lecture fraiche) : lampes injoignables ou passees OFF hors de l'application (attendues ON, rien en cours d'envoi, derniere reponse avant la lecture)
async function controle() {
  if (!runs.size) return;
  let l;
  const tLecture = Date.now();
  invalider();
  try { l = await lister(); } catch (e) { return; }
  for (const d of l) appareils.set(d.id, d);
  const now = Date.now();
  for (const r of [...runs.values()]) {
    if (r.etat !== 'en_cours') continue;
    for (const id of [...r.lampes]) {
      const d = l.find((x) => x.id === id);
      if (!d) ignorer(r, id, 'introuvable');
      else if (!d.reachable) ignorer(r, id, 'injoignable');
      else if (r.attenduOn.get(id) === true && d.state.on === false && !file.occupe(id) && file.finDe(id) < tLecture) ignorer(r, id, 'passée OFF hors de l\'application');
    }
  }
}

// Lancement : controle (chevauchements, ecart, plafond), 3 animations au plus, lampes reprises aux autres animations, etat de depart relu (reset).
export async function lancer(anim, { cle, essai = false } = {}) {
  cle = cle || (essai ? 'essai' : anim.id);
  const l = await lister();
  for (const d of l) appareils.set(d.id, d);
  const v = verifier(anim, nomDe);
  if (!v.ok) throw new HttpError(409, v.erreurs[0]);
  const autres = [...runs.values()].filter((r) => r.cle !== cle);
  const lampes = new Set(), ignorees = new Map();
  for (const id of v.lampes) {
    const d = l.find((x) => x.id === id);
    if (!d) ignorees.set(id, 'introuvable');
    else if (!animable(d)) ignorees.set(id, 'non animable');
    else if (!d.reachable) ignorees.set(id, 'injoignable');
    else lampes.add(id);
  }
  if (!lampes.size) throw new HttpError(409, 'Aucune lampe à animer (' + [...ignorees].map(([id, m]) => nomDe(id) + ' : ' + m).join(', ') + ').');
  // 3 au plus : celles dont toutes les lampes passeraient a la nouvelle ne comptent pas
  const restantes = autres.filter((r) => [...r.lampes].some((id) => !lampes.has(id)));
  if (restantes.length >= LIMITES.simultanees) throw new HttpError(409, 'Trois animations tournent déjà : arrêtez-en une d\'abord.');
  if (runs.has(cle)) terminer(runs.get(cle), 'relancee', false, null);
  for (const r of autres) for (const id of lampes) if (r.lampes.has(id)) ignorer(r, id, 'reprise par « ' + (anim.nom || 'Essai') + ' »');
  retirerFile((c) => !c.run && lampes.has(c.lampe));
  const etats = new Map();
  for (const id of lampes) etats.set(id, etatDe(l.find((x) => x.id === id)));
  const r = {
    cle, id: essai ? null : anim.id, nom: anim.nom || 'Essai', essai, anim, lampes, ignorees, initial: etats, etats, attenduOn: new Map([...etats].map(([id, s]) => [id, s.on === true])),
    etat: 'en_cours', motif: null, debut: Date.now(), cycleN: 0, envoyees: 0, sautees: 0, reprises: 0, timer: null, sonde: null,
  };
  runs.set(cle, r);
  log('animation', JSON.stringify(r.nom), ': lancée,', lampes.size, 'lampe(s)', ignorees.size ? '(' + ignorees.size + ' ignorée(s))' : '');
  cycle(r, Date.now() + 200);
  if (!controleT) controleT = setInterval(controle, CONTROLE);
  return resume(r);
}
// Arret demande (bouton) : retour a l'etat de depart si l'animation le prevoit
export function arreter(cle) {
  const r = runs.get(cle);
  if (!r) return false;
  terminer(r, 'arret', r.anim.reset, null);
  return true;
}
export const enMarche = (cle) => runs.has(cle);
// Commande manuelle sur des lampes (POST d'un appareil, d'une piece, d'un lot, d'un scenario) : retirees des animations, sans retour a l'etat de depart
export function liberer(ids, motif = 'autre commande') {
  const s = new Set(ids);
  for (const r of [...runs.values()]) for (const id of ids) if (r.lampes.has(id)) ignorer(r, id, motif);
  retirerFile((c) => !c.run && s.has(c.lampe));
}
// Tout OFF : toutes les animations arretees, sans retour a l'etat de depart
export function toutArreter(motif = 'Tout OFF') {
  for (const r of [...runs.values()]) terminer(r, 'tout_off', false, motif);
  retirerFile(() => true);
}
function resume(r) {
  return {
    cle: r.cle, id: r.id, nom: r.nom, essai: r.essai, etat: r.etat, motif: r.motif, debut: new Date(r.debut).toISOString(),
    cycle: r.cycleMs / 1000, cycles: r.cycleN, boucle: r.anim.boucle, lampes: [...r.lampes].map((id) => ({ id, nom: nomDe(id) })),
    ignorees: [...r.ignorees].map(([id, motif]) => ({ id, nom: nomDe(id), motif })), envoyees: r.envoyees, sautees: r.sautees, reprises: r.reprises,
  };
}
export const etat = () => ({ enCours: [...runs.values()].map(resume), finies: finies.map((x) => ({ ...x })) });
// FIN
