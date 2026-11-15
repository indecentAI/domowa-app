// @zone cameras | Cartes camera de l'accueil (#homeCams) : lecteur, EN DIRECT, reconnexion 3 essais, son, volume, plein ecran, pave PTZ, SD/HD, bouton +.
// V1.7 : etat de joignabilite (GET /api/cameras, etat et motif) relu toutes les 30 s tant que l'accueil est affiche ; hors ligne : « Hors ligne », motif, lecture inactive ; cartes mises a jour sans reconstruction (un flux en cours n'est pas coupe).
(function () {
  var $ = APP.$, el = APP.el, box = $("homeCams"), cards = [], loaded = false, loading = false, visible = true; // visible : accueil affiche (premier ecran ; home.js l affiche avant ce script)
  var MAX_ESSAIS = 3;
  var SV = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICON_PLAY = SV + '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor"/></svg>';
  var ICON_STOP = SV + '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/></svg>';
  var ICON_SND_ON = SV + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  var ICON_SND_OFF = SV + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="15" y1="9" x2="22" y2="16"/><line x1="22" y1="9" x2="15" y2="16"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';
  var ICON_FS_ON = SV + '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var ICON_FS_OFF = SV + '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  var ICON_PTZ = SV + '<rect x="8" y="8" width="8" height="8" rx="1"/>' +
 '<polygon points="12 2.5 9.5 6 14.5 6" fill="currentColor" stroke-width="1"/>' +
 '<polygon points="12 21.5 9.5 18 14.5 18" fill="currentColor" stroke-width="1"/>' +
 '<polygon points="2.5 12 6 9.5 6 14.5" fill="currentColor" stroke-width="1"/>' +
 '<polygon points="21.5 12 18 9.5 18 14.5" fill="currentColor" stroke-width="1"/></svg>';
 var ARROWS = [["up", "Haut", "M6 15l6-6 6 6"], ["left", "Gauche", "M15 6l-6 6 6 6"], ["right", "Droite", "M9 6l6 6-6 6"], ["down", "Bas", "M6 9l6 6 6-6"]];

  function now() { return new Date().getTime(); }
  // En-tête : l'état s'affiche dans c.stxt ; le point rouge (c.dot) précède « EN DIRECT ».
  function setState(c, t) {
    if (c.stxt.textContent !== t) c.stxt.textContent = t;
    c.dot.className = t === "EN DIRECT" ? "cdot" : "cdot hidden";
  }
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function fsExit() { var f = document.exitFullscreen || document.webkitExitFullscreen, p; if (f) { p = f.call(document); if (p && p.catch) p.catch(function () {}); } }
  function fsIcons() {
    var i, on;
    for (i = 0; i < cards.length; i++) {
      on = fsEl() === cards[i].root;
      cards[i].fs.innerHTML = on ? ICON_FS_OFF : ICON_FS_ON;
      cards[i].fs.setAttribute("aria-label", on ? "Quitter le plein écran" : "Plein écran");
    }
  }
  function toggleFs(c) {
    var r = c.root, f = r.requestFullscreen || r.webkitRequestFullscreen, p;
    if (fsEl() === r) { fsExit(); return; }
    if (!f) { APP.banner("Plein écran non disponible sur ce navigateur.", "warn"); return; }
    p = f.call(r);
    if (p && p.catch) p.catch(function (e) { APP.banner("Plein écran refusé : " + (e && e.message), "warn"); });
  }
  function show(c, live) {
    var hl = !live && c.hl;
    c.pp.className = "cbtn" + (hl ? "" : live ? " off" : " on");
    c.pp.innerHTML = live ? ICON_STOP : ICON_PLAY;
    c.pp.disabled = hl;
    c.pp.setAttribute("aria-label", live ? "Stop" : hl ? "Lecture impossible : " + c.motifTxt : "Lire : " + c.name);
    c.ctl.className = live ? "cctl" : "cctl hidden";
    c.pad.className = live && c.ptz && c.padOn ? "cpadbox" : "cpadbox hidden";
 c.view.className = live ? "cview open" : "cview";
  }
  // Qualité choisie (SD ou HD), mémorisée par caméra ; sans localStorage la caméra reste en SD.
  function loadQ(id) { try { return window.localStorage.getItem("cam-q-" + id) === "hd" ? "hd" : "sd"; } catch (e) { return "sd"; } }
  function saveQ(id, q) { try { window.localStorage.setItem("cam-q-" + id, q); } catch (e) {} }
  function qLabel(c) {
    var hd = c.q === "hd";
    c.qb.className = "cbtn cq" + (hd ? " on" : "");
    c.qb.textContent = hd ? "HD" : "SD";
    c.qb.setAttribute("aria-label", hd ? "Qualité haute définition" : "Qualité standard");
  }
  // Mouvement : appui = la caméra tourne, relâchement = arrêt. L'arrêt part après la fin de la commande de mouvement (ordre garanti).
  function sendMove(c, dir, cb) { APP.api("POST", "/api/cameras/" + encodeURIComponent(c.id) + "/move", { dir: dir }, cb); }
  function pressArrow(c, dir) {
    if (c.dir) return;
    c.dir = dir; c.inflight = true; c.wantStop = false;
    sendMove(c, dir, function (err) {
      c.inflight = false;
      if (err) APP.banner(c.name + " : " + err, "warn");
      if (c.wantStop || err) { c.wantStop = false; c.dir = null; sendMove(c, "stop", function () {}); }
    });
  }
  function releaseArrow(c, dir) {
    if (c.dir !== dir) return;
    if (c.inflight) { c.wantStop = true; return; }
    c.dir = null; sendMove(c, "stop", function () {});
  }
  function arrow(c, a) {
    var b = el("button", "carr c" + a[0], "");
    b.innerHTML = SV + '<path d="' + a[2] + '"/></svg>';
    b.setAttribute("aria-label", a[1]);
    b.onpointerdown = function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} pressArrow(c, a[0]); };
    b.onpointerup = function () { releaseArrow(c, a[0]); };
    b.onpointercancel = function () { releaseArrow(c, a[0]); };
    b.onlostpointercapture = function () { releaseArrow(c, a[0]); };
    b.oncontextmenu = function (e) { e.preventDefault(); };
    return b;
  }
  function ptzLabel(c) {
 c.pz.className = "cbtn cpz" + (c.padOn ? " on" : "");
 c.pz.innerHTML = ICON_PTZ;
 c.pz.setAttribute("aria-label", c.padOn ? "Masquer les fl\u00e8ches d'orientation" : "Afficher les fl\u00e8ches d'orientation");
 }
 function soundLabel(c) {
    var on = !c.v.muted && c.v.volume > 0;
    c.snd.className = "cbtn " + (on ? "on" : "off");
    c.snd.innerHTML = on ? ICON_SND_ON : ICON_SND_OFF;
    c.snd.setAttribute("aria-label", on ? "Couper le son (Mute)" : "Rétablir le son");
    c.vol.value = on ? String(c.v.volume) : "0"; // son coupe : curseur a 0 (le volume choisi reste en memoire pour la reprise)
    c.vol.style.setProperty("--p", Math.round(Number(c.vol.value) * 100) + "%"); // partie blanche de la piste (cameras.css)
  }
  function stop(c, msg) {
    c.live = false; c.wait = false;
    if (c.dir) { c.wantStop = true; releaseArrow(c, c.dir); }
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    c.v.pause(); c.v.removeAttribute("src"); c.v.load();
    if (fsEl() === c.root) fsExit();
    show(c, false); setState(c, msg || "");
    repos(c);
  }
  // V1.7 : carte a l'arret d'une camera hors ligne : « Hors ligne » (sauf message d'arret) et motif sous l'en-tete ; retour en ligne : effaces
  function repos(c) {
    var hl = c.hl && !c.live;
    c.motif.textContent = hl ? c.motifTxt : "";
    c.motif.className = hl ? "cmotif" : "cmotif hidden";
    if (c.live) return;
    if (hl && !c.stxt.textContent) setState(c, "Hors ligne");
    else if (!hl && c.stxt.textContent === "Hors ligne") setState(c, "");
  }
  function majEtat(c, cam) {
    c.hl = cam.etat === "hors_ligne"; c.motifTxt = APP.lieu(cam.motif || "Cam\u00e9ra injoignable.");
    c.root.className = c.hl ? "ccard chors" : "ccard";
    if (!c.live) show(c, false);
    repos(c);
  }
  function stopAll() { var i; for (i = 0; i < cards.length; i++) if (cards[i].live) stop(cards[i], ""); }
  // Ouvre (ou rouvre) la connexion au flux ; le serveur ferme l'ancienne connexion de la même caméra.
  function open(c, msg) {
    var p;
    c.wait = false; c.ok = false; c.lastT = 0; c.moved = now(); c.since = c.moved;
    setState(c, msg);
    c.v.removeAttribute("src"); c.v.load();
    c.v.src = "/api/cameras/" + encodeURIComponent(c.id) + "/stream?t=" + now() + (c.hd && c.q === "hd" ? "&q=hd" : "");
    p = c.v.play();
    if (p && p.catch) p.catch(function (e) {
      if (!c.live || !e || e.name !== "NotAllowedError") return;
      c.v.muted = true; soundLabel(c);
      var q = c.v.play(); if (q && q.catch) q.catch(function () { if (c.live) stop(c, "Lecture refusée par Chrome."); });
    });
  }
  function reconnect(c) {
    if (!c.live || c.wait) return;
    if (c.tries >= MAX_ESSAIS && c.q === "hd") {
      c.q = "sd"; c.tries = 0; qLabel(c);
      APP.banner(c.name + " : haute définition indisponible, retour en qualité standard.", "warn");
      open(c, "Connexion…");
      return;
    }
    if (c.tries >= MAX_ESSAIS) {
      stop(c, "Flux indisponible");
      APP.banner(c.name + " : flux indisponible (caméra éteinte, Wi-Fi ou identifiants ?)", "warn");
      return;
    }
    c.tries++; c.wait = true;
    setState(c, "Reconnexion " + c.tries + "/" + MAX_ESSAIS + "…");
    c.timer = setTimeout(function () { c.timer = null; if (c.live) open(c, "Reconnexion " + c.tries + "/" + MAX_ESSAIS + "…"); }, 1500);
  }
  function start(c) {
    c.live = true; c.tries = 0; c.v.muted = false; if (c.v.volume === 0) c.v.volume = 0.5;
    soundLabel(c); show(c, true);
    open(c, "Connexion…");
  }
  function build(cam) {
    var c = { id: cam.id, name: cam.name, ptz: cam.ptz !== false, dir: null, inflight: false, wantStop: false, hd: !!cam.hd, q: cam.hd ? loadQ(cam.id) : "sd", live: false, wait: false, tries: 0, ok: false, lastT: 0, moved: 0, since: 0, timer: null }, head, view, pad, i;
    c.padOn = true;
 c.root = el("div", "ccard");
    head = el("div", "chead"); head.appendChild(el("span", "cname", cam.name));
    c.state = el("span", "cstate", ""); c.dot = el("span", "cdot hidden", ""); c.stxt = el("span", "", "");
    c.state.appendChild(c.dot); c.state.appendChild(c.stxt); head.appendChild(c.state);
    c.motif = el("div", "cmotif hidden", ""); c.hl = false; c.motifTxt = "";
    view = el("div", "cview"); c.view = view;
    c.v = el("video", "cvideo"); c.v.setAttribute("playsinline", "");
    c.v.onwaiting = function () { if (c.live && !c.wait && c.ok) setState(c, "Chargement…"); };
    c.v.onerror = function () { reconnect(c); };
    c.v.onended = function () { reconnect(c); };
    view.appendChild(c.v);
    c.pad = el("div", "cpadbox hidden"); pad = el("div", "cpad");
    for (i = 0; i < ARROWS.length; i++) pad.appendChild(arrow(c, ARROWS[i]));
    c.pad.appendChild(pad); view.appendChild(c.pad);
    c.btns = el("div", "cbtns");
    c.pp = el("button", "cbtn on", ""); c.pp.onclick = function () { if (c.live) stop(c, ""); else if (!c.hl) start(c); };
    c.ctl = el("span", "cctl hidden", "");
    c.snd = el("button", "cbtn on", "");
    c.snd.onclick = function () {
      if (c.v.muted || c.v.volume === 0) { c.v.muted = false; if (c.v.volume === 0) { c.v.volume = 0.5; c.vol.value = "0.5"; } }
      else c.v.muted = true;
      soundLabel(c);
    };
    c.vol = el("input", "cvol", ""); c.vol.type = "range"; c.vol.min = "0"; c.vol.max = "1"; c.vol.step = "0.05"; c.vol.value = "1";
    c.vol.setAttribute("aria-label", "Volume");
    c.vol.oninput = function () { c.v.volume = Number(c.vol.value); if (c.v.volume > 0) c.v.muted = false; soundLabel(c); };
    c.pz = el("button", "cbtn cpz", "");
 c.pz.onclick = function () {
 c.padOn = !c.padOn;
 if (!c.padOn && c.dir) releaseArrow(c, c.dir);
 ptzLabel(c); show(c, c.live);
 };
 c.fs = el("button", "cbtn", ""); c.fs.onclick = function () { toggleFs(c); };
    c.qb = el("button", "cbtn cq", "SD");
    c.qb.onclick = function () {
      c.q = c.q === "hd" ? "sd" : "hd"; saveQ(c.id, c.q); qLabel(c);
      if (c.live) { c.tries = 0; if (c.timer) { clearTimeout(c.timer); c.timer = null; } open(c, "Connexion…"); }
    };
    c.ctl.appendChild(c.snd); c.ctl.appendChild(c.vol); if (c.ptz) c.ctl.appendChild(c.pz); c.ctl.appendChild(c.fs);
    c.btns.appendChild(c.pp); c.btns.appendChild(c.ctl);
    if (c.hd) view.appendChild(c.qb);
    c.root.appendChild(head); c.root.appendChild(c.motif); c.root.appendChild(view); c.root.appendChild(c.btns);
    soundLabel(c); ptzLabel(c); qLabel(c); majEtat(c, cam);
    return c;
  }
  function entete() {
    var h = el("div", "hcamhead"), b = el("button", "cj-plus", "");
    h.appendChild(el("div", "hlabel", "Cam\u00e9ras"));
    b.innerHTML = SV + '<path d="M12 5v14M5 12h14"/></svg>';
    b.setAttribute("aria-label", "Ajouter ou g\u00e9rer les cam\u00e9ras");
    b.onclick = function () { if (APP.camerasOpen) APP.camerasOpen(); };
    h.appendChild(b);
    return h;
  }
  APP.camerasReload = function () { stopAll(); loaded = false; load(); };
  function load() {
    if (loaded || loading) return;
    loading = true;
    APP.api("GET", "/api/cameras", null, function (err, d) {
      var i, c;
      loading = false;
      if (err || !d || !d.cameras) return;
      loaded = true; cards = [];
      box.innerHTML = "";
      box.appendChild(entete());
      for (i = 0; i < d.cameras.length; i++) { c = build(d.cameras[i]); c.cle = cle(d.cameras[i]); cards.push(c); box.appendChild(c.root); }
      fsIcons();
      if (!d.cameras.length) box.appendChild(el("div", "cj-vide", "Aucune cam\u00e9ra. Touchez + pour en ajouter."));
      box.className = "hcams";
    });
  }
  // V1.7 : relecture de l'etat des cameras (30 s, accueil affiche, page visible) ; meme liste : etat mis a jour ; liste changee : reconstruite si aucune ne joue
  function cle(cam) { return [cam.id, cam.name, cam.ptz !== false, !!cam.hd].join("|"); }
  function relire() {
    if (!loaded || loading || !visible || document.hidden) return;
    loading = true;
    APP.api("GET", "/api/cameras", null, function (err, d) {
      var i, meme;
      loading = false;
      if (err || !d || !d.cameras) return;
      meme = d.cameras.length === cards.length;
      for (i = 0; meme && i < cards.length; i++) meme = cards[i].cle === cle(d.cameras[i]);
      if (meme) { for (i = 0; i < cards.length; i++) majEtat(cards[i], d.cameras[i]); return; }
      for (i = 0; i < cards.length; i++) if (cards[i].live) return;
      loaded = false; load();
    });
  }
  setInterval(relire, 30000);
  // Une fois par seconde, pour chaque flux : le temps de lecture avance-t-il ? Lecteur nu : aucun saut, aucun changement de vitesse.
  // Sinon « Image figée… » puis reconnexion (3 essais). Si le temps recule (boucle), reconnexion aussitôt.
  setInterval(function () {
    var i, c, n = now(), t, age;
    for (i = 0; i < cards.length; i++) {
      c = cards[i]; if (!c.live || c.wait) continue;
      t = c.v.currentTime;
      if (c.ok && t < c.lastT - 0.3) { reconnect(c); continue; }
      if (t > c.lastT + 0.2) {
        c.lastT = t; c.moved = n; c.ok = true;
        if (c.state.textContent !== "EN DIRECT" && APP.bannerMsg && APP.bannerMsg.indexOf(c.name + " : ") === 0) APP.banner("", "");
        setState(c, "EN DIRECT");
        if (n - c.since > 20000) c.tries = 0;
      } else {
        age = n - c.moved;
        if (age > (c.ok ? 9000 : 15000)) { reconnect(c); continue; }
        if (age > 4000 && c.ok) setState(c, "Image figée…");
      }
    }
  }, 1000);
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopAll(); else relire(); });
  document.addEventListener("fullscreenchange", fsIcons);
  document.addEventListener("webkitfullscreenchange", fsIcons);
  APP.surVue(function (name) { visible = name === "home"; if (!visible) stopAll(); else if (loaded) relire(); else load(); }, 40);
  load();
})();
// FIN
