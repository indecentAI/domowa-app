// @zone animations | Fichier donnees/animations-v2.json {v: 2, animations: [...], migre_de?, migre_le?} (V1.5, sans secret) : absent = vide ; illisible : jamais reecrit,
// ecritures refusees ; ecriture atomique (ecrireJson). Migration (etapes sans effets entree / sortie) : au premier usage, depuis donnees/animations.json {v: 1}
// (version de travail de la V1.5), converti par migrer() de animations-plan.mjs ; l'ancien fichier n'est jamais modifie (une version precedente le relit : retour sans perte).
import fs from 'node:fs';
import path from 'node:path';
import { DONNEES, lireJson, ecrireJson, log } from '../core/outils.mjs';
import { HttpError } from '../core/http.mjs';
import { migrer } from './animations-plan.mjs';

const NOM = 'animations-v2.json', ANCIEN = 'animations.json';
const valides = (l) => l.filter((a) => a && typeof a.id === 'string' && Array.isArray(a.etapes));

// Ancien fichier converti, ou null (absent ou illisible : rien n'est cree)
function depuisAncien() {
  if (!fs.existsSync(path.join(DONNEES, ANCIEN))) return null;
  const j = lireJson(ANCIEN, null);
  if (!j || j.v !== 1 || !Array.isArray(j.animations)) return null;
  return valides(j.animations).map(migrer);
}

export function lireAnimations() {
  if (!fs.existsSync(path.join(DONNEES, NOM))) {
    const l = depuisAncien();
    if (!l) return { liste: [], illisible: fs.existsSync(path.join(DONNEES, ANCIEN)) };
    try {
      ecrireJson(NOM, { v: 2, animations: l, migre_de: ANCIEN, migre_le: new Date().toISOString() }, 1);
      log('animations', 'migration : ' + l.length + ' animation(s) de ' + ANCIEN + ' vers ' + NOM + ' (ancien fichier garde)');
    } catch { /* lecture seule possible : liste convertie rendue, ecrite au prochain enregistrement */ }
    return { liste: l, illisible: false };
  }
  const j = lireJson(NOM, null);
  if (!j || j.v !== 2 || !Array.isArray(j.animations)) return { liste: [], illisible: true };
  return { liste: valides(j.animations), illisible: false };
}
export function ecrireAnimations(liste) {
  if (lireAnimations().illisible) throw new HttpError(500, 'Fichier des animations illisible (donnees/' + NOM + ' ou ' + ANCIEN + ') : rien n\'a été enregistré.');
  const j = fs.existsSync(path.join(DONNEES, NOM)) ? lireJson(NOM, {}) : {}, o = { v: 2, animations: liste };
  if (j.migre_de) { o.migre_de = j.migre_de; o.migre_le = j.migre_le; } // trace de la migration gardee
  ecrireJson(NOM, o, 1);
}
// FIN
