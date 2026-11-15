// @zone hubs | Contrat hub de l'adaptateur DIRIGERA (CLAUDE.md, « Hubs ») : un seul hub (id dirigera-1), etat (sonde GET /v1/hub/status, 4 s), adresses, deconnexion, recherche et appairage (appairage.mjs). Sans secret.
import { HttpError } from '../../core/http.mjs';
import { withTimeout } from '../../core/outils.mjs';
import { lire, client, etatLocal, deconnecter, erreur } from './connexion.mjs';
import { rechercher, champs, verifier, appairer } from './appairage.mjs';

const ID = 'dirigera-1';
export const hub = {
  nom: 'IKEA DIRIGERA',
  max: 1,
  adresses() { const a = lire().adresse; return a ? [a] : []; },
  async etat() {
    const c = lire(), e = etatLocal();
    if (e === 'non_configure') return [];
    const h = { id: ID, nom: 'Hub IKEA DIRIGERA', adresse: c.adresse, etat: 'deconnecte', motif: null };
    if (e === 'deconnecte') return [h];
    try {
      const s = await withTimeout(client().then((x) => x.hub.status()), 4000);
      h.etat = 'connecte';
      const n = s && s.attributes && s.attributes.customName;
      if (typeof n === 'string' && n.trim()) h.nom = n.trim();
    } catch (err) {
      const r = erreur(err);
      h.etat = 'erreur';
      h.motif = r ? r[1] : 'Lecture impossible.';
    }
    return [h];
  },
  rechercher,
  // Aide de la fenetre « Hubs » (a tenir a jour avec appairage.mjs et les routes /api/hubs/*).
  aide: [
    { titre: 'Connecter le hub IKEA DIRIGERA', lignes: [
      '1. Cet appareil et le hub doivent être sur le même réseau (le Wi-Fi de la box).',
      '2. Appuyez sur « Connecter un hub » (ou « Changer de hub »), puis sur « Rechercher sur le réseau » et touchez le hub trouvé. Sinon, tapez son adresse : la box l\'affiche dans la liste des appareils connectés (conseil : réservez-la dans la box).',
      '3. Appuyez sur Connecter. Quand le compte à rebours s\'affiche, appuyez une fois, brièvement, sur le bouton sous le hub (60 secondes au plus).',
      '4. L\'état passe à « Connecté » : les lumières et les prises apparaissent.',
    ] },
    { titre: 'Reconnecter', lignes: [
      'Quand l\'état indique « Déconnecté » ou « Jeton refusé par le hub » (hub réinitialisé, par exemple) : Reconnecter, puis le bouton sous le hub. L\'adresse est gardée.',
    ] },
    { titre: 'Changer de hub', lignes: [
      'Même parcours avec la nouvelle adresse. Le hub actuel reste utilisé si l\'appairage échoue ou est annulé.',
    ] },
    { titre: 'Déconnecter', lignes: [
      'Efface le jeton de cet appareil (confirmation demandée) ; l\'adresse est gardée. Lumières et prises disparaissent jusqu\'à la reconnexion.',
    ] },
    { titre: 'Sécurité', lignes: [
      'Connexion chiffrée et vérifiée : seul un appareil portant un certificat IKEA est accepté.',
      'Le jeton reste sur cet appareil (donnees/dirigera-token.txt) : jamais affiché, jamais gardé par le navigateur.',
      'Recherche et saisie limitées aux adresses privées du réseau local.',
    ] },
    { titre: 'En cas de problème', lignes: [
      '« Bouton non appuyé dans les 60 secondes » : recommencez et appuyez une seule fois, brièvement.',
      '« Hub inaccessible » : vérifiez l\'adresse, le Wi-Fi et que le hub est allumé.',
      '« Erreur de certificat TLS » : l\'appareil à cette adresse n\'est pas un hub IKEA ; vérifiez l\'adresse.',
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
