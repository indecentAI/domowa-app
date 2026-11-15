// @zone distant | Mode du serveur (V1.8), serveur arrete : node scripts/serveur.mjs (etat) | distant [adresse] [port] (ouvre l'acces aux appareils du reseau local : HTTPS, appairage par code) | local (referme : 127.0.0.1 seulement). Ecrit donnees/serveur.json (sans secret) ; les appareils autorises (donnees/clients.json) sont gardes.
import net from 'node:net';
import readline from 'node:readline';
import { LOCAL_HOST, LOCAL_PORT } from '../config.mjs';
import { lireConfig, ecrireConfig, adressesMachine, privee, portValide, empreinteDe, PORT_DEFAUT } from '../core/serveur.mjs';

const fin = (m) => { console.log(m); process.exit(1); };
const enMarche = () => new Promise((ok) => {
  const s = net.connect({ host: LOCAL_HOST, port: LOCAL_PORT });
  s.setTimeout(1500);
  s.on('connect', () => { s.destroy(); ok(true); }); s.on('error', () => ok(false)); s.on('timeout', () => { s.destroy(); ok(false); });
});
const demander = (q) => new Promise((ok) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (r) => { rl.close(); ok(r.trim()); }); });

function afficher(c) {
  if (c.invalide) console.log('donnees/serveur.json est illisible ou invalide : le serveur démarre en mode local.');
  if (c.mode !== 'distant') { console.log('Mode : local (http://' + LOCAL_HOST + ':' + LOCAL_PORT + ' sur cette machine seulement).'); return; }
  console.log('Mode : distant.');
  console.log('Adresse à ouvrir depuis un autre appareil : https://' + c.adresse + ':' + c.port);
  const e = empreinteDe(c.adresse);
  console.log(e ? 'Empreinte du certificat (SHA-256), à comparer avec celle que montre le navigateur :\n  ' + e : 'Certificat : créé au prochain démarrage du serveur.');
  console.log('Sur cette machine : http://' + LOCAL_HOST + ':' + LOCAL_PORT + ' (inchangé). Code pour autoriser un appareil, serveur démarré : node scripts/appairage.mjs');
}

const [cmd, a1, a2] = process.argv.slice(2);
if (!cmd || cmd === 'etat') afficher(lireConfig());
else if (cmd === 'local' || cmd === 'distant') {
  if (await enMarche()) fin('Le serveur est en marche : l\'arrêter d\'abord (bash stop.sh, ou le service), puis relancer cette commande.');
  if (cmd === 'local') { ecrireConfig({ mode: 'local' }); console.log('Mode local enregistré. Les appareils autorisés sont gardés (donnees/clients.json) mais ne peuvent plus se connecter.'); }
  else {
    const dispo = adressesMachine();
    let adresse = a1;
    if (!adresse) {
      if (dispo.length === 1) adresse = dispo[0];
      else if (dispo.length > 1 && process.stdin.isTTY) {
        console.log('Adresses de cette machine sur le réseau local :'); dispo.forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x));
        const r = await demander('Numéro de l\'adresse à utiliser : ');
        adresse = dispo[Number(r) - 1];
        if (!adresse) fin('Choix invalide. Rien n\'a été changé.');
      } else fin(dispo.length ? 'Plusieurs adresses : ' + dispo.join(', ') + '. Relancer avec l\'adresse choisie : node scripts/serveur.mjs distant <adresse>'
        : 'Adresse de cette machine introuvable (liste refusée par le système). La lire dans les réglages Wi-Fi, puis : node scripts/serveur.mjs distant <adresse> (exemple : 192.168.1.20)');
    }
    if (!privee(adresse)) fin('Adresse refusée : il faut une adresse IPv4 privée du réseau local (exemple : 192.168.1.20). Rien n\'a été changé.');
    if (dispo.length && !dispo.includes(adresse)) fin('Cette adresse n\'est pas celle de cette machine (' + dispo.join(', ') + '). Rien n\'a été changé.');
    const port = a2 === undefined ? PORT_DEFAUT : Number(a2);
    if (!portValide(port)) fin('Port refusé : entier de 1024 à 65535 (défaut ' + PORT_DEFAUT + '). Rien n\'a été changé.');
    ecrireConfig({ mode: 'distant', adresse, port });
    console.log('Mode distant enregistré. Réserver cette adresse pour cette machine dans la box (bail DHCP fixe) : si elle change, relancer cette commande.');
  }
  afficher(lireConfig());
  console.log('Démarrer le serveur : bash start.sh (ou le service).');
} else fin('Usage : node scripts/serveur.mjs [etat | distant [adresse] [port] | local]');
// FIN
