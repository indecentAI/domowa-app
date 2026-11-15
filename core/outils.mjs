// @zone socle | Utilitaires communs : DIR (racine du projet), DONNEES (donnees/, 700 ; V1.8 : dossier choisi par DOMOWA_DONNEES, choisirDonnees), log horodate, sleep, withTimeout (10 s), borne (appel borne), lireJson/ecrireJson dans donnees/ (ecriture atomique), nouvelId.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Dossier des donnees (V1.8) : variable d'environnement DOMOWA_DONNEES (chemin absolu : conteneur, service), sinon donnees/ a cote du code, comme avant.
// Un chemin relatif ou vide est ignore (un dossier de donnees ne depend jamais du dossier courant).
export function choisirDonnees(env, dir) {
  const v = env && typeof env.DOMOWA_DONNEES === 'string' ? env.DOMOWA_DONNEES.trim() : '';
  return v && path.isAbsolute(v) ? path.resolve(v) : path.join(dir, 'donnees');
}
export const DONNEES = choisirDonnees(process.env, DIR); // donnees et secrets : jamais servis ni empaquetes
export const log = (...a) => console.log(new Date().toISOString(), ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function withTimeout(p, ms = 10000) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}
// Appel borne d'une fonction (d'adaptateur le plus souvent) : une exception synchrone devient un rejet, ms au plus (puis ETIMEDOUT).
export const borne = (fn, ms) => withTimeout(Promise.resolve().then(fn), ms);

// Fichier de donnees a la racine : contenu JSON, ou defaut si absent ou illisible (la validation reste au module appelant).
export function lireJson(nom, defaut) {
  try { return JSON.parse(fs.readFileSync(path.join(DONNEES, nom), 'utf8')); } catch (e) { return defaut; }
}
export function ecrireJson(nom, obj, indent) {
  fs.mkdirSync(DONNEES, { recursive: true, mode: 0o700 });
  const f = path.join(DONNEES, nom);
  fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, indent));
  fs.renameSync(f + '.tmp', f);
}
// Identifiant (scenarios, animations, couleurs, pieces locales) : instant (base 36), compteur (2 caracteres : uniques jusqu'a 1296 dans la meme milliseconde ;
// le seul hasard de 4 caracteres se repetait parfois, vu au banc), hasard (4 caracteres) ; 14 caracteres [a-z0-9], sous la limite de 20 des routes.
let compteurId = 0;
export const nouvelId = () => Date.now().toString(36) + (compteurId++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6).padEnd(4, '0');
// FIN
