// @zone apk | Lien avec l'application Android (V1.9) : sans effet hors de l'APK (APP.apk.present faux, aucun écouteur). Dans l'APK (User-Agent « Domowa-APK/ », APP_VERSION.apk de version.js) : reçoit le canal du pont (message « domowa-pont » portant un MessagePort, envoyé par l'application après chaque chargement ; le dernier reçu est adopté, comme dans l'assistant) et expose APP.apk {present, reglages(), retour(peut)}. Requêtes {id, op, args} sur la liste fermée de l'application (reglages {version} : ouvrir les réglages de l'application, avec la version du serveur lue dans GET /api/clients (serveur.version ; 1,5 s au plus, sinon null) ; retour {peut} : la page sait traiter le bouton Retour) ; une requête sans canal attend le canal, le dernier état de retour seul est gardé. Message reçu de l'application : {evt: "bandeau"} seulement (après le chemin A), texte fixe écrit ici. Aucune adresse, aucun secret.
(function () {
  "use strict";
  const present = !!(window.APP_VERSION && window.APP_VERSION.apk);
  if (!present) { APP.apk = { present: false, reglages() {}, retour() {} }; return; }
  let port = null, n = 0, attente = [], dernier = null;
  function envoyer(op, args) {
    const m = JSON.stringify({ id: "w" + (++n), op, args: args || {} });
    if (port) { try { port.postMessage(m); return; } catch (e) { port = null; } }
    attente.push(m); if (attente.length > 10) attente.shift();
  }
  window.addEventListener("message", function (e) {
    if (e.data !== "domowa-pont" || !e.ports || !e.ports[0]) return;
    port = e.ports[0];
    port.onmessage = function (m) {
      // Seul message attendu : {evt: "bandeau"}, une fois après le chemin A ; le texte est écrit ici, jamais repris du message
      let r = null;
      try { r = JSON.parse(m.data); } catch (x) { return; }
      if (r && r.evt === "bandeau") APP.banner(APP.tel ? "Réglages de l'application : onglet Plus" : "Réglages de l'application : menu ⋯", "ok");
    };
    const L = attente.splice(0);
    L.forEach((m) => { try { port.postMessage(m); } catch (x) { /* canal fermé : le prochain le remplacera */ } });
    if (dernier !== null) envoyer("retour", { peut: dernier }); // nouveau canal (page rechargée) : l'application reprend l'état courant
  });
  APP.apk = {
    present: true,
    reglages() {
      // Version du serveur pour les réglages de l'application (1,5 s au plus : sinon sans version)
      let fait = false;
      const fin = (v) => { if (fait) return; fait = true; envoyer("reglages", { version: typeof v === "string" ? v : null }); };
      setTimeout(() => fin(null), 1500);
      // GET /api/clients et non /api/status, qui répond 409 tant qu'aucun hub n'est configuré (serveur neuf)
      APP.api("GET", "/api/clients", null, (err, d) => fin(!err && d && d.serveur ? d.serveur.version : null));
    },
    retour(peut) { peut = !!peut; if (peut === dernier) return; dernier = peut; envoyer("retour", { peut }); }
  };
})();
// FIN
