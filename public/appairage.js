// @zone distant | Page d'appairage (V1.8, autonome, sans APP) : saisie du code à 8 chiffres (espace toléré) et du nom de l'appareil, un seul POST /api/appairage {code, nom} (le serveur pose le cookie « domowa », HttpOnly : jamais lu ni gardé ici), puis ouverture de l'application. Le code n'est gardé nulle part.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var code = $("apCode"), nom = $("apNom"), ok = $("apOk"), msg = $("apMsg"), envoi = false;
  var chiffres = function () { return code.value.replace(/\D/g, "").slice(0, 8); };
  // V1.9 révision 2 : chaque type d'échec a sa marche à suivre (#apAide), d'après le statut et le message du serveur (core/acces.mjs)
  var aide = $("apAide");
  function aideDe(statut, texte) {
    if (statut === 0) return "Cet appareil doit être sur le même Wi-Fi que le serveur (pas le réseau « invité » ni les données mobiles), et le serveur doit être démarré. Android 17 et plus : autorisez « Appareils à proximité » pour le navigateur (Paramètres > Applications > Chrome > Autorisations).";
    if (statut === 429) return "Après 5 codes faux, le code est annulé : attendez 5 minutes, puis demandez un nouveau code sur le serveur (« Appareils autorisés » > « Autoriser un appareil »).";
    if (/Aucun code en cours/.test(texte)) return "Le code a expiré (5 minutes) ou a déjà servi. Sur le serveur : menu « ⋯ » > « Appareils autorisés » > « Autoriser un appareil », puis tapez le nouveau code.";
    if (/Code refusé/.test(texte)) return "Recopiez les 8 chiffres affichés sur le serveur, fenêtre « Appareils autorisés ». Un code ne sert qu'une fois et dure 5 minutes.";
    if (/déjà autorisés/.test(texte)) return "Le serveur accepte 10 appareils : sur le serveur, révoquez-en un (« Appareils autorisés » > « Révoquer »), puis demandez un nouveau code.";
    if (statut === 400) return "Tapez les 8 chiffres du code et un nom pour cet appareil (30 caractères au plus).";
    return "Réessayez ; si cela continue, demandez un nouveau code sur le serveur.";
  }
  function dire(t, cls, statut) {
    msg.textContent = t; msg.className = "ap-msg" + (cls ? " " + cls : "");
    if (cls === "err") { aide.textContent = aideDe(statut, t); aide.hidden = false; } else { aide.textContent = ""; aide.hidden = true; }
  }
  function etat() { ok.disabled = envoi || chiffres().length !== 8 || !nom.value.trim(); }
  // Nom proposé d'après le navigateur (modifiable) : aucune donnée de l'appareil n'est envoyée en dehors de ce nom
  var ua = navigator.userAgent || "";
  if (/Domowa-APK\//.test(ua)) $("apEtape").hidden = false; // V1.9 : page ouverte par l'assistant de l'application Android (étape 3 sur 4)
  nom.value = /Android/.test(ua) ? (/Mobile/.test(ua) ? "Smartphone" : "Tablette") : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : "Ordinateur";
  code.addEventListener("input", function () { var c = chiffres(); code.value = c.length > 4 ? c.slice(0, 4) + " " + c.slice(4) : c; etat(); });
  nom.addEventListener("input", etat);
  $("apForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (ok.disabled) return;
    envoi = true; etat(); dire("Vérification…");
    var x = new XMLHttpRequest();
    x.open("POST", "/api/appairage", true);
    x.timeout = 20000;
    x.setRequestHeader("X-Requested-With", "tablette");
    x.setRequestHeader("Content-Type", "application/json");
    x.onload = function () {
      var d = null; try { d = JSON.parse(x.responseText); } catch (err) {}
      if (x.status === 200 || x.status === 409) { dire(x.status === 200 ? "Appareil autorisé. Ouverture de l'application…" : "Cet appareil est déjà autorisé. Ouverture de l'application…", "ok"); code.value = ""; window.location.replace("/"); return; }
      envoi = false; code.value = ""; etat(); code.focus();
      dire((d && d.error) || "Erreur " + x.status + ".", "err", x.status);
    };
    x.onerror = x.ontimeout = function () { envoi = false; etat(); dire("Serveur injoignable.", "err", 0); };
    x.send(JSON.stringify({ code: chiffres(), nom: nom.value }));
  });
  etat(); code.focus();
})();
// FIN
