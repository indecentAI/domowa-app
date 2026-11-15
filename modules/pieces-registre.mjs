// @zone pieces | Registre local des pieces (V1.4, CLAUDE.md « Pièces » ; aucun nom de marque) : donnees/pieces.json {v: 1, locales: [{id: loc-..., nom, icone,
// cree_le}], rangement: {appareilId: pieceId}}. Une piece locale n'a aucun appareil du hub (elle passe dans le hub des qu'un appareil du hub y est range) ;
// le rangement ne concerne que les appareils independants (adaptateurs avec rangement : lave-linge, familles SmartThings, cameras), sans aucun effet sur
// le hub. Les pieces du hub n'y sont pas recopiees (le hub fait foi). Fichier absent = vide (rien a migrer ; une version precedente l'ignore) ;
// fichier illisible : jamais reecrit, ecritures refusees (message). Aucun secret.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../core/http.mjs';
import { DONNEES, lireJson, ecrireJson, borne, nouvelId } from '../core/outils.mjs';
import { charger, rangeables } from '../core/appareils.mjs';
import { ID_RE } from '../core/modele.mjs';

const FICHIER = 'pieces.json';
export const MAX_LOCALES = 30, MAX_RANGES = 200;
export const LOCAL_RE = /^loc-[a-z0-9]{4,30}$/;
export const estLocale = (id) => LOCAL_RE.test(String(id));
export const nouvelleLocale = () => 'loc-' + nouvelId().toLowerCase().replace(/[^a-z0-9]/g, '');

const vide = () => ({ v: 1, locales: [], rangement: {} });
// Lecture : {v, locales, rangement, illisible}
export function lireRegistre() {
  if (!fs.existsSync(path.join(DONNEES, FICHIER))) return { ...vide(), illisible: false };
  const j = lireJson(FICHIER, null);
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ...vide(), illisible: true };
  const locales = (Array.isArray(j.locales) ? j.locales : []).filter((p) => p && estLocale(p.id) && typeof p.nom === 'string')
    .map((p) => ({ id: p.id, nom: p.nom, icone: typeof p.icone === 'string' ? p.icone : null, cree_le: typeof p.cree_le === 'string' ? p.cree_le : null }));
  const rangement = {};
  const r = j.rangement && typeof j.rangement === 'object' && !Array.isArray(j.rangement) ? j.rangement : {};
  for (const [a, p] of Object.entries(r)) if (ID_RE.test(a) && a !== '__proto__' && typeof p === 'string' && ID_RE.test(p)) rangement[a] = p;
  return { v: 1, locales, rangement, illisible: false };
}
// Ecriture : fn(registre) le modifie ; refusee si le fichier est illisible ; piecesHub (ids lus a l'instant, ou null) : rangements orphelins retires
export function majRegistre(fn, piecesHub) {
  const r = lireRegistre();
  if (r.illisible) throw new HttpError(500, 'donnees/pieces.json illisible : rangement local non modifié (voir la sauvegarde).');
  const res = fn(r);
  if (Array.isArray(piecesHub)) {
    const connues = new Set(piecesHub.concat(r.locales.map((p) => p.id)));
    for (const a of Object.keys(r.rangement)) if (!connues.has(r.rangement[a])) delete r.rangement[a];
  }
  if (r.locales.length > MAX_LOCALES) throw new HttpError(400, 'Trop de pièces locales (' + MAX_LOCALES + ' au plus).');
  if (Object.keys(r.rangement).length > MAX_RANGES) throw new HttpError(400, 'Trop d\'appareils rangés (' + MAX_RANGES + ' au plus).');
  ecrireJson(FICHIER, { v: 1, locales: r.locales, rangement: r.rangement }, 1);
  return res;
}

// Appareils independants connus (depuis les caches des adaptateurs, 6 s au plus chacun) : {appareils: [{id, nom, genre, adapter, origine, vue (cle de la vue du client ou null)}], pannes: [origine]}
export async function independants() {
  await charger();
  const pannes = [], vus = new Set(), appareils = [];
  await Promise.all(rangeables().map(async (x) => {
    try {
      const l = await borne(() => x.r.appareils(), 6000);
      for (const d of Array.isArray(l) ? l : []) {
        if (!d || typeof d.id !== 'string' || !ID_RE.test(d.id) || vus.has(d.id)) continue;
        vus.add(d.id);
        appareils.push({ id: d.id, nom: String(d.nom || d.id).slice(0, 60), genre: String(d.genre || '').slice(0, 30), adapter: x.id, origine: String(x.r.nom || x.id).slice(0, 30), vue: typeof d.vue === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(d.vue) ? d.vue : null });
      }
    } catch (e) { pannes.push(String(x.r.nom || x.id).slice(0, 30)); }
  }));
  return { appareils, pannes };
}
// FIN
