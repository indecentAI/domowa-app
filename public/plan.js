// @zone plan | Vue Lumieres, colonne gauche : puces de pieces, bulles (tile), plan par piece (layout, glisser en mode Organiser), selection (Tout selectionner, Aucune, compteur).
(function () {
  var $ = APP.$, el = APP.el, roomKey = APP.roomKey;
  function visible() {
    var o = [], i, d;
    for (i = 0; i < APP.devices.length; i++) { d = APP.devices[i]; if ((APP.room === "all" || roomKey(d) === APP.room) && (!APP.cat || d.kind === APP.cat)) o.push(d); }
    return o;
  }

  function renderRooms() {
    var box = $("rooms"); box.replaceChildren();
    // Pieces du modele de navigation (menu.js) : celles des appareils ON/OFF et, depuis la V1.4, celles sans lumiere ni prise (pieces-liste.js)
    var md = APP.nav ? APP.nav.model().rooms : [], rooms = [], hasNone = false, i, valid = { all: 1 };
    for (i = 0; i < md.length; i++) { valid[md[i].key] = 1; if (md[i].key === "none") hasNone = true; else rooms.push({ id: md[i].key, name: md[i].label }); }
    if (!valid[APP.room]) APP.room = "all";
    function chip(key, label) {
      var b = el("button", "chip" + (key === APP.room ? " sel" : ""), label);
      b.onclick = function () { APP.room = key; APP.render(); };
      box.appendChild(b);
    }
    chip("all", "Toutes");
    for (i = 0; i < rooms.length; i++) chip(rooms[i].id, rooms[i].name);
    if (hasNone) chip("none", "Autres");
  }

   function tile(d) {
    var isLight = d.kind === "light";
    var on = d.isOn === true;
    var col = !on ? "var(--lampe-off)" : (isLight ? APP.colorOf(true, d.colorMode, d.hue, d.sat, d.temp) : APP.colorOf(true, "temperature", null, null, 2700));
    var lvl = (isLight && d.level !== null) ? d.level : 100;
    var w = el("div", "bub" + (on ? " on" : "") + (APP.sel[d.id] ? " sel" : "") + (d.reachable ? "" : " unreach"));
    w.appendChild(el("div", "bname", d.name));
    // V1.6 : la bulle est un vrai bouton (focus au clavier, nom et état lus : aria-label, aria-pressed = sélectionnée)
    var b = el("button", "bubble");
    b.type = "button";
    b.setAttribute("aria-label", d.name + " : " + (d.reachable ? (on ? "ON" : "OFF") : "injoignable"));
    b.setAttribute("aria-pressed", APP.sel[d.id] ? "true" : "false");
    if (!d.reachable) b.disabled = true;
    b.style.setProperty("--c", col);
    b.style.setProperty("--o", on ? (0.15 + 0.85 * lvl / 100).toFixed(2) : "0.22");
    b.style.setProperty("--g", on ? Math.round(22 * lvl / 100) + "px" : "0px");
    b.appendChild(el("div", "bfill"));
    b.appendChild(el("div", "bgloss"));
    // V1.4 : type dessiné dans la bulle (lumière, prise) ; vues à plat (Tous, catégories) : pièce sous la bulle (« Autres » par défaut)
    if (APP.piecesChoix) { var k = el("div", "bkind"); k.innerHTML = (APP.icones && APP.icones.element(d.id, 20)) || APP.piecesChoix.type(isLight ? "lumiere" : "prise"); b.appendChild(k); } // V2.1 : icône choisie dans la vue Équipements
    w.appendChild(b);
    if (APP.room === "all") w.appendChild(el("div", "bpiece", d.room ? d.room.name : "Autres"));
    if (d.reachable) b.onclick = function () { APP.sel[d.id] = !APP.sel[d.id]; APP.render(); };
    return w;
  }

  APP.layout = {};
  APP.organize = false;

  function loadLayout() {
    APP.api("GET", "/api/layout", null, function (err, d) {
      if (!err && d && d.layout) { APP.layout = d.layout; APP.render(); }
    });
  }
  // Place par défaut d'une bulle (aucune position enregistrée) : 5 colonnes comme avant sur un plan large ; plan étroit (V1.6) : moins de colonnes
  // (96 px au moins chacune) pour que les noms ne se chevauchent pas. Une position enregistrée (mode Organiser) n'est jamais déplacée.
  var colonnes = 5;
  function autoPos(i) {
    if (colonnes >= 5) return { x: 12 + (i % 5) * 19, y: 14 + Math.floor(i / 5) * 24 };
    return { x: Math.round(1000 * (i % colonnes + 0.5) / colonnes) / 10, y: 14 + Math.floor(i / colonnes) * 24 };
  }
  function posList(room) {
    var out = {}, saved = APP.layout[room] || {}, idx = 0, i, d;
    for (i = 0; i < APP.devices.length; i++) {
      d = APP.devices[i];
      if (roomKey(d) !== room) continue;
      out[d.id] = saved[d.id] ? { x: saved[d.id].x, y: saved[d.id].y } : autoPos(idx);
      idx++;
    }
    return out;
  }
  function saveRoom(room, pos) {
    APP.api("POST", "/api/layout", { room: room, positions: pos }, function (err) {
      if (err) APP.banner("Positions non enregistrées : " + err, "err");
    });
  }

  function attachDrag(w, id) {
    w.onpointerdown = function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var room = APP.room, r = $("tiles").getBoundingClientRect(), moved = false, nx = 0, ny = 0;
      APP.dragging = true;
      w.className += " drag";
      try { w.setPointerCapture(e.pointerId); } catch (x) {}
      w.onpointermove = function (ev) {
        var G = 10, px = Math.round((ev.clientX - r.left) / G) * G, py = Math.round((ev.clientY - r.top) / G) * G;
        nx = Math.max(7, Math.min(93, px / r.width * 100));
        ny = Math.max(10, Math.min(90, py / r.height * 100));
        w.style.left = nx + "%"; w.style.top = ny + "%"; moved = true;
      };
      w.onpointerup = w.onpointercancel = function () {
        w.onpointermove = null; w.onpointerup = null; w.onpointercancel = null;
        APP.dragging = false;
        if (moved) {
          var pos = posList(room);
          pos[id] = { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 };
          APP.layout[room] = pos;
          saveRoom(room, pos);
        }
        APP.render();
      };
      if (e.preventDefault) e.preventDefault();
    };
  }

  function renderTiles() {
    var box = $("tiles"); box.replaceChildren();
    var v = visible(), i, w, bb, pos, p, flow = (APP.room === "all"), org = APP.organize && !flow;
    box.className = "tiles " + (flow ? "flow" : "abs") + (org ? " org" : "");
    $("orgBtn").style.display = flow ? "none" : "";
    $("orgBtn").textContent = org ? "Terminer" : "Organiser";
    $("orgReset").style.display = org ? "" : "none";
    document.querySelector(".selbar").style.display = v.length ? "" : "none";
    if (!v.length) {
      // Piece sans lumiere ni prise (V1.4 : piece locale, ou seulement des appareils independants) : pas de plan vide
      if (!flow) { box.className = "tiles flow"; $("orgBtn").style.display = "none"; }
      box.appendChild(el("p", "", flow ? "Aucun appareil à afficher." : "Aucune lumière ni prise dans cette pièce."));
      return;
    }
    if (APP.tel) {
      majBarreTel(flow);
      if (flow || !APP.telPlan) { box.className = "tiles tl-liste"; $("orgBtn").style.display = "none"; $("orgReset").style.display = "none"; listeTel(box, v); return; }
    }
    if (!flow) { var lg = box.getBoundingClientRect().width; colonnes = lg ? Math.max(2, Math.min(5, Math.floor(lg / 96))) : 5; }
    pos = flow ? null : posList(APP.room);
    for (i = 0; i < v.length; i++) {
      w = tile(v[i]);
      if (!flow) { p = pos[v[i].id]; w.style.left = p.x + "%"; w.style.top = p.y + "%"; }
      if (org) { bb = w.querySelector(".bubble"); if (bb) bb.onclick = null; attachDrag(w, v[i].id); }
      box.appendChild(w);
    }
  }

  // V1.6, smartphone (APP.tel) : liste des appareils par défaut (une ligne de 56 px : type, nom, état, interrupteur ON/OFF à droite) ; bouton Liste / Plan
  // dans une pièce (le plan à bulles et Organiser restent) ; toucher une ligne : cet appareil seul est sélectionné et la feuille de réglages s'ouvre
  // (APP.telFeuille, tel.js) ; appui long (0,6 s, annulé au-delà de 10 px de glissement) : mode sélection (cases, Tout sélectionner, Aucune, Régler, Terminer).
  APP.telPlan = false; APP.telSel = false;
  var ICON_OK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  function etatTel(d) {
    if (!d.reachable) return "Injoignable";
    if (d.isOn !== true) return "OFF";
    return d.kind === "light" && d.level !== null && d.level !== undefined ? "ON · " + Math.round(d.level) + " %" : "ON";
  }
  function ligneTel(d) {
    var on = d.isOn === true, isLight = d.kind === "light", sel = !!APP.sel[d.id];
    var r = el("div", "tl-app" + (sel ? " sel" : "") + (on ? " on" : "") + (d.reachable ? "" : " unreach"));
    var b = el("button", "tl-corps", ""), t = null, long = false, x0 = 0, y0 = 0, k, txt, sw;
    b.type = "button";
    if (APP.telSel) { k = el("span", "tl-case" + (sel ? " sel" : ""), ""); if (sel) k.innerHTML = ICON_OK; b.appendChild(k); }
    k = el("span", "tl-type", ""); if (APP.piecesChoix) k.innerHTML = (APP.icones && APP.icones.element(d.id, 20)) || APP.piecesChoix.type(isLight ? "lumiere" : "prise"); b.appendChild(k);
    if (on && isLight) k.style.color = APP.colorOf(true, d.colorMode, d.hue, d.sat, d.temp);
    txt = el("span", "tl-txt", "");
    txt.appendChild(el("span", "tl-nom", d.name));
    txt.appendChild(el("span", "tl-etat", etatTel(d) + (APP.room === "all" ? " · " + (d.room ? d.room.name : "Autres") : "")));
    b.appendChild(txt);
    b.setAttribute("aria-label", d.name + " : " + etatTel(d) + (APP.telSel ? (sel ? ", sélectionné" : ", non sélectionné") : ", réglages"));
    if (APP.telSel) b.setAttribute("aria-pressed", sel ? "true" : "false");
    var stop = function () { clearTimeout(t); t = null; };
    b.addEventListener("pointerdown", function (e) { long = false; stop(); x0 = e.clientX; y0 = e.clientY; if (!d.reachable) return;
      t = setTimeout(function () { t = null; long = true; if (!APP.telSel) { APP.telSel = true; APP.sel = {}; } APP.sel[d.id] = true; APP.render(); }, 600); });
    b.addEventListener("pointermove", function (e) { if (t && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)) stop(); });
    b.addEventListener("pointerup", stop); b.addEventListener("pointerleave", stop); b.addEventListener("pointercancel", stop);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    b.onclick = function () {
      if (long) { long = false; return; }
      if (!d.reachable) { APP.banner(d.name + " : injoignable.", "warn"); return; }
      if (APP.telSel) { if (sel) delete APP.sel[d.id]; else APP.sel[d.id] = true; APP.render(); return; }
      APP.sel = {}; APP.sel[d.id] = true; APP.render();
      if (APP.telFeuille) APP.telFeuille.ouvrir();
    };
    r.appendChild(b);
    sw = el("button", "tl-inter" + (on ? " on" : ""), "");
    sw.type = "button";
    sw.innerHTML = '<span class="tl-bille"></span>';
    sw.setAttribute("aria-label", d.name + (on ? " : passer OFF" : " : passer ON"));
    sw.setAttribute("aria-pressed", on ? "true" : "false");
    sw.disabled = !d.reachable;
    sw.onclick = function () { APP.applyLights([d.id], { on: !on }, d.name + (on ? " : OFF." : " : ON.")); };
    r.appendChild(sw);
    return r;
  }
  function listeTel(box, v) {
    var i;
    for (i = 0; i < v.length; i++) box.appendChild(ligneTel(v[i]));
  }
  var telVue = null, telRegler = null, telFin = null;
  function majBarreTel(flow) {
    var bar = document.querySelector(".selbar"), n = APP.selIds().length, liste = flow || !APP.telPlan;
    if (!telVue) {
      telVue = el("button", "b-small tl-vue", ""); telVue.onclick = function () { APP.telPlan = !APP.telPlan; APP.telSel = false; APP.organize = false; APP.render(); };
      telRegler = el("button", "b-small b-main tl-regler", ""); telRegler.onclick = function () { if (APP.telFeuille) APP.telFeuille.ouvrir(); };
      telFin = el("button", "b-small tl-fin", "Terminer"); telFin.onclick = function () { APP.telSel = false; APP.render(); };
      bar.insertBefore(telVue, bar.firstChild); bar.appendChild(telRegler); bar.appendChild(telFin);
    }
    telVue.style.display = flow ? "none" : "";
    telVue.textContent = APP.telPlan ? "Liste" : "Plan";
    telVue.setAttribute("aria-label", APP.telPlan ? "Afficher la liste" : "Afficher le plan");
    $("selAll").style.display = liste && !APP.telSel ? "none" : "";
    $("selNone").style.display = liste && !APP.telSel ? "none" : "";
    telFin.style.display = liste && APP.telSel ? "" : "none";
    telRegler.style.display = n && (APP.telSel || !liste) ? "" : "none";
    telRegler.textContent = "Régler (" + n + ")";
    bar.classList.toggle("tl-astuce", liste && !APP.telSel);
  }

  $("orgBtn").onclick = function () {
    APP.organize = !APP.organize;
    if (APP.organize) APP.banner("Mode Organiser : faites glisser les bulles où vous voulez, puis appuyez sur Terminer.", "ok");
    else APP.banner("", "");
    APP.render();
  };
  $("orgReset").onclick = function () {
    if (!confirm("Remettre les bulles de cette pièce en disposition automatique ?")) return;
    delete APP.layout[APP.room];
    saveRoom(APP.room, {});
    APP.render();
  };
  loadLayout();

   function updatePanelState() {
    var n = APP.selIds().length;
    $("selCount").textContent = n ? n + " sélectionné" + (n > 1 ? "s" : "") : "";
  }

  $("selAll").onclick = function () {
    var v = visible(), i;
    for (i = 0; i < v.length; i++) if (v[i].reachable) APP.sel[v[i].id] = true;
    APP.render();
  };
  $("selNone").onclick = function () { APP.sel = {}; APP.render(); };

  APP.onRender(renderRooms, 10);
  APP.onRender(renderTiles, 30);
  APP.onRender(updatePanelState, 40);
})();
// FIN
