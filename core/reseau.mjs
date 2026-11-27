// @zone socle | Adresses IPv4 du reseau local : estIPv4, privee (10/8, 172.16/12, 192.168/16 ; definies dans core/ipv4.mjs), reseaux() (sous-reseaux prives de la tablette ; repli sur le /24 des hubs declares si Android refuse la liste des interfaces), adresseLocale(ip), rechercherMdns(type, {signal}) (V2.2 revision 2 : recherche des hubs, commune aux adaptateurs), ADRESSE_REFUSEE (texte commun). Ne connait aucune marque.
import os from 'node:os';
import { adressesHubs } from './appareils.mjs';
import { HttpError } from './http.mjs';
import { estIPv4, vers, privee } from './ipv4.mjs';
export { estIPv4, vers, depuis, privee } from './ipv4.mjs'; // fonctions pures (core/ipv4.mjs), reexportees pour les modules existants

// Sous-reseaux IPv4 prives de la tablette : { ip, base, masque, base24 }. Repli (Android peut refuser os.networkInterfaces) : le /24 de chaque hub
// declare (contrat hub.adresses(), adaptateurs deja charges) ; jusqu'en V1.2 etape 5 : le /24 de HUB_IP (config.mjs).
export function reseaux() {
  const r = [];
  try {
    const ifs = os.networkInterfaces();
    for (const nom of Object.keys(ifs)) for (const a of ifs[nom] || []) {
      if (a.family !== 'IPv4' || a.internal || !privee(a.address) || !estIPv4(a.netmask)) continue;
      const masque = vers(a.netmask);
      r.push({ ip: a.address, masque, base: (vers(a.address) & masque) >>> 0, base24: (vers(a.address) & 0xFFFFFF00) >>> 0 });
    }
  } catch (e) { /* liste refusee : repli ci-dessous */ }
  if (!r.length) for (const ip of adressesHubs()) {
    if (!privee(ip)) continue;
    const base = (vers(ip) & 0xFFFFFF00) >>> 0;
    if (!r.some((x) => x.base === base)) r.push({ ip, masque: 0xFFFFFF00, base, base24: base });
  }
  return r;
}
export function adresseLocale(ip) {
  if (!privee(ip)) return false;
  const n = vers(ip);
  return reseaux().some((r) => ((n & r.masque) >>> 0) === r.base);
}
// Refus d'une adresse de hub qui n'est pas une IPv4 privee (appairage des adaptateurs, POST /api/hubs/identifier) : un seul texte.
export const ADRESSE_REFUSEE = 'Adresse refusée : seules les adresses IPv4 privées du réseau local sont acceptées (ex. 192.168.1.20).';

// Recherche mDNS d'un type de service (ex. 'ihsp', 'home-assistant'), protocole tcp : [{adresse, nom}] (IPv4 privees, sans doublon ; nom : 60 caracteres
// au plus, ou null), 5 s au plus, arretee plus tot par signal. Bibliotheque bonjour-service chargee a la demande (son absence ne bloque pas l'adaptateur).
export async function rechercherMdns(type, { signal } = {}) {
  let mod;
  try { mod = await import('bonjour-service'); } catch (e) { throw new HttpError(500, 'Recherche impossible : bibliothèque « bonjour-service » absente (npm install).'); }
  const Bonjour = mod.Bonjour || (mod.default && mod.default.Bonjour);
  const nom = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);
  const vus = new Map();
  let B, nav;
  return new Promise((resolve) => {
    let fini = false;
    const fin = () => { if (fini) return; fini = true; try { if (nav) nav.stop(); if (B) B.destroy(); } catch (e) { /* rien */ } resolve([...vus.values()]); };
    try {
      B = new Bonjour({}, () => {});
      nav = B.find({ type, protocol: 'tcp' }, (s) => {
        try { for (const a of (s && s.addresses) || []) if (privee(a) && !vus.has(a)) vus.set(a, { adresse: a, nom: nom(s.name) }); } catch (e) { /* annonce illisible */ }
      });
    } catch (e) { return fin(); }
    const t = setTimeout(fin, 5000);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); fin(); }, { once: true });
  });
}
// FIN
