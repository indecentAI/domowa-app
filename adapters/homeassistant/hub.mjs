// @zone homeassistant hubs | Contrat hub de l'adaptateur Home Assistant (CLAUDE.md, « Hubs ») : un hub (id homeassistant-1), utilise (jeton present), etat (sonde GET /api/config, 4 s), adresses, deconnexion, recherche mDNS _home-assistant._tcp, appairage par jeton d'acces longue duree (champ secret), aide de la fenetre. Sans secret.
import { HttpError } from '../../core/http.mjs';
import { privee } from '../../core/reseau.mjs';
import { lire, etatLocal, obtenir, enregistrer, deconnecter, erreur, jetonPresent, PORT_DEFAUT, portValide, jetonValide } from './connexion.mjs';

const ID = 'homeassistant-1';
const texte = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

// Recherche : annonce mDNS de Home Assistant (_home-assistant._tcp), adresses privees seulement, 5 s ; bibliotheque chargee a la demande.
async function rechercher({ signal }) {
  let mod;
  try { mod = await import('bonjour-service'); } catch (e) { throw new HttpError(500, 'Recherche impossible : bibliothèque « bonjour-service » absente (npm install).'); }
  const Bonjour = mod.Bonjour || (mod.default && mod.default.Bonjour);
  const vus = new Map();
  let B, nav;
  return new Promise((resolve) => {
    let fini = false;
    const fin = () => { if (fini) return; fini = true; try { if (nav) nav.stop(); if (B) B.destroy(); } catch (e) { /* rien */ } resolve([...vus.values()]); };
    try {
      B = new Bonjour({}, () => {});
      nav = B.find({ type: 'home-assistant', protocol: 'tcp' }, (s) => {
        try { for (const a of (s && s.addresses) || []) if (privee(a) && !vus.has(a)) vus.set(a, { adresse: a, nom: texte(s.name, 60) }); } catch (e) { /* annonce illisible */ }
      });
    } catch (e) { return fin(); }
    const t = setTimeout(fin, 5000);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); fin(); }, { once: true });
  });
}

const champs = [
  { cle: 'adresse', libelle: 'Adresse du hub', type: 'adresse' }, // V2.0 : libelle neutre (aucun type de hub nomme)
  { cle: 'port', libelle: 'Port (vide : 8123)', type: 'texte', court: true }, // court : a droite de l'adresse (fenetre Hubs)
  { cle: 'jeton', libelle: 'Jeton d\'accès longue durée', type: 'secret' },
];
function verifier(ch) {
  const a = typeof ch.adresse === 'string' ? ch.adresse.trim() : '';
  if (!privee(a)) throw new HttpError(400, 'Adresse refusée : seules les adresses IPv4 privées du réseau local sont acceptées (ex. 192.168.1.20).');
  const p = typeof ch.port === 'string' ? ch.port.trim() : '';
  const port = p === '' ? PORT_DEFAUT : (/^\d{1,5}$/.test(p) ? Number(p) : NaN);
  if (!portValide(port)) throw new HttpError(400, 'Port refusé : un nombre de 1 à 65535 (8123 par défaut).');
  const jeton = typeof ch.jeton === 'string' ? ch.jeton.trim() : '';
  if (!jetonValide(jeton)) throw new HttpError(400, 'Jeton absent ou mal formé : collez le jeton d\'accès longue durée créé dans votre profil Home Assistant.');
  return { adresse: a, port, jeton };
}
// Appairage : GET /api/config avec le jeton saisi (8 s) ; reponse attendue : objet JSON portant version (texte). Jeton ecrit seulement apres cette reponse.
async function appairer({ adresse, port, jeton }, { etape, signal }) {
  etape({ texte: 'Connexion à Home Assistant…' });
  const c = await obtenir('/api/config', { adresse, port, jeton, delai: 8000 });
  if (!c || typeof c !== 'object' || typeof c.version !== 'string') throw new HttpError(502, 'Réponse illisible : est-ce bien Home Assistant ?');
  if (signal.aborted) return null;
  enregistrer(adresse, port, jeton);
  return { id: ID };
}

export const hub = {
  nom: 'Home Assistant',
  max: 1,
  priorite: 1, // V2.0 : propose avant DIRIGERA ; pas de sonde identifier : jamais de requete sans jeton valide (Home Assistant peut noter, voire bannir, une adresse apres des echecs d'authentification)
  utilise: () => jetonPresent(),
  adresses() { const a = lire().adresse; return a ? [a] : []; },
  async etat() {
    const c = lire(), e = etatLocal();
    if (e === 'non_configure') return [];
    const h = { id: ID, nom: 'Home Assistant', adresse: c.adresse, etat: 'deconnecte', motif: null };
    if (e === 'deconnecte') return [h];
    try {
      const conf = await obtenir('/api/config', { delai: 4000 });
      h.etat = 'connecte';
      const n = conf && texte(conf.location_name, 40);
      if (n) h.nom = 'Home Assistant (' + n + ')';
    } catch (err) {
      const r = erreur(err);
      h.etat = 'erreur';
      h.motif = r ? r[1] : 'Lecture impossible.';
    }
    return [h];
  },
  rechercher,
  // Aide de la fenetre « Hubs » (a tenir a jour avec ce fichier et les routes /api/hubs/*).
  aide: [
    { titre: 'Connecter Home Assistant', lignes: [
      '1. Dans Home Assistant : votre profil (en bas à gauche), onglet Sécurité, « Jetons d\'accès longue durée », Créer un jeton (nom : Domowa). Copiez-le : il ne sera plus affiché.',
      '2. Ici : « Connecter un hub », puis « Rechercher sur le réseau » : Home Assistant est proposé en premier. Sinon, tapez son adresse et Connecter. Les champs Port et Jeton paraissent ensuite.',
      '3. Port : laissez vide pour 8123 (port habituel). Collez le jeton, puis Connecter.',
      '4. L\'état passe à « Connecté » : les lumières et les prises de Home Assistant apparaissent.',
    ] },
    { titre: 'Ce qui est pris en charge', lignes: [
      'Lumières (sauf les groupes de lumières) et interrupteurs déclarés comme prises (classe « outlet »).',
      'Commandes : ON, OFF, luminosité, couleur et blanc des lumières ; ON et OFF des prises (Tout OFF compris). Chaque commande est envoyée une seule fois : si Home Assistant ne répond pas, l\'état est relu, jamais renvoyé.',
      'Les pièces (zones) de Home Assistant ne sont pas encore reprises : les appareils sont dans « Autres ».',
    ] },
    { titre: 'Un seul hub à la fois', lignes: [
      'L\'application utilise soit le hub IKEA DIRIGERA, soit Home Assistant. Pour changer, déconnectez d\'abord l\'un, puis connectez l\'autre.',
    ] },
    { titre: 'Sécurité', lignes: [
      'Liaison en HTTP sur le réseau local seulement (adresse privée) : le jeton circule sans chiffrement sur le Wi-Fi de la maison.',
      'Le jeton reste sur cet appareil (donnees/homeassistant-token.txt) : jamais affiché, jamais gardé par le navigateur.',
      'Pour retirer l\'accès : Déconnecter ici, et supprimez le jeton dans votre profil Home Assistant.',
    ] },
    { titre: 'En cas de problème', lignes: [
      '« Jeton refusé » : le jeton a été supprimé ou mal collé ; créez-en un nouveau.',
      '« Home Assistant injoignable » : vérifiez l\'adresse, le port et le Wi-Fi.',
      '« Redirection refusée » ou « Réponse illisible » : l\'adresse ne mène pas à l\'interface de Home Assistant (port, ou HTTPS seulement).',
      'Recherche sans résultat : Android bloque parfois la recherche sur le réseau ; tapez l\'adresse à la main.',
    ] },
  ],
  appairage: { champs, verifier, appairer },
  async deconnecter(id) {
    if (id !== ID) throw new HttpError(404, 'Hub inconnu.');
    deconnecter();
  },
};
// FIN
