// @zone equipements | Diagnostic des équipements (V2.1, 21/11) : node scripts/equipements-diagnostic.mjs, serveur démarré. Lit GET /api/equipements sur l'écoute locale
// (127.0.0.1:8080) et affiche, pour chaque équipement, seulement des données sans risque à coller dans une conversation : un numéro, le type d'appareil du hub, et la liste
// des capacités (nom, groupe, écrivable, rôle, type de la valeur) ; jamais de nom, d'identifiant, de valeur, de pièce, de code ni de coordonnées (masqués par le script).
import http from 'node:http';

const lire = () => new Promise((ok, ko) => {
  http.get({ host: '127.0.0.1', port: 8080, path: '/api/equipements', agent: false, headers: { Host: '127.0.0.1:8080' } }, (r) => {
    let b = ''; r.on('data', (x) => { b += x; }); r.on('end', () => { try { ok(JSON.parse(b)); } catch (e) { ko(new Error('réponse illisible')); } });
  }).on('error', () => ko(new Error('serveur injoignable sur 127.0.0.1:8080 (démarré ?)')));
});
const genre = (v) => (v === null || v === undefined ? 'vide' : Array.isArray(v) ? 'liste' : typeof v);

try {
  const d = await lire();
  const l = Array.isArray(d.equipements) ? d.equipements : [];
  console.log('Équipements : ' + l.length + (d.pannes && d.pannes.length ? ' ; pannes : ' + d.pannes.length : ''));
  l.forEach((e, i) => {
    if (e.absent) { console.log('#' + (i + 1) + ' absent'); return; }
    const c = (Array.isArray(e.capacites) ? e.capacites : []).map((x) => x.cap + '[' + (x.groupe || '?').slice(0, 4) + (x.ecriture ? ',ecr' : '') + (x.disponible === false ? ',indispo' : '') + (x.role ? ',' + x.role : '') + ',' + genre(x.valeur) + ']');
    console.log('#' + (i + 1) + ' type=' + (typeof e.type === 'string' ? e.type.replace(/[^A-Za-z]/g, '').slice(0, 20) : '?') + (e.famille ? ' famille=' + e.famille : '') + ' : ' + c.join(' ') + (e.inconnues ? ' ; inconnues=' + e.inconnues : '') + (e.lies ? ' ; lies=' + e.lies.length : ''));
  });
} catch (e) {
  console.log('Diagnostic impossible : ' + e.message);
  process.exitCode = 1;
}
// FIN
