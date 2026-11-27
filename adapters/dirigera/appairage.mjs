// @zone hubs | DIRIGERA : recherche du hub sur le reseau local (mDNS _ihsp._tcp via bonjour-service, adresses IPv4 privees seulement, 5 s) et appairage guide (bouton sous le hub, 60 s) par la bibliotheque dirigera 2.0.2, TLS strict. Contrat : contrat « Hubs » de .claude/rules/hubs.md.
// Appairage (node_modules/dirigera/dist/index.js, authenticate) : GET oauth/authorize (PKCE S256) puis POST oauth/token reessaye 59 fois a 1 s
// jusqu'a l'appui sur le bouton. Avant : sonde GET /v1/hub/status sans jeton (toute reponse HTTP prouve hub joint et certificat IKEA valide).
// La bibliotheque n'offre pas d'annulation : apres annulation (signal), sa boucle s'acheve seule et le jeton eventuel est jete, jamais ecrit.
import { createDirigeraClient } from 'dirigera';
import { HttpError } from '../../core/http.mjs';
import { withTimeout } from '../../core/outils.mjs';
import { privee, rechercherMdns, ADRESSE_REFUSEE } from '../../core/reseau.mjs';
import { enregistrer, ID } from './connexion.mjs';

// Recherche : [{adresse, nom}] (rechercherMdns de core/reseau.mjs : IPv4 privees, sans doublon, 5 s).
export const rechercher = ({ signal }) => rechercherMdns('ihsp', { signal });

// V2.0 (connexion transparente, modules/hubs.mjs identifier) : vrai si un hub IKEA repond a cette adresse. Meme sonde que l'appairage : GET /v1/hub/status
// sans jeton par la bibliotheque, TLS strict (racine IKEA embarquee) ; toute reponse HTTP prouve le certificat IKEA ; rien n'est ecrit, aucun jeton envoye.
export async function identifier(adresse) {
  if (!privee(adresse)) return false;
  try {
    const c = await createDirigeraClient({ gatewayIP: adresse, rejectUnauthorized: true });
    await withTimeout(c.hub.status(), 4000);
    return true;
  } catch (e) { return !!(e && e.response); }
}
export const champs = [{ cle: 'adresse', libelle: 'Adresse du hub', type: 'adresse' }];
export function verifier(ch) {
  const a = typeof ch.adresse === 'string' ? ch.adresse.trim() : '';
  if (!privee(a)) throw new HttpError(400, ADRESSE_REFUSEE);
  return { adresse: a };
}
export async function appairer({ adresse }, { etape, signal }) {
  etape({ texte: 'Connexion au hub…' });
  const c = await createDirigeraClient({ gatewayIP: adresse, rejectUnauthorized: true });
  try { await withTimeout(c.hub.status(), 8000); } catch (e) { if (!e.response) throw e; }
  if (signal.aborted) return null;
  etape({ texte: 'Appuyez sur le bouton sous le hub.', delai: 60 });
  let jeton;
  try { jeton = await c.authenticate(); } catch (e) {
    if (e && e.response) throw new HttpError(408, 'Bouton non appuyé dans les 60 secondes. Recommencez.');
    throw e;
  }
  if (signal.aborted) return null; // annule pendant l'attente : jeton jete
  enregistrer(adresse, jeton);
  return { id: ID };
}
// FIN
