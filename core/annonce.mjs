// @zone distant | V1.9 : annonce mDNS du serveur en mode distant (pour la recherche de l'APK) : _domowa._tcp sur l'adresse choisie seulement, active tant que l'ecoute reseau est ouverte. Reponses aux seuls noms de Domowa (liste fermee : NOMS), aucun nom de machine, aucune empreinte ni secret ; journal sans adresse. Contrat : CLAUDE.md, « Mode distant ».
import { log } from './outils.mjs';

export const SERVICE = '_domowa._tcp.local';
export const INSTANCE = 'Domowa.' + SERVICE;
export const HOTE = 'domowa.local';
export const SERVICES = '_services._dns-sd._udp.local';
export const TTL = 120;
// Noms auxquels on repond : le type de service, la liste des types, et nos propres enregistrements (un client Android resout l'instance et l'hote
// par des questions SRV, TXT et A separees). Toute autre question : aucune reponse.
export const NOMS = [SERVICE, SERVICES, INSTANCE, HOTE];

// Enregistrements de Domowa (adresse : IPv4 privee de l'ecoute reseau ; port : celui de l'ecoute).
function enregistrements(adresse, port) {
  return {
    PTR: { name: SERVICE, type: 'PTR', ttl: TTL, data: INSTANCE },
    SRV: { name: INSTANCE, type: 'SRV', ttl: TTL, flush: true, data: { priority: 0, weight: 0, port, target: HOTE } },
    TXT: { name: INSTANCE, type: 'TXT', ttl: TTL, flush: true, data: ['v=1'] },
    A: { name: HOTE, type: 'A', ttl: TTL, flush: true, data: adresse },
    TYPES: { name: SERVICES, type: 'PTR', ttl: TTL, data: SERVICE },
  };
}

// Reponse a un paquet de questions (pur, essaye par banc/unitaires/annonce.test.mjs) : {answers, additionals} ou null si aucune question ne nous concerne.
export function reponse(paquet, { adresse, port }) {
  const e = enregistrements(adresse, port), answers = [], additionals = [];
  const ajouter = (l, r) => { if (!l.includes(r)) l.push(r); };
  for (const q of (paquet && Array.isArray(paquet.questions)) ? paquet.questions : []) {
    const nom = String((q && q.name) || '').toLowerCase().replace(/\.$/, ''), t = q && q.type, tout = t === 'ANY';
    if (!NOMS.some((n) => n.toLowerCase() === nom)) continue;
    if (nom === SERVICES.toLowerCase() && (t === 'PTR' || tout)) ajouter(answers, e.TYPES);
    if (nom === SERVICE.toLowerCase() && (t === 'PTR' || tout)) { ajouter(answers, e.PTR); [e.SRV, e.TXT, e.A].forEach((r) => ajouter(additionals, r)); }
    if (nom === INSTANCE.toLowerCase()) {
      if (t === 'SRV' || tout) { ajouter(answers, e.SRV); ajouter(additionals, e.A); }
      if (t === 'TXT' || tout) ajouter(answers, e.TXT);
    }
    if (nom === HOTE.toLowerCase() && (t === 'A' || tout)) ajouter(answers, e.A);
  }
  if (!answers.length) return null;
  return { answers, additionals: additionals.filter((r) => !answers.includes(r)) };
}

// Annonce spontanee (a l'ouverture, deux fois a 1 s) : tous les enregistrements du service.
export const annonce = (o) => reponse({ questions: [{ name: SERVICE, type: 'PTR' }] }, o);

// Demarrage : socket UDP 5353 sur toutes les interfaces (la reception multicast l'exige), envois par l'interface de l'adresse choisie.
// Echec (port pris, multicast indisponible, bibliotheque absente) : journal (code seul), le serveur continue. fabrique : remplacable (essais).
export async function demarrer({ adresse, port }, fabrique) {
  let mdns = null, fini = false;
  const arreter = () => { if (fini) return; fini = true; try { if (mdns) mdns.destroy(); } catch (e) { /* deja ferme */ } };
  try {
    if (!fabrique) fabrique = (await import('multicast-dns')).default;
    mdns = fabrique({ interface: adresse, bind: '0.0.0.0', reuseAddr: true, loopback: true }); // bind explicite : lie a l'adresse, le socket ne recevrait pas le multicast
  } catch (e) { log('annonce mDNS impossible (' + (e.code || e.name) + ')'); return { arreter }; }
  mdns.on('error', (e) => { if (fini) return; log('annonce mDNS impossible (' + (e.code || e.name) + ')'); arreter(); });
  mdns.on('warning', () => { /* paquet mal forme recu : ignore */ });
  mdns.on('query', (q) => { if (fini) return; const r = reponse(q, { adresse, port }); if (r) try { mdns.respond(r); } catch (e) { /* envoi impossible : prochaine question */ } });
  const envoyer = () => { if (!fini) try { mdns.respond(annonce({ adresse, port })); } catch (e) { /* idem */ } };
  mdns.on('ready', () => { if (fini) return; log('annonce mDNS active'); envoyer(); setTimeout(envoyer, 1000).unref(); });
  return { arreter };
}
// FIN
