// @zone hubs | Essai guidé des groupes du hub DIRIGERA (V2.1, 21/11 ; cartes, section 15 : vérifications demandées avant de coder « Choisir les lampes… » et la luminosité / couleur
// d'un groupe). node scripts/groupes-essai.mjs sur l'appareil du serveur (serveur démarré ou non). Chaque étape est expliquée puis demandée (Entrée = faire, « n » = passer, « q » = arrêter
// et nettoyer). Fonctions de la bibliothèque seulement (node_modules/dirigera/dist/api/deviceSets.js et devices.js lus : create, updateConfiguration {deviceIds, remoteLinkIds},
// setIsOn, setAttributes, delete ; devices.list, setAttributes), instance sans aucun renvoi (connexion.mjs, sansRenvoi : TLS strict, seule racine IKEA). Crée au plus deux groupes
// « Domo-wa essai », toujours supprimés à la fin (même après une erreur ou « q ») ; l'état des lampes essayées (ON / OFF, luminosité, température) est remis. L'étape des liens d'une
// télécommande (remoteLinkIds) est facultative, demandée par « oui » en toutes lettres : elle peut retirer les liens faits dans l'application IKEA (à refaire dans l'application).
// Écran : noms des lampes pour les reconnaître. Bilan final à coller dans la conversation : réponses seulement, sans nom, identifiant, adresse ni jeton.
import readline from 'node:readline';
import { sansRenvoi } from '../adapters/dirigera/connexion.mjs';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// Lignes mises en file : réponses tapées d'avance ou envoyées par un tube (banc) jamais perdues ; entrée fermée = arrêt et nettoyage
const lignes = []; let attente = null, ferme = false;
rl.on('line', (l) => { if (attente) { const f = attente; attente = null; f(l); } else lignes.push(l); });
rl.on('close', () => { ferme = true; if (attente) { const f = attente; attente = null; f(null); } });
async function lire(texte) {
  process.stdout.write(texte);
  const l = lignes.length ? lignes.shift() : ferme ? null : await new Promise((r) => { attente = r; });
  if (l === null) throw new Error('ARRET');
  return l;
}
const NOM = 'Domo-wa essai';
const bilan = [];
const crees = [];
let api = null, devices = [], A = null, B = null, etatAvant = [], teleEssai = null, liensAvant = 0;
const note = (q, r) => { bilan.push(q + ' : ' + r); console.log('  → ' + r); };
const motif = (e) => (e && e.response && e.response.statusCode ? 'refusé par le hub (HTTP ' + e.response.statusCode + ')' : e && e.code ? 'erreur ' + e.code : 'erreur');
const nom = (d) => (d && d.attributes && d.attributes.customName) || '(sans nom)';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function relire() { devices = await api.devices.list(); return devices; }
const par = (id) => devices.find((d) => d.id === id);
const dans = (d, g) => !!(d && Array.isArray(d.deviceSet) && d.deviceSet.some((s) => s && s.id === g));
async function demander(texte) {
  const r = (await lire('\n' + texte + '\n[Entrée] faire · [n] passer · [q] arrêter et nettoyer : ')).trim().toLowerCase();
  if (r === 'q') throw new Error('ARRET');
  return r !== 'n';
}
async function creer() {
  const g = await api.deviceSets.create({ name: NOM, icon: 'lighting_table_lamp' });
  if (!g || typeof g.id !== 'string') throw new Error('création sans identifiant');
  crees.push(g.id);
  return g.id;
}

async function essais() {
  api = await sansRenvoi();
  await relire();
  const lampes = devices.filter((d) => d.type === 'light');
  if (lampes.length < 2) { console.log('Il faut au moins deux lampes.'); return; }
  console.log('Lampes du hub :');
  lampes.forEach((d, i) => console.log('  ' + (i + 1) + '. ' + nom(d) + (d.isReachable === false ? ' (injoignable)' : '') + ((d.remoteLinks || []).length ? ' (liée à une télécommande)' : '')));
  const choix = async (q) => { for (;;) { const n = Number((await lire(q)).trim()); if (Number.isInteger(n) && n >= 1 && n <= lampes.length) return lampes[n - 1]; console.log('Numéro invalide.'); } };
  console.log('\nChoisissez deux lampes visibles depuis votre place, sans importance (elles vont s\'allumer, s\'éteindre et changer de luminosité).');
  A = await choix('Lampe A (numéro) : ');
  do { B = await choix('Lampe B (numéro, différente de A) : '); } while (B.id === A.id);
  etatAvant = [A, B].map((d) => ({ id: d.id, isOn: d.attributes.isOn, lightLevel: d.attributes.lightLevel, colorTemperature: d.attributes.colorTemperature, cr: (d.capabilities && d.capabilities.canReceive) || [] }));
  console.log('Lampe A : ' + nom(A) + ' · Lampe B : ' + nom(B));

  let g1 = null;
  if (await demander('1. Créer un groupe « ' + NOM + ' » et y mettre A et B (updateConfiguration deviceIds).')) {
    try {
      g1 = await creer();
      await api.deviceSets.updateConfiguration({ id: g1, deviceIds: [A.id, B.id] });
      await pause(1000); await relire();
      note('1 groupe de deux lampes', dans(par(A.id), g1) && dans(par(B.id), g1) ? 'oui, A et B dans le groupe' : 'groupe créé mais lampes absentes du groupe');
    } catch (e) { note('1 groupe de deux lampes', motif(e)); }
  }
  if (!g1) { note('suite', 'arrêtée (pas de groupe)'); return; }

  if (await demander('2. Commander le groupe : ON puis OFF (setIsOn). Regardez A et B.')) {
    try {
      await api.deviceSets.setIsOn({ id: g1, isOn: true }); await pause(2000); await relire();
      const on = [par(A.id), par(B.id)].every((d) => d.attributes.isOn === true);
      await api.deviceSets.setIsOn({ id: g1, isOn: false }); await pause(2000); await relire();
      const off = [par(A.id), par(B.id)].every((d) => d.attributes.isOn === false);
      const vu = (await lire('Avez-vous vu A et B passer ON ensemble, puis OFF ? (o / n) : ')).trim().toLowerCase();
      note('2 ON / OFF du groupe', (on && off ? 'relu ON puis OFF' : 'relecture : ON ' + on + ', OFF ' + off) + ' ; vu : ' + (vu.startsWith('o') ? 'oui' : 'non'));
    } catch (e) { note('2 ON / OFF du groupe', motif(e)); }
  }

  if (await demander('3. Régler la luminosité du groupe à 30 % (setAttributes lightLevel), lampes ON.')) {
    try {
      await api.deviceSets.setIsOn({ id: g1, isOn: true }); await pause(1500);
      await api.deviceSets.setAttributes({ id: g1, attributes: { lightLevel: 30 } }); await pause(2000); await relire();
      note('3 luminosité du groupe', [par(A.id), par(B.id)].map((d) => d.attributes.lightLevel).join(' et ') + ' % relus (30 attendu)');
    } catch (e) { note('3 luminosité du groupe', motif(e)); }
  }

  const blanc = etatAvant.every((x) => x.cr.includes('colorTemperature'));
  if (blanc && await demander('4. Régler la température du groupe à 2700 K (setAttributes colorTemperature).')) {
    try {
      await api.deviceSets.setAttributes({ id: g1, attributes: { colorTemperature: 2700 } }); await pause(2000); await relire();
      note('4 température du groupe', [par(A.id), par(B.id)].map((d) => d.attributes.colorTemperature).join(' et ') + ' K relus (2700 attendu, à l\'arrondi du hub)');
    } catch (e) { note('4 température du groupe', motif(e)); }
  } else if (!blanc) note('4 température du groupe', 'passé (A ou B sans température réglable)');

  let g2 = null;
  if (await demander('5. Une lampe dans deux groupes : créer un second groupe avec A seule.')) {
    try {
      g2 = await creer();
      await api.deviceSets.updateConfiguration({ id: g2, deviceIds: [A.id] });
      await pause(1000); await relire();
      note('5 une lampe dans deux groupes', dans(par(A.id), g1) && dans(par(A.id), g2) ? 'oui (A dans les deux)' : dans(par(A.id), g2) ? 'non : A a quitté le premier groupe' : 'second groupe sans A');
    } catch (e) { note('5 une lampe dans deux groupes', motif(e)); }
  }

  if (await demander('6. La liste remplace-t-elle la précédente ? Envoyer au premier groupe la liste B seule.')) {
    try {
      await api.deviceSets.updateConfiguration({ id: g1, deviceIds: [B.id] });
      await pause(1000); await relire();
      note('6 deviceIds remplace la liste', !dans(par(A.id), g1) && dans(par(B.id), g1) ? 'oui (A retirée, B gardée)' : dans(par(A.id), g1) ? 'non (A toujours dans le groupe : la liste s\'ajoute)' : 'B absente');
    } catch (e) { note('6 deviceIds remplace la liste', motif(e)); }
  }

  const prise = devices.find((d) => d.type === 'outlet');
  if (prise && await demander('7. Groupes réservés aux lumières ? Ajouter une prise (« ' + nom(prise) + ' ») au premier groupe (sans la commander).')) {
    try {
      await api.deviceSets.updateConfiguration({ id: g1, deviceIds: [B.id, prise.id] });
      await pause(1000); await relire();
      note('7 prise dans un groupe', dans(par(prise.id), g1) ? 'acceptée' : 'refusée en silence (absente du groupe)');
    } catch (e) { note('7 prise dans un groupe', motif(e)); }
  } else if (!prise) note('7 prise dans un groupe', 'passé (aucune prise)');

  const telecommandes = devices.filter((d) => d.type === 'controller');
  if (telecommandes.length) {
    console.log('\n8. FACULTATIF — liens d\'une télécommande (remoteLinkIds).');
    console.log('   Peut RETIRER les liens faits dans l\'application IKEA pour la télécommande choisie (à refaire ensuite dans l\'application).');
    console.log('   À ne faire qu\'avec une télécommande sans importance. Télécommandes :');
    telecommandes.forEach((d, i) => console.log('  ' + (i + 1) + '. ' + nom(d) + ' (' + devices.filter((x) => (x.remoteLinks || []).includes(d.id)).length + ' appareils liés)'));
    const r = (await lire('Numéro de la télécommande pour cet essai, ou Entrée pour passer : ')).trim();
    const t = telecommandes[Number(r) - 1];
    if (t && (await lire('Écrivez « oui » pour lier « ' + nom(t) + ' » au premier groupe (lampe B) : ')).trim().toLowerCase() === 'oui') {
      try {
        const avant = devices.filter((x) => (x.remoteLinks || []).includes(t.id)).map((x) => x.id);
        teleEssai = t.id; liensAvant = avant.length;
        if (avant.includes(B.id)) note('8 remarque', 'B était déjà liée à cette télécommande : essai non concluant (relancer avec une lampe B non liée)');
        await api.deviceSets.updateConfiguration({ id: g1, deviceIds: [B.id], remoteLinkIds: [t.id] });
        await pause(1500); await relire();
        const apres = devices.filter((x) => (x.remoteLinks || []).includes(t.id)).map((x) => x.id);
        const gardes = avant.filter((x) => apres.includes(x)).length;
        note('8 remoteLinkIds', 'liés avant : ' + avant.length + ', après : ' + apres.length + ' (anciens gardés : ' + gardes + ', B liée : ' + (apres.includes(B.id) ? 'oui' : 'non') + ')');
        const vu = (await lire('Appuyez sur la télécommande : B réagit-elle ? (o / n) : ')).trim().toLowerCase();
        note('8 appui de la télécommande', vu.startsWith('o') ? 'B réagit' : 'B ne réagit pas');
      } catch (e) { note('8 remoteLinkIds', motif(e)); }
    } else note('8 remoteLinkIds', 'passé');
  } else note('8 remoteLinkIds', 'passé (aucune télécommande)');
}

async function nettoyer() {
  if (!api) return;
  for (const id of crees.reverse()) {
    try { await api.deviceSets.delete({ id }); note('nettoyage', 'groupe d\'essai supprimé'); } catch (e) { note('nettoyage', 'suppression d\'un groupe d\'essai : ' + motif(e) + ' (à supprimer dans l\'application IKEA : « ' + NOM + ' »)'); }
  }
  for (const x of etatAvant) {
    const at = { isOn: x.isOn };
    if (typeof x.lightLevel === 'number') at.lightLevel = x.lightLevel;
    if (typeof x.colorTemperature === 'number' && x.cr.includes('colorTemperature')) at.colorTemperature = x.colorTemperature;
    try { await api.devices.setAttributes({ id: x.id, attributes: at }); } catch (e) { note('nettoyage', 'état d\'une lampe non remis : ' + motif(e)); }
  }
  if (etatAvant.length) note('nettoyage', 'état des lampes A et B remis');
  try {
    await relire();
    const restes = devices.filter((d) => (d.deviceSet || []).some((s) => s && crees.includes(s.id))).length;
    if (teleEssai) note('vérification', 'télécommande : ' + liensAvant + ' appareils liés avant l\'essai, ' + devices.filter((x) => (x.remoteLinks || []).includes(teleEssai)).length + ' après le nettoyage');
    note('vérification', restes ? restes + ' appareil(s) encore dans un groupe d\'essai' : 'aucun appareil dans un groupe d\'essai');
  } catch (e) { /* relecture facultative */ }
}

try { await essais(); }
catch (e) { if (e.message !== 'ARRET') note('erreur', motif(e)); else console.log('Arrêt demandé.'); }
finally {
  await nettoyer();
  rl.close();
  console.log('\n===== Bilan à coller dans la conversation (sans nom ni identifiant) =====');
  bilan.forEach((l) => console.log(l));
  console.log('=====');
}
// FIN
