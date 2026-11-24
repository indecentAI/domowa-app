// @zone lumieres | Reglages d'une lumiere (prefixe q-, panneau.css), composant partage (V1.5) : APP.reglages(opts) -> {root, c1, c2, N, P, peindre, occupe} ; cadran de luminosite SVG (opts.curseur : curseur horizontal en tete de la carte des couleurs, une seule carte),
// Blanc / Couleur, curseurs temperature, teinte et intensite (- / +), blancs et couleurs rapides, couleurs personnalisees (donnees/colors.json, 7 au plus, + = ajouter la couleur reglee,
// appui long 0,7 s = supprimer ; communes a toutes les instances). Utilise par le panneau des lumieres (panel.js : ON/OFF, envoi differe aux lampes) et l'editeur d'animation
// (animations.js : sans ON/OFF, « Inchangée » pour la couleur et la luminosite, changement transmis aussitot).
// opts : {onoff (boutons ON/OFF), curseur (luminosite en curseur horizontal, sans cadran), off (avec curseur : bouton « OFF » sur la ligne de luminosite,
//   P.off, rappel eteindre(P) ; couleur masquee tant qu'il est choisi), inchange (mode « Inchangée » et luminosite gardee), actif() (le cadran repond), differe (envoi 600 ms / 50 ms apres le geste, attente si APP.busy),
//   niveau(P), blanc(P), couleur(P), on(vrai|faux), inchangee(P) (rappels ; P = {level, mode: temperature|color|aucune, hue, sat 0-100, kelvin, garde (luminosite gardee)}),
//   caps (V2.1 : capacites exposees, liste de "onoff", "luminosite", "blanc", "couleur" ; absent = toutes, editeur d'animation) : seules ces sections sont CONSTRUITES (jamais cachees ensuite) :
//   ON/OFF (avec opts.onoff), cadran de luminosite, blanc (temperature + Chaud / Neutre / Froid), couleur (teinte + intensite + couleurs rapides et personnalisees) ; Blanc / Couleur seulement si les deux,
//   carte des couleurs seulement si blanc ou couleur ; titre false : sans titre ni indication (vue Equipements : en-tete propre) ; kelvin [min, max] (bornes declarees de la temperature, sinon 1801-6535). Les elements N absents restent indefinis.
(function () {
  var el = APP.el;
  var WHITES = [["Chaud", 2700], ["Neutre", 4000], ["Froid", 6500]];
  var COLORS = [["Rouge", 0, 100], ["Orange", 25, 100], ["Jaune", 50, 100], ["Vert", 120, 100], ["Cyan", 180, 100], ["Bleu", 240, 100], ["Violet", 280, 100], ["Rose", 320, 70]];
  var NS = "http://www.w3.org/2000/svg";
  var RAD = 80, CIRC = 2 * Math.PI * RAD, ARC = CIRC * 0.75;
  var ICON_MINUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 12h12"/></svg>';
  var ICON_PLUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg>';
  var ICON_POWER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>';
  var ICON_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_THERMO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><circle cx="12" cy="17" r="1.3"/></svg>';
  var ICON_BULB = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><g class="q-rays"><path d="M2.5 8h1.6M19.9 8h1.6M5 2.6l1.1 1.1M19 2.6l-1.1 1.1M12 0.6v1.4"/></g><path class="b" d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/><path d="M9.5 18.5h5M10.5 21h3"/></svg>';
  var ICON_SAME = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 9h14M5 15h14"/></svg>';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag), k;
    for (k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function stepBtn(plus) {
    var b = el("button", "q-step", "");
    b.innerHTML = plus ? ICON_PLUS : ICON_MINUS;
    b.setAttribute("aria-label", plus ? "Augmenter" : "Diminuer");
    return b;
  }

  // Couleurs personnalisees : une seule liste pour toutes les instances (GET/POST /api/colors), mode suppression commun
  var CUSTOM = [], delMode = false, delSince = 0, instances = [], numero = 0;
  function renderAll() { for (var i = 0; i < instances.length; i++) instances[i].renderCustom(); }
  function exitDel() { if (delMode) { delMode = false; renderAll(); } }
  function addCustom(P) {
    APP.api("POST", "/api/colors", { hue: P.hue, sat: P.sat }, function (err, r) {
      if (err) { APP.banner(err, "warn"); return; }
      CUSTOM = r.colors; renderAll();
    });
  }
  function delCustom(id) {
    APP.api("POST", "/api/colors/" + id + "/delete", null, function (err, r) {
      if (err) { APP.banner(err, "warn"); return; }
      CUSTOM = r.colors;
      if (!CUSTOM.length) delMode = false;
      renderAll();
    });
  }
  function loadCustom() {
    APP.api("GET", "/api/colors", null, function (err, d) {
      if (!err && d && d.colors) { CUSTOM = d.colors; renderAll(); }
    });
  }
  document.addEventListener("click", function (e) {
    if (!delMode || (Date.now() - delSince) < 600) return;
    var t = e.target;
    if (!t || !t.closest || t.closest(".q-x")) return;
    var inside = !!t.closest(".q-custom");
    exitDel();
    if (inside) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  APP.reglages = function (opts) {
    var P = { level: 80, mode: "temperature", hue: 240, sat: 100, kelvin: 4000, garde: false };
    var N = {}, timer = null, interacting = false, lpTimer = null, lpFired = false;
    var actif = opts.actif || function () { return true; };
    var A = function (k) { return !opts.caps || opts.caps.indexOf(k) >= 0; };
    var aBlanc = A("blanc"), aCouleur = A("couleur"), aLum = opts.curseur || A("luminosite"), deux = aBlanc && aCouleur;
    var KMIN = opts.kelvin && opts.kelvin[0] > 0 ? opts.kelvin[0] : 1801, KMAX = opts.kelvin && opts.kelvin[1] > KMIN ? opts.kelvin[1] : 6535;
    if (!deux) P.mode = aBlanc ? "temperature" : "color";
    // Rappel apres un geste : differe (panneau : envoi aux lampes, attente si une commande est en cours) ou immediat (editeur)
    function schedule(fn, delay) {
      if (!opts.differe) { fn(); return; }
      if (timer) clearTimeout(timer);
      timer = setTimeout(function fire() {
        timer = null;
        if (APP.busy) { timer = setTimeout(fire, 300); return; }
        fn();
      }, delay);
    }
    function applyLevel() { P.garde = false; P.off = false; opts.niveau(P); }
    function applyWhite() { opts.blanc(P); }
    function applyColor() { opts.couleur(P); }
    var LVL = { key: "level", min: 1, max: 100, step: 5, apply: applyLevel };
    function bump(o, dir) {
      var v = P[o.key] + dir * o.step, m = o.max + 1;
      v = o.wrap ? ((v % m) + m) % m : clamp(v, o.min, o.max);
      P[o.key] = v; if (o.key === "level") { P.garde = false; P.off = false; } paint(); schedule(o.apply, 600);
    }
    function setRange(s, v) { if (+s.value !== v) s.value = v; }

    function paint() {
      var frac = (P.level - 1) / 99, ang = (135 + 270 * frac) * Math.PI / 180, i;
      var x = 100 + RAD * Math.cos(ang), y = 100 + RAD * Math.sin(ang), lit = N.lit ? N.lit() : true, a = (ARC * frac) + " " + CIRC;
      if (N.lvl) {
        // Curseur horizontal (opts.curseur) : valeur, « inchangée » ou « OFF » (curseur grise ; OFF : couleur masquee)
        setRange(N.lvl, P.level);
        N.lvlVal.textContent = P.off ? "OFF" : P.garde ? "inchangée" : P.level + " %";
        N.lvl.className = "q-rng lvl" + (P.garde || P.off ? " q-gris" : "");
        if (N.offB) N.offB.className = "q-mode q-garde q-offb" + (P.off ? " sel" : "");
        N.c2.className = "q-card" + (P.off ? " q-eteinte" : "");
        N.lvl.style.setProperty("--tc", "hsl(40,100%," + Math.round(30 + 0.65 * P.level) + "%)");
      } else if (N.fill) {
        N.fill.setAttribute("stroke-dasharray", a);
        N.glow.setAttribute("stroke-dasharray", a);
        N.thumb.setAttribute("cx", x); N.thumb.setAttribute("cy", y);
        N.thumbG.setAttribute("cx", x); N.thumbG.setAttribute("cy", y + 2);
        N.num.textContent = P.garde ? "=" : P.level;
        N.dial.className = "q-dial" + (lit && !P.garde ? "" : " dim");
        N.bulb.setAttribute("class", "q-bulb" + (lit && !P.garde ? " on" : ""));
        N.c1.style.setProperty("--ga", lit && !P.garde ? (0.1 + 0.4 * frac).toFixed(2) : "0");
      }
      if (!opts.curseur) N.c1.className = "q-card q-c1" + (lit ? "" : " q-dim");
      if (N.garde) N.garde.className = "q-mode q-garde" + (P.garde && !P.off ? " sel" : "");
      if (N.kel) { N.kVal.textContent = P.kelvin + " K"; setRange(N.kel, P.kelvin); }
      if (N.hue) {
        N.hueVal.textContent = P.hue + "°"; setRange(N.hue, P.hue);
        N.satVal.textContent = P.sat + " %"; setRange(N.sat, P.sat);
        N.sat.style.setProperty("--satg", "linear-gradient(to right,#fff,hsl(" + P.hue + ",100%,50%))");
        N.sat.style.setProperty("--tc", "hsl(" + P.hue + ",100%," + Math.round(100 - P.sat / 2) + "%)");
        N.hue.style.setProperty("--tc", "hsl(" + P.hue + ",100%,50%)");
      }
      if (N.mW) N.mW.className = "q-mode" + (P.mode === "temperature" ? " sel" : "");
      if (N.mC) N.mC.className = "q-mode" + (P.mode === "color" ? " sel" : "");
      if (N.mA) N.mA.className = "q-mode" + (P.mode === "aucune" ? " sel" : "");
      // Blanc / Couleur (les deux construits) : la section du mode choisi ; une seule construite : toujours affichee
      if (deux) { N.white.style.display = P.mode === "temperature" ? "" : "none"; N.color.style.display = P.mode === "color" ? "" : "none"; }
      for (i = 0; N.pw && i < N.pw.length; i++) N.pw[i].className = "q-pcard" + (Math.abs(P.kelvin - WHITES[i][1]) <= 100 ? " sel" : "");
      for (i = 0; N.pc && i < N.pc.length; i++) N.pc[i].className = "q-sw" + (P.hue === COLORS[i][1] && P.sat === COLORS[i][2] ? " sel" : "");
      paintCustom();
    }

    function ctl(o) {
      var box = el("div", "q-ctl"), head = el("div", "q-head" + (o.inline ? " inline" : "")), lab = el("div", "q-lab", "");
      var val = el("div", "q-val" + (o.big ? " big" : ""), ""), row = el("div", "q-row");
      if (o.icon) { var ic = el("span", "q-lico", ""); ic.innerHTML = o.icon; lab.appendChild(ic); }
      lab.appendChild(el("span", "", o.name));
      if (o.unit) lab.appendChild(el("span", "q-unitl", o.unit));
      head.appendChild(lab);
      if (o.inline) head.appendChild(val);
      box.appendChild(head);
      if (!o.inline) box.appendChild(val);
      var minus = stepBtn(false), plus = stepBtn(true);
      var s = document.createElement("input");
      s.type = "range"; s.min = o.min; s.max = o.max; s.step = 1; s.value = P[o.key]; s.className = "q-rng " + o.cls;
      s.setAttribute("aria-label", o.name);
      s.oninput = function () { P[o.key] = +s.value; if (o.key === "level") { P.garde = false; P.off = false; } interacting = true; APP.dragging = true; paint(); };
      s.onchange = function () { interacting = false; APP.dragging = false; P[o.key] = +s.value; paint(); schedule(o.apply, 50); };
      minus.onclick = function () { bump(o, -1); };
      plus.onclick = function () { bump(o, 1); };
      row.appendChild(minus); row.appendChild(s); row.appendChild(plus);
      box.appendChild(row);
      return { box: box, input: s, val: val };
    }

    function levelFromEvent(e) {
      var r = N.svg.getBoundingClientRect();
      var a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
      var rel = ((a - 135) % 360 + 360) % 360;
      if (rel > 270) rel = rel > 315 ? 0 : 270;
      return clamp(Math.round(1 + rel / 270 * 99), 1, 100);
    }

    function mkWhite(i) {
      var b = el("button", "q-pcard", ""), sp = el("span", "q-psph", ""), col = APP.colorOf(true, "temperature", null, null, WHITES[i][1]);
      sp.style.background = "radial-gradient(circle at 32% 28%, rgba(255,255,255,.7) 0, rgba(255,255,255,0) 50%), " + col;
      sp.style.boxShadow = "0 0 16px " + col;
      b.appendChild(sp);
      b.appendChild(el("span", "q-pn", WHITES[i][0]));
      b.appendChild(el("span", "q-pk", WHITES[i][1] + " K"));
      b.onclick = function () { P.mode = "temperature"; P.kelvin = WHITES[i][1]; paint(); schedule(applyWhite, 50); };
      return b;
    }
    function mkColor(i) {
      var b = el("button", "q-sw", ""), s = el("span", "q-sph", "");
      b.title = COLORS[i][0]; b.setAttribute("aria-label", COLORS[i][0]);
      s.style.background = "radial-gradient(circle at 32% 28%, rgba(255,255,255,.55) 0, rgba(255,255,255,0) 45%), hsl(" + COLORS[i][1] + ",100%," + Math.round(100 - COLORS[i][2] / 2) + "%)";
      b.appendChild(s);
      b.onclick = function () { P.mode = "color"; P.hue = COLORS[i][1]; P.sat = COLORS[i][2]; paint(); schedule(applyColor, 50); };
      return b;
    }

    function paintCustom() {
      var i, o;
      if (!N.cs) return;
      for (i = 0; i < N.cs.length; i++) {
        o = N.cs[i];
        o.b.className = "q-sw q-csw" + (P.hue === o.c.hue && P.sat === o.c.sat ? " sel" : "");
      }
    }
    function makeEmpty() { return el("div", "q-cell q-empty", ""); }
    function makeCustom(c) {
      var cell = el("div", "q-cell"), b = el("button", "q-sw q-csw", ""), s = el("span", "q-sph", ""), x;
      s.style.background = "radial-gradient(circle at 32% 28%, rgba(255,255,255,.55) 0, rgba(255,255,255,0) 45%), hsl(" + c.hue + ",100%," + Math.round(100 - c.sat / 2) + "%)";
      b.appendChild(s);
      b.title = "Couleur personnalisée";
      b.oncontextmenu = function () { return false; };
      b.onpointerdown = function () {
        lpFired = false;
        if (delMode) return;
        if (lpTimer) clearTimeout(lpTimer);
        lpTimer = setTimeout(function () { lpTimer = null; lpFired = true; delMode = true; delSince = Date.now(); renderAll(); }, 700);
      };
      b.onpointerup = b.onpointercancel = b.onpointerleave = function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
      b.onclick = function () {
        if (lpFired || (Date.now() - delSince) < 600) { lpFired = false; return; }
        P.mode = "color"; P.hue = c.hue; P.sat = c.sat; paint(); schedule(applyColor, 50);
      };
      cell.appendChild(b);
      if (delMode) {
        x = el("button", "q-x", "✕");
        x.setAttribute("aria-label", "Supprimer");
        x.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); delCustom(c.id); };
        cell.appendChild(x);
      }
      N.cs.push({ b: b, c: c });
      return cell;
    }
    function makeAdd() {
      var cell = el("div", "q-cell"), b = el("button", "q-sw q-csw q-add", "+");
      b.title = "Ajouter la couleur réglée";
      b.setAttribute("aria-label", "Ajouter la couleur réglée");
      b.disabled = CUSTOM.length >= 7;
      b.onclick = function () {
        if ((Date.now() - delSince) < 600) return;
        addCustom(P);
      };
      cell.appendChild(b);
      return cell;
    }
    function renderCustom() {
      var box = N.custom, i;
      if (!box) return;
      box.innerHTML = ""; N.cs = [];
      box.className = "q-qc q-custom" + (delMode ? " del" : "");
      for (i = 0; i < 7; i++) box.appendChild(i < CUSTOM.length ? makeCustom(CUSTOM[i]) : makeEmpty());
      box.appendChild(makeAdd());
      paintCustom();
    }

    // Construction (meme structure et memes classes que le panneau d'origine)
    var c1, c2, row, t, i, seg, defs, flt, ctr, bw, cell, quick;
    N.root = el("div", "q-root");
    c2 = el("div", "q-card"); N.c2 = c2;
    if (opts.curseur) {
      // Luminosite en curseur horizontal, comme la teinte et l'intensite, en tete de la meme carte (editeur d'animation : place gagnee)
      c1 = el("div", "q-sect q-lum"); N.c1 = c1;
      t = ctl({ name: "Luminosité", unit: "(%)", inline: true, key: "level", cls: "lvl", min: 1, max: 100, step: 5, apply: applyLevel });
      N.lvl = t.input; N.lvlVal = t.val; c1.appendChild(t.box);
      if (opts.inchange) {
        N.garde = el("button", "q-mode q-garde", "");
        N.garde.innerHTML = ICON_SAME + "<span>Inchangée</span>";
        N.garde.setAttribute("aria-label", "Luminosité inchangée");
        N.garde.onclick = function () { P.garde = P.off ? true : !P.garde; P.off = false; paint(); schedule(P.garde ? function () { opts.inchangee(P); } : applyLevel, 50); };
        t.box.firstChild.appendChild(N.garde);
      }
      if (opts.off) {
        // « OFF » : la lampe passe OFF (fondu de la lampe) ; toucher a nouveau : luminosite du curseur
        N.offB = el("button", "q-mode q-garde q-offb", "OFF");
        N.offB.setAttribute("aria-label", "OFF");
        N.offB.onclick = function () { P.off = !P.off; if (!P.off) P.garde = false; paint(); opts.eteindre(P); };
        t.box.firstChild.appendChild(N.offB);
      }
      c2.appendChild(c1);
    } else construireCadran();
    function construireCadran() {
    c1 = el("div", "q-card q-c1"); N.c1 = c1;
    if (opts.titre !== false) { N.title = el("div", "q-title", ""); N.hint = el("div", "q-hint", ""); c1.appendChild(N.title); c1.appendChild(N.hint); }
    if (opts.onoff && A("onoff")) {
      seg = el("div", "q-segs");
      N.bOn = el("button", "q-seg", ""); N.bOn.innerHTML = ICON_POWER + "<span>ON</span>";
      N.bOff = el("button", "q-seg", ""); N.bOff.innerHTML = ICON_POWER + "<span>OFF</span>";
      N.bOn.onclick = function () { opts.on(true); };
      N.bOff.onclick = function () { opts.on(false); };
      seg.appendChild(N.bOn); seg.appendChild(N.bOff); c1.appendChild(seg);
    }
    if (!aLum) return;
    N.dialBox = el("div", "q-dialbox");
    row = el("div", "q-dialrow");
    var minus = stepBtn(false), plus = stepBtn(true);
    minus.onclick = function () { bump(LVL, -1); };
    plus.onclick = function () { bump(LVL, 1); };
    N.dial = el("div", "q-dial");
    N.svg = svgEl("svg", { viewBox: "0 0 200 200", "class": "q-svg" });
    defs = svgEl("defs", {});
    // Filtre propre a chaque instance (un filtre d'une vue masquee ne s'applique pas ailleurs)
    var fid = "qblur" + (numero++ || "");
    flt = svgEl("filter", { id: fid, x: "-50%", y: "-50%", width: "200%", height: "200%" });
    flt.appendChild(svgEl("feGaussianBlur", { stdDeviation: "5" }));
    defs.appendChild(flt); N.svg.appendChild(defs);
    N.svg.appendChild(svgEl("circle", { cx: 100, cy: 100, r: RAD, fill: "none", stroke: "#2b303b", "stroke-width": 16, "stroke-linecap": "round", "stroke-dasharray": ARC + " " + CIRC, transform: "rotate(135 100 100)" }));
    N.svg.appendChild(svgEl("circle", { cx: 100, cy: 100, r: 64, fill: "#11151c", stroke: "#262c37", "stroke-width": 1 }));
    N.glow = svgEl("circle", { cx: 100, cy: 100, r: RAD, fill: "none", "stroke-width": 22, "stroke-linecap": "round", "stroke-dasharray": "0 " + CIRC, transform: "rotate(135 100 100)", "class": "q-glow", filter: "url(#" + fid + ")" });
    N.fill = svgEl("circle", { cx: 100, cy: 100, r: RAD, fill: "none", "stroke-width": 16, "stroke-linecap": "round", "stroke-dasharray": "0 " + CIRC, transform: "rotate(135 100 100)", "class": "q-fill" });
    N.thumbG = svgEl("circle", { cx: 100, cy: 100, r: 12, fill: "#000", "fill-opacity": 0.55, filter: "url(#" + fid + ")" });
    N.thumb = svgEl("circle", { cx: 100, cy: 100, r: 11, fill: "#f3f4f7", stroke: "#ffffff", "stroke-opacity": 0.5, "stroke-width": 2 });
    N.svg.appendChild(N.glow); N.svg.appendChild(N.fill); N.svg.appendChild(N.thumbG); N.svg.appendChild(N.thumb);
    N.dial.appendChild(N.svg);
    ctr = el("div", "q-center", "");
    bw = el("div", "q-bw", ""); bw.innerHTML = ICON_BULB; N.bulb = bw.firstChild;
    N.num = el("div", "q-num", ""); ctr.appendChild(bw); ctr.appendChild(N.num); ctr.appendChild(el("div", "q-unit", "%"));
    N.dial.appendChild(ctr);
    row.appendChild(minus); row.appendChild(N.dial); row.appendChild(plus);
    N.dialBox.appendChild(row);
    N.mixed = el("div", "q-mixed", ""); N.dialBox.appendChild(N.mixed);
    if (opts.inchange) {
      N.garde = el("button", "q-mode q-garde", "");
      N.garde.innerHTML = ICON_SAME + "<span>Luminosité inchangée</span>";
      N.garde.onclick = function () { P.garde = !P.garde; paint(); schedule(P.garde ? function () { opts.inchangee(P); } : applyLevel, 50); };
      N.dialBox.appendChild(N.garde);
    }
    c1.appendChild(N.dialBox);

    N.svg.onpointerdown = function (e) {
      if (!actif()) return;
      interacting = true; APP.dragging = true;
      try { N.svg.setPointerCapture(e.pointerId); } catch (x) {}
      P.level = levelFromEvent(e); P.garde = false; paint();
      N.svg.onpointermove = function (ev) { P.level = levelFromEvent(ev); paint(); };
      N.svg.onpointerup = N.svg.onpointercancel = function () {
        N.svg.onpointermove = null; N.svg.onpointerup = null; N.svg.onpointercancel = null;
        interacting = false; APP.dragging = false; schedule(applyLevel, 50);
      };
      if (e.preventDefault) e.preventDefault();
    };
    }

    if (deux) {
    row = el("div", "q-modes");
    N.mW = el("button", "q-mode", ""); N.mW.innerHTML = ICON_SUN + "<span>Blanc</span>";
    N.mC = el("button", "q-mode", ""); N.mC.innerHTML = '<i class="q-wheel"></i><span>Couleur</span>';
    N.mW.onclick = function () { P.mode = "temperature"; paint(); schedule(applyWhite, 50); };
    N.mC.onclick = function () { P.mode = "color"; paint(); schedule(applyColor, 50); };
    row.appendChild(N.mW); row.appendChild(N.mC);
    if (opts.inchange) {
      N.mA = el("button", "q-mode", ""); N.mA.innerHTML = ICON_SAME + "<span>Inchangée</span>";
      N.mA.onclick = function () { P.mode = "aucune"; paint(); schedule(function () { opts.inchangee(P); }, 50); };
      row.appendChild(N.mA);
    }
    c2.appendChild(row);
    }

    if (aBlanc) {
    N.white = el("div", "q-sect");
    t = ctl({ name: "Température de couleur", icon: ICON_THERMO, big: true, key: "kelvin", cls: "kel", min: KMIN, max: KMAX, step: 100, apply: applyWhite });
    N.kel = t.input; N.kVal = t.val; N.white.appendChild(t.box);
    row = el("div", "q-pre"); N.pw = [];
    for (i = 0; i < WHITES.length; i++) { N.pw.push(mkWhite(i)); row.appendChild(N.pw[i]); }
    N.white.appendChild(row); c2.appendChild(N.white);
    }

    if (aCouleur) {
    N.color = el("div", "q-sect");
    t = ctl({ name: "Teinte", unit: "(°)", inline: true, key: "hue", cls: "hue", min: 0, max: 359, step: 5, wrap: true, apply: applyColor });
    N.hue = t.input; N.hueVal = t.val; N.color.appendChild(t.box);
    t = ctl({ name: "Intensité", unit: "(%)", inline: true, key: "sat", cls: "sat", min: 0, max: 100, step: 5, apply: applyColor });
    N.sat = t.input; N.satVal = t.val; N.color.appendChild(t.box);
    quick = el("div", "q-quick");
    quick.appendChild(el("div", "q-qt", "Couleurs rapides"));
    row = el("div", "q-qc"); N.pc = [];
    for (i = 0; i < COLORS.length; i++) { cell = el("div", "q-cell"); N.pc.push(mkColor(i)); cell.appendChild(N.pc[i]); row.appendChild(cell); }
    quick.appendChild(row);
    N.custom = el("div", "q-qc q-custom");
    quick.appendChild(N.custom);
    N.color.appendChild(quick); c2.appendChild(N.color);
    }
    if (!opts.curseur) N.root.appendChild(c1);
    if (opts.curseur || aBlanc || aCouleur) N.root.appendChild(c2); else { c2 = null; N.c2 = null; }

    var inst = { root: N.root, c1: c1, c2: c2, N: N, P: P, caps: opts.caps ? opts.caps.slice() : null, peindre: paint, renderCustom: renderCustom, occupe: function () { return interacting || !!timer; } };
    instances.push(inst);
    renderCustom();
    paint();
    return inst;
  };
  // Instance retiree de la page (editeur reconstruit) : plus redessinee
  APP.reglagesRetirer = function (inst) { var i = instances.indexOf(inst); if (i >= 0) instances.splice(i, 1); };
  loadCustom();
})();
// FIN
