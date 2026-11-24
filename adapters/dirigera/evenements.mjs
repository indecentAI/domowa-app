// @zone appareils equipements | Evenements du hub DIRIGERA (V2.1 etape evenements ; cartes du 21/11, section 1) : abonnement par la bibliotheque (startListeningForUpdates /
// stopListeningForUpdates, node_modules/dirigera/dist/ws.js : wss://<hub>:8443/v1, jeton en en-tete, TLS strict comme les requetes : seule racine IKEA embarquee ;
// reconnexion faite par la bibliotheque (reconnecting-websocket, 10 s au plus entre deux essais)) et memoire du serveur, perdue au redemarrage :
//  - « depuis… » d'un etat d'alerte ou d'ouverture (isOpen, waterLeakDetected) : heure du serveur a la reception du changement ;
//  - dernier passage d'un capteur de mouvement (isDetected vrai) : heure du serveur a la reception.
// Un changement vu par une lecture du hub et non par un evenement (connexion coupee) : valeur notee sans heure (jamais d'heure inventee).
// Ecoute ouverte a la premiere lecture du hub (suivre()), puis tenue a jour a chaque lecture : client reconstruit (adresse ou jeton change) -> ancienne ecoute
// fermee, nouvelle ouverte ; hub non configure ou deconnecte -> ecoute fermee, memoire videe. Rien n'est journalise du contenu des evenements (noms, identifiants,
// valeurs) ni de l'adresse ; seulement l'ouverture et la fermeture de l'ecoute. Lecture seule : aucune commande n'est envoyee par ce module.
import { log } from '../../core/outils.mjs';

// Attributs suivis : attribut DIRIGERA -> champ de la memoire. depuis : heure du dernier changement de valeur ; derniere : heure du dernier « vrai »
const SUIVIS = { isOpen: 'depuis', waterLeakDetected: 'depuis', isDetected: 'derniere' };
const MAX = 2000; // appareils retenus au plus (memoire bornee)

const memoire = new Map(); // id d'appareil -> { attribut: { valeur, depuis?, derniere? } }
let ecoute = null; // client qui ecoute
let ouverte = 0; // nombre d'ouvertures (essais unitaires)
let horloge = () => new Date().toISOString();

function noter(id, attr, valeur, heure) {
  if (typeof id !== 'string' || !SUIVIS[attr] || typeof valeur !== 'boolean') return;
  let m = memoire.get(id);
  if (!m) { if (memoire.size >= MAX) memoire.delete(memoire.keys().next().value); m = {}; memoire.set(id, m); }
  const a = m[attr] || (m[attr] = { valeur: null });
  if (SUIVIS[attr] === 'depuis') { if (a.valeur !== valeur) { a.valeur = valeur; a.depuis = heure; } }
  else { a.valeur = valeur; if (valeur && heure) a.derniere = heure; }
}

// Message du hub (fonction de rappel de la bibliotheque : ne leve jamais, n'attend rien)
export function recevoir(ev) {
  try {
    if (!ev || ev.type !== 'deviceStateChanged' || !ev.data || typeof ev.data.id !== 'string') return;
    const at = ev.data.attributes;
    if (!at || typeof at !== 'object') return;
    const t = horloge();
    for (const k of Object.keys(SUIVIS)) if (k in at) noter(ev.data.id, k, at[k], t);
  } catch (e) { /* jamais d'exception vers la bibliotheque ni de journal du contenu */ }
}

// Lecture complete du hub (versEquipements) : la memoire suit la valeur lue ; un changement manque (ecoute coupee) est note sans heure
export function constater(appareils) {
  for (const d of appareils || []) {
    if (!d || typeof d.id !== 'string' || !d.attributes) continue;
    for (const k of Object.keys(SUIVIS)) {
      const v = d.attributes[k];
      if (typeof v !== 'boolean') continue;
      const m = memoire.get(d.id), a = m && m[k];
      if (!a) noter(d.id, k, v, null);
      else if (a.valeur !== v) { if (SUIVIS[k] === 'depuis') { a.valeur = v; a.depuis = null; } else a.valeur = v; }
    }
  }
}

// Heures connues d'un appareil : { isOpen: {depuis}, waterLeakDetected: {depuis}, isDetected: {derniere} } (copies)
export function heures(id) {
  const m = memoire.get(id);
  if (!m) return {};
  const r = {};
  for (const k of Object.keys(m)) r[k] = { depuis: m[k].depuis || null, derniere: m[k].derniere || null };
  return r;
}

// Ecoute tenue a jour : appelee avec la promesse du client courant (connexion.mjs) apres une lecture reussie ; null = plus de hub
export async function suivre(promesseClient) {
  let c = null;
  try { c = promesseClient ? await promesseClient : null; } catch (e) { c = null; }
  if (c === ecoute) return;
  if (ecoute) { try { ecoute.stopListeningForUpdates(); } catch (e) { /* deja fermee */ } ecoute = null; memoire.clear(); log('dirigera : écoute des événements fermée'); }
  if (!c || typeof c.startListeningForUpdates !== 'function') return;
  try { c.startListeningForUpdates(recevoir); ecoute = c; ouverte++; log('dirigera : écoute des événements ouverte'); }
  catch (e) { ecoute = null; log('dirigera : écoute des événements impossible'); }
}
export function arreter() { return suivre(null); }

// Essais unitaires seulement
export const _essai = { memoire, vider: () => memoire.clear(), horloge: (f) => { horloge = f; }, ouvertures: () => ouverte, ecoute: () => ecoute };
// FIN
