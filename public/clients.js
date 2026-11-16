// @zone distant | Fenêtre « Appareils autorisés » (V1.8, préfixe ca-, cadre hb- de hubs.css) : mode du serveur (local ou distant), adresse à ouvrir depuis un autre appareil, empreinte du certificat, « Autoriser un appareil » (code à 8 chiffres et compte à rebours : POST /api/appairage/code), appareils autorisés (GET /api/clients), « Révoquer » en deux appuis (POST /api/clients/:id/revoquer), aide « ? ». V1.9 révision 2 : sur la machine du serveur (serveur.modifiable), vue « mode » : ouvrir aux autres appareils, changer d'adresse, revenir au mode local (POST /api/serveur/mode, deux appuis). APP.clients {ouvrir}.
(function () {
  "use strict";
  const el = APP.el, $ = APP.$;
  const AIDE = [
    ["À quoi sert cette fenêtre ?", "Elle montre si l'application est ouverte aux autres appareils de la maison (mode distant) ou seulement à la machine qui la fait tourner (mode local), et quels appareils ont le droit de s'y connecter."],
    ["Mode local, mode distant", "Mode local : seule la machine du serveur ouvre l'application, rien n'est ouvert sur le réseau. Mode distant : le serveur accepte aussi les appareils du réseau local (Wi-Fi de la maison), en connexion chiffrée (HTTPS), et seulement ceux que vous avez autorisés ici. Rien n'est ouvert vers Internet."],
    ["Ouvrir aux autres appareils", "Sur la machine du serveur (tablette, smartphone ou ordinateur qui le fait tourner) : « Ouvrir aux autres appareils… », choisir l'adresse de cette machine sur le Wi-Fi (proposée si le système la donne ; sinon : Paramètres > Wi-Fi > réseau connecté > Adresse IP), garder le port 8443, puis toucher deux fois le bouton. Pas besoin de redémarrer : l'adresse à ouvrir et l'empreinte s'affichent aussitôt, avec un premier code. Si l'accès ne peut pas s'ouvrir, rien n'est changé et le motif est affiché. Depuis un autre appareil, le mode ne se change pas."],
    ["Changer d'adresse, revenir au mode local", "« Changer… » à côté du mode : une autre adresse ou un autre port (le certificat est refait si l'adresse change : les appareils devront comparer la nouvelle empreinte), ou « Revenir au mode local » (deux appuis) : les autres appareils ne peuvent plus se connecter, mais restent dans la liste et retrouvent l'accès si vous rouvrez à la même adresse. L'adresse du serveur doit être réservée dans la box : si elle change, l'accès se ferme. Machine sans écran : node scripts/serveur.mjs, serveur arrêté."],
    ["Accès réseau fermé, ouverture refusée", "« pas celle de cette machine » : l'adresse n'est pas (ou plus) celle du Wi-Fi de cette machine : Wi-Fi coupé, autre réseau, faute de frappe, ou adresse changée par la box. Au démarrage, le serveur réessaie seul toutes les 30 s ; si l'adresse a changé, « Changer… » avec la nouvelle (et la réserver dans la box). « port déjà pris » : un autre programme utilise ce port ; en choisir un autre (de 1024 à 65535). « certificat » : openssl manque (Termux : pkg install openssl-tool). Un changement refusé ne change rien."],
    ["Réglage du mode refusé", "Adresse refusée : il faut l'adresse privée de cette machine sur le Wi-Fi (exemple 192.168.1.20), pas une adresse Internet. Port refusé : un nombre de 1024 à 65535 (8443 par défaut). « déjà ouvert à cette adresse » ou « déjà réservé à cette machine » : rien à faire. « depuis un autre appareil » : le mode ne se change que sur la machine du serveur (sécurité). « déjà en cours » ou « pas prêt » : attendre un instant et réessayer."],
    ["Écriture impossible", "Le serveur n'a pas pu enregistrer la liste des appareils autorisés (donnees/clients.json) : place insuffisante ou droits du dossier donnees/. Rien n'a été changé. Libérer de la place sur la machine du serveur, puis réessayer ; server.log donne le détail."],
    ["Liste illisible", "Le fichier des appareils autorisés (donnees/clients.json) est illisible : par sécurité, aucun appareil ne peut se connecter et le fichier n'est jamais réécrit. Sur la machine du serveur, serveur arrêté : renommer donnees/clients.json (par exemple en clients.json.ancien), puis redémarrer : la liste repart vide, autorisez de nouveau chaque appareil."],
    ["Autoriser un appareil", "1. Touchez « Autoriser un appareil » : un code à 8 chiffres s'affiche, valable 5 minutes, une seule fois. 2. Sur l'autre appareil, ouvrez dans Chrome l'adresse affichée (elle commence par https). 3. Tapez le code et donnez un nom à l'appareil. Il reste autorisé un an, sans mot de passe à retenir."],
    ["L'avertissement de certificat", "Le serveur crée lui-même son certificat : le navigateur ne le connaît pas et affiche un avertissement à la première visite. Avant de continuer, ouvrez le détail du certificat dans le navigateur et comparez son empreinte SHA-256 avec celle de cette fenêtre : si elles sont identiques, vous parlez bien à votre serveur."],
    ["L'autre appareil n'arrive pas à ouvrir l'adresse", "Il doit être sur le même Wi-Fi que le serveur, et pas sur un réseau invité : beaucoup de box isolent les appareils de ce réseau (option « AP isolé » ou « isolation des clients »). Android 17 et plus : le navigateur doit avoir l'autorisation « Appareils à proximité » (Paramètres > Applications > Chrome > Autorisations) ; sans elle, Chrome dit seulement « Ce site est inaccessible ». Si l'accès réseau est fermé (motif dans cette fenêtre) : Wi-Fi coupé au démarrage (le serveur réessaie seul toutes les 30 s), adresse changée (relancer node scripts/serveur.mjs distant), ou openssl absent (Termux : pkg install openssl-tool)."],
    ["Révoquer", "« Révoquer » (deux appuis) retire aussitôt le droit d'un appareil : perdu, prêté ou remplacé. Pour le remettre, il suffit de l'autoriser de nouveau. Dix appareils au plus."],
    ["Code refusé", "Un code dure 5 minutes et ne sert qu'une fois : passé ce délai, en demander un nouveau. Sur l'autre appareil, recopier les 8 chiffres sans erreur. Après 5 codes faux, le code est annulé et il faut attendre 5 minutes avant d'en demander un autre."],
    ["Machine sans écran", "Sur la machine du serveur, en terminal : node scripts/appairage.mjs affiche l'adresse, l'empreinte et un code."],
    ["Application Android Domowa", "Elle trouve le serveur sur le Wi-Fi et affiche son empreinte : comparez-la avec celle de cette fenêtre (groupes 1 et 4), puis entrez le code d'« Autoriser un appareil ». Elle apparaît ici comme les autres appareils autorisés."]
  ];
  let d = null, root = null, body = null, vue = "main", erreur = "", info = "", occupe = false, arme = "", armeT = null, code = null, tic = null, sonde = null, nb0 = 0;
  let saisie = null, armeCible = "", cible = ""; // cible : rubrique de l'aide à montrer (« Que faire ? ») // vue « mode » : {adresse, port} saisis (le temps de la fenêtre) ; adresse:port de la confirmation en attente

  const date = (iso) => { const t = new Date(iso); return !iso || isNaN(t) ? "jamais" : t.toLocaleDateString("fr-FR") + " " + t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  const empreinte = (e) => { const p = String(e || "").split(":"), r = []; for (let i = 0; i < p.length; i += 8) r.push(p.slice(i, i + 8).join(":")); return r; }; // 4 groupes de 8 octets (2 par ligne sur la tablette, 1 sur le téléphone)
  function stop() { clearInterval(tic); clearInterval(sonde); tic = null; sonde = null; }
  function desarmer() { arme = ""; clearTimeout(armeT); }
  function fermer() { if (!root) return; if (occupe && vue === "mode") return; stop(); desarmer(); document.body.removeChild(root); root = null; body = null; vue = "main"; erreur = ""; info = ""; code = null; saisie = null; }
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
  // V1.9 révision 2 : chaque échec affiché a sa rubrique d'aide (« Que faire ? ») ; messages du serveur : modules/appairage.mjs, core/acces.mjs, core/serveur.mjs
  const RUBRIQUES = [
    [/pas celle de cette machine|port (choisi )?(est )?déjà pris|Ce port est déjà pris|certificat|accès réseau|Accès réseau/i, "Accès réseau fermé, ouverture refusée"],
    [/Code refusé|codes refusés|a expiré|n'est plus valable/, "Code refusé"],
    [/appareils sont déjà autorisés|Appareil inconnu/, "Révoquer"],
    [/illisible/, "Liste illisible"],
    [/écriture impossible|non enregistrée/, "Écriture impossible"],
    [/Mode local : aucun autre appareil/, "Ouvrir aux autres appareils"],
    [/Adresse refusée|Port refusé|déjà ouvert à cette adresse|déjà réservé à cette machine|autre appareil|déjà en cours|pas prêt|Mode inconnu|Confirmation requise|machine du serveur|Rien n'a été changé/, "Réglage du mode refusé"]
  ];
  function rubrique(texte) { const r = RUBRIQUES.find((x) => x[0].test(texte || "")); return r ? r[1] : ""; }
  function echec(box, texte) {
    const e = el("div", "hb-err ca-echec"); e.appendChild(el("span", "ca-echtxt", texte));
    const r = rubrique(texte);
    if (r) { const b = el("button", "b-small ca-quefaire", "Que faire ?"); b.onclick = () => { cible = r; vue = "aide"; rendre(); }; e.appendChild(b); }
    box.appendChild(e);
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
  // V1.9 révision 2 : changement de mode sur la machine du serveur (écoute locale), sans redémarrage ; rien n'est changé si l'accès ne s'ouvre pas.
  function versMode() { desarmer(); erreur = ""; info = ""; vue = "mode"; saisie = null; rendre(); }
  function changerMode(corps, cle) {
    occupe = true; erreur = ""; info = ""; rendre();
    APP.api("POST", "/api/serveur/mode", Object.assign({ confirm: true }, corps), (err, r) => {
      occupe = false;
      if (err || !r) { erreur = err || "Réponse inattendue du serveur."; rendre(); return; }
      d = r; vue = "main"; saisie = null; stop(); code = null;
      if (corps.mode === "local") { info = "Le serveur est de nouveau réservé à cette machine."; rendre(); return; }
      info = "Le serveur est ouvert aux appareils du Wi-Fi de la maison : autorisez chacun avec un code.";
      rendre();
      if (r.serveur.ecoute && r.lisible && !r.clients.length) demander(); // premier code d'office
    });
  }
  function vueMode(box) {
    const s = d.serveur, dist = s.mode === "distant";
    if (!saisie) saisie = { adresse: dist ? (s.url || "").replace(/^https:\/\//, "").replace(/:\d+$/, "") : ((s.adresses || [])[0] || ""), port: String(s.port || 8443) };
    box.appendChild(bouton("b-small hb-retour", "← Retour", () => { desarmer(); vue = "main"; erreur = ""; saisie = null; rendre(); }));
    const cols = el("div", "ca-cols"), g = el("div", "ca-col"), dr = el("div", "ca-col");
    g.appendChild(el("div", "hb-sec", dist ? "Changer l'adresse" : "Ouvrir aux autres appareils"));
    const f = el("div", "hb-bloc");
    (s.adresses || []).forEach((a) => {
      const t = bouton("hb-trouve" + (saisie.adresse === a ? " sel" : ""), "", () => { saisie.adresse = a; desarmer(); rendre(); });
      t.appendChild(el("span", "hb-tadr", a)); t.appendChild(el("span", "hb-tnom", "cette machine"));
      f.appendChild(t);
    });
    f.appendChild(el("label", "hb-lab", "Adresse de cette machine sur le Wi-Fi"));
    const ia = el("input", "hb-in"); ia.id = "caAdr"; ia.type = "text"; ia.setAttribute("inputmode", "decimal"); ia.placeholder = "ex. 192.168.1.20";
    const ip = el("input", "hb-in ca-port"); ip.id = "caPort"; ip.type = "text"; ip.setAttribute("inputmode", "numeric"); ip.placeholder = "8443";
    [ia, ip].forEach((i) => { i.setAttribute("autocomplete", "off"); i.setAttribute("autocapitalize", "off"); i.setAttribute("autocorrect", "off"); i.spellcheck = false; i.disabled = occupe; });
    ia.value = saisie.adresse; ip.value = saisie.port;
    ia.oninput = () => { saisie.adresse = ia.value.trim(); majBouton(); };
    ip.oninput = () => { saisie.port = ip.value.trim(); majBouton(); };
    f.appendChild(ia);
    f.appendChild(el("label", "hb-lab", "Port (8443 par défaut)")); f.appendChild(ip);
    g.appendChild(f);
    const b = bouton("b-main hb-large", "", () => {
      if (occupe) return;
      if (arme !== "ouvrir") { arme = "ouvrir"; armeCible = saisie.adresse + ":" + saisie.port; clearTimeout(armeT); armeT = setTimeout(() => { arme = ""; rendre(); }, 8000); rendre(); return; }
      desarmer(); changerMode({ mode: "distant", adresse: saisie.adresse, port: Number(saisie.port) });
    });
    b.id = "caOuvrir";
    // Bouton suivi pendant la saisie (sans reconstruire les champs) : actif seulement si l'adresse et le port ont la bonne forme ; une saisie désarme.
    function majBouton() {
      if (arme === "ouvrir" && armeCible !== saisie.adresse + ":" + saisie.port) desarmer();
      const valide = /^(\d{1,3}\.){3}\d{1,3}$/.test(saisie.adresse) && /^\d{4,5}$/.test(saisie.port);
      b.classList.toggle("ca-arme", arme === "ouvrir");
      if (occupe) { b.disabled = false; b.setAttribute("aria-busy", "true"); b.innerHTML = '<span class="b-anneau" aria-hidden="true"></span><span>Chargement…</span>'; return; }
      b.removeAttribute("aria-busy");
      b.textContent = arme === "ouvrir" ? "Confirmer : " + saisie.adresse + " · port " + saisie.port : (dist ? "Changer d'adresse" : "Ouvrir aux autres appareils");
      b.disabled = !valide;
    }
    majBouton();
    g.appendChild(b);
    if (erreur) echec(g, erreur);
    dr.appendChild(el("div", "hb-sec", "Bon à savoir"));
    dr.appendChild(el("div", "hb-p", "Les appareils du Wi-Fi de la maison pourront ouvrir l'application, en connexion chiffrée, une fois autorisés par un code. Rien n'est ouvert vers Internet."));
    dr.appendChild(el("div", "hb-note", (s.adresses && s.adresses.length ? "" : "Cette machine ne donne pas son adresse : lisez-la dans Paramètres > Wi-Fi > réseau connecté > Adresse IP. ") + "Réservez cette adresse pour cette machine dans la box : si elle change, l'accès se ferme."));
    if (dist) {
      dr.appendChild(el("div", "hb-sec", "Réserver à cette machine"));
      dr.appendChild(el("div", "hb-note", "Les autres appareils ne pourront plus se connecter ; ils restent dans la liste."));
      dr.appendChild(bouton("hb-deco" + (arme === "local" ? " arme" : ""), arme === "local" ? "Confirmer le retour au mode local" : "Revenir au mode local", () => {
        if (arme !== "local") { arme = "local"; clearTimeout(armeT); armeT = setTimeout(() => { arme = ""; rendre(); }, 8000); rendre(); return; }
        desarmer(); changerMode({ mode: "local" });
      }));
    }
    cols.appendChild(g); cols.appendChild(dr); box.appendChild(cols);
  }
  function serveur(box) {
    const s = d.serveur, b = el("div", "hb-bloc");
    const lm = ligne("Mode", s.mode === "distant" ? "Distant" : "Local", s.mode === "distant" && s.ecoute ? "ok" : "");
    if (s.modifiable && s.mode === "distant") { lm.classList.add("ca-lmode"); lm.appendChild(bouton("b-small ca-chg", "Changer…", versMode)); }
    b.appendChild(lm);
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
    if (s.mode !== "distant") {
      box.appendChild(el("div", "hb-note", "Seule la machine du serveur ouvre l'application : rien n'est ouvert sur le réseau."));
      if (s.modifiable) box.appendChild(bouton("b-main hb-large", "Ouvrir aux autres appareils…", versMode));
    }
    else if (!s.ecoute) echec(box, (s.motif || "L'accès réseau n'est pas ouvert.") + (s.modifiable ? " Si l'adresse de cette machine a changé : « Changer… »." : " Le mode se règle sur la machine du serveur."));
    else if (!d.lisible) echec(box, "La liste des appareils autorisés est illisible (donnees/clients.json) : aucun appareil ne peut se connecter.");
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
      AIDE.forEach((a) => { const s = el("div", "hb-sec" + (a[0] === cible ? " ca-cible" : ""), a[0]); body.appendChild(s); body.appendChild(el("div", "hb-p" + (a[0] === cible ? " ca-cible" : ""), a[1])); });
      const c = body.querySelector(".hb-sec.ca-cible"); if (c && c.scrollIntoView) c.scrollIntoView({ block: "start" });
      cible = "";
      return;
    }
    if (!d) { body.appendChild(el("div", erreur ? "hb-err" : "hb-note", erreur || "Lecture…")); return; }
    if (vue === "mode" && d.serveur.modifiable) { vueMode(body); return; }
    const cols = el("div", "ca-cols"), g = el("div", "ca-col"), dr = el("div", "ca-col ca-droite");
    serveur(g);
    if (d.serveur.mode === "distant" && d.serveur.ecoute && d.lisible) {
      if (code) vueCode(g);
      else g.appendChild(bouton("b-main hb-large", occupe ? "Un instant…" : "Autoriser un appareil", demander));
    }
    if (info) g.appendChild(el("div", "hb-ok", info));
    if (erreur) echec(g, erreur);
    liste(dr);
    cols.appendChild(g); cols.appendChild(dr); body.appendChild(cols);
    const l2 = body.querySelector(".ca-liste"); if (l2) l2.scrollTop = y;
    majCompte();
  }

  APP.clients = { ouvrir: ouvrir, rubrique: rubrique, rubriques: () => AIDE.map((a) => a[0]) }; // rubrique, rubriques : essais (chaque échec a sa rubrique)
  const m = $("clientsBtn"); if (m) m.onclick = ouvrir;
})();
// FIN
