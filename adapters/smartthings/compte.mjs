// @zone electromenager | Compte SmartThings depuis l'application : etat sans secret, application OAuth (saisie de secours), connexion (adresse d'autorisation + code colle), deconnexion.
// Exception de saisie (CLAUDE.md) : client_secret et code arrivent par un POST protege ; jamais renvoyes, stockes cote client ni journalises.
// state : aleatoire, en memoire, 10 min, usage unique (consomme avant l'echange). Le client_id figure dans l'adresse d'autorisation (public au sens OAuth).
// Une operation de compte a la fois ; les ecritures du fichier passent par le verrou du renouvellement (api.mjs).
import crypto from 'node:crypto';
import { HttpError } from '../../core/http.mjs';
import { ErreurST, etatCompte, etatCloud, adresseAutorisation, echangerCode, effacerJetons, enregistrerApplication, RETOUR, SCOPES } from './api.mjs';

const DUREE = 600000;
const ID = /^[A-Za-z0-9-]{8,80}$/, SECRET = /^[\x21-\x7e]{8,200}$/, CODE = /^[A-Za-z0-9._~-]{4,512}$/;
let attente = null; // { state, scope, t }
let occupe = false;
const enAttente = () => (attente && Date.now() - attente.t < DUREE ? attente : null);

const ERREURS = {
  ST_CONFIG: [409, 'Application OAuth absente : renseigner client_id et client_secret.'],
  ST_SECRET: [500, 'Fichier donnees/smartthings.json illisible.'],
  ST_CODE: [400, 'Code refusé ou expiré : recommencer la connexion.'],
  ST_ECRITURE: [500, 'Enregistrement impossible dans donnees/smartthings.json.'],
  ST_QUOTA: [503, 'Quota du cloud SmartThings atteint : réessayer plus tard.'],
  ST_RESEAU: [502, 'Cloud SmartThings injoignable (Internet ?).'],
  ST_DELAI: [504, 'Le cloud SmartThings ne répond pas.'],
  ST_TLS: [502, 'Erreur de certificat TLS avec le cloud.'],
};
async function traduire(p) {
  try { return await p; } catch (e) {
    if (e instanceof ErreurST) { const m = ERREURS[e.code] || [502, 'Réponse inattendue du cloud SmartThings.']; throw new HttpError(m[0], m[1]); }
    throw e;
  }
}
async function seul(f) {
  if (occupe) throw new HttpError(409, 'Une opération sur le compte est déjà en cours.');
  occupe = true;
  try { return await f(); } finally { occupe = false; }
}
const etat = () => Object.assign(etatCompte(), { attente: !!enAttente(), retour: RETOUR, cloud: etatCloud() }); // V1.7 : cloud {etat: joignable|injoignable|inconnu, depuis}

// Texte colle : le code seul, l'adresse de retour ou la page httpbin entiere ({"args": {"code": ..., "state": ...}}).
function extraire(texte) {
  const t = texte.trim();
  if (CODE.test(t)) return { code: t, state: null };
  const champ = (n) => { const m = new RegExp('(?:^|[^A-Za-z0-9_])' + n + '"?\\s*[:=]\\s*"?([A-Za-z0-9._~-]{4,512})').exec(t); return m ? m[1] : null; };
  return { code: champ('code'), state: champ('state') };
}

export const routes = [
  ['GET', '/api/smartthings/compte', async () => etat()],
  ['POST', '/api/smartthings/application', async (c) => seul(async () => {
    const b = await c.corps();
    const id = typeof b.client_id === 'string' ? b.client_id.trim() : '', sec = typeof b.client_secret === 'string' ? b.client_secret.trim() : '';
    if (!ID.test(id)) throw new HttpError(400, 'client_id invalide (lettres, chiffres et tirets).');
    if (!SECRET.test(sec)) throw new HttpError(400, 'client_secret invalide.');
    await traduire(enregistrerApplication(id, sec));
    attente = null;
    return etat();
  })],
  ['POST', '/api/smartthings/connexion', async (c) => seul(async () => {
    const b = await c.corps();
    const scope = b.commande === false ? SCOPES.lecture : SCOPES.commande;
    const state = crypto.randomBytes(16).toString('hex');
    const url = await traduire(Promise.resolve().then(() => adresseAutorisation(scope, state)));
    attente = { state, scope, t: Date.now() };
    return { url, scope, retour: RETOUR };
  })],
  ['POST', '/api/smartthings/code', async (c) => seul(async () => {
    const b = await c.corps();
    if (typeof b.texte !== 'string' || !b.texte.trim() || b.texte.length > 3500) throw new HttpError(400, 'Coller le code (ou la page httpbin entière).');
    const a = enAttente();
    if (!a) throw new HttpError(409, 'Aucune connexion en cours (ou plus de 10 min) : appuyer de nouveau sur Connecter.');
    const { code, state } = extraire(b.texte);
    if (!code) throw new HttpError(400, 'Code introuvable dans le texte collé.');
    attente = null; // usage unique, meme en cas d'echec
    if (state && state !== a.state) throw new HttpError(400, 'Ce code ne correspond pas à la dernière demande : recommencer la connexion.');
    await traduire(echangerCode(code, a.scope));
    return etat();
  })],
  ['POST', '/api/smartthings/deconnexion', async (c) => seul(async () => {
    const b = await c.corps();
    if (b.confirm !== true) throw new HttpError(400, 'Confirmation requise.');
    await traduire(effacerJetons());
    attente = null;
    return etat();
  })],
];
// FIN
