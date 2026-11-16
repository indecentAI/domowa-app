// @zone animations | Animations (V1.5, fonctions pures, sans hub ni fichier) : valider (format d'une animation ; migrer : ancien format a effets), horaire (instants des commandes, sans etat), verifier (chevauchements, ecart par lampe, plafond de cadence), compiler (commandes concretes d'un cycle depuis l'etat des lampes, capacites prises en compte), retour (reset). Unites : secondes ici, ms dans le moteur.
// Animation : {id, nom, icone?, fav?, boucle, reset, etapes: [etape]} ; etape : {lampes: [ids] (ordre = ordre du decalage),
// depart: avec|apres (la precedente), delai, duree, courbe: lineaire|acceleree|ralentie|douce, decalage, off (true : la lampe passe OFF, avec son propre fondu),
// luminosite: 1-100|null, cible: null | {type: 'couleur', teinte 0-359, saturation 0-100} | {type: 'blanc', kelvin}}.
// Lampe n°k d'une etape : debut + k x decalage. Courbe non lineaire : 2 a 4 petits glissements (chacun une commande) ; lineaire, ou moins de 2 s : un seul (fondu natif de la lampe).
// Etape OFF : une commande OFF a l'instant de la lampe (fondu natif) ; sa duree ne compte que pour l'enchainement. Glisser une lampe OFF : on: true ajoute a sa
// premiere commande (ON a sa derniere luminosite, puis glissement). Boucle : le cycle dure jusqu'a la fin de la derniere etape.
// V1.5 (version de travail) : effets « entree » et « sortie » retires (fondu natif des lampes IKEA suffisant, a l'usage) ; migrer() convertit une animation qui en a.
import { HttpError } from '../core/http.mjs';
import { ID_RE, KELVIN_MIN, KELVIN_MAX } from '../core/modele.mjs';

export const LIMITES = { animations: 30, etapes: 40, lampes: 20, dureeMin: 0.5, dureeMax: 3600, delaiMax: 3600, decalageMax: 60, ecart: 0.5, plafond: 4, cycleMin: 1, simultanees: 3 };
export const COURBES = ['lineaire', 'acceleree', 'ralentie', 'douce'];
// Corps de requete d'une animation (routes de modules/animations.mjs) : aux limites (40 etapes de 20 lampes, identifiants de 80 caracteres), environ 80 Ko ;
// la taille par defaut du serveur (4 Ko) refusait des 10 etapes de 8 lampes (essai : banc/unitaires/animations.test.mjs).
export const CORPS_ANIMATION = 128 * 1024;
const err = (m) => new HttpError(400, m);
const dixieme = (v) => Math.round(v * 10) / 10;
function nombre(v, min, max, nom) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw err(nom + ' : ' + String(min).replace('.', ',') + ' à ' + String(max).replace('.', ',') + '.');
  return dixieme(v);
}
function entier(v, min, max, nom) {
  if (!Number.isInteger(v) || v < min || v > max) throw err(nom + ' : nombre entier de ' + min + ' à ' + max + '.');
  return v;
}

// Conversion d'une animation a effets (version de travail de la V1.5) : glisser -> etape ordinaire ; entree -> glissement depuis OFF (ON a la derniere luminosite) ;
// sortie -> glissement vers 1 % (duree - 0,5 s, 0,5 s au moins), puis etape OFF « avec » celle-ci au bout du glissement (memes instants par lampe : OFF a la fin
// de l'ancienne sortie) ; une etape suivante « avec » la sortie garde son instant (delai diminue du glissement, ou 0 si plus court). Sans effet : rendue telle quelle.
export function migrer(a) {
  if (!a || typeof a !== 'object' || !Array.isArray(a.etapes) || !a.etapes.some((e) => e && typeof e === 'object' && 'effet' in e)) return a;
  const etapes = [];
  let recul = 0; // decalage d'origine de l'etape « avec » qui suit une sortie
  for (const e of a.etapes) {
    if (!e || typeof e !== 'object') { etapes.push(e); recul = 0; continue; }
    const { effet, ...x } = e;
    if (recul && x.depart === 'avec') x.delai = Math.max(0, dixieme((typeof x.delai === 'number' ? x.delai : 0) - recul));
    recul = 0;
    if (effet === 'sortie' && typeof x.duree === 'number') {
      const g = dixieme(Math.max(LIMITES.dureeMin, x.duree - LIMITES.ecart));
      etapes.push({ ...x, duree: g, luminosite: 1, cible: null });
      etapes.push({ lampes: Array.isArray(x.lampes) ? x.lampes.slice() : x.lampes, depart: 'avec', delai: g, duree: LIMITES.ecart, courbe: 'lineaire', decalage: x.decalage, off: true, luminosite: null, cible: null });
      recul = g;
    } else etapes.push(x);
  }
  return { ...a, etapes };
}

// Format d'une animation (sans les lampes du hub : verifiees au lancement). icones : cles permises (SCENE_ICONS de scenarios.mjs).
// Une animation a effets (ancien format, ancien client) est d'abord convertie (migrer).
export function valider(a, icones) {
  if (!a || typeof a !== 'object') throw err('Animation requise.');
  a = migrer(a);
  if (typeof a.nom !== 'string' || a.nom.trim().length < 1 || a.nom.trim().length > 40) throw err('Le nom doit faire 1 à 40 caractères.');
  const o = { nom: a.nom.trim().replace(/\s+/g, ' '), boucle: a.boucle === true, reset: a.reset === true };
  if (a.icone !== undefined && a.icone !== null && a.icone !== '') {
    if (typeof a.icone !== 'string' || (icones && !icones.includes(a.icone))) throw err('Icône inconnue.');
    o.icone = a.icone;
  }
  if (!Array.isArray(a.etapes) || a.etapes.length < 1 || a.etapes.length > LIMITES.etapes) throw err('Une animation compte 1 à ' + LIMITES.etapes + ' étapes.');
  o.etapes = a.etapes.map((e, i) => {
    const n = 'Étape ' + (i + 1);
    if (!e || typeof e !== 'object') throw err(n + ' : invalide.');
    if (!Array.isArray(e.lampes) || e.lampes.length < 1 || e.lampes.length > LIMITES.lampes) throw err(n + ' : 1 à ' + LIMITES.lampes + ' lampes.');
    if (!e.lampes.every((x) => typeof x === 'string' && ID_RE.test(x)) || new Set(e.lampes).size !== e.lampes.length) throw err(n + ' : liste de lampes invalide.');
    if (e.off !== undefined && typeof e.off !== 'boolean') throw err(n + ' : OFF vrai ou faux.');
    const off = e.off === true;
    const depart = e.depart === undefined ? 'apres' : e.depart;
    if (depart !== 'avec' && depart !== 'apres') throw err(n + ' : départ « avec » ou « après » la précédente.');
    const courbe = e.courbe === undefined ? 'lineaire' : e.courbe;
    if (!COURBES.includes(courbe)) throw err(n + ' : courbe inconnue.');
    const x = {
      lampes: e.lampes.slice(), depart, courbe: off ? 'lineaire' : courbe,
      delai: nombre(e.delai === undefined ? 0 : e.delai, 0, LIMITES.delaiMax, n + ', délai (s)'),
      duree: nombre(e.duree, LIMITES.dureeMin, LIMITES.dureeMax, n + ', durée (s)'),
      decalage: nombre(e.decalage === undefined ? 0 : e.decalage, 0, LIMITES.decalageMax, n + ', décalage (s)'),
      luminosite: e.luminosite === undefined || e.luminosite === null ? null : entier(e.luminosite, 1, 100, n + ', luminosité'),
      cible: null,
    };
    if (e.cible !== undefined && e.cible !== null) {
      const c = e.cible;
      if (c && c.type === 'couleur') x.cible = { type: 'couleur', teinte: entier(c.teinte, 0, 359, n + ', teinte'), saturation: entier(c.saturation, 0, 100, n + ', saturation') };
      else if (c && c.type === 'blanc') x.cible = { type: 'blanc', kelvin: entier(c.kelvin, KELVIN_MIN, KELVIN_MAX, n + ', blanc (K)') };
      else throw err(n + ' : cible « couleur » ou « blanc ».');
    }
    if (off) { x.off = true; x.cible = null; x.luminosite = null; }
    else if (x.luminosite === null && !x.cible) throw err(n + ' : choisissez une luminosité, une couleur, un blanc ou OFF.');
    return x;
  });
  return o;
}

// Nombre de petits glissements d'une courbe sur d secondes
export const segments = (courbe, d) => (courbe === 'lineaire' || d < 2 ? 1 : Math.min(4, Math.floor(d / LIMITES.ecart)));
const f = { lineaire: (x) => x, acceleree: (x) => x * x, ralentie: (x) => 1 - (1 - x) * (1 - x), douce: (x) => x * x * (3 - 2 * x) };
export const courbe = (nom, x) => (f[nom] || f.lineaire)(x);

// Instants des changements d'un cycle (sans etat) : etapes [{debut, fin}], commandes [{t, lampe, etape, sorte: glisse|off, part (0..1 de la courbe), n, ms, w}], cycle (s).
// Un changement = un envoi a une lampe, fait de w ecritures au hub (une valeur par ecriture, decouper()) : glissement : luminosite et couleur ou blanc, plus le ON
// si l'etape precedente de cette lampe (dans le cycle, ou celle d'avant la boucle) la met OFF ; OFF : une ecriture. Le ON d'une lampe deja OFF au lancement
// n'est pas compte ici : le moteur tient le plafond en direct (les modeles qui partent de OFF, comme l'aube, espacent leur premiere etape).
export function horaire(a) {
  const etapes = [], commandes = [];
  let prec = null;
  a.etapes.forEach((e, i) => {
    const base = !prec ? 0 : (e.depart === 'avec' ? prec.debut : prec.fin);
    const debut = dixieme(base + e.delai), fin = dixieme(debut + (e.lampes.length - 1) * e.decalage + e.duree);
    etapes.push({ debut, fin });
    e.lampes.forEach((lampe, k) => {
      const s = debut + k * e.decalage;
      if (e.off) { commandes.push({ t: s, lampe, etape: i, sorte: 'off', part: 1, n: 1, ms: 0, w: 1 }); return; }
      const wg = Math.max(1, (e.luminosite !== null ? 1 : 0) + (e.cible ? 1 : 0)), n = segments(e.courbe, e.duree), pas = e.duree / n;
      for (let j = 0; j < n; j++) commandes.push({ t: s + j * pas, lampe, etape: i, sorte: 'glisse', part: (j + 1) / n, n, ms: Math.round(pas * 1000), w: wg });
    });
    prec = etapes[i];
  });
  const cycle = Math.max(LIMITES.cycleMin, ...etapes.map((x) => x.fin));
  commandes.forEach((c) => { c.t = Math.round(c.t * 1000) / 1000; });
  commandes.sort((x, y) => x.t - y.t || x.etape - y.etape);
  // ON d'une lampe que son changement precedent (dans l'ordre du temps, boucle comprise) a mise OFF : une ecriture de plus au premier glissement
  const parLampe = new Map();
  for (const c of commandes) { if (!parLampe.has(c.lampe)) parLampe.set(c.lampe, []); parLampe.get(c.lampe).push(c); }
  for (const l of parLampe.values()) {
    l.forEach((c, j) => {
      const p = j > 0 ? l[j - 1] : (a.boucle && l.length > 1 ? l[l.length - 1] : null);
      if (c.sorte === 'glisse' && p && p.sorte === 'off') c.w++;
    });
  }
  return { etapes, commandes, cycle };
}

// Controle avant enregistrement et lancement : {ok, erreurs: [texte], cycle, commandes (ecritures au hub par cycle), pic (ecritures au plus dans 1 s), lampes: [ids]}.
// nom(id) : nom affiche d'une lampe (sinon l'identifiant). En boucle, l'enchainement d'un cycle au suivant compte aussi.
export function verifier(a, nom = (id) => id) {
  const h = horaire(a), erreurs = [], lampes = [...new Set(a.etapes.flatMap((e) => e.lampes))];
  // Une lampe : etapes sans chevauchement, changements (envois) espaces de 0,5 s au moins
  for (const l of lampes) {
    const plages = [];
    a.etapes.forEach((e, i) => { const k = e.lampes.indexOf(l); if (k >= 0) { const s = h.etapes[i].debut + k * e.decalage; plages.push({ i, s, f: s + e.duree }); } });
    plages.sort((x, y) => x.s - y.s);
    for (let j = 1; j < plages.length; j++) {
      if (plages[j].s < plages[j - 1].f - 0.001) { erreurs.push(nom(l) + ' : les étapes ' + (plages[j - 1].i + 1) + ' et ' + (plages[j].i + 1) + ' se chevauchent.'); break; }
    }
    const ts = h.commandes.filter((c) => c.lampe === l).map((c) => c.t);
    if (a.boucle && ts.length) ts.push(ts[0] + h.cycle);
    for (let j = 1; j < ts.length; j++) {
      if (ts[j] - ts[j - 1] < LIMITES.ecart - 0.001) { erreurs.push(nom(l) + ' : deux changements à moins de 0,5 s (vers ' + String(dixieme(ts[j] % h.cycle)).replace('.', ',') + ' s).'); break; }
    }
  }
  // Plafond : 4 ecritures au plus dans toute fenetre d'une seconde (les w ecritures d'un envoi partent ensemble)
  const ts = h.commandes.flatMap((c) => Array(c.w).fill(c.t));
  if (a.boucle) ts.push(...ts.map((t) => t + h.cycle));
  let pic = 0, ou = 0;
  for (let i = 0, j = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] >= 1 - 0.0001) j++;
    if (i - j + 1 > pic) { pic = i - j + 1; ou = ts[j]; }
  }
  if (pic > LIMITES.plafond) {
    const c = h.commandes.find((x) => x.t >= (ou % h.cycle) - 0.0001) || h.commandes[0];
    erreurs.push('Trop rapide : ' + pic + ' commandes en 1 s (étape ' + (c.etape + 1) + ', vers ' + String(dixieme(ou % h.cycle)).replace('.', ',') + ' s), ' + LIMITES.plafond + ' au plus. Allongez les durées ou le décalage, ou retirez des lampes.');
  }
  return { ok: !erreurs.length, erreurs, cycle: h.cycle, commandes: h.commandes.reduce((n, c) => n + c.w, 0), pic, lampes };
}

// Etat d'une lampe pour la compilation : {on, level, mode: color|temperature|null, hue, sat (0-1), kelvin, caps: {level, color, ctemp, ctempMin, ctempMax}}
const borneK = (k, c) => Math.max(c.ctempMin || KELVIN_MIN, Math.min(c.ctempMax || KELVIN_MAX, k));
function teinteVers(h0, h1, x) { let d = ((h1 - h0 + 540) % 360) - 180; return Math.round((h0 + d * x + 360) % 360) % 360; }
// Commandes concretes d'un cycle : [{t (s), lampe, cible: {on?, level?, hue?, sat?, kelvin?}, ms}], et etats en fin de cycle (Map, pour le cycle suivant).
// etats : Map id -> etat (lampes absentes : ignorees). Une commande sans rien a changer pour la lampe (capacites) n'est pas produite.
export function compiler(a, etats) {
  const h = horaire(a), st = new Map(), sortie = [];
  for (const [id, e] of etats) st.set(id, { ...e, caps: { ...(e.caps || {}) } });
  // Valeurs de depart et d'arrivee de chaque (etape, lampe), fixees au moment ou la lampe commence l'etape
  const vise = new Map();
  for (const c of h.commandes) {
    const e = a.etapes[c.etape], s = st.get(c.lampe);
    if (!s) continue;
    const cle = c.etape + ' ' + c.lampe;
    if (!vise.has(cle)) {
      const cap = s.caps, de = { level: s.level == null ? 100 : s.level, hue: s.hue == null ? 0 : s.hue, sat: s.sat == null ? 0 : s.sat, kelvin: s.kelvin == null ? 2700 : s.kelvin, mode: s.mode };
      const vers = { level: cap.level ? e.luminosite : null, couleur: null, kelvin: null };
      if (e.cible && e.cible.type === 'couleur' && cap.color) vers.couleur = { hue: e.cible.teinte, sat: e.cible.saturation / 100 };
      if (e.cible && e.cible.type === 'blanc' && cap.ctemp) vers.kelvin = borneK(e.cible.kelvin, cap);
      vise.set(cle, { de, vers, etaitOn: s.on === true });
    }
    const v = vise.get(cle), x = courbe(e.courbe, c.part), cible = {};
    if (c.sorte === 'off') {
      cible.on = false; s.on = false;
    } else {
      if (v.vers.level !== null && v.vers.level !== undefined) { cible.level = Math.max(1, Math.min(100, Math.round(v.de.level + (v.vers.level - v.de.level) * x))); s.level = cible.level; }
      if (v.vers.couleur) {
        const h0 = v.de.mode === 'color' ? v.de.hue : v.vers.couleur.hue, s0 = v.de.mode === 'color' ? v.de.sat : 0;
        cible.hue = teinteVers(h0, v.vers.couleur.hue, x); cible.sat = Math.round((s0 + (v.vers.couleur.sat - s0) * x) * 100) / 100;
        s.mode = 'color'; s.hue = cible.hue; s.sat = cible.sat;
      }
      if (v.vers.kelvin !== null) {
        const k0 = v.de.mode === 'temperature' ? v.de.kelvin : v.vers.kelvin;
        cible.kelvin = Math.round(k0 + (v.vers.kelvin - k0) * x); s.mode = 'temperature'; s.kelvin = cible.kelvin;
      }
      if (!Object.keys(cible).length) continue;
      if (s.on !== true) { cible.on = true; s.on = true; }
    }
    sortie.push({ t: c.t, lampe: c.lampe, cible, ms: c.ms });
  }
  return { commandes: sortie, cycle: h.cycle, etats: st };
}

// Ecritures d'un envoi, une valeur chacune, dans l'ordre : ON (sans fondu), luminosite, couleur (teinte et saturation ensemble) ou blanc ; OFF seul.
// Le hub DIRIGERA n'applique qu'une valeur quand une ecriture en porte plusieurs (vu sur les lampes, V1.5) : [{cible, ms}]
export function decouper(cible, ms) {
  if (cible.on === false) return [{ cible: { on: false }, ms: 0 }];
  const o = [];
  if (cible.on === true) o.push({ cible: { on: true }, ms: 0 });
  if (cible.level !== undefined) o.push({ cible: { level: cible.level }, ms });
  if (cible.hue !== undefined) o.push({ cible: { hue: cible.hue, sat: cible.sat }, ms });
  if (cible.kelvin !== undefined) o.push({ cible: { kelvin: cible.kelvin }, ms });
  return o;
}

// Reset : retour de chaque lampe a son etat de depart (fondu de 1 s) ; [{lampe, cible, ms}]
export function retour(etats) {
  const o = [];
  for (const [id, s] of etats) {
    if (s.on !== true) { o.push({ lampe: id, cible: { on: false }, ms: 1000 }); continue; }
    const c = { on: true };
    if (s.caps && s.caps.level && s.level != null) c.level = s.level;
    if (s.mode === 'color' && s.caps && s.caps.color && s.hue != null) { c.hue = s.hue; c.sat = s.sat; }
    if (s.mode === 'temperature' && s.caps && s.caps.ctemp && s.kelvin != null) c.kelvin = s.kelvin;
    o.push({ lampe: id, cible: c, ms: 1000 });
  }
  return o;
}
// FIN
