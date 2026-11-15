// @zone distant | Fenêtre « Appareils autorisés » (V1.8, préfixe ca-, cadre hb- de hubs.css) : mode du serveur (local ou distant), adresse à ouvrir depuis un autre appareil, empreinte du certificat, « Autoriser un appareil » (code à 8 chiffres et compte à rebours : POST /api/appairage/code), appareils autorisés (GET /api/clients), « Révoquer » en deux appuis (POST /api/clients/:id/revoquer), aide « ? ». APP.clients {ouvrir}.
(function () {
  "use strict";
  const el = APP.el, $ = APP.$;
  const AIDE = [
    ["À quoi sert cette fenêtre ?", "Elle montre si l'application est ouverte aux autres appareils de la maison (mode distant) ou seulement à la machine qui la fait tourner (mode local), et quels appareils ont le droit de s'y connecter."],
    ["Mode local, mode distant", "Mode local : seule la machine du serveur ouvre l'application, rien n'est ouvert sur le réseau. Mode distant : le serveur accepte aussi les appareils du réseau local (Wi-Fi de la maison), en connexion chiffrée (HTTPS), et seulement ceux que vous avez autorisés ici. Rien n'est ouvert vers Internet."],
    ["Changer de mode", "Le changement se fait sur la machine du serveur, serveur arrêté, en terminal : node scripts/serveur.mjs distant (ou local), puis redémarrer le serveur. Pensez à réserver l'adresse du serveur dans la box : si elle change, il faut relancer cette commande et le certificat est refait."],
    ["Autoriser un appareil", "1. Touchez « Autoriser un appareil » : un code à 8 chiffres s'affiche, valable 5 minutes, une seule fois. 2. Sur l'autre appareil, ouvrez dans Chrome l'adresse affichée (elle commence par https). 3. Tapez le code et donnez un nom à l'appareil. Il reste autorisé un an, sans mot de passe à retenir."],
    ["L'avertissement de certificat", "Le serveur crée lui-même son certificat : le navigateur ne le connaît pas et affiche un avertissement à la première visite. Avant de continuer, ouvrez le détail du certificat dans le navigateur et comparez son empreinte SHA-256 avec celle de cette fenêtre : si elles sont identiques, vous parlez bien à votre serveur."],
    ["L'autre appareil n'arrive pas à ouvrir l'adresse", "Il doit être sur le même Wi-Fi que le serveur, et pas sur un réseau invité : beaucoup de box isolent les appareils de ce réseau (option « AP isolé » ou « isolation des clients »). Android 17 et plus : le navigateur doit avoir l'autorisation « Appareils à proximité » (Paramètres > Applications > Chrome > Autorisations) ; sans elle, Chrome dit seulement « Ce site est inaccessible ». Si l'accès réseau est fermé (motif dans cette fenêtre) : Wi-Fi coupé au démarrage (le serveur réessaie seul toutes les 30 s), adresse changée (relancer node scripts/serveur.mjs distant), ou openssl absent (Termux : pkg install openssl-tool)."],
    ["Révoquer", "« Révoquer » (deux appuis) retire aussitôt le droit d'un appareil : perdu, prêté ou remplacé. Pour le remettre, il suffit de l'autoriser de nouveau. Dix appareils au plus."],
    ["Code refusé", "Après 5 codes faux, le code est annulé et il faut attendre 5 minutes avant d'en demander un autre."],
    ["Machine sans écran", "Sur la machine du serveur, en terminal : node scripts/appairage.mjs affiche l'adresse, l'empreinte et un code."],
    ["Application Android Domowa", "Elle trouve le serveur sur le Wi-Fi et affiche son empreinte : comparez-la avec celle de cette fenêtre (groupes 1 et 4), puis entrez le code d'« Autoriser un appareil ». Elle apparaît ici comme les autres appareils autorisés."]
  ];
  let d = null, root = null, body = null, vue = "main", erreur = "", info = "", occupe = false, arme = "", armeT = null, code = null, tic = null, sonde = null, nb0 = 0;

  const date = (iso) => { const t = new Date(iso); return !iso || isNaN(t) ? "jamais" : t.toLocaleDateString("fr-FR") + " " + t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  const empreinte = (e) => { const p = String(e || "").split(":"), r = []; for (let i = 0; i < p.length; i += 8) r.push(p.slice(i, i + 8).join(":")); return r; }; // 4 groupes de 8 octets (2 par ligne sur la tablette, 1 sur le téléphone)
  function stop() { clearInterval(tic); clearInterval(sonde); tic = null; sonde = null; }
  function desarmer() { arme = ""; clearTimeout(armeT); }
  function fermer() { if (!root) return; stop(); desarmer(); document.body.removeChild(root); root = null; body = null; vue = "main"; erreur = ""; info = ""; code = null; }
  function lire(cb) {
    APP.api("GET", "/api/clients", null, (err, r) => { if (err) erreur = err; else if (r) d = r; if (cb) cb(err, r); rendre(); });
  }
  function ouvrir() {
    if (root) return;
    root = el("div", "hb-scrim"); root.id = "caFenetre";
    root.onclick = (e) => { if (e.target === root) fermer(); };
    const panel = el("div", "hb-panel ca-panel"), head = el("div", "hb-head"), ics = el("div", "hb-ics");
    const q = el("button", "hb-ic", "?"), x = el("button", "hb-ic", "×");
    head.appendChild(el("div", "hb-titre", "Appareils autorisés"));
    q.title = "Aide"; q.setAttribute("aria-label", "Aide"); q.onclick = () => { vue = vue === "aide" ? "main" : "aide"; rendre(); };
    x.title = "Fermer"; x.setAttribute("aria-label", "Fermer"); x.onclick = fermer;
    ics.appendChild(q); ics.appendChild(x); head.appendChild(ics);
    body = el("div", "hb-body ca-body");
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    d = null; rendre(); lire();
  }
  function ligne(lib, val, cls) { const l = el("div", "hb-ligne"); l.appendChild(el("span", "hb-lib", lib)); l.appendChild(el("span", "hb-val" + (cls ? " " + cls : ""), val)); return l; }
  function bouton(cls, texte, fn) { const b = el("button", cls, texte); b.onclick = fn; b.disabled = occupe; return b; }

  // Code affiché : compte à rebours chaque seconde, liste relue toutes les 3 s (un appareil de plus : autorisé, retour à la liste)
  function demander() {
    occupe = true; erreur = ""; info = ""; rendre();
    APP.api("POST", "/api/appairage/code", {}, (err, r) => {
      occupe = false;
      if (err || !r || !r.code) { erreur = err || "Réponse inattendue du serveur."; rendre(); return; }
      code = { valeur: r.code, fin: Date.now() + (r.duree || 300) * 1000 }; nb0 = d ? d.clients.length : 0;
      stop();
      tic = setInterval(() => { if (code && Date.now() >= code.fin) { finCode("Le code a expiré : en demander un nouveau.", true); return; } majCompte(); }, 1000);
      sonde = setInterval(() => APP.api("GET", "/api/clients", null, (e2, r2) => {
        if (e2 || !r2 || !code) return;
        d = r2;
        if (r2.clients.length > nb0) { const n = r2.clients[r2.clients.length - 1]; finCode("« " + n.nom + " » est autorisé."); }
        else if (!r2.code) finCode("Le code n'est plus valable (expiré, ou refusé 5 fois) : en demander un nouveau.", true);
      }), 3000);
      rendre();
    });
  }
  function finCode(msg, ko) { stop(); code = null; if (ko) { erreur = msg; info = ""; } else { info = msg; erreur = ""; } rendre(); }
  function majCompte() {
    const c = $("caCompte"); if (!c || !code) return;
    const s = Math.max(0, Math.ceil((code.fin - Date.now()) / 1000));
    c.textContent = "Valable encore " + Math.floor(s / 60) + " min " + (s % 60 < 10 ? "0" : "") + (s % 60) + " s";
  }
  function revoquer(c) {
    occupe = true; erreur = ""; info = ""; rendre();
    APP.api("POST", "/api/clients/" + c.id + "/revoquer", { confirm: true }, (err, r) => {
      occupe = false;
      if (err) erreur = err; else { if (r) d = r; info = "« " + c.nom + " » n'est plus autorisé."; if (c.courant) { window.location.replace("/appairage.html"); return; } }
      rendre();
    });
  }
  function serveur(box) {
    const s = d.serveur, b = el("div", "hb-bloc");
    b.appendChild(ligne("Mode", s.mode === "distant" ? "Distant" : "Local", s.mode === "distant" && s.ecoute ? "ok" : ""));
    if (s.mode === "distant") {
      const a = el("div", "ca-emp");
      a.appendChild(el("div", "hb-lib", "Adresse à ouvrir depuis un autre appareil")); a.appendChild(el("div", "ca-url", s.url || "?"));
      b.appendChild(a);
      if (s.empreinte) {
        const l = el("div", "ca-emp"), e = empreinte(s.empreinte);
        l.appendChild(el("div", "hb-lib", "Empreinte du certificat (SHA-256)"));
        const h = el("div", "ca-hexs"); e.forEach((g) => h.appendChild(el("span", "ca-hex", g))); l.appendChild(h);
        b.appendChild(l);
      }
    }
    box.appendChild(b);
    if (s.mode !== "distant") box.appendChild(el("div", "hb-note", "Seule la machine du serveur ouvre l'application : rien n'est ouvert sur le réseau. Pour l'ouvrir aussi aux autres appareils de la maison : arrêter le serveur puis, en terminal, node scripts/serveur.mjs distant (aide « ? »)."));
    else if (!s.ecoute) box.appendChild(el("div", "hb-err", (s.motif || "L'accès réseau n'est pas ouvert.") + " Si l'adresse du serveur a changé : serveur arrêté, node scripts/serveur.mjs distant."));
    else if (!d.lisible) box.appendChild(el("div", "hb-err", "La liste des appareils autorisés est illisible (donnees/clients.json) : aucun appareil ne peut se connecter."));
  }
  function vueCode(box) {
    const s = el("div", "hb-session ca-code");
    s.appendChild(el("div", "hb-etape", "Code à taper sur l'autre appareil"));
    const v = el("div", "hb-compte ca-chiffres", code.valeur.slice(0, 4) + " " + code.valeur.slice(4)); v.id = "caCode";
    s.appendChild(v);
    const c = el("div", "hb-note", ""); c.id = "caCompte"; s.appendChild(c);
    box.appendChild(s);
    box.appendChild(el("div", "hb-p", "Sur l'autre appareil, ouvrir " + (d.serveur.url || "l'adresse du serveur") + " dans Chrome, vérifier l'empreinte du certificat, puis taper ce code. Il ne sert qu'une fois."));
    box.appendChild(bouton("b-light hb-large", "Terminer", () => finCode("")));
  }
  function liste(box) {
    box.appendChild(el("div", "hb-sec", "Appareils autorisés (" + d.clients.length + " sur " + d.max + ")"));
    const l = el("div", "ca-liste");
    if (!d.clients.length) l.appendChild(el("div", "hb-note", d.serveur.mode === "distant" ? "Aucun appareil autorisé pour l'instant." : "Aucun."));
    d.clients.forEach((c) => {
      const r = el("div", "ca-client"), t = el("div", "ca-txt");
      const n = el("div", "ca-nom"), cle = "r-" + c.id;
      n.appendChild(el("span", "ca-nomt", c.nom));
      if (c.courant) n.appendChild(el("span", "ca-ici", "cet appareil"));
      t.appendChild(n);
      t.appendChild(arme === cle && c.courant ? el("div", "ca-vu ca-avert", "Cet appareil devra être autorisé de nouveau avec un code.") : el("div", "ca-vu", "Dernière visite : " + date(c.vu_le)));
      r.appendChild(t);
      r.appendChild(bouton("ca-rev" + (arme === cle ? " arme" : ""), arme === cle ? "Confirmer" : "Révoquer", () => {
        if (arme !== cle) { arme = cle; clearTimeout(armeT); armeT = setTimeout(() => { arme = ""; rendre(); }, 8000); rendre(); return; }
        desarmer(); revoquer(c);
      }));
      l.appendChild(r);
    });
    box.appendChild(l);
  }
  function rendre() {
    if (!root) return;
    const haut = body.querySelector(".ca-liste"), y = haut ? haut.scrollTop : 0;
    body.innerHTML = "";
    if (vue === "aide") {
      body.appendChild(bouton("b-small hb-retour", "← Retour", () => { vue = "main"; rendre(); }));
      AIDE.forEach((a) => { body.appendChild(el("div", "hb-sec", a[0])); body.appendChild(el("div", "hb-p", a[1])); });
      return;
    }
    if (!d) { body.appendChild(el("div", erreur ? "hb-err" : "hb-note", erreur || "Lecture…")); return; }
    const cols = el("div", "ca-cols"), g = el("div", "ca-col"), dr = el("div", "ca-col ca-droite");
    serveur(g);
    if (d.serveur.mode === "distant" && d.serveur.ecoute && d.lisible) {
      if (code) vueCode(g);
      else g.appendChild(bouton("b-main hb-large", occupe ? "Un instant…" : "Autoriser un appareil", demander));
    }
    if (info) g.appendChild(el("div", "hb-ok", info));
    if (erreur) g.appendChild(el("div", "hb-err", erreur));
    liste(dr);
    cols.appendChild(g); cols.appendChild(dr); body.appendChild(cols);
    const l2 = body.querySelector(".ca-liste"); if (l2) l2.scrollTop = y;
    majCompte();
  }

  APP.clients = { ouvrir: ouvrir };
  const m = $("clientsBtn"); if (m) m.onclick = ouvrir;
})();
// FIN
