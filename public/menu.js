// @zone socle | Menu lateral et navigation : navModel (pieces, dont celles sans appareil ON/OFF, categories, categories exterieures), APP.nav {model, home, list, scenes, vue, categorie, action, piecesEnPlus, outilsPieces}, rendu du menu (puis APP.renderHome), boutons Menu, Accueil, Tout OFF.
(function () {
  var $ = APP.$, el = APP.el, roomKey = APP.roomKey;
  function openMenu() { $("menu").className = "menu open"; $("scrim").className = "scrim open"; }
  function closeMenu() { $("menu").className = "menu"; $("scrim").className = "scrim"; }

  var KIND_NAMES = { light: "Lumières", outlet: "Prises" };
  var KIND_ORDER = ["light", "outlet"];
  // Categories exterieures (vue pleine page propre, ex. electromenager.js) : APP.nav.categorie({key, label, count}) ; count() -> undefined (masquee),
  // null (affichee sans nombre) ou nombre. Ouverture : APP.nav.vue(key) -> APP.view = key et APP.showTab(key) (le fichier de la vue y ajoute son crochet : APP.surVue(fn, ordre) d'app.js).
  var externes = [];
  function extCats() {
    var o = [], i, n;
    for (i = 0; i < externes.length; i++) { n = externes[i].count(); if (n !== undefined) o.push({ key: externes[i].key, label: externes[i].label, count: n }); }
    return o;
  }

  // Pièces connues hors des appareils ON/OFF (V1.4, pieces-liste.js) : APP.nav.piecesEnPlus(fn) ; fn() -> [{key, label, independants}] :
  // pièces sans lumière ni prise ajoutées (triées par nom), appareils indépendants ajoutés au compteur. Outils du volet Pièces : APP.nav.outilsPieces(fabrique).
  var enPlus = null, outils = null;
  // Actions a vue propre (V1.5 : Animations, animations.js) : APP.nav.action({key, label}) -> entree sous « Scénarios » ; ouverture par APP.nav.vue(key).
  var actions = [];
  function navModel() {
    var rooms = [], seen = {}, rc = {}, kc = {}, hasNone = false, cats = [], order, i, d, k, key, extra, ajout = [];
    for (i = 0; i < APP.devices.length; i++) {
      d = APP.devices[i];
      k = roomKey(d);
      rc[k] = (rc[k] || 0) + 1;
      kc[d.kind] = (kc[d.kind] || 0) + 1;
      if (d.room) {
        if (!seen[d.room.id]) { seen[d.room.id] = 1; rooms.push({ key: d.room.id, label: d.room.name, count: 0 }); }
      } else hasNone = true;
    }
    for (i = 0; i < rooms.length; i++) { rooms[i].count = rc[rooms[i].key]; rooms[i].onoff = rc[rooms[i].key]; }
    extra = enPlus ? enPlus() || [] : [];
    var autresInd = 0;
    for (i = 0; i < extra.length; i++) {
      if (extra[i] && extra[i].key === "none") { autresInd = extra[i].independants || 0; continue; }
      if (!extra[i] || !extra[i].key || !extra[i].label) continue;
      if (seen[extra[i].key]) { for (k = 0; k < rooms.length; k++) if (rooms[k].key === extra[i].key) rooms[k].count += extra[i].independants || 0; }
      else { seen[extra[i].key] = 1; ajout.push({ key: extra[i].key, label: extra[i].label, count: extra[i].independants || 0, onoff: 0 }); }
    }
    ajout.sort(function (a, b) { return a.label.localeCompare(b.label); });
    rooms = rooms.concat(ajout);
    // « Autres » (V1.4) : pièce par défaut, en dernier : appareils ON/OFF sans pièce et appareils indépendants non rangés (pieces-liste.js : clé none)
    if (hasNone || autresInd) rooms.push({ key: "none", label: "Autres", count: (rc.none || 0) + autresInd, onoff: rc.none || 0 });
    order = KIND_ORDER.slice();
    for (key in kc) if (kc.hasOwnProperty(key) && order.indexOf(key) < 0) order.push(key);
    for (i = 0; i < order.length; i++) {
      if (kc[order[i]]) cats.push({ key: order[i], label: KIND_NAMES[order[i]] || order[i], count: kc[order[i]] });
    }
    // Total « Tous les appareils » : appareils ON/OFF + nombre de chaque categorie exterieure (ex. appareils SmartThings).
    var ext = extCats(), total = APP.devices.length;
    for (i = 0; i < ext.length; i++) if (typeof ext[i].count === "number") total += ext[i].count;
    return { total: total, rooms: rooms, cats: cats, ext: ext };
  }

  function leave() { if (APP.organize) APP.banner("", ""); APP.organize = false; }
  function goHome() { leave(); APP.room = "all"; APP.cat = null; APP.view = "home"; APP.showTab("home"); APP.render(); }
  function goList(room, cat) { leave(); APP.room = room; APP.cat = cat; APP.view = "lights"; APP.showTab("lights"); APP.render(); }
  function goScenes() { leave(); APP.view = "scenes"; APP.showTab("scenes"); APP.render(); }
  function goView(key) { leave(); APP.view = key; APP.showTab(key); APP.render(); }
  APP.nav = { model: navModel, home: goHome, list: goList, scenes: goScenes, vue: goView, categorie: function (c) { externes.push(c); },
    piecesEnPlus: function (fn) { enPlus = fn; }, outilsPieces: function (fab) { outils = fab; }, action: function (a) { actions.push(a); } };

  function renderMenu() {
    var m = $("menu");
    if (!m) return;
    m.innerHTML = "";
    var md = navModel(), view = APP.view || "home", lists = (view === "lights"), here = "Accueil", i;
    function item(text, count, active, fn) {
      var b = el("button", "mitem" + (active ? " sel" : ""), "");
      b.appendChild(el("span", "", text));
      if (count !== null) b.appendChild(el("span", "mcount", String(count)));
      b.onclick = function () { closeMenu(); fn(); };
      m.appendChild(b);
      if (active) here = text;
    }
    function section(t) { m.appendChild(el("div", "mlabel", t)); }
    function roomItem(x) { item(x.label, x.count, lists && !APP.cat && APP.room === x.key, function () { goList(x.key, null); }); }
    function catItem(x) { item(x.label, x.count, lists && APP.room === "all" && APP.cat === x.key, function () { goList("all", x.key); }); }
    function extItem(x) { item(x.label, x.count, view === x.key, function () { goView(x.key); }); }

    item("Accueil", null, view === "home", goHome);
    item("Tous les appareils", md.total, lists && APP.room === "all" && !APP.cat, function () { goList("all", null); });
    if (md.rooms.length || outils) section("Pièces");
    for (i = 0; i < md.rooms.length; i++) roomItem(md.rooms[i]);
    if (outils) m.appendChild(outils(closeMenu));
    section("Actions");
    item("Scénarios", null, view === "scenes", goScenes);
    for (i = 0; i < actions.length; i++) (function (a) { item(a.label, null, view === a.key, function () { goView(a.key); }); })(actions[i]);
    if (md.cats.length || md.ext.length) section("Catégories");
    for (i = 0; i < md.cats.length; i++) catItem(md.cats[i]);
    for (i = 0; i < md.ext.length; i++) extItem(md.ext[i]);
    if ($("where")) $("where").textContent = here;
    if (APP.renderHome) APP.renderHome();
  }

  $("menuBtn").onclick = openMenu;
  $("scrim").onclick = closeMenu;
  $("homeBtn").onclick = function () { closeMenu(); goHome(); };

  $("alloff").onclick = function () {
    if (APP.busy) return;
    var n = 0, i;
    for (i = 0; i < APP.devices.length; i++) if (APP.devices[i].isOn === true) n++;
    if (!n) { APP.banner("Tout est déjà OFF.", "ok"); return; }
    if (!confirm("Passer en OFF tous les appareils ON (" + n + ") ? La prise est incluse.")) return;
    APP.setBusy(true);
    APP.api("POST", "/api/actions/all-off", { confirm: true }, function (err, r) {
      APP.setBusy(false);
      if (r && r.devices) APP.devices = r.devices;
      if (err && !(r && r.failed)) APP.banner(err, "err");
      else if (r && r.failed && r.failed.length) {
        var names = [], k;
        for (k = 0; k < r.failed.length; k++) names.push(r.failed[k].name + " (" + r.failed[k].reason + ")");
        APP.banner("OFF incomplet : " + names.join(", "), "warn");
      } else APP.banner("Tout est OFF.", "ok");
      APP.render();
    });
  };

  APP.onRender(renderMenu, 20);
})();
// FIN
