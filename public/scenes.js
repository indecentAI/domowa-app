// @zone scenarios | Onglet Scenarios : liste, appliquer, renommer, supprimer, icone (ICONS = SCENE_ICONS de modules/scenarios.mjs ; APP.sceneIcons pour animations.js), favori ;
// V1.5 : un scenario n'a pas d'animation (l'animation porte tout, onglet Animations).
(function () {
  var $ = APP.$, el = APP.el;

  APP.renderScenes = function () {
    var box = $("sceneList"); box.innerHTML = "";
    if (!APP.scenes.length) { box.appendChild(el("p", "", "Aucun scénario enregistré.")); return; }
    var i;
    for (i = 0; i < APP.scenes.length; i++) box.appendChild(card(APP.scenes[i]));
  };

  APP.loadScenes = function () {
    APP.api("GET", "/api/scenarios", null, function (err, d) {
      if (err || !d) { APP.banner(err || "Réponse inattendue.", "err"); return; }
      APP.scenes = d.scenarios || [];
      APP.renderScenes();
    });
  };

  var ICON_EDIT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_TRASH = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  function card(s) {
    var c = el("div", "scard"), dots = el("div", "dots"), head = el("div", "shead"), i, l, dot;
    var nm = el("div", "sname", s.name);
    nm.title = s.name;
    var slot = el("button", "sslot" + (s.icon && iconSvg(s.icon) ? "" : " empty"), "");
    slot.innerHTML = (s.icon && iconSvg(s.icon)) ? iconSvg(s.icon) : ICON_PLUS;
    slot.title = "Choisir une icône"; slot.setAttribute("aria-label", "Choisir une icône");
    slot.onclick = function () { openPicker(s); };
    var nm = el("div", "sname", s.name);
    nm.title = s.name;
    var ed = el("button", "sicon", "");
    ed.innerHTML = ICON_EDIT;
    ed.title = "Renommer"; ed.setAttribute("aria-label", "Renommer");
    ed.onclick = function () { renameScene(s); };
    var star = el("button", "sstar" + (s.fav ? " on" : ""), "");
    star.innerHTML = ICON_STAR;
    star.title = s.fav ? "Retirer des favoris" : "Ajouter aux favoris"; star.setAttribute("aria-label", star.title);
    star.setAttribute("aria-pressed", s.fav ? "true" : "false");
    star.onclick = function () { toggleFav(s); };
    head.appendChild(slot); head.appendChild(nm); head.appendChild(ed); head.appendChild(star); c.appendChild(head);
    for (i = 0; i < s.lights.length; i++) {
      l = s.lights[i];
      dot = el("div", "dot");
      dot.style.background = APP.colorOf(l.on, l.mode, l.hue, l.sat, l.kelvin);
      dot.title = l.name;
      dots.appendChild(dot);
    }
    c.appendChild(dots);
    c.appendChild(el("div", "tsub", s.lights.length + " appareil" + (s.lights.length > 1 ? "s" : "")));
    var row = el("div", "srow");
    var a = el("button", "sapply", "Appliquer");
    var d = el("button", "sdel", "");
    d.innerHTML = ICON_TRASH;
    d.title = "Supprimer"; d.setAttribute("aria-label", "Supprimer");
    a.onclick = function () { applyScene(s); };
    d.onclick = function () { deleteScene(s); };
    row.appendChild(a); row.appendChild(d);
    c.appendChild(row);
    return c;
  }

  var SVG0 = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = [
    { k: "sun", t: "Soleil", d: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' },
    { k: "moon", t: "Lune", d: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' },
    { k: "meal", t: "Repas", d: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10"/><path d="M17 21V3c-2.5 1.5-4 4.5-4 8h4"/>' },
    { k: "tv", t: "Télévision", d: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>' },
    { k: "film", t: "Film", d: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/>' },
    { k: "book", t: "Lecture", d: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
    { k: "music", t: "Musique", d: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
    { k: "heart", t: "Cœur", d: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>' },
    { k: "sparkles", t: "Fête", d: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>' },
    { k: "bed", t: "Nuit", d: '<path d="M3 20V6M3 16h18v4M21 16v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="12" r="2"/>' },
    { k: "laptop", t: "Travail", d: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20"/>' },
    { k: "flame", t: "Ambiance", d: '<path d="M12 22c4 0 7-2.7 7-7 0-3-1.5-5-3-7-.5 2-1.8 3-3 3 0-3-1-6-4-9-1 4-4 6-4 11 0 5 3 9 7 9z"/>' },
    { k: "home", t: "Maison", d: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>' },
    { k: "door", t: "Sortie", d: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>' },
    { k: "bulb", t: "Lumière", d: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>' },
    { k: "leaf", t: "Nature", d: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 17-9 17z"/><path d="M4 21c2-6 6-9 10-11"/>' },
    { k: "coffee", t: "Café", d: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>' },
    { k: "wine", t: "Soirée", d: '<path d="M8 2h8l1 7a5 5 0 0 1-10 0z"/><path d="M12 14v8M8 22h8"/>' },
    { k: "gift", t: "Cadeau", d: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>' },
    { k: "gamepad", t: "Jeux", d: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4"/><circle cx="15" cy="13" r="1"/><circle cx="18" cy="11" r="1"/>' },
    { k: "sofa", t: "Détente", d: '<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M5 18v2M19 18v2"/>' },
    { k: "bath", t: "Bain", d: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M6 12V6a2 2 0 0 1 4 0"/><path d="M6 19l-1 2M18 19l1 2"/>' },
    { k: "sunrise", t: "Lever", d: '<path d="M12 2v8"/><path d="M4.93 10.93l1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="M19.07 10.93l-1.41 1.41"/><path d="M22 22H2"/><path d="M8 6l4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>' },
    { k: "sunset", t: "Coucher", d: '<path d="M12 10V2"/><path d="M4.93 10.93l1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="M19.07 10.93l-1.41 1.41"/><path d="M22 22H2"/><path d="M16 6l-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>' },
    { k: "phone", t: "Téléphone", d: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>' },
    { k: "power", t: "Éteindre", d: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>' },
    { k: "lock", t: "Absent", d: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' },
    { k: "bell", t: "Alerte", d: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' },
    { k: "clock", t: "Horloge", d: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    { k: "palette", t: "Couleurs", d: '<path d="M12 22a10 10 0 1 1 10-10c0 3-2 4-4 4h-2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="11" r="1"/>' },
    { k: "cloud", t: "Doux", d: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.6 12 3.5 3.5 0 0 0 6 19z"/>' },
    { k: "zap", t: "Énergie", d: '<path d="M13 2L3 14h8l-1 8 10-12h-8z"/>' },
    { k: "users", t: "Invités", d: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>' },
    { k: "dumbbell", t: "Sport", d: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>' },
    { k: "tree", t: "Jardin", d: '<path d="M12 22v-5"/><path d="M12 17c-4 0-6-2-6-5 0-2 1-3 2-4-1-1-1-2-1-3a5 5 0 0 1 10 0c0 1 0 2-1 3 1 1 2 2 2 4 0 3-2 5-6 5z"/>' },
    { k: "wind", t: "Air", d: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/>' },
    { k: "camera", t: "Photo", d: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>' },
    { k: "chef", t: "Cuisine", d: '<path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V21H6z"/><path d="M6 17h12"/>' },
    { k: "plug", t: "Prise", d: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>' }
  ];
  var ICON_STAR = '<svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="12 2.5 15.1 8.7 22 9.7 17 14.5 18.2 21.4 12 18.1 5.8 21.4 7 14.5 2 9.7 8.9 8.7"/></svg>';
  var ICON_PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  function iconSvg(k, size) {
    var i, n = size || 22;
    for (i = 0; i < ICONS.length; i++) if (ICONS[i].k === k) return SVG0.replace('width="22" height="22"', 'width="' + n + '" height="' + n + '"') + ICONS[i].d + "</svg>";
    return "";
  }
  APP.sceneIcon = iconSvg;
  APP.sceneIcons = ICONS;
  APP.applyScene = function (s) { applyScene(s); };
  function saveField(s, field, value, undo) {
    APP.api("POST", "/api/scenarios/" + s.id + "/" + field, field === "icon" ? { icon: value } : { fav: value }, function (err, r) {
      if (err) { undo(); APP.renderScenes(); APP.banner(err, "err"); return; }
      if (r && r.scenarios) { APP.scenes = r.scenarios; APP.renderScenes(); }
    });
  }
  function toggleFav(s) {
    var was = s.fav === true;
    s.fav = !was;
    APP.renderScenes();
    saveField(s, "fav", !was, function () { s.fav = was; });
  }
  function setIcon(s, k) {
    var was = s.icon;
    if (k) s.icon = k; else delete s.icon;
    APP.renderScenes();
    saveField(s, "icon", k || null, function () { if (was) s.icon = was; else delete s.icon; });
  }
  function openPicker(s) {
    var wrap = el("div", "ipick"), pan = el("div", "ipanel"), grid = el("div", "igrid"), none = el("button", "inone", "Aucune icône"), i;
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    function mk(ic) {
      var b = el("button", "iopt" + (s.icon === ic.k ? " sel" : ""), "");
      b.innerHTML = iconSvg(ic.k); b.title = ic.t; b.setAttribute("aria-label", ic.t);
      b.onclick = function () { close(); setIcon(s, ic.k); };
      return b;
    }
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
    pan.appendChild(el("div", "ititle", "Icône de « " + s.name + " »"));
    for (i = 0; i < ICONS.length; i++) grid.appendChild(mk(ICONS[i]));
    pan.appendChild(grid);
    none.onclick = function () { close(); setIcon(s, null); };
    pan.appendChild(none);
    wrap.appendChild(pan);
    document.body.appendChild(wrap);
  }

  function applyScene(s) {
    if (APP.busy) return;
    APP.setBusy(true);
    APP.api("POST", "/api/scenarios/" + s.id + "/apply", null, function (err, r) {
      APP.setBusy(false);
      if (err && !(r && r.failed)) { APP.banner(err, "err"); APP.refresh(); return; }
      if (r && r.devices) APP.devices = r.devices;
      var items = [], i, l, st;
      for (i = 0; i < s.lights.length; i++) {
        l = s.lights[i]; st = { on: l.on };
        if (l.on) {
          if (l.level !== undefined) st.level = l.level;
          if (l.mode === "color") { st.mode = "color"; st.hue = l.hue; st.sat = l.sat; }
          else if (l.mode === "temperature") { st.mode = "temperature"; st.kelvin = l.kelvin; }
        }
        items.push({ id: l.id, name: l.name, st: st });
      }
      APP.report(r, items, "Scénario « " + s.name + " » appliqué.");
      APP.render();
    });
  }

  function renameScene(s) {
    var name = window.prompt("Nouveau nom :", s.name);
    if (name === null) return;
    name = name.replace(/^\s+|\s+$/g, "");
    if (!name) { APP.banner("Le nom ne peut pas être vide.", "warn"); return; }
    APP.api("POST", "/api/scenarios/" + s.id + "/rename", { name: name }, function (err, r) {
      if (err) { APP.banner(err, "err"); return; }
      APP.scenes = r.scenarios; APP.renderScenes();
    });
  }

  function deleteScene(s) {
    if (!confirm("Supprimer le scénario « " + s.name + " » ?")) return;
    APP.api("POST", "/api/scenarios/" + s.id + "/delete", null, function (err, r) {
      if (err) { APP.banner(err, "err"); return; }
      APP.scenes = r.scenarios; APP.renderScenes();
    });
  }

  $("saveScene").onclick = function () {
    var ids = APP.selIds(), L, k;
    if (!ids.length) {
      L = APP.lights();
      for (k = 0; k < L.length; k++) if (L[k].reachable) ids.push(L[k].id);
      if (!ids.length) { APP.banner("Aucune lumière disponible.", "warn"); return; }
      if (!confirm("Aucun appareil sélectionné : enregistrer les " + ids.length + " appareils ?")) return;
    }
    var name = window.prompt("Nom du scénario :", "");
    if (name === null) return;
    name = name.replace(/^\s+|\s+$/g, "");
    if (!name) { APP.banner("Le nom ne peut pas être vide.", "warn"); return; }
    APP.api("POST", "/api/scenarios", { name: name, ids: ids }, function (err, r) {
      if (err) { APP.banner(err, "err"); return; }
      APP.scenes = r.scenarios; APP.renderScenes();
      APP.banner("Scénario « " + name + " » enregistré.", "ok");
    });
  };
})();
// FIN
