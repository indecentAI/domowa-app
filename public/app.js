// @zone socle | Objet global APP : $, el, api (XHR), bandeau, statut, setBusy, distant et lieu (V1.8 : page servie par l'ecoute reseau, « cet appareil » -> « le serveur »), colorOf, find, lights, selIds, roomKey, refresh (15 s, bandeau des pannes partielles ; crochets APP.surActualisation), render (crochets APP.onRender), showTab (crochets APP.surVue), demarrage.
var APP = window.APP = {
  devices: [], room: "all", sel: {}, busy: false, dragging: false,
  connErr: false, scenes: []
};
(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function now() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  APP.$ = $; APP.el = el;
  // V1.8, mode distant : la page vient de l'ecoute reseau du serveur (HTTPS ; l'ecoute locale est en HTTP). La machine qui porte les donnees
  // se nomme alors « le serveur » et non « cet appareil » : APP.lieu(texte) adapte un texte ecrit pour le mode local.
  APP.distant = !!(window.location && window.location.protocol === "https:");
  APP.lieu = function (t) {
    if (!APP.distant || typeof t !== "string") return t;
    return t.replace(/\bde cet appareil\b/g, "du serveur").replace(/\bDe cet appareil\b/g, "Du serveur").replace(/\bcet appareil\b/g, "le serveur").replace(/\bCet appareil\b/g, "Le serveur");
  };

  APP.api = function (method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    x.timeout = method === "GET" ? 20000 : 60000;
    x.setRequestHeader("X-Requested-With", "tablette");
    if (body) x.setRequestHeader("Content-Type", "application/json");
    x.onload = function () {
      var d = null;
      try { d = JSON.parse(x.responseText); } catch (e) {}
      if (x.status === 401 && APP.distant) { if (!APP.renvoi) { APP.renvoi = true; window.location.replace("/appairage.html"); } return; } // V1.8 : appareil non autorise ou revoque
      if ((x.status >= 200 && x.status < 300) || x.status === 207) cb(null, d);
      else cb((d && d.error) || ("Erreur " + x.status), d);
    };
    x.onerror = function () { cb(APP.distant ? "Serveur injoignable. Est-il démarré, et cet appareil sur le même réseau ?" : "Serveur local injoignable. Termux est-il lancé ?", null); };
    x.ontimeout = function () { cb("Délai dépassé.", null); };
    x.send(body ? JSON.stringify(body) : null);
  };

  var bannerTimer = null, bannerHide = null;
  APP.bannerMsg = "";
  function bannerClose() {
    var b = $("banner");
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    if (bannerHide) { clearTimeout(bannerHide); bannerHide = null; }
    APP.bannerMsg = "";
    b.classList.remove("show");
    bannerHide = setTimeout(function () { bannerHide = null; b.className = "banner hidden"; b.textContent = ""; }, 280);
  }
  APP.banner = function (msg, kind) {
    var b = $("banner"), vis;
    if (!msg) { if (!b.classList.contains("hidden")) bannerClose(); return; }
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    if (bannerHide) { clearTimeout(bannerHide); bannerHide = null; }
    vis = b.classList.contains("show");
    b.onclick = bannerClose;
    b.textContent = msg; b.className = "banner " + kind + (vis ? " show" : "");
    if (!vis) { void b.offsetWidth; b.classList.add("show"); }
    APP.bannerMsg = msg;
    bannerTimer = setTimeout(bannerClose, kind === "ok" ? 4000 : 8000);
  };
  // Plein écran d'une carte (caméra) : seul cet élément est visible, le bandeau s'y installe puis revient dans la page à la sortie.
  function bannerPlace() {
    var b = $("banner"), f = document.fullscreenElement || document.webkitFullscreenElement;
    var t = (f && f !== document.documentElement && f !== document.body) ? f : document.body;
    if (b.parentNode !== t) t.appendChild(b);
  }
  document.addEventListener("fullscreenchange", bannerPlace);
  document.addEventListener("webkitfullscreenchange", bannerPlace);
  APP.setStatus = function (ok, msg) { var s = $("status"); s.textContent = msg; s.className = "status " + (ok ? "ok" : "bad"); };
  APP.setBusy = function (b) { APP.rev = (APP.rev || 0) + 1; APP.busy = b; document.body.className = b ? "busy" : ""; };

  function kelvinColor(k) {
    var t = (k - 1801) / (6535 - 1801), r, g, b, u;
    if (t < 0) t = 0; if (t > 1) t = 1;
    if (t < 0.5) { u = t / 0.5; r = 255; g = Math.round(147 + 108 * u); b = Math.round(41 + 214 * u); }
    else { u = (t - 0.5) / 0.5; r = Math.round(255 - 65 * u); g = Math.round(255 - 40 * u); b = 255; }
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  APP.colorOf = function (on, mode, hue, sat, kelvin) {
    if (!on) return "#cfd3d8";
    if (mode === "color" && hue !== null && hue !== undefined) {
      var s = Math.min(1, sat || 0);
      return "hsl(" + Math.round(hue) + ",100%," + Math.round((1 - s / 2) * 100) + "%)";
    }
    if (kelvin !== null && kelvin !== undefined) return kelvinColor(kelvin);
    return "#ffe9a8";
  };

  APP.find = function (list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  APP.lights = function () {
    var o = [], i;
    for (i = 0; i < APP.devices.length; i++) if (APP.devices[i].kind === "light" || APP.devices[i].kind === "outlet") o.push(APP.devices[i]);
    return o;
  };
  APP.selIds = function () {
    var o = [], L = APP.lights(), i;
    for (i = 0; i < L.length; i++) if (APP.sel[L[i].id] && L[i].reachable) o.push(L[i].id);
    return o;
  };

  APP.roomKey = function (d) { return d.room ? d.room.id : "none"; };

 // Pannes partielles (GET /api/devices -> pannes [{adapter, libelle, motif}]) : bandeau a chaque changement, retire au retablissement.
  APP.pannesMsg = "";
  function montrerPannes(p) {
    var parts = [], i, msg;
    for (i = 0; p && i < p.length; i++) parts.push(p[i].libelle + " indisponible : " + p[i].motif);
    msg = parts.join(" ; ");
    if (msg === APP.pannesMsg) return;
    if (!msg && APP.pannesMsg && APP.bannerMsg === APP.pannesMsg) APP.banner("", "");
    APP.pannesMsg = msg;
    if (msg) APP.banner(msg, "warn");
  }

  // Crochets ordonnes (qualite 2026-11-11) : chaque fichier ajoute sa partie avec un ordre explicite ; execution par ordre croissant
  // (a ordre egal : ordre d'ajout). L'ordre ne depend plus de celui des scripts dans index.html (il remplace les enveloppes de fonctions).
  function crochets() {
    var liste = [];
    return {
      ajouter: function (fn, ordre) {
        liste.push({ fn: fn, o: ordre || 50, i: liste.length });
        liste.sort(function (a, b) { return a.o - b.o || a.i - b.i; });
      },
      lancer: function (arg) { for (var i = 0; i < liste.length; i++) liste[i].fn(arg); }
    };
  }

  // Actualisation : appareils ON/OFF (GET /api/devices), puis les crochets APP.surActualisation(fn, ordre), toujours appeles, meme si la lecture
  // des appareils est sautee (glisser, commande en cours) : pieces-liste.js 10 (GET /api/pieces/liste), animations.js 20 (GET /api/animations).
  var actualisations = crochets();
  APP.surActualisation = actualisations.ajouter;
  function lireAppareils() {
    if (APP.dragging || APP.busy) return;
    var rev0 = APP.rev;
    APP.api("GET", "/api/devices", null, function (err, d) {
      if (APP.busy || rev0 !== APP.rev) return;
      if (err || !d || !d.devices) {
        APP.connErr = true; APP.setStatus(false, "Hors ligne");
        APP.banner(err || "Réponse inattendue du serveur.", "err");
        return;
      }
      APP.devices = d.devices;
      APP.setStatus(true, "Hub connecté");
      if (APP.connErr) { APP.banner("", ""); APP.connErr = false; APP.pannesMsg = ""; }
      montrerPannes(d.pannes);
      $("stamp").textContent = "Actualisé à " + now();
      APP.render();
    });
  }
  APP.refresh = function () { lireAppareils(); actualisations.lancer(); };

  // Rendu : chaque fichier ajoute sa partie avec APP.onRender(fn, ordre), executee par ordre croissant
  // (pieces 10, menu 20, bulles 30, carte SmartThings 35, appareils independants de la piece 36, selection 40, piece de la selection 45, panneau des lumieres 90).
  var rendus = crochets();
  APP.onRender = rendus.ajouter;
  APP.render = function () { rendus.lancer(); };

  // Changement de vue : les crochets APP.surVue(fn(name), ordre) d'abord (animations.js 10, st-familles.js 20, electromenager.js 30, cameras.js 40,
  // home.js 50), puis la partie de base (#viewLights, #viewScenes ; scenarios relus a l'ouverture de leur vue).
  var vues = crochets();
  APP.surVue = vues.ajouter;
  APP.showTab = function (name) {
    vues.lancer(name);
    $("viewLights").className = "view" + (name === "lights" ? "" : " hidden");
    $("viewScenes").className = "view" + (name === "scenes" ? "" : " hidden");
    if (name === "scenes" && APP.loadScenes) APP.loadScenes();
  };

  $("refresh").onclick = function () { APP.refresh(); };

  // Demarrage une fois tous les scripts charges (index.html) : rendu, actualisation toutes les 15 s et au retour sur la page.
  function demarrer() {
    APP.render();
    setInterval(function () { if (!document.hidden) APP.refresh(); }, 15000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) APP.refresh(); });
    APP.refresh();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
// FIN
