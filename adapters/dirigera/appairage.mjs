// @zone hubs | DIRIGERA : recherche du hub sur le reseau local (mDNS _ihsp._tcp via bonjour-service, adresses IPv4 privees seulement, 5 s) et appairage guide (bouton sous le hub, 60 s) par la bibliotheque dirigera 2.0.2, TLS strict. Contrat : CLAUDE.md, « Hubs ».
// Appairage (node_modules/dirigera/dist/index.js, authenticate) : GET oauth/authorize (PKCE S256) puis POST oauth/token reessaye 59 fois a 1 s
// jusqu'a l'appui sur le bouton. Avant : sonde GET /v1/hub/status sans jeton (toute reponse HTTP prouve hub joint et certificat IKEA valide).
// La bibliotheque n'offre pas d'annulation : apres annulation (signal), sa boucle s'acheve seule et le jeton eventuel est jete, jamais ecrit.
import { createDirigeraClient } from 'dirigera';
import { HttpError } from '../../core/http.mjs';
import { withTimeout } from '../../core/outils.mjs';
import { privee } from '../../core/reseau.mjs';
import { enregistrer } from './connexion.mjs';

const texte = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);

// Recherche : [{adresse, nom}] (adresses privees, sans doublon) ; bibliotheque chargee a la demande (son absence ne bloque pas l'adaptateur).
export async function rechercher({ signal }) {
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
      nav = B.find({ type: 'ihsp', protocol: 'tcp' }, (s) => {
        try { for (const a of (s && s.addresses) || []) if (privee(a) && !vus.has(a)) vus.set(a, { adresse: a, nom: texte(s.name) }); } catch (e) { /* annonce illisible */ }
      });
    } catch (e) { return fin(); }
    const t = setTimeout(fin, 5000);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); fin(); }, { once: true });
  });
}

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
  if (!privee(a)) throw new HttpError(400, 'Adresse refusée : seules les adresses IPv4 privées du réseau local sont acceptées (ex. 192.168.1.20).');
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
  return { id: 'dirigera-1' };
}
// FIN
