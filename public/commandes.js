// @zone socle | Verification apres commande et compte rendu : APP.verify(devices, items) -> noms en ecart, APP.report(reponse, items, msgOk) (bandeau), APP.applyLights(ids, st, msgOk) (POST /api/lights/apply).
(function () {
  function hueDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  APP.verify = function (devices, items) {
    var bad = [], i, it, st, d, ok;
    for (i = 0; i < items.length; i++) {
      it = items[i]; st = it.st; d = APP.find(devices, it.id);
      if (!d) { bad.push(it.name || it.id); continue; }
      ok = true;
      if (st.on !== undefined && d.isOn !== st.on) ok = false;
      if (ok && st.on !== false) {
        if (st.level !== undefined && (d.level === null || Math.abs(d.level - st.level) > 3)) ok = false;
        if (st.mode === "color") {
          if (d.colorMode !== "color" || d.hue === null || d.sat === null || hueDiff(d.hue, st.hue) > 4 || Math.abs(d.sat - st.sat) > 0.06) ok = false;
        } else if (st.mode === "temperature") {
          if (d.colorMode !== "temperature" || d.temp === null || Math.abs(d.temp - st.kelvin) > 100) ok = false;
        }
      }
      if (!ok) bad.push(d.name);
    }
    return bad;
  };

  APP.report = function (r, items, okMsg) {
    var failed = (r && r.failed) || [], seen = {}, parts = [], i, bad;
    for (i = 0; i < failed.length; i++) { seen[failed[i].name] = 1; parts.push(failed[i].name + " (" + failed[i].reason + ")"); }
    if (r && r.devices) {
      bad = APP.verify(r.devices, items);
      for (i = 0; i < bad.length; i++) if (!seen[bad[i]]) { seen[bad[i]] = 1; parts.push(bad[i] + " (réglage non confirmé)"); }
    }
    if (parts.length) APP.banner("Non appliqué sur : " + parts.join(", "), "warn");
    else APP.banner(okMsg, "ok");
  };

  APP.applyLights = function (ids, st, okMsg) {
    if (APP.busy) return;
    if (st.level !== undefined || st.mode !== undefined) {
      var only = [], q, dd;
      for (q = 0; q < ids.length; q++) { dd = APP.find(APP.devices, ids[q]); if (dd && dd.kind === "light") only.push(ids[q]); }
      ids = only;
    }
    if (!ids.length) { APP.banner("Sélectionne d’abord au moins une lumière.", "warn"); return; }
    APP.setBusy(true);
    APP.api("POST", "/api/lights/apply", { ids: ids, settings: st }, function (err, r) {
      APP.setBusy(false);
      if (err && !(r && r.failed)) { APP.banner(err, "err"); APP.refresh(); return; }
      if (r && r.devices) APP.devices = r.devices;
      var items = [], i, d;
      for (i = 0; i < ids.length; i++) { d = APP.find(APP.devices, ids[i]); items.push({ id: ids[i], name: d ? d.name : ids[i], st: st }); }
      APP.report(r, items, okMsg);
      APP.render();
    });
  };
})();
// FIN
