// @zone animations | Routes des animations (V1.5) : GET /api/animations (liste, en cours, limites, lampes animables), POST /api/animations (creer), /api/animations/verifier (controle sans ecriture),
// /api/animations/essai (essayer sans enregistrer), /api/animations/:id/modifier|supprimer|dupliquer|lancer|arreter|favori ({fav} : icone sur la carte de l'accueil). Stockage : animations-donnees.mjs ; regles : animations-plan.mjs ; moteur : animations-moteur.mjs.
import { HttpError } from '../core/http.mjs';
import { nouvelId } from '../core/outils.mjs';
import { lister } from '../core/appareils.mjs';
import { valider, verifier, LIMITES, CORPS_ANIMATION } from './animations-plan.mjs';
import { lancer, arreter, etat, animable, enMarche, appareilsEnMarche } from './animations-moteur.mjs';
import { lireAnimations, ecrireAnimations } from './animations-donnees.mjs';
import { SCENE_ICONS } from './scenarios.mjs';

const maintenant = () => new Date().toISOString();
// Lampes animables (editeur) et noms des lampes (messages) ; hub injoignable : lampes null, noms = identifiants. Animation en cours et simple lecture
// (GET) : appareils deja lus par le moteur (5 s au plus), sans relire le hub ; une animation recue (POST) est toujours controlee sur une lecture fraiche.
async function inventaire(frais = true) {
  try {
    const l = (!frais && appareilsEnMarche()) || await lister();
    return {
      nom: (id) => (l.find((d) => d.id === id) || {}).name || id,
      lampes: l.filter(animable).map((d) => ({ id: d.id, nom: d.name, piece: d.room ? d.room.name : null, couleur: !!d.caps.color, blanc: !!d.caps.ctemp, luminosite: !!d.caps.level, joignable: d.reachable !== false })),
    };
  } catch (e) { return { nom: (id) => id, lampes: null }; }
}
async function complet(liste, frais = false) {
  const inv = await inventaire(frais);
  return { animations: liste || lireAnimations().liste, ...etat(), limites: LIMITES, lampes: inv.lampes, time: maintenant() };
}
// Animation recue : format (400), puis controle (409 : chevauchement, ecart, plafond), noms des lampes dans les messages
async function preparer(body) {
  const a = valider(body && body.animation, SCENE_ICONS);
  const v = verifier(a, (await inventaire()).nom);
  if (!v.ok) throw new HttpError(409, v.erreurs[0]);
  return a;
}

const LONG = { corps: CORPS_ANIMATION }; // corps d'une animation complete (4 Ko par defaut : trop peu)
export const routes = [
  ['GET', '/api/animations', async () => complet()],
  ['POST', '/api/animations/verifier', async (c) => {
    const body = await c.corps();
    let a;
    try { a = valider(body && body.animation, SCENE_ICONS); } catch (e) { if (e instanceof HttpError) return { ok: false, erreurs: [e.message] }; throw e; }
    return verifier(a, (await inventaire()).nom);
  }, LONG],
  ['POST', '/api/animations', async (c) => {
    const a = await preparer(await c.corps());
    const { liste } = lireAnimations();
    if (liste.length >= LIMITES.animations) throw new HttpError(400, 'Maximum ' + LIMITES.animations + ' animations.');
    a.id = nouvelId();
    liste.push(a);
    ecrireAnimations(liste);
    c.envoyer(201, { animation: a, ...(await complet(liste)) });
  }, LONG],
  ['POST', '/api/animations/essai', async (c) => {
    const a = await preparer(await c.corps());
    a.nom = 'Essai : ' + a.nom;
    await lancer(a, { essai: true });
    return complet();
  }, LONG],
  ['POST', /^\/api\/animations\/([a-z0-9]{1,20})\/(modifier|supprimer|dupliquer|lancer|arreter|favori)$/, async (c) => {
    const id = c.m[1], action = c.m[2];
    if (id === 'essai' && action === 'arreter') { arreter('essai'); return complet(); }
    const { liste } = lireAnimations();
    const i = liste.findIndex((a) => a.id === id);
    if (i < 0) throw new HttpError(404, 'Animation inconnue.');
    if (action === 'lancer') { await lancer(liste[i]); return complet(liste); }
    if (action === 'arreter') { arreter(id); return complet(liste); }
    if (action === 'supprimer') {
      if (enMarche(id)) throw new HttpError(409, 'Animation en cours : arrêtez-la d\'abord.');
      liste.splice(i, 1);
    } else if (action === 'dupliquer') {
      if (liste.length >= LIMITES.animations) throw new HttpError(400, 'Maximum ' + LIMITES.animations + ' animations.');
      const copie = JSON.parse(JSON.stringify(liste[i]));
      copie.id = nouvelId();
      delete copie.fav;
      copie.nom = (liste[i].nom.slice(0, 32) + ' (copie)');
      liste.splice(i + 1, 0, copie);
    } else if (action === 'favori') {
      const body = await c.corps();
      if (!body || typeof body.fav !== 'boolean') throw new HttpError(400, 'Valeur "fav" booléenne requise.');
      if (body.fav) liste[i].fav = true; else delete liste[i].fav;
    } else {
      const a = await preparer(await c.corps());
      a.id = id;
      if (liste[i].fav) a.fav = true;
      liste[i] = a;
    }
    ecrireAnimations(liste);
    return { ...(await complet(liste)), enMarche: enMarche(id) };
  }, LONG],
];
// FIN
