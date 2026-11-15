// @zone socle | Mise a jour immediate : un POST connu est applique a l'affichage avant la reponse, annule si echec total, relu 2,5 s apres.
// Regle : APP.prevoir(/regex de l'url/, function (m, corps) { return [{id, st}] ou null; }). La commande generique /api/devices/:id/cmd {set} est prevue d'office.
(function () {
  var rawApi = APP.api, checkTimer = null;
  function cloneDev(d) { var o = {}, k; for (k in d) if (d.hasOwnProperty(k)) o[k] = d[k]; return o; }
  function indexOfDev(id) { var i; for (i = 0; i < APP.devices.length; i++) if (APP.devices[i].id === id) return i; return -1; }
  function applySt(d, st) {
    if (st.on !== undefined) d.isOn = st.on;
    if (d.kind !== "light" || st.on === false) return;
    if (st.level !== undefined && d.canDim) d.level = st.level;
    if (st.mode === "color" && d.canColor) { d.colorMode = "color"; d.hue = st.hue; d.sat = st.sat; }
    else if (st.mode === "temperature" && d.canTemp) { d.colorMode = "temperature"; d.temp = st.kelvin; }
  }
  APP.optimistic = function (items) {
    var snap = [], i, j, d, n;
    for (i = 0; i < items.length; i++) {
      j = indexOfDev(items[i].id);
      if (j < 0 || !APP.devices[j].reachable) continue;
      d = APP.devices[j]; n = cloneDev(d);
      applySt(n, items[i].st);
      snap.push({ id: d.id, old: d });
      APP.devices[j] = n;
    }
    if (snap.length) APP.render();
    return snap;
  };
  APP.rollback = function (snap) {
    var i, j;
    for (i = 0; i < snap.length; i++) { j = indexOfDev(snap[i].id); if (j >= 0) APP.devices[j] = snap[i].old; }
    APP.render();
  };
  var regles = [];
  APP.prevoir = function (re, fn) { regles.push([re, fn]); };
  function predict(url, body) {
    var i, m;
    body = body || {};
    for (i = 0; i < regles.length; i++) if ((m = url.match(regles[i][0]))) return regles[i][1](m, body);
    return null;
  }
  APP.prevoir(/^\/api\/devices\/([A-Za-z0-9_-]+)\/power$/, function (m, b) { return typeof b.on === "boolean" ? [{ id: m[1], st: { on: b.on } }] : null; });
  APP.prevoir(/^\/api\/devices\/([A-Za-z0-9_-]+)\/brightness$/, function (m, b) { return typeof b.level === "number" ? [{ id: m[1], st: { level: b.level } }] : null; });
  APP.prevoir(/^\/api\/devices\/([A-Za-z0-9_-]+)\/cmd$/, function (m, b) { return (b.set && typeof b.set === "object") ? [{ id: m[1], st: b.set }] : null; });
  APP.prevoir(/^\/api\/lights\/apply$/, function (m, b) {
    var items = [], i;
    if (!b.ids || !b.settings) return null;
    for (i = 0; i < b.ids.length; i++) items.push({ id: b.ids[i], st: b.settings });
    return items;
  });
  APP.prevoir(/^\/api\/rooms\/([A-Za-z0-9_-]+)\/power$/, function (m, b) {
    var items = [], i, d;
    if (typeof b.on !== "boolean") return null;
    for (i = 0; i < APP.devices.length; i++) { d = APP.devices[i]; if (d.kind === (b.kind || "light") && d.room && d.room.id === m[1]) items.push({ id: d.id, st: { on: b.on } }); }
    return items;
  });
  APP.prevoir(/^\/api\/actions\/all-off$/, function () {
    var items = [], i;
    for (i = 0; i < APP.devices.length; i++) if (APP.devices[i].isOn === true) items.push({ id: APP.devices[i].id, st: { on: false } });
    return items;
  });
  APP.prevoir(/^\/api\/scenarios\/([a-z0-9]{1,20})\/apply$/, function (m) {
    var items = [], i, s, l, st;
    s = APP.find(APP.scenes || [], m[1]);
    if (!s || !s.lights) return null;
    for (i = 0; i < s.lights.length; i++) {
      l = s.lights[i]; st = { on: l.on };
      if (l.on) {
        if (l.level !== undefined) st.level = l.level;
        if (l.mode === "color") { st.mode = "color"; st.hue = l.hue; st.sat = l.sat; }
        else if (l.mode === "temperature") { st.mode = "temperature"; st.kelvin = l.kelvin; }
      }
      items.push({ id: l.id, st: st });
    }
    return items;
  });
  function checkLater() {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(function () { checkTimer = null; APP.refresh(); }, 2500);
  }
  APP.api = function (method, url, body, cb) {
    var items = method === "POST" ? predict(url, body) : null, snap = (items && items.length) ? APP.optimistic(items) : null;
    rawApi(method, url, body, function (err, d) {
      if (items) {
        if (err && !(d && (d.failed || d.devices))) { if (snap && snap.length) APP.rollback(snap); }
        else checkLater();
      }
      cb(err, d);
    });
  };
})();
// FIN
