// @zone apk | Lien avec l'application Android (V1.9) : sans effet hors de l'APK (APP.apk.present faux, aucun écouteur). Dans l'APK (User-Agent « Domowa-APK/ », APP_VERSION.apk de version.js) : reçoit le canal du pont (message « domowa-pont » portant un MessagePort, envoyé par l'application après chaque chargement ; le dernier reçu est adopté, comme dans l'assistant) et expose APP.apk {present, reglages(), retour(peut), video(etat)}. Requêtes {id, op, args} sur la liste fermée de l'application (reglages {version} : ouvrir les réglages de l'application, avec la version du serveur lue dans GET /api/clients (serveur.version ; 1,5 s au plus, sinon null) ; retour {peut} : la page sait traiter le bouton Retour ; video {joue, l, h} (étape apk-pip) : une caméra est en direct, dimensions de son image, envoyé quand cela change, de nouveau sur un canal neuf) ; une requête sans canal attend le canal, le dernier état de retour seul est gardé. Messages reçus de l'application : {evt: "bandeau"} (après le chemin A), texte fixe écrit ici ; {evt: "pip", actif} (étape apk-pip : image dans l'image, booléen strict -> APP.camPip). Aucune adresse, aucun secret.
(function () {
  "use strict";
  const present = !!(window.APP_VERSION && window.APP_VERSION.apk);
  if (!present) { APP.apk = { present: false, reglages() {}, retour() {}, video() {} }; return; }
  let port = null, n = 0, attente = [], dernier = null, video = null; // video : dernier état annoncé ({joue, l, h}) ; null tant qu'aucune caméra n'a joué
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
      else if (r && r.evt === "pip" && APP.camPip) APP.camPip(r.actif === true); // image dans l'image : rien d'autre n'est repris du message
    };
    const L = attente.splice(0);
    L.forEach((m) => { try { port.postMessage(m); } catch (x) { /* canal fermé : le prochain le remplacera */ } });
    if (dernier !== null) envoyer("retour", { peut: dernier }); // nouveau canal (page rechargée) : l'application reprend l'état courant
    if (video !== null) envoyer("video", video);
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
    retour(peut) { peut = !!peut; if (peut === dernier) return; dernier = peut; envoyer("retour", { peut }); },
    video(e) {
      const v = { joue: !!(e && e.joue), l: null, h: null };
      if (v.joue && Number.isInteger(e.l) && Number.isInteger(e.h) && e.l > 0 && e.h > 0) { v.l = e.l; v.h = e.h; }
      if (video === null ? !v.joue : JSON.stringify(v) === JSON.stringify(video)) return;
      video = v; envoyer("video", v);
    }
  };
})();
// FIN
