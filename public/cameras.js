// @zone cameras | Cartes camera de l'accueil (#homeCams) : lecteur, EN DIRECT, reconnexion 3 essais, son, volume, plein ecran, pave PTZ, SD/HD, bouton +.
// V1.7 : etat de joignabilite (GET /api/cameras, etat et motif) relu toutes les 30 s tant que l'accueil est affiche ; hors ligne : « Hors ligne », motif, lecture inactive ; cartes mises a jour sans reconstruction (un flux en cours n'est pas coupe).
// V1.9 : flux partage entre les appareils (adapters/cameras/diffusion.mjs) : chaque carte a son identifiant de lecteur (v) ; le bouton SD/HD envoie choix=1 (relance le flux pour tous) ;
// le bouton affiche la qualite reellement servie (diffusion.qualite de GET /api/cameras, relue des que l'image arrive puis toutes les 30 s), qui peut etre celle choisie par un autre appareil.
// Etape cam-fleches : fleches d'orientation masquees au demarrage du flux, bouton rond central « Revenir au centre » (move {dir: centre}), toucher bref = pas fixe (PAS_MS).
// Etape cam-vignette : quitter l'accueil pendant un flux ne l'arrete plus : la carte qui joue passe en vignette flottante (#camFlot, hors des vues) par-dessus les autres ecrans
// (nom, etat, image, bouton « Plein ecran » et croix « Fermer » = arret du flux, comme le mini-lecteur de YouTube ; en plein ecran, toutes les commandes de la carte) ; retour a l'accueil : elle reprend sa place dans la colonne, sans coupure (deplacement du noeud dans la meme tache).
// Etape cam-mse : lecture par MediaSource (cameras-direct.js, APP.camDirect) pour rester pres du direct (rattrapage doux, saut rare sur une image cle) ;
// repli sur la lecture directe de l'adresse (lecteur nu) si MediaSource manque ou si le format est refuse, garde pour cette carte et cette qualite jusqu'au rechargement.
// Attribut data-lecture de la balise video : direct | nu (essais, diagnostic).
// Etape cam-vignette-libre : vignette au-dessus de tous les ecrans de l'application (fenetres comprises), deplacable au doigt ou a la souris (glisser hors des boutons),
// position gardee sur cet appareil (localStorage cam-flot-pos : fractions de la place libre, suivies a la rotation) ; bouton « Mettre en vignette » (.cvigb) sur la carte qui joue :
// la carte quitte la colonne et y reste hors (c.force) meme a l'accueil, jusqu'a la croix « Fermer » ; « EN DIRECT » masque en vignette (le nom prime ; les autres etats restent).
// Etape apk-pip : dans l'APK, camera en direct annoncee a l'application (image dans l'image d'Android 8 et plus) ; en image dans l'image, la video seule (APP.camPip).
// Etape cam-vignette-retour : a l'accueil, vignette tenue et doigt (ou souris) immobile au-dessus de la colonne des cameras SURVOL_MS : colonne en surbrillance (.hcams.ccible) ;
// lachee alors, chaque carte en vignette retourne a sa place dans la colonne sans arret du flux (position gardee inchangee) ; doigt sorti de la colonne : surbrillance retiree.
(function () {
  var $ = APP.$, el = APP.el, box = $("homeCams"), cards = [], loaded = false, loading = false, visible = true, flot = null; // visible : accueil affiche (premier ecran ; home.js l affiche avant ce script)
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
  function lecteur() { var t = "", i; for (i = 0; i < 12; i++) t += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36)); return t; } // identifiant du lecteur d'une carte (aucun secret)
  // En-tête : l'état s'affiche dans c.stxt ; le point rouge (c.dot) précède « EN DIRECT ».
  function setState(c, t) {
    if (c.stxt.textContent !== t) c.stxt.textContent = t;
    c.dot.className = t === "EN DIRECT" ? "cdot" : "cdot hidden";
    c.state.classList.toggle("cdirect", t === "EN DIRECT"); // masque en vignette (cameras.css)
    annoncer();
  }
  // Etape apk-pip (APK seulement : APP.apk.video, sans effet dans un navigateur) : camera en direct annoncee a l'application, avec les dimensions de son image
  // (rapport de la fenetre d'image dans l'image) ; vignette d'abord, sinon la premiere qui joue. Envoye seulement quand cela change (apk.js).
  function enDirect() {
    var i, c, j = null;
    for (i = 0; i < cards.length; i++) { c = cards[i]; if (c.live && c.ok && (!j || (c.flot && !j.flot))) j = c; }
    return j;
  }
  function annoncer() {
    var j;
    if (!APP.apk || !APP.apk.present) return;
    j = enDirect();
    APP.apk.video(j ? { joue: true, l: j.v.videoWidth || null, h: j.v.videoHeight || null } : { joue: false });
  }
  // Image dans l'image de l'APK ({evt: pip, actif} de l'application, apk.js) : la video seule de la camera en direct couvre la fenetre (html.cam-pip, carte .cpip, cameras.css) ;
  // rien d'autre ne change (la carte garde sa place, sa vignette, sa lecture) ; sortie : classes retirees.
  APP.camPip = function (actif) {
    var i, j;
    for (i = 0; i < cards.length; i++) cards[i].root.classList.remove("cpip");
    j = actif ? enDirect() : null;
    if (j) j.root.classList.add("cpip");
    document.documentElement.classList.toggle("cam-pip", !!j);
  };
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function fsExit() { var f = document.exitFullscreen || document.webkitExitFullscreen, p; if (f) { p = f.call(document); if (p && p.catch) p.catch(function () {}); } }
  function fsIcons() {
    var i, on;
    for (i = 0; i < cards.length; i++) {
      on = fsEl() === cards[i].root;
      cards[i].fs.innerHTML = on ? ICON_FS_OFF : ICON_FS_ON;
      cards[i].fs.setAttribute("aria-label", on ? "Quitter le plein écran" : "Plein écran");
      cards[i].plein.innerHTML = cards[i].fs.innerHTML; // bouton de la vignette (etape cam-vignette-plein)
      cards[i].plein.setAttribute("aria-label", (on ? "Quitter le plein \u00e9cran : " : "Plein \u00e9cran : ") + cards[i].name);
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
  function servie(c) { return c.live && c.servie ? c.servie : c.q; } // qualite affichee : celle du flux en cours si connue
  function qLabel(c) {
    var hd = servie(c) === "hd";
    c.qb.className = "cbtn cq" + (hd ? " on" : "");
    c.qb.textContent = hd ? "HD" : "SD";
    c.qb.setAttribute("aria-label", hd ? "Qualité haute définition" : "Qualité standard");
  }
  // Mouvement : appui = la caméra tourne, relâchement = arrêt. L'arrêt part après la fin de la commande de mouvement (ordre garanti).
  // Étape cam-fleches : un toucher bref fait un pas fixe (la caméra tourne au moins PAS_MS après l'accord de la commande, environ 5 fois le pas d'avant) ; appui tenu plus longtemps : arrêt au relâchement, comme avant.
  // Arrêt immédiat (vite) : flux arrêté, flèches masquées, retour au centre.
  var PAS_MS = 800;
  function sendMove(c, dir, cb) { APP.api("POST", "/api/cameras/" + encodeURIComponent(c.id) + "/move", { dir: dir }, cb); }
  function finMouvement(c) {
    if (c.pasTimer) { clearTimeout(c.pasTimer); c.pasTimer = null; }
    c.dir = null; c.wantStop = false; c.vite = false;
    sendMove(c, "stop", function () {});
  }
  function arreterApres(c) { // relâché, commande acceptée : arrêt à la fin du pas
    var reste = c.vite ? 0 : c.pasFin - now();
    if (reste <= 0) { finMouvement(c); return; }
    if (!c.pasTimer) c.pasTimer = setTimeout(function () { c.pasTimer = null; if (c.dir) finMouvement(c); }, reste);
  }
  function pressArrow(c, dir) {
    if (c.dir) return;
    c.dir = dir; c.inflight = true; c.wantStop = false; c.vite = false; c.pasFin = 0;
    sendMove(c, dir, function (err) {
      c.inflight = false; c.pasFin = now() + PAS_MS;
      if (err) { APP.banner(c.name + " : " + err, "warn"); finMouvement(c); return; }
      if (c.wantStop) arreterApres(c);
    });
  }
  function releaseArrow(c, dir, vite) {
    if (c.dir !== dir) return;
    c.wantStop = true; if (vite) c.vite = true;
    if (!c.inflight) arreterApres(c);
  }
  function centrer(c) {
    if (c.centreEnCours) return;
    if (c.dir) releaseArrow(c, c.dir, true);
    c.centreEnCours = true;
    sendMove(c, "centre", function (err) { c.centreEnCours = false; if (err) APP.banner(c.name + " : " + err, "warn"); });
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
  function boutonCentre(c) {
    var b = el("button", "carr ccentre", "");
    b.innerHTML = SV + '<circle cx="12" cy="12" r="3.5" fill="currentColor"/><circle cx="12" cy="12" r="8"/></svg>';
    b.setAttribute("aria-label", "Revenir au centre");
    b.onclick = function () { centrer(c); };
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
  // Vignette flottante (etape cam-vignette) : conteneur #camFlot cree au premier besoin, ajoute au body (hors des vues masquees) ;
  // la carte est deplacee d'un bloc (appendChild : meme tache, la lecture ne s'interrompt pas), une place vide garde son rang dans la colonne.
  function conteneur() {
    if (!flot) { flot = el("div", "cflot", ""); flot.id = "camFlot"; flot.setAttribute("role", "region"); flot.setAttribute("aria-label", "Cam\u00e9ra en cours"); document.body.appendChild(flot); glisser(flot); }
    return flot;
  }
  // Position de la vignette (etape cam-vignette-libre) : sans position gardee, coin bas droit de cameras.css ; sinon left / top dans l'ecran, BORD px du bord au moins.
  var POS_CLE = "cam-flot-pos", SEUIL_GLISSE = 8, BORD = 8;
  function borne(v) { return Math.min(1, Math.max(0, v)); }
  function lirePos() {
    try { var p = JSON.parse(localStorage.getItem(POS_CLE) || "null"); return p && isFinite(p.x) && isFinite(p.y) ? { x: borne(p.x), y: borne(p.y) } : null; } catch (e) { return null; }
  }
  function libre(r) { return { x: Math.max(0, innerWidth - r.width - 2 * BORD), y: Math.max(0, innerHeight - r.height - 2 * BORD) }; }
  function poser(l, t) { flot.style.left = l + "px"; flot.style.top = t + "px"; flot.style.right = "auto"; flot.style.bottom = "auto"; }
  function placer() {
    var p, r, lb;
    if (!flot || !flot.firstChild) return;
    p = lirePos();
    if (!p) { flot.style.left = flot.style.top = flot.style.right = flot.style.bottom = ""; return; }
    r = flot.getBoundingClientRect(); lb = libre(r);
    poser(BORD + p.x * lb.x, BORD + p.y * lb.y);
  }
  // Retour dans la colonne (etape cam-vignette-retour) : cible = colonne visible a l'accueil (ni masquee, ni mode Organiser), testee sur la position du doigt
  // (la vignette la recouvre : pas d'elementFromPoint) ; surbrillance apres SURVOL_MS au-dessus d'elle.
  var SURVOL_MS = 600;
  function dansColonne(x, y) {
    var r, vh = $("viewHome");
    if (!visible || box.classList.contains("hidden") || (vh && (vh.classList.contains("horg") || vh.classList.contains("hcam-masq")))) return false;
    r = box.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && x >= Math.max(0, r.left) && x <= Math.min(innerWidth, r.right) && y >= Math.max(0, r.top) && y <= Math.min(innerHeight, r.bottom);
  }
  function cible(d, oui) {
    if (!oui) { if (d.survol) { clearTimeout(d.survol); d.survol = null; } if (d.cible) { d.cible = false; box.classList.remove("ccible"); flot.classList.remove("cflot-cible"); } return; }
    if (d.cible || d.survol) return;
    d.survol = setTimeout(function () { d.survol = null; d.cible = true; box.classList.add("ccible"); flot.classList.add("cflot-cible"); }, SURVOL_MS);
  }
  // Glisser (pointer events, sans bibliothèque) : hors des boutons et du curseur, jamais en plein ecran ; au-dela de SEUIL_GLISSE px, la vignette suit le doigt (capture gardee)
  function glisser(f) {
    var d = null;
    f.addEventListener("pointerdown", function (e) {
      var r;
      if (fsEl() || e.button > 0 || (e.target.closest && e.target.closest("button,input"))) return;
      r = f.getBoundingClientRect();
      d = { id: e.pointerId, x0: e.clientX, y0: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height, bouge: false };
    });
    f.addEventListener("pointermove", function (e) {
      var dx, dy;
      if (!d || e.pointerId !== d.id) return;
      dx = e.clientX - d.x0; dy = e.clientY - d.y0;
      if (!d.bouge) {
        if (Math.abs(dx) < SEUIL_GLISSE && Math.abs(dy) < SEUIL_GLISSE) return;
        d.bouge = true; f.classList.add("cflot-glisse");
        try { f.setPointerCapture(d.id); } catch (x) {}
      }
      poser(Math.min(Math.max(BORD, d.l + dx), Math.max(BORD, innerWidth - d.w - BORD)), Math.min(Math.max(BORD, d.t + dy), Math.max(BORD, innerHeight - d.h - BORD)));
      cible(d, dansColonne(e.clientX, e.clientY));
      e.preventDefault();
    });
    function fin(e) {
      var r, lb, i, retour;
      if (!d || e.pointerId !== d.id) return;
      retour = d.cible && e.type === "pointerup";
      cible(d, false);
      if (retour) { // lachee sur la colonne : retour a sa place, lecture continue ; position gardee inchangee (prochaine vignette au meme endroit)
        f.classList.remove("cflot-glisse");
        for (i = 0; i < cards.length; i++) if (cards[i].flot) rentrer(cards[i]);
      } else if (d.bouge) {
        r = f.getBoundingClientRect(); lb = libre(r);
        try { localStorage.setItem(POS_CLE, JSON.stringify({ x: lb.x ? borne((r.left - BORD) / lb.x) : 0, y: lb.y ? borne((r.top - BORD) / lb.y) : 0 })); } catch (x) {}
        f.classList.remove("cflot-glisse");
      }
      d = null;
    }
    f.addEventListener("pointerup", fin);
    f.addEventListener("pointercancel", fin);
  }
  window.addEventListener("resize", placer);
  function flotter(c) {
    if (c.flot || !c.root.parentNode) return;
    if (c.dir) releaseArrow(c, c.dir, true);
    c.place = el("div", "cplace hidden", "");
    c.root.parentNode.insertBefore(c.place, c.root);
    conteneur().appendChild(c.root);
    c.flot = true; c.root.classList.add("cvign");
    placer();
  }
  function rentrer(c) {
    if (!c.flot) return;
    c.flot = false; c.force = false; c.root.classList.remove("cvign");
    if (c.place && c.place.parentNode) c.place.parentNode.replaceChild(c.root, c.place);
    else if (c.root.parentNode) c.root.parentNode.removeChild(c.root); // colonne reconstruite entre-temps : carte retiree
    c.place = null;
  }
  // Coupe la lecture en cours (lecteur MediaSource compris) et vide la balise.
  function couper(c) {
    if (c.direct) { c.direct.arreter(); c.direct = null; }
    c.v.playbackRate = 1; c.v.removeAttribute("src"); c.v.load();
  }
  function stop(c, msg) {
    rentrer(c);
    c.live = false; c.wait = false; c.servie = null; qLabel(c);
    if (c.dir) releaseArrow(c, c.dir, true);
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    c.v.pause(); couper(c);
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
    c.root.classList.toggle("chors", c.hl); // classList : la classe cvign d'une vignette est gardee (relecture repondue apres la sortie de l'accueil)
    if (c.live && c.ok) { c.servie = cam.diffusion && (cam.diffusion.qualite === "hd" || cam.diffusion.qualite === "sd") ? cam.diffusion.qualite : null; qLabel(c); }
    if (!c.live) show(c, false);
    repos(c);
  }
  function stopAll() { var i; for (i = 0; i < cards.length; i++) if (cards[i].live) stop(cards[i], ""); }
  // Ouvre (ou rouvre) la connexion au flux ; le serveur remplace l'ancienne connexion de ce lecteur (v) ; choix : qualite choisie (relance le flux pour tous).
  function adresse(c, choix) { return "/api/cameras/" + encodeURIComponent(c.id) + "/stream?t=" + now() + "&v=" + c.vid + (c.hd && c.q === "hd" ? "&q=hd" : "") + (choix ? "&choix=1" : ""); }
  function jouer(c) {
    var p = c.v.play();
    if (p && p.catch) p.catch(function (e) {
      if (!c.live || !e || e.name !== "NotAllowedError") return;
      c.v.muted = true; soundLabel(c);
      var q = c.v.play(); if (q && q.catch) q.catch(function () { if (c.live) stop(c, "Lecture refusée par Chrome."); });
    });
  }
  function open(c, msg, choix) {
    var cle = c.hd && c.q === "hd" ? "hd" : "sd", d;
    c.wait = false; c.ok = false; c.lastT = 0; c.moved = now(); c.since = c.moved;
    setState(c, msg);
    couper(c);
    if (!c.nu[cle] && APP.camDirect && APP.camDirect.dispo()) {
      c.v.setAttribute("data-lecture", "direct");
      d = c.direct = APP.camDirect.lecteur(c.v, adresse(c, choix), {
        panne: function () { if (c.direct === d) reconnect(c); },
        repli: function () { // format non lisible par MediaSource : lecture directe de l'adresse (meme lecteur v : le serveur remplace la demande)
          if (c.direct !== d || !c.live) return;
          c.direct = null; c.nu[cle] = true;
          c.v.setAttribute("data-lecture", "nu"); c.v.removeAttribute("src"); c.v.load();
          c.v.src = adresse(c, choix); jouer(c);
        }
      });
    } else { c.v.setAttribute("data-lecture", "nu"); c.v.src = adresse(c, choix); }
    jouer(c);
  }
  function reconnect(c) {
    if (!c.live || c.wait) return;
    if (c.tries >= MAX_ESSAIS && c.q === "hd") {
      c.q = "sd"; c.servie = null; c.tries = 0; qLabel(c);
      APP.banner(c.name + " : haute définition indisponible, retour en qualité standard.", "warn");
      open(c, "Connexion…", true);
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
    c.padOn = false; ptzLabel(c); // fleches masquees a chaque demarrage du flux
    soundLabel(c); show(c, true);
    open(c, "Connexion…");
  }
  function build(cam) {
    var c = { flot: false, force: false, place: null, id: cam.id, name: cam.name, ptz: cam.ptz !== false, dir: null, inflight: false, wantStop: false, vite: false, pasFin: 0, pasTimer: null, centreEnCours: false, hd: !!cam.hd, q: cam.hd ? loadQ(cam.id) : "sd", live: false, wait: false, tries: 0, ok: false, lastT: 0, moved: 0, since: 0, timer: null, servie: null, vid: lecteur(), direct: null, nu: { sd: false, hd: false } }, head, view, pad, i;
    c.padOn = false; // étape cam-fleches : flèches masquées au démarrage du flux (bouton d'orientation pour les afficher)
    c.root = el("div", "ccard");
    head = el("div", "chead"); head.appendChild(el("span", "cname", cam.name));
    c.state = el("span", "cstate", ""); c.dot = el("span", "cdot hidden", ""); c.stxt = el("span", "", "");
    c.state.appendChild(c.dot); c.state.appendChild(c.stxt); head.appendChild(c.state);
    c.vigb = el("button", "cvigb", ""); // etape cam-vignette-libre : mettre en vignette depuis l'accueil (carte qui joue, dans la colonne : cameras.css)
    c.vigb.innerHTML = SV + '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="6" height="4" rx="1" fill="currentColor"/></svg>';
    c.vigb.setAttribute("aria-label", "Mettre en vignette : " + cam.name);
    c.vigb.onclick = function () { if (!c.live) return; c.force = true; flotter(c); };
    head.appendChild(c.vigb);
    c.plein = el("button", "cplein", ""); // plein ecran depuis la vignette (visible en vignette seulement, cameras.css)
    c.plein.innerHTML = ICON_FS_ON; c.plein.setAttribute("aria-label", "Plein \u00e9cran : " + cam.name);
    c.plein.onclick = function () { toggleFs(c); };
    head.appendChild(c.plein);
    c.ferme = el("button", "cfermer", ""); // croix de la vignette flottante (visible en vignette seulement, cameras.css) : arret du flux
    c.ferme.innerHTML = SV + '<path d="M6 6l12 12M18 6L6 18"/></svg>';
    c.ferme.setAttribute("aria-label", "Fermer : " + cam.name);
    c.ferme.onclick = function () { stop(c, ""); };
    head.appendChild(c.ferme);
    c.motif = el("div", "cmotif hidden", ""); c.hl = false; c.motifTxt = "";
    view = el("div", "cview"); c.view = view;
    c.v = el("video", "cvideo"); c.v.setAttribute("playsinline", "");
    c.v.onwaiting = function () { if (c.live && !c.wait && c.ok) setState(c, "Chargement…"); };
    c.v.onerror = function () { reconnect(c); };
    c.v.onended = function () { reconnect(c); };
    view.appendChild(c.v);
    c.pad = el("div", "cpadbox hidden"); pad = el("div", "cpad");
    for (i = 0; i < ARROWS.length; i++) pad.appendChild(arrow(c, ARROWS[i]));
    pad.appendChild(boutonCentre(c));
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
 if (!c.padOn && c.dir) releaseArrow(c, c.dir, true);
 ptzLabel(c); show(c, c.live);
 };
 c.fs = el("button", "cbtn", ""); c.fs.onclick = function () { toggleFs(c); };
    c.qb = el("button", "cbtn cq", "SD");
    c.qb.onclick = function () {
      c.q = servie(c) === "hd" ? "sd" : "hd"; c.servie = null; saveQ(c.id, c.q); qLabel(c);
      if (c.live) { c.tries = 0; if (c.timer) { clearTimeout(c.timer); c.timer = null; } open(c, "Connexion…", true); }
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
  function relire(maintenant) {
    if (!loaded || (loading && !maintenant) || !visible || document.hidden) return;
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
  // Une fois par seconde, pour chaque flux : le temps de lecture avance-t-il ? (Rattrapage du direct : cameras-direct.js ; le lecteur nu ne saute jamais.)
  // Sinon « Image figée… » puis reconnexion (3 essais). Si le temps recule (boucle), reconnexion aussitôt.
  setInterval(function () {
    var i, c, n = now(), t, age;
    for (i = 0; i < cards.length; i++) {
      c = cards[i]; if (!c.live || c.wait) continue;
      t = c.v.currentTime;
      if (c.ok && t < c.lastT - 0.3) { reconnect(c); continue; }
      if (t > c.lastT + 0.2) {
        if (!c.ok) { c.ok = true; relire(true); } // image arrivee : qualite reellement servie relue (flux deja regarde par un autre appareil)
        c.lastT = t; c.moved = n;
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
  // Etape cam-vignette : hors de l'accueil, les flux en cours passent en vignette (plus d'arret) ; retour a l'accueil : remis dans la colonne
  APP.surVue(function (name) {
    var i;
    visible = name === "home";
    for (i = 0; i < cards.length; i++) { if (!visible && cards[i].live) flotter(cards[i]); else if (visible && !cards[i].force) rentrer(cards[i]); } // mise en vignette demandee : gardee a l'accueil
    if (!visible) return;
    if (loaded) relire(); else load();
  }, 40);
  load();
})();
// FIN
