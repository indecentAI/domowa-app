// @zone cameras-ajout
// cameras-ajout.js : fenetre "Cameras" (bouton + du panneau des cameras de l'accueil) : recherche, ajout avec test, ajout manuel, renommage, suppression.
// Charge apres cameras.js. Expose APP.camerasOpen. Utilise APP.camerasReload (cameras.js) pour rafraichir les cartes de l'accueil.
// Serveur : /api/cameras/discover, /discover/cancel, /list, /add, /:id/rename, /:id/delete (cameras-gestion.mjs). Le mot de passe n'est jamais conserve ici.
(function () {
  var el = APP.el, root = null, body = null, C = null, timer = null;
  var S = { view: "main", searching: false, etat: "", etape: "", found: [], erreurs: [], msg: "", mine: [], renaming: null, dev: null, manual: false };
  var SV = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var I_CLOSE = SV + '<path d="M6 6l12 12M18 6L6 18"/></svg>';
  var I_PENCIL = SV + '<path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>';
  var I_TRASH = SV + '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
  var I_CHECK = SV + '<path d="M5 12l5 5 9-10"/></svg>';

  function icone(cls, svg, label, fn) { var b = el("button", cls, ""); b.innerHTML = svg; b.setAttribute("aria-label", label); b.onclick = fn; return b; }
  function nomAppareil(d) {
    if (d.marque) return d.marque + (d.modele ? " " + d.modele : "");
    return d.modele || d.nom || "Appareil r\u00e9seau";
  }
  function protos(d) {
    var i, o = [];
    for (i = 0; i < (d.protocoles || []).length; i++) if (d.protocoles[i] === "onvif" || d.protocoles[i] === "rtsp") o.push(d.protocoles[i].toUpperCase());
    return o;
  }
  function champ(parent, label, type, ph) {
    var i = el("input", "cj-in", "");
    parent.appendChild(el("label", "cj-lab", label));
    i.type = type; i.placeholder = ph || ""; i.setAttribute("autocomplete", "off"); i.setAttribute("autocapitalize", "none"); i.setAttribute("spellcheck", "false");
    parent.appendChild(i);
    return i;
  }

  // ---------- recherche ----------
  function statut() {
    var n = S.found.length;
    if (S.msg) return S.msg;
    if (S.searching) return (S.etape || "Recherche en cours...") + " " + n + " appareil" + (n > 1 ? "s" : "") + " trouv\u00e9" + (n > 1 ? "s" : "") + ".";
    if (S.etat === "annulee") return "Recherche annul\u00e9e.";
    if (S.etat === "terminee") return n ? n + " appareil" + (n > 1 ? "s" : "") + " trouv\u00e9" + (n > 1 ? "s" : "") + ". Touchez-en un pour l'ajouter." : "Aucune cam\u00e9ra trouv\u00e9e. V\u00e9rifiez qu'elle est allum\u00e9e et sur le m\u00eame Wi-Fi, ou utilisez \u00ab Ajouter manuellement \u00bb.";
    return "Touchez Rechercher pour d\u00e9tecter les cam\u00e9ras du r\u00e9seau.";
  }
  function renderFound() {
    var i, d, row, info, sub, tags, p;
    if (!C) return;
    C.search.disabled = S.searching;
    C.cancel.className = S.searching ? "b-small" : "b-small hidden";
    C.status.textContent = statut();
    C.warn.textContent = S.erreurs.length ? S.erreurs.join(" | ") : "";
    C.list.innerHTML = "";
    for (i = 0; i < S.found.length; i++) {
      d = S.found[i];
      row = el("div", "cj-row"); info = el("div", "cj-info");
      info.appendChild(el("div", "cj-name", nomAppareil(d)));
      sub = el("div", "cj-sub", d.ip); tags = protos(d);
      for (p = 0; p < tags.length; p++) sub.appendChild(el("span", "cj-tag", tags[p]));
      info.appendChild(sub); row.appendChild(info);
      if (d.ajoutee) row.appendChild(el("span", "cj-done", "Ajout\u00e9e"));
      else row.appendChild(addBtn(d));
      C.list.appendChild(row);
    }
  }
  function addBtn(d) { var b = el("button", "b-main", "Ajouter"); b.style.minHeight = "44px"; b.onclick = function () { openForm(d, false); }; return b; }
  function tick() {
    timer = null;
    APP.api("GET", "/api/cameras/discover", null, function (err, d) {
      if (!root) return;
      if (err || !d) { S.searching = false; S.msg = err || "Recherche impossible."; renderFound(); return; }
      S.etat = d.etat; S.etape = d.etape; S.found = d.appareils || []; S.erreurs = d.erreurs || [];
      S.searching = d.etat === "en cours";
      renderFound();
      if (S.searching) timer = setTimeout(tick, 1000);
    });
  }
  function search() {
    S.found = []; S.erreurs = []; S.msg = ""; S.searching = true; S.etat = "en cours"; S.etape = "";
    renderFound();
    APP.api("POST", "/api/cameras/discover", {}, function (err) {
      if (!root) return;
      if (err) { S.searching = false; S.msg = err; renderFound(); return; }
      tick();
    });
  }
  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
    S.searching = false; S.etat = "annulee"; renderFound();
    APP.api("POST", "/api/cameras/discover/cancel", {}, function () {});
  }

  // ---------- mes cameras ----------
  function loadMine() {
    APP.api("GET", "/api/cameras/list", null, function (err, d) {
      if (!root) return;
      S.mine = !err && d && d.cameras ? d.cameras : [];
      renderMine();
    });
  }
  function done() { loadMine(); if (APP.camerasReload) APP.camerasReload(); }
  setInterval(function () { if (root && !S.renaming && !document.hidden) loadMine(); }, 30000); // V1.7 : etat des cameras relu tant que la fenetre est ouverte
  function mineRow(c) {
    var row = el("div", "cj-row"), info = el("div", "cj-info"), sub, inp;
    if (S.renaming === c.id) {
      inp = el("input", "cj-in", ""); inp.type = "text"; inp.value = c.title; inp.maxLength = 40;
      inp.setAttribute("autocomplete", "off"); inp.setAttribute("aria-label", "Nom de la cam\u00e9ra");
      info.appendChild(inp); row.appendChild(info);
      row.appendChild(icone("cj-ic", I_CHECK, "Enregistrer le nom", function () {
        APP.api("POST", "/api/cameras/" + encodeURIComponent(c.id) + "/rename", { title: inp.value.replace(/^\s+|\s+$/g, "") }, function (err) {
          if (err) { APP.banner(err, "err"); return; }
          S.renaming = null; done();
        });
      }));
      row.appendChild(icone("cj-ic", I_CLOSE, "Annuler", function () { S.renaming = null; renderMine(); }));
      return row;
    }
    info.appendChild(el("div", "cj-name", c.title));
    sub = el("div", "cj-sub", c.host);
    if (c.ptz) sub.appendChild(el("span", "cj-tag", "PTZ"));
    if (c.hd) sub.appendChild(el("span", "cj-tag", "SD/HD"));
    if (!c.secret) sub.appendChild(el("span", "cj-tag", "identifiants manquants"));
    if (c.etat === "hors_ligne") sub.appendChild(el("span", "cj-tag cj-hors", "hors ligne")); // V1.7 : etat de GET /api/cameras/list (sonde.mjs)
    info.appendChild(sub);
    if (c.etat === "hors_ligne" && c.motif) info.appendChild(el("div", "cj-sub", APP.lieu(c.motif)));
    row.appendChild(info);
    row.appendChild(icone("cj-ic", I_PENCIL, "Renommer", function () { S.renaming = c.id; renderMine(); }));
    row.appendChild(icone("cj-ic del", I_TRASH, "Supprimer", function () {
      if (!confirm("Supprimer la cam\u00e9ra \u00ab " + c.title + " \u00bb ? Son mot de passe enregistr\u00e9 sera effac\u00e9.")) return;
      APP.api("POST", "/api/cameras/" + encodeURIComponent(c.id) + "/delete", { confirm: true }, function (err) {
        if (err) { APP.banner(err, "err"); return; }
        done();
      });
    }));
    return row;
  }
  function renderMine() {
    var i;
    if (!C) return;
    C.mine.innerHTML = "";
    if (!S.mine.length) { C.mine.appendChild(el("div", "cj-status", "Aucune cam\u00e9ra enregistr\u00e9e.")); return; }
    for (i = 0; i < S.mine.length; i++) C.mine.appendChild(mineRow(S.mine[i]));
  }

  // ---------- vues ----------
  function renderMain() {
    var bar, link;
    body.innerHTML = "";
    C = { search: el("button", "b-main", "Rechercher des cam\u00e9ras"), cancel: el("button", "b-small hidden", "Annuler"), status: el("div", "cj-status", ""), warn: el("div", "cj-warn", ""), list: el("div", "", ""), mine: el("div", "", "") };
    C.search.onclick = search; C.cancel.onclick = cancel;
    body.appendChild(el("div", "cj-sec", "Rechercher"));
    bar = el("div", "cj-bar"); bar.appendChild(C.search); bar.appendChild(C.cancel);
    body.appendChild(bar); body.appendChild(C.status); body.appendChild(C.warn); body.appendChild(C.list);
    body.appendChild(el("div", "cj-sec", "Mes cam\u00e9ras"));
    body.appendChild(C.mine);
    link = el("button", "cj-link", "Ajouter manuellement"); link.onclick = function () { openForm(null, true); };
    body.appendChild(link);
    renderFound(); renderMine();
  }
  function openForm(dev, manual) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (S.searching) cancel();
    S.view = "form"; S.dev = dev; S.manual = manual; C = null;
    renderForm();
  }
  function backMain() { S.view = "main"; renderMain(); loadMine(); }
  function renderForm() {
    var dev = S.dev, manual = S.manual, back, inNom, inUser, inPwd, inIp, inPath, inPort, err, go;
    body.innerHTML = "";
    back = el("div", "cj-back");
    back.appendChild(el("button", "b-small", "Retour")); back.firstChild.onclick = backMain;
    back.appendChild(el("div", "cj-name", manual ? "Ajout manuel" : nomAppareil(dev)));
    body.appendChild(back);
    if (!manual) body.appendChild(el("div", "cj-sub", dev.ip));
    if (manual) inIp = champ(body, "Adresse IP de la cam\u00e9ra", "text", "192.168.1.20");
    inNom = champ(body, "Nom affich\u00e9 (facultatif)", "text", "Salon, entr\u00e9e...");
    inNom.maxLength = 40;
    inUser = champ(body, "Identifiant du compte de la cam\u00e9ra", "text", "");
    inPwd = champ(body, "Mot de passe", "password", "");
    if (manual) {
      inPath = champ(body, "Chemin RTSP (facultatif)", "text", "stream1");
      inPort = champ(body, "Port RTSP (facultatif)", "text", "554");
    }
    body.appendChild(el("div", "cj-hint", APP.lieu("Ce sont les identifiants du compte cr\u00e9\u00e9 dans l'application du fabricant pour la cam\u00e9ra, pas ceux de votre compte personnel. Ils restent sur cet appareil et ne sont jamais r\u00e9affich\u00e9s.")));
    err = el("div", "cj-err hidden", "");
    go = el("button", "b-main cj-go", "Tester et ajouter");
    body.appendChild(err); body.appendChild(go);
    function erreur(t) { err.textContent = t; err.className = "cj-err"; }
    go.onclick = function () {
      var req, ip = manual ? inIp.value.replace(/\s/g, "") : dev.ip, port, titre;
      if (manual && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { erreur("Adresse IP invalide."); return; }
      if (!inUser.value || !inPwd.value) { erreur("Identifiant et mot de passe requis."); return; }
      req = { ip: ip, user: inUser.value, pwd: inPwd.value };
      titre = inNom.value.replace(/^\s+|\s+$/g, ""); if (titre) req.title = titre;
      if (manual) {
        if (inPath.value.replace(/\s/g, "")) req.chemin = inPath.value.replace(/\s/g, "");
        port = parseInt(inPort.value, 10); if (port) req.rtspPort = port;
      } else {
        req.indice = [dev.marque, dev.modele, dev.nom].join(" ");
        if (dev.onvifPort) req.onvifPort = dev.onvifPort;
        if (dev.rtspPort) req.rtspPort = dev.rtspPort;
      }
      err.className = "cj-err hidden"; go.disabled = true; go.textContent = "Test en cours (jusqu'\u00e0 1 minute)...";
      APP.api("POST", "/api/cameras/add", req, function (e, d) {
        req.pwd = "";
        if (!root) return;
        inPwd.value = "";
        if (e) { go.disabled = false; go.textContent = "Tester et ajouter"; erreur(e); return; }
        backMain();
        if (APP.camerasReload) APP.camerasReload();
        APP.banner("Cam\u00e9ra ajout\u00e9e" + (d && d.ptz ? ", orientable" : "") + (d && d.hd ? ", SD/HD disponible" : "") + ".", "ok");
      });
    };
  }

  // ---------- ouverture et fermeture ----------
  function closeModal() {
    if (!root) return;
    if (timer) { clearTimeout(timer); timer = null; }
    if (S.searching) APP.api("POST", "/api/cameras/discover/cancel", {}, function () {});
    S.searching = false; S.renaming = null;
    document.body.removeChild(root); root = null; body = null; C = null;
  }
  function openModal() {
    var panel, head;
    if (root) return;
    root = el("div", "cj-scrim");
    root.onclick = function (e) { if (e.target === root) closeModal(); };
    panel = el("div", "cj-panel"); head = el("div", "cj-head");
    head.appendChild(el("div", "cj-title", "Cam\u00e9ras"));
    head.appendChild(icone("cj-x", I_CLOSE, "Fermer", closeModal));
    body = el("div", "cj-body");
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    S.view = "main"; S.msg = ""; S.renaming = null;
    renderMain(); loadMine();
  }
  APP.camerasOpen = openModal;
})();
// FIN
