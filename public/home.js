// @zone accueil | Accueil : rubriques Pieces / Actions / Categories (4 au plus), une ligne de cartes chacune a defilement horizontal (fondu, fleches, position gardee) ; cartes de piece (boutons KINDS ampoule/prise via roomPower), crayon et appui long (APP.homeEdite), carte « + » (APP.homePieces), carte Scenarios (favoris en icones, tous : la carte s'elargit), cartes d'actions en plus (APP.homeActions, V1.5 : Animations, meme forme : APP.homeFavoris), categories (dont exterieures : APP.nav.vue) ; crochet de vue APP.surVue (ordre 50).
(function () {
  var $ = APP.$, el = APP.el, last = "";

  // Vue d'accueil (dernier crochet de vue, juste avant la partie de base d'app.js, qui masque aussi #viewLights et #viewScenes)
  APP.surVue(function (name) {
    var h = $("viewHome");
    if (name === "home") {
      $("viewLights").className = "view hidden";
      $("viewScenes").className = "view hidden";
      h.className = "view";
      majDefils();
      return;
    }
    h.className = "view hidden";
  }, 50);

  // Defilement horizontal des rubriques (V1.5) : chaque ligne .hline defile au doigt (defilement natif de Chrome, sans bibliotheque) ; fondu au bord (.fg, .fd)
  // et fleches de l'etiquette (.hfl) seulement s'il reste des cartes de ce cote ; position de chaque ligne gardee d'une reconstruction a l'autre (par titre).
  // Cartes de taille fixe (accueil.css) : plus de paliers ; ecran bas : cartes compactes (regle CSS). Recalcul au defilement, a chaque reconstruction, a l'affichage et au changement de taille.
  var lignes = [], positions = {};
  var CHEV_G = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
  var CHEV_D = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  function majDefil(x) {
    var l = x.line, max = l.scrollWidth - l.clientWidth, g = l.scrollLeft > 2, d = l.scrollLeft < max - 2;
    l.className = "hline" + (g ? " fg" : "") + (d ? " fd" : "");
    x.row.className = "hrow" + (max > 2 ? " hdeborde" : "");
    x.prec.disabled = !g; x.suiv.disabled = !d;
  }
  function majDefils() { var i; for (i = 0; i < lignes.length; i++) majDefil(lignes[i]); }
  if (window.ResizeObserver) new ResizeObserver(function () { majDefils(); }).observe($("homeMain"));
  else window.addEventListener("resize", majDefils);
  function fleche(sens, line) {
    var b = el("button", "hfl", "");
    b.innerHTML = sens < 0 ? CHEV_G : CHEV_D;
    b.setAttribute("aria-label", sens < 0 ? "Cartes précédentes" : "Cartes suivantes");
    b.onclick = function () { line.scrollBy({ left: sens * Math.max(160, Math.round(line.clientWidth * 0.8)), behavior: "smooth" }); };
    return b;
  }
  function nbApp(n) { return n === null ? null : (n ? n + (n > 1 ? " appareils" : " appareil") : "Aucun appareil"); }

  // sous : texte sous le nom (null : aucun)
  function card(label, sous, fn) {
    var w = el("div", "hwrap"), b = el("button", "hcard", "");
    b.appendChild(el("span", "hname", label));
    if (sous !== null) b.appendChild(el("span", "hcount", sous));
    b.title = label;
    b.onclick = fn;
    w.appendChild(b);
    return w;
  }
  function row(title, cards, emptyMsg) {
    var s = el("div", "hrow"), line = el("div", "hline"), lab = el("div", "hlabel", title), fl = el("span", "hfleches", ""), x, i;
    s.setAttribute("data-rubrique", title); // V1.6 : sur le téléphone, la rubrique Catégories est dans l'onglet Appareils (accueil.css)
    x = { titre: title, row: s, line: line, prec: fleche(-1, line), suiv: fleche(1, line) };
    fl.appendChild(x.prec); fl.appendChild(x.suiv); lab.appendChild(fl);
    s.appendChild(lab);
    if (!cards.length) line.appendChild(el("div", "hempty", emptyMsg));
    for (i = 0; i < cards.length; i++) line.appendChild(cards[i]);
    line.addEventListener("scroll", function () { positions[title] = line.scrollLeft; majDefil(x); }, { passive: true });
    s.appendChild(line);
    lignes.push(x);
    return s;
  }
  var ICON_BULB = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
  var ICON_PLUG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>';
  var KINDS = [
    { kind: "light", cls: "hlamp", icon: ICON_BULB, nom: "lumières" },
    { kind: "outlet", cls: "hplug", icon: ICON_PLUG, nom: "prises" }
  ];
  var pw = {};
  function roomDevs(key, kind) {
    var o = [], i, d;
    for (i = 0; i < APP.devices.length; i++) { d = APP.devices[i]; if (d.kind === kind && d.room && d.room.id === key && d.reachable) o.push(d); }
    return o;
  }
  function anyOn(L) { var i; for (i = 0; i < L.length; i++) if (L[i].isOn) return true; return false; }
  function updatePower() {
    var k, j, L, on, kd, b;
    for (k in pw) if (pw.hasOwnProperty(k)) {
      for (j = 0; j < KINDS.length; j++) {
        kd = KINDS[j]; b = pw[k][kd.kind];
        L = roomDevs(k, kd.kind); on = anyOn(L);
        b.className = "hpow " + kd.cls + " " + (on ? "on" : "off");
        b.setAttribute("aria-pressed", on ? "true" : "false"); // V1.6 : état lu sans la couleur (plein = ON, contour = OFF)
        b.disabled = !L.length;
        b.setAttribute("aria-label", (on ? "Tout OFF : " : "Tout ON : ") + kd.nom + " de la pièce");
      }
    }
  }
  function roomPower(key, label, kd) {
    if (APP.busy) return;
    var want = !anyOn(roomDevs(key, kd.kind));
    APP.setBusy(true);
    APP.api("POST", "/api/rooms/" + encodeURIComponent(key) + "/power", { on: want, kind: kd.kind }, function (err, r) {
      var k, names = [];
      APP.setBusy(false);
      if (err && !(r && r.failed)) { APP.banner(err, "err"); APP.refresh(); return; }
      if (r && r.devices) APP.devices = r.devices;
      if (r && r.failed && r.failed.length) {
        for (k = 0; k < r.failed.length; k++) names.push(r.failed[k].name + " (" + r.failed[k].reason + ")");
        APP.banner("Non appliqué sur : " + names.join(", "), "warn");
      } else APP.banner(label + " (" + kd.nom + ") : " + (want ? "ON." : "OFF."), "ok");
      APP.render();
    });
  }
  function mkBtn(key, label, kd) {
    var b = el("button", "hpow " + kd.cls + " off", "");
    b.innerHTML = kd.icon;
    b.onclick = function () { roomPower(key, label, kd); };
    return b;
  }
  // Carte de pièce (V1.4) : crayon en haut à droite et appui long (0,6 s) -> fenêtre « Pièces » sur cette pièce (APP.homeEdite, pieces-gestion.js) ;
  // « Autres » (sans pièce) n'est pas modifiable ; pièce sans lumière ni prise (x.onoff 0) : sans boutons de pièce.
  // Seuil de glissement (V1.5) : l'appui long est annulé dès que le doigt bouge de plus de 10 px ou que Chrome commence à faire défiler la ligne (pointercancel) ;
  // un toucher qui a fait défiler n'ouvre pas la carte (Chrome n'envoie pas de click après un défilement).
  var ICON_CRAYON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  function mkRoom(x) {
    var long = false, t = null, x0 = 0, y0 = 0;
    var w = card(x.label, nbApp(x.count), function () {
      if (long) { long = false; return; }
      APP.nav.list(x.key, null);
    }), bar, j, kd, c = w.firstChild, ed;
    c.className = "hcard hroom";
    if (x.key === "none") return w;
    if (APP.homeEdite) {
      ed = el("button", "hedit", "");
      ed.innerHTML = ICON_CRAYON; ed.title = "Modifier la pièce"; ed.setAttribute("aria-label", "Modifier " + x.label);
      ed.onclick = function () { APP.homeEdite(x.key); };
      w.appendChild(ed);
      var stop = function () { clearTimeout(t); t = null; };
      c.addEventListener("pointerdown", function (e) { long = false; stop(); x0 = e.clientX; y0 = e.clientY; t = setTimeout(function () { t = null; long = true; APP.homeEdite(x.key); }, 600); });
      c.addEventListener("pointermove", function (e) { if (t && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)) stop(); });
      c.addEventListener("pointerup", stop); c.addEventListener("pointerleave", stop); c.addEventListener("pointercancel", stop);
      c.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }
    if (!x.onoff) { w.className = "hwrap hsans"; return w; }
    bar = el("div", "hbtns", "");
    pw[x.key] = {};
    for (j = 0; j < KINDS.length; j++) { kd = KINDS[j]; pw[x.key][kd.kind] = mkBtn(x.key, x.label, kd); bar.appendChild(pw[x.key][kd.kind]); }
    w.appendChild(bar);
    return w;
  }
  var ICON_FAV = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="12 2.5 15.1 8.7 22 9.7 17 14.5 18.2 21.4 12 18.1 5.8 21.4 7 14.5 2 9.7 8.9 8.7"/></svg>';
  var sb = [];
  // Carte « Scénarios » (V1.5) : nom et nombre à gauche, un bouton-icône par favori à droite (tous : la carte s'élargit, la ligne défile) ;
  // toucher la carte ouvre l'onglet, toucher une icône applique le scénario (anneau blanc si actif).
  function favs() {
    var o = [], i, s;
    for (i = 0; i < (APP.scenes || []).length; i++) { s = APP.scenes[i]; if (s && s.fav === true) o.push(s); }
    return o;
  }
  function scnSig() {
    var f = favs(), o = [APP.scenes ? APP.scenes.length : "-"], i;
    for (i = 0; i < f.length; i++) o.push(f[i].id + ":" + (f[i].icon || "") + ":" + f[i].name);
    return o.join("|");
  }
  // Un scénario est actif quand tous ses appareils joignables sont dans l'état enregistré (mêmes tolérances que la vérification des commandes).
  function sceneActive(s) {
    var items = [], i, l, st, d;
    for (i = 0; i < s.lights.length; i++) {
      l = s.lights[i]; d = APP.find(APP.devices, l.id);
      if (!d || !d.reachable) continue;
      st = { on: l.on };
      if (l.on) {
        if (l.level !== undefined) st.level = l.level;
        if (l.mode === "color") { st.mode = "color"; st.hue = l.hue; st.sat = l.sat; }
        else if (l.mode === "temperature") { st.mode = "temperature"; st.kelvin = l.kelvin; }
      }
      items.push({ id: l.id, name: l.name, st: st });
    }
    return items.length > 0 && APP.verify(APP.devices, items).length === 0;
  }
  function updateScn() {
    var i, on;
    for (i = 0; i < sb.length; i++) {
      on = sceneActive(sb[i].s);
      sb[i].b.className = "hpow hscn " + (on ? "on" : "off");
      sb[i].b.setAttribute("aria-label", sb[i].s.name + (on ? " (actif)" : ""));
    }
  }
  // Carte à favoris (Scénarios ; V1.5 : Animations, APP.homeFavoris) : {nom, compte, ouvrir, favoris: [{icone (svg, sinon étoile), titre, clic}]} -> {w, carte, boutons}
  function carteFavoris(o) {
    var w = el("div", "hwrap"), b = el("button", "hcard hscen", ""), t = el("span", "htexte", ""), bt = [], bar, j, x, ic;
    t.appendChild(el("span", "hname", o.nom));
    t.appendChild(el("span", "hcount", o.compte || ""));
    b.appendChild(t);
    b.title = o.nom;
    b.onclick = o.ouvrir;
    w.appendChild(b);
    if (!o.favoris.length) return { w: w, carte: b, boutons: bt };
    // Place réservée aux icônes dans la carte (--n : nombre de favoris), icônes posées par-dessus (un bouton ne peut pas en contenir un autre)
    b.appendChild(el("span", "hscnplace", ""));
    b.style.setProperty("--n", o.favoris.length);
    bar = el("div", "hscnb", "");
    for (j = 0; j < o.favoris.length; j++) {
      x = o.favoris[j];
      ic = el("button", "hpow hscn off", "");
      ic.innerHTML = x.icone || ICON_FAV;
      ic.title = x.titre; ic.setAttribute("aria-label", x.titre);
      ic.onclick = x.clic;
      bar.appendChild(ic); bt.push(ic);
    }
    w.appendChild(bar);
    return { w: w, carte: b, boutons: bt };
  }
  APP.homeFavoris = carteFavoris;
  function mkScenes() {
    var n = APP.scenes ? APP.scenes.length : null, f = favs(), fav = [], j, r;
    for (j = 0; j < f.length; j++) fav.push({ icone: f[j].icon && APP.sceneIcon(f[j].icon, 20), titre: f[j].name, clic: appliquer(f[j]) });
    r = carteFavoris({ nom: "Scénarios", compte: n === null ? "" : n ? n + (n > 1 ? " scénarios" : " scénario") : "Aucun scénario", ouvrir: APP.nav.scenes, favoris: fav });
    for (j = 0; j < f.length; j++) sb.push({ b: r.boutons[j], s: f[j] });
    return r.w;
  }
  function appliquer(s) { return function () { APP.applyScene(s); }; }
  function loadFavs() {
    APP.api("GET", "/api/scenarios", null, function (err, d) {
      if (err || !d || !d.scenarios) return;
      APP.scenes = d.scenarios; last = "";
      APP.renderHome();
    });
  }
  function mkCat(x) { return card(x.label, nbApp(x.count), function () { APP.nav.list("all", x.key); }); }
  function mkExt(x) { return card(x.label, nbApp(x.count), function () { APP.nav.vue(x.key); }); }

  // Carte « + » au bout de la ligne des pièces (V1.4 ; fabrique de pieces.js : fn() -> élément .hwrap) ; APP.homeRafraichir : accueil reconstruit.
  var fabPieces = null;
  APP.homePieces = function (fab) { fabPieces = fab; last = ""; APP.renderHome(); };
  APP.homeRafraichir = function () { last = ""; APP.renderHome(); };
  // Cartes d'actions en plus dans la ligne Actions, apres « Scénarios » (V1.5 : Animations ; fabrique de animations.js : fn() -> element .hwrap)
  var fabActions = [];
  APP.homeActions = function (fab) { fabActions.push(fab); last = ""; APP.renderHome(); };

  APP.renderHome = function () {
    var box = $("homeMain");
    if (!box || (APP.view || "home") !== "home") return;
    var md = APP.nav.model(), sig = JSON.stringify(md) + "#" + scnSig(), rooms = [], cats = [], i;
    if (sig === last && box.firstChild) { updatePower(); updateScn(); return; }
    last = sig; pw = {}; sb = []; lignes = [];
    for (i = 0; i < md.rooms.length; i++) rooms.push(mkRoom(md.rooms[i]));
    if (fabPieces) rooms.push(fabPieces());
    for (i = 0; i < md.cats.length; i++) cats.push(mkCat(md.cats[i]));
    for (i = 0; i < md.ext.length; i++) cats.push(mkExt(md.ext[i]));
    box.innerHTML = "";
    box.appendChild(row("Pièces", rooms, "Aucune pièce."));
    var act = [mkScenes()];
    for (i = 0; i < fabActions.length; i++) act.push(fabActions[i]());
    box.appendChild(row("Actions", act, ""));
    box.appendChild(row("Catégories", cats, "Aucun appareil."));
    for (i = 0; i < lignes.length; i++) lignes[i].line.scrollLeft = positions[lignes[i].titre] || 0;
    updatePower();
    updateScn();
    majDefils();
  };

  loadFavs();
  APP.view = "home";
  APP.showTab("home");
  APP.render();
})();
// FIN
