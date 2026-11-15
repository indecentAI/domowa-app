// @zone diagnostic
// decouverte-test.mjs : lance la recherche de cameras dans le terminal (aucun identifiant, rien n'est ecrit).
// Usage : node scripts/decouverte-test.mjs
import { lancer, liste, reseaux } from '../adapters/cameras/decouverte.mjs';
import { charger } from '../core/appareils.mjs';
await charger(); // adresses des hubs declares : repli si Android refuse la liste des interfaces
console.log('Reseaux locaux :', reseaux().map((r) => r.ip).join(', ') || 'aucun');
const job = lancer(), vus = new Set(), t0 = Date.now();
const ligne = (r) => r.ip + ' onvif:' + (r.onvifPort || '-') + ' rtsp:' + (r.rtspPort || '-') + ' [' + r.protocoles.join(',') + '] via ' + r.sources.join('+') + ' ' + [r.marque, r.modele, r.nom].filter(Boolean).join(' / ');
const iv = setInterval(() => { for (const r of liste(job)) if (!vus.has(r.ip)) { vus.add(r.ip); console.log('+ ' + Math.round((Date.now() - t0) / 100) / 10 + ' s ' + ligne(r)); } }, 300);
await job.promesse;
clearInterval(iv);
console.log('\nTermine (' + job.etat + ') en ' + Math.round((Date.now() - t0) / 100) / 10 + ' s : ' + liste(job).length + ' appareil(s)');
for (const r of liste(job)) console.log(' ' + ligne(r));
if (job.erreurs.length) console.log('Avertissements :', job.erreurs.join(' | '));
process.exit(0);
