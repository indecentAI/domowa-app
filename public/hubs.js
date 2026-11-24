// @zone hubs | Fenêtre « Hubs » (préfixe hb-), ouverte en touchant l'état de l'en-tête (#status) : hubs déclarés par les adaptateurs (GET /api/hubs), recherche sur le réseau, appairage guidé (étapes et compte à rebours du serveur), changer de hub, reconnecter, déconnecter (confirmation), aide « ? » (générale + aide de chaque type). Aucune marque : tout vient du serveur. APP.hubs {ouvrir}.
(function () {
  const el = APP.el;
  let root = null, body = null, vue = "main", etat = null, session = null, form = null, trouves = null, cherche = false, erreur = "", info = "", occupe = false;
  let arme = null, armeT = null, relecture = null, suivi = null, tic = null, valeurs = {}, equip = [], distantEq = false;
  // form : {type, hub?, auto?, pour?} (auto, V2.0 : connexion transparente, type trouvé par la recherche ou par /api/hubs/identifier ; pour : adresse dont le type est connu) ; valeurs : champs non secrets saisis (le temps de la fenêtre) ; un champ secret n'est jamais gardé.

  // Commande du widget du hub (rechercher, installer, identifier) : équipement relu, fenêtre relue
  if (APP.cartes) APP.cartes.surEquipement(() => { if (root && vue === "main") charger(); });
  function charger() {
    APP.api("GET", "/api/hubs", null, (err, d) => {
      if (!err && d) etat = d; else if (err) erreur = err;
      if (root && vue === "main") rendre();
    });
    // V2.1 : équipement du hub connecté (famille « hub », vue Équipements) : même widget que la configuration du hub (APP.cartes.hub)
    APP.api("GET", "/api/equipements", null, (err, d) => {
      if (err || !d || !Array.isArray(d.equipements)) return;
      equip = d.equipements.filter((e) => e.famille === "hub" && !e.absent); distantEq = !!d.distant || APP.distant;
      if (root && vue === "main" && !occupe) rendre();
    });
  }
  function poster(url, corps, ok) {
    if (occupe) return;
    occupe = true; erreur = ""; info = ""; rendre();
    APP.api("POST", url, corps, (err, d) => {
      occupe = false;
      if (err) { erreur = err; rendre(); return; }
      ok(d);
      rendre();
    });
  }
  const typeDe = (t) => (etat && etat.types.find((x) => x.type === t)) || null;
  function ligne(box, lib, val, cls) {
    const r = el("div", "hb-ligne");
    r.appendChild(el("span", "hb-lib", lib));
    r.appendChild(el("span", "hb-val" + (cls ? " " + cls : ""), val));
    box.appendChild(r);
  }
  function bouton(cls, texte, fn) { const b = el("button", cls, texte); b.onclick = fn; b.disabled = occupe; return b; }
  const TEXTE_ETAT = { connecte: ["Connecté", "ok"], deconnecte: ["Déconnecté", "ko"], erreur: ["Erreur", "ko"] };

  // ---------- session d'appairage (GET /api/hubs/appairage toutes les secondes tant qu'elle dure) ----------
  function suivre() {
    clearTimeout(suivi);
    APP.api("GET", "/api/hubs/appairage", null, (err, d) => {
      if (!root) return;
      const s = !err && d ? d.session : null;
      if (s && s.etat === "en_cours") { session = s; vue = "session"; rendre(); suivi = setTimeout(suivre, 1000); return; }
      if (vue !== "session") return;
      session = null;
      if (s && s.etat === "reussi") {
        form = null; trouves = null; vue = "main"; valeurs = {};
        info = s.message || "Hub connecté."; // pas de bandeau : l'actualisation qui suit retire les bandeaux d'erreur
        charger(); APP.refresh();
      } else {
        erreur = (s && s.message) || err || "Appairage interrompu.";
        vue = form ? "form" : "main";
        if (vue === "main") charger();
      }
      rendre();
    });
  }
  function appairer(t, champs) {
    poster("/api/hubs/appairage", { type: t.type, champs: champs }, (d) => {
      session = d.session; vue = "session";
      clearTimeout(suivi); suivi = setTimeout(suivre, 500);
    });
  }
  // Reconnecter : directement si le type ne demande qu'une adresse (celle du hub), sinon le formulaire prérempli.
  function reconnecter(t, h) {
    const seuleAdresse = t.champs.every((c) => c.type === "adresse");
    if (seuleAdresse) {
      const ch = {};
      t.champs.forEach((c) => { ch[c.cle] = h.adresse || ""; });
      form = null; erreur = ""; // echec ou annulation : retour a la vue principale, message affiche
      appairer(t, ch);
      return;
    }
    ouvrirForm(t, h);
    t.champs.forEach((c) => { if (c.type === "adresse") valeurs[c.cle] = h.adresse || ""; });
    rendre();
  }
  function ouvrirAuto() { form = { type: null, hub: null, auto: true, pour: null }; trouves = null; erreur = ""; info = ""; valeurs = {}; vue = "form"; rendre(); }
  // Résultat de recherche touché : adresse reprise ; en connexion transparente, son type devient celui du formulaire (champs propres affichés).
  function choisir(r) {
    valeurs.adresse = r.adresse;
    if (form.auto && r.type && typeDe(r.type)) { form.type = r.type; form.pour = r.adresse; }
    form.liste = false; // liste repliée sur le hub choisi (tient sans défilement avec les champs du type) ; le toucher la rouvre
    rendre();
  }
  function ouvrirForm(t, h) { form = { type: t.type, hub: h ? h.id : null }; trouves = null; erreur = ""; info = ""; valeurs = {}; vue = "form"; rendre(); }

  // ---------- vues ----------
  function rendreMain() {
    const box = el("div", "");
    if (!etat) { box.appendChild(el("div", "hb-note", "Chargement…")); return box; }
    if (!etat.types.length) box.appendChild(el("div", "hb-note", "Aucun type de hub n'est déclaré par le serveur."));
    // V2.0 : aucun type de hub affiché ; un type bloqué (un autre hub est utilisé, un hub à la fois) est masqué en entier.
    // Repli : si tous les types sont bloqués (deux jetons laissés par une version de travail), tous restent montrés, Déconnecter seul proposé.
    const libres = etat.types.filter((t) => !t.bloque);
    (libres.length ? libres : etat.types).forEach((t) => {
      if (t.panne) box.appendChild(el("div", "hb-err", "Lecture impossible : " + t.panne));
      etat.hubs.filter((h) => h.type === t.type).forEach((h) => {
        const b = el("div", "hb-bloc"), x = TEXTE_ETAT[h.etat] || TEXTE_ETAT.erreur;
        ligne(b, "État", x[0], x[1]);
        if (h.adresse) ligne(b, "Adresse", h.adresse);
        if (h.motif) b.appendChild(el("div", "hb-motif", h.motif));
        const r = el("div", "hb-rang");
        if (h.etat !== "connecte" && t.champs && !t.bloque) r.appendChild(bouton("b-main", "Reconnecter", () => reconnecter(t, h)));
        if (t.champs && !t.bloque) r.appendChild(bouton("b-small", "Changer de hub", () => ouvrirForm(t, h)));
        if (r.childNodes.length) b.appendChild(r);
        if (h.etat !== "deconnecte") {
          const conf = arme === h.id;
          b.appendChild(bouton("hb-deco" + (conf ? " arme" : ""), conf ? "Confirmer la déconnexion" : "Déconnecter", () => {
            if (!conf) { arme = h.id; clearTimeout(armeT); armeT = setTimeout(() => { arme = null; if (root) rendre(); }, 5000); rendre(); return; }
            arme = null; clearTimeout(armeT);
            poster("/api/hubs/" + encodeURIComponent(h.id) + "/deconnexion", { confirm: true }, (d) => { etat = d; info = "Hub déconnecté."; APP.refresh(); });
          }));
        }
        box.appendChild(b);
        // Hub connecté : logiciel, soleil et heure, localisation, code d'appairage, options (widget commun de equipements-cartes.js ; équipement de cet adaptateur)
        const eq = h.etat === "connecte" && APP.cartes ? equip.filter((e) => String(e.id).split(":")[0] === t.type)[0] : null;
        if (eq) { const w = el("div", "eq-cartes hb-equip"); APP.cartes.hub(eq, w, () => { if (root && vue === "main") rendre(); }, distantEq); if (w.childNodes.length) box.appendChild(w); }
      });
    });
    // V2.0 : un seul bouton, quel que soit le nombre de types ; le type est trouvé à la connexion (priorité déclarée par le serveur).
    if (libres.some((t) => t.champs && t.nb < t.max)) box.appendChild(bouton("b-main hb-large", "Connecter un hub", ouvrirAuto));
    return box;
  }
  function rendreForm() {
    const t = form.type ? typeDe(form.type) : null, box = el("div", "");
    box.appendChild(bouton("b-small hb-retour", "← Retour", () => { form = null; trouves = null; erreur = ""; vue = "main"; rendre(); }));
    if (form.type && (!t || !t.champs)) { box.appendChild(el("div", "hb-note", "Ce type de hub n'est plus disponible.")); return box; }
    box.appendChild(el("div", "hb-sec", form.hub ? "Changer de hub" : "Connecter un hub"));
    const f = el("div", "hb-bloc");
    const peutChercher = form.auto ? etat.types.some((x) => !x.bloque && x.recherche && x.champs) : t.recherche;
    if (peutChercher) {
      f.appendChild(bouton("b-light hb-large", cherche ? "Recherche… (5 secondes)" : "Rechercher sur le réseau", () => {
        if (cherche) return;
        cherche = true; trouves = null; erreur = ""; rendre();
        APP.api("POST", "/api/hubs/recherche", form.auto ? {} : { type: t.type }, (err, d) => {
          cherche = false;
          if (err) erreur = err; else trouves = d.resultats;
          if (root && vue === "form") { if (form.auto && trouves && trouves.length) choisir(trouves[0]); else rendre(); } // le premier = le plus prioritaire
        });
      }));
      if (trouves && !trouves.length) f.appendChild(el("div", "hb-note", "Aucun hub trouvé. Tapez son adresse ci-dessous."));
      const replie = form.auto && form.pour && !form.liste && (trouves || []).length > 1 && trouves.some((r) => r.adresse === form.pour);
      (trouves || []).filter((r) => !replie || r.adresse === form.pour).forEach((r) => {
        const b = bouton("hb-trouve" + (valeurs.adresse === r.adresse ? " sel" : ""), "", () => { if (replie) { form.liste = true; rendre(); } else choisir(r); });
        b.appendChild(el("span", "hb-tadr", r.adresse));
        b.appendChild(el("span", "hb-tnom", (r.nom || "") + (r.connu ? " (actuel)" : "") + (replie ? " · " + (trouves.length - 1) + " autre(s)" : "")));
        f.appendChild(b);
      });
    }
    const entrees = [];
    // Connexion transparente sans type connu : l'adresse seule ; les champs propres au type (port, jeton…) paraissent quand il est trouvé.
    const champs = t ? t.champs : [{ cle: "adresse", libelle: "Adresse du hub", type: "adresse" }];
    // Champ court (V2.0, ex. port) : posé à droite du champ précédent (.hb-duo), pour que le formulaire tienne sans défilement.
    let duo = null;
    champs.forEach((c, k) => {
      let dest = f;
      if (!c.court && champs[k + 1] && champs[k + 1].court) { duo = el("div", "hb-duo"); f.appendChild(duo); }
      if (duo) { dest = el("div", ""); duo.appendChild(dest); if (c.court) duo = null; }
      dest.appendChild(el("label", "hb-lab", c.libelle));
      const i = el("input", "hb-in");
      i.type = c.type === "secret" ? "password" : "text";
      if (c.type === "adresse") { i.setAttribute("inputmode", "decimal"); i.placeholder = "ex. 192.168.1.20"; }
      i.setAttribute("autocomplete", "off"); i.setAttribute("autocapitalize", "off"); i.setAttribute("autocorrect", "off"); i.spellcheck = false;
      i.id = "hbChamp-" + c.cle;
      if (c.type !== "secret") { i.value = valeurs[c.cle] || ""; i.oninput = () => { valeurs[c.cle] = i.value; }; }
      dest.appendChild(i);
      entrees.push([c, i]);
    });
    if (form.hub) f.appendChild(el("div", "hb-note", "Le hub actuel reste utilisé si l'appairage échoue ou est annulé."));
    if (info) f.appendChild(el("div", "hb-note", info)); // V2.0 : « Complétez les champs… » (connexion transparente)
    const r = el("div", "hb-rang");
    r.appendChild(bouton("b-main", "Connecter", () => {
      const ch = {};
      entrees.forEach((e) => { ch[e[0].cle] = e[1].value.trim(); if (e[0].type === "secret") e[1].value = ""; });
      const adr = (entrees.find((e) => e[0].type === "adresse") || [{}, { value: "" }])[1].value.trim();
      if (!form.auto || (t && form.pour === adr)) { appairer(t, ch); return; }
      // Connexion transparente, adresse tapée : le serveur dit quel type répond ; s'il demande d'autres champs (port, jeton…), ils paraissent, sinon l'appairage part.
      const vu = (trouves || []).find((x) => x.adresse === adr && x.type);
      const suite = (type) => {
        const u = typeDe(type);
        if (!u || !u.champs) { erreur = "Ce type de hub n'est plus disponible."; return; }
        form.type = u.type; form.pour = adr; valeurs.adresse = adr;
        const ch2 = {}; u.champs.forEach((c) => { if (ch[c.cle] !== undefined) ch2[c.cle] = ch[c.cle]; });
        if (u.champs.every((c) => c.type === "adresse" || ch2[c.cle] || c.court)) { appairer(u, ch2); return; }
        info = "Complétez les champs, puis Connecter.";
      };
      if (vu) { suite(vu.type); rendre(); return; }
      poster("/api/hubs/identifier", { adresse: adr }, (d) => suite(d.type));
    }));
    r.appendChild(bouton("b-small", "Annuler", () => { form = null; trouves = null; erreur = ""; vue = "main"; rendre(); }));
    f.appendChild(r);
    box.appendChild(f);
    return box;
  }
  function rendreSession() {
    const box = el("div", ""), s = session || {}, e = s.etape;
    box.appendChild(el("div", "hb-sec", "Appairage"));
    const f = el("div", "hb-bloc hb-session");
    f.appendChild(el("div", "hb-etape", e ? e.texte : "Préparation…"));
    if (e && e.fin) {
      const n = el("div", "hb-compte"), barre = el("div", "hb-barre"), p = el("div", "hb-prog");
      barre.appendChild(p); f.appendChild(n); f.appendChild(barre);
      const maj = () => {
        const reste = Math.max(0, Math.ceil((Date.parse(e.fin) - Date.now()) / 1000));
        n.textContent = reste + " s";
        p.style.width = Math.min(100, (reste / (e.delai || 60)) * 100) + "%";
      };
      maj(); clearInterval(tic); tic = setInterval(() => { if (!root || vue !== "session") { clearInterval(tic); return; } maj(); }, 250);
    }
    f.appendChild(bouton("b-small hb-large", "Annuler", () => {
      APP.api("POST", "/api/hubs/appairage/annuler", {}, (err, d) => {
        clearTimeout(suivi); session = null;
        erreur = err || (d && d.session && d.session.message) || "Appairage annulé.";
        vue = form ? "form" : "main"; rendre();
        if (vue === "main") charger();
      });
    }));
    box.appendChild(f);
    return box;
  }
  const AIDE = [
    { titre: "Hubs", lignes: [
      "Cette fenêtre s'ouvre en touchant l'état, en haut de l'écran (« Connecté » ou « Hors ligne »).",
      APP.lieu("Elle montre chaque hub connu de cet appareil et son état, et permet de le connecter, de le reconnecter, d'en changer ou de le déconnecter."),
      "La connexion d'un hub suit les étapes affichées (par exemple, appuyer sur un bouton du hub pendant un compte à rebours). Annuler est possible à tout moment.",
      "Un seul hub à la fois : tant qu'un hub est connecté (ou en erreur), aucun autre ne peut être connecté (seul le hub utilisé est montré). Déconnectez-le d'abord.",
      "« Connecter un hub » trouve seul le type du hub : la recherche choisit d'office le hub trouvé (le prioritaire s'il y en a plusieurs) ; une adresse tapée est reconnue à la connexion.",
      "Hub connecté : son logiciel (à jour ou mise à jour disponible), le prochain coucher et lever du soleil, le fuseau, la localisation en texte (à l'écran seulement) et le code d'appairage (« Afficher », puis un second appui ; effacé après 30 secondes ou à la fermeture), comme dans la vue Équipements. Rechercher une mise à jour ; Installer en deux appuis (le hub redémarre : ne pas le débrancher) ; Identifier.",
    ] },
  ];
  function rendreAide() {
    const box = el("div", "");
    box.appendChild(bouton("b-small hb-retour", "← Retour", () => { vue = form ? "form" : "main"; rendre(); }));
    const secs = AIDE.concat(...((etat && etat.types) || []).map((t) => t.aide || []));
    secs.forEach((s) => {
      box.appendChild(el("div", "hb-sec", s.titre));
      const b = el("div", "hb-bloc");
      s.lignes.forEach((l) => b.appendChild(el("p", "hb-p", APP.lieu(l)))); // V1.8 : « cet appareil » -> « le serveur » depuis un autre appareil
      box.appendChild(b);
    });
    return box;
  }
  function rendre() {
    if (!root) return;
    if (vue !== "session") clearInterval(tic);
    body.innerHTML = "";
    body.appendChild(vue === "aide" ? rendreAide() : vue === "form" ? rendreForm() : vue === "session" ? rendreSession() : rendreMain());
    if (info && vue === "main") body.appendChild(el("div", "hb-ok", info));
    if (erreur && vue !== "aide") body.appendChild(el("div", "hb-err", erreur));
  }
  function fermer() {
    if (!root) return;
    clearTimeout(armeT); clearTimeout(suivi); clearInterval(relecture); clearInterval(tic);
    arme = null; erreur = ""; info = ""; form = null; trouves = null; valeurs = {}; session = null; vue = "main";
    document.body.removeChild(root); root = null; body = null;
    if (APP.cartes) APP.cartes.effacerCode(); // code d'appairage jamais gardé à la fermeture
  }
  function icone(texte, titre, fn) { const b = el("button", "hb-ic", texte); b.title = titre; b.setAttribute("aria-label", titre); b.onclick = fn; return b; }
  // Ouverture : relit les hubs et reprend une session en cours (fenêtre refermée pendant un appairage) ; relue toutes les 15 s (vue principale).
  function ouvrir() {
    if (root) return;
    root = el("div", "hb-scrim");
    root.id = "hubsFenetre";
    root.onclick = (e) => { if (e.target === root && vue !== "session") fermer(); };
    const panel = el("div", "hb-panel"), head = el("div", "hb-head"), ics = el("div", "hb-ics");
    head.appendChild(el("div", "hb-titre", "Hubs"));
    ics.appendChild(icone("?", "Aide", () => { vue = vue === "aide" ? (form ? "form" : "main") : "aide"; rendre(); }));
    ics.appendChild(icone("×", "Fermer", fermer));
    head.appendChild(ics);
    body = el("div", "hb-body");
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    vue = "main"; rendre();
    charger();
    suivre();
    relecture = setInterval(() => { if (root && vue === "main" && !occupe) charger(); }, 15000);
  }
  const st = APP.$("status");
  st.setAttribute("role", "button");
  st.title = "Hubs : état et connexion";
  st.onclick = ouvrir;
  st.tabIndex = 0; // V1.6 : focus au clavier, Entrée ou Espace ouvrent la fenêtre comme un appui
  st.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); } };
  APP.hubs = { ouvrir: ouvrir };
})();
// FIN
