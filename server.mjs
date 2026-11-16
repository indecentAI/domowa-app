// @zone socle | Point d'entree : ecoute locale HTTP 127.0.0.1:8080 (controle Host, sans appairage) et, en mode distant (V1.8, donnees/serveur.json), ecoute reseau HTTPS sur l'adresse privee du serveur (TLS 1.2 au moins, jeton exige : core/acces.mjs ; sans jeton : page d'appairage seule), controle d'entree, fichiers statiques public/ et /api/* -> core/routeur.mjs (core/portier.mjs), rotation du journal (1 Mo), Node 20 exige (V1.8), erreurs non rattrapees journalisees sans arreter le serveur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { LOCAL_HOST, LOCAL_PORT } from './config.mjs';
import { hoteValide, reglerReseau } from './core/http.mjs';
import { DIR, log } from './core/outils.mjs';
import { api, preparer } from './core/routeur.mjs';
import { lireConfig, ouvrirEcouteReseau } from './core/serveur.mjs';
import { acces } from './core/acces.mjs';
import { portier, statique, diagnosticReseau } from './core/portier.mjs';
import { demarrer as annoncer } from './core/annonce.mjs';

// V1.8 : Node 20 au moins (mesure le 11/11/2026 : sous Node 18 la bibliotheque du hub ne se charge pas, le serveur demarrerait sans hub).
const NODE_MIN = 20;
if (Number(process.versions.node.split('.')[0]) < NODE_MIN) {
  console.error('Node ' + process.versions.node + ' : version trop ancienne, Node ' + NODE_MIN + ' ou plus est nécessaire. Le serveur ne démarre pas.');
  process.exit(1);
}

const PUBLIC = path.join(DIR, 'public');
// Controle d'entree (core/portier.mjs) : Host, jeton de l'ecoute reseau (core/acces.mjs ; sans jeton : page d'appairage seule), /api/* -> routeur, fichiers statiques de public/.
const traiter = portier({ hoteValide, authentifier: (c) => acces.authentifier(c), api, statique: statique(PUBLIC), journal: log });
const server = http.createServer(traiter(false));

// Erreur hors requete : journalisee (type, code, ligne ; jamais le message, qui peut contenir une adresse avec identifiants), le serveur continue.
const trace = (e) => [e && e.name, e && e.code, String((e && e.stack) || '').split('\n').find((l) => l.includes(' at ')) || ''].join(' ').trim();
process.on('unhandledRejection', (e) => log('ERREUR non rattrapée (promesse) :', trace(e)));
process.on('uncaughtException', (e) => log('ERREUR non rattrapée :', trace(e)));

// Rotation du journal : au-dela de 1 Mo, copie en server.log.old puis vidage (le journal est ouvert en ajout par start.sh).
const LOG = path.join(DIR, 'server.log');
function rotateLog() {
  try {
    if (fs.statSync(LOG).size > 1048576) { fs.copyFileSync(LOG, LOG + '.old'); fs.truncateSync(LOG, 0); }
  } catch { /* pas de journal : rien a faire */ }
}
rotateLog();
setInterval(rotateLog, 600000).unref();

await preparer(); // modules et adaptateurs ; une erreur ici arrete le demarrage (cause dans server.log)
server.listen(LOCAL_PORT, LOCAL_HOST, () => {
  console.log('Serveur prêt : http://' + LOCAL_HOST + ':' + LOCAL_PORT);
});
// V1.8, mode distant : ecoute reseau en plus de l'ecoute locale (jamais 0.0.0.0), core/serveur.mjs (ouvrirEcouteReseau). Un echec (certificat, adresse
// absente de la machine, port pris) est journalise sans adresse et laisse l'ecoute locale en service ; adresse absente : nouvel essai toutes les 30 s.
// V1.9 : annonce mDNS (recherche de l'APK, core/annonce.mjs) une fois l'ecoute ouverte ; echec : journal, rien d'autre.
ouvrirEcouteReseau(lireConfig(), { traiter: traiter(true), reglerReseau, journal: log, diagnostic: () => diagnosticReseau({ journal: log }), annoncer });
// FIN
