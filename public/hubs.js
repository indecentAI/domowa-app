// @zone hubs | Fenêtre « Hubs » (préfixe hb-), ouverte en touchant l'état de l'en-tête (#status) : hubs déclarés par les adaptateurs (GET /api/hubs), recherche sur le réseau, appairage guidé (étapes et compte à rebours du serveur), changer de hub, reconnecter, déconnecter (confirmation), aide « ? » (générale + aide de chaque type). Aucune marque : tout vient du serveur. APP.hubs {ouvrir}.
(function () {
  const el = APP.el;
  let root = null, body = null, vue = "main", etat = null, session = null, form = null, trouves = null, cherche = false, erreur = "", info = "", occupe = false;
  let arme = null, armeT = null, relecture = null, suivi = null, tic = null, valeurs = {};
  // form : {type, hub?} ; valeurs : champs non secrets saisis (le temps de la fenêtre) ; un champ secret n'est jamais gardé.

  function charger() {
    APP.api("GET", "/api/hubs", null, (err, d) => {
      if (!err && d) etat = d; else if (err) erreur = err;
      if (root && vue === "main") rendre();
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
  function ouvrirForm(t, h) { form = { type: t.type, hub: h ? h.id : null }; trouves = null; erreur = ""; info = ""; valeurs = {}; vue = "form"; rendre(); }

  // ---------- vues ----------
  function rendreMain() {
    const box = el("div", "");
    if (!etat) { box.appendChild(el("div", "hb-note", "Chargement…")); return box; }
    if (!etat.types.length) box.appendChild(el("div", "hb-note", "Aucun type de hub n'est déclaré par le serveur."));
    etat.types.forEach((t) => {
      box.appendChild(el("div", "hb-sec", t.nom));
      if (t.panne) box.appendChild(el("div", "hb-err", "Lecture impossible : " + t.panne));
      etat.hubs.filter((h) => h.type === t.type).forEach((h) => {
        const b = el("div", "hb-bloc"), x = TEXTE_ETAT[h.etat] || TEXTE_ETAT.erreur;
        ligne(b, "Hub", h.nom);
        ligne(b, "État", x[0], x[1]);
        if (h.adresse) ligne(b, "Adresse", h.adresse);
        if (h.motif) b.appendChild(el("div", "hb-motif", h.motif));
        const r = el("div", "hb-rang");
        if (h.etat !== "connecte" && t.champs) r.appendChild(bouton("b-main", "Reconnecter", () => reconnecter(t, h)));
        if (t.champs) r.appendChild(bouton("b-small", "Changer de hub", () => ouvrirForm(t, h)));
        b.appendChild(r);
        if (h.etat !== "deconnecte") {
          const conf = arme === h.id;
          b.appendChild(bouton("hb-deco" + (conf ? " arme" : ""), conf ? "Confirmer la déconnexion" : "Déconnecter", () => {
            if (!conf) { arme = h.id; clearTimeout(armeT); armeT = setTimeout(() => { arme = null; if (root) rendre(); }, 5000); rendre(); return; }
            arme = null; clearTimeout(armeT);
            poster("/api/hubs/" + encodeURIComponent(h.id) + "/deconnexion", { confirm: true }, (d) => { etat = d; info = "Hub déconnecté."; APP.refresh(); });
          }));
        }
        box.appendChild(b);
      });
      if (t.champs && t.nb < t.max) box.appendChild(bouton("b-main hb-large", "Connecter un hub", () => ouvrirForm(t, null)));
    });
    return box;
  }
  function rendreForm() {
    const t = typeDe(form.type), box = el("div", "");
    box.appendChild(bouton("b-small hb-retour", "← Retour", () => { form = null; trouves = null; erreur = ""; vue = "main"; rendre(); }));
    if (!t || !t.champs) { box.appendChild(el("div", "hb-note", "Ce type de hub n'est plus disponible.")); return box; }
    box.appendChild(el("div", "hb-sec", (form.hub ? "Changer de hub" : "Connecter un hub") + " : " + t.nom));
    const f = el("div", "hb-bloc");
    if (t.recherche) {
      f.appendChild(bouton("b-light hb-large", cherche ? "Recherche… (5 secondes)" : "Rechercher sur le réseau", () => {
        if (cherche) return;
        cherche = true; trouves = null; erreur = ""; rendre();
        APP.api("POST", "/api/hubs/recherche", { type: t.type }, (err, d) => {
          cherche = false;
          if (err) erreur = err; else trouves = d.resultats;
          if (root && vue === "form") rendre();
        });
      }));
      if (trouves && !trouves.length) f.appendChild(el("div", "hb-note", "Aucun hub trouvé. Tapez son adresse ci-dessous."));
      (trouves || []).forEach((r) => {
        const cle = (t.champs.find((c) => c.type === "adresse") || {}).cle;
        const b = bouton("hb-trouve" + (cle && valeurs[cle] === r.adresse ? " sel" : ""), "", () => { if (cle) valeurs[cle] = r.adresse; rendre(); });
        b.appendChild(el("span", "hb-tadr", r.adresse));
        b.appendChild(el("span", "hb-tnom", (r.nom || "") + (r.connu ? " (actuel)" : "")));
        f.appendChild(b);
      });
    }
    const entrees = [];
    t.champs.forEach((c) => {
      f.appendChild(el("label", "hb-lab", c.libelle));
      const i = el("input", "hb-in");
      i.type = c.type === "secret" ? "password" : "text";
      if (c.type === "adresse") { i.setAttribute("inputmode", "decimal"); i.placeholder = "ex. 192.168.1.20"; }
      i.setAttribute("autocomplete", "off"); i.setAttribute("autocapitalize", "off"); i.setAttribute("autocorrect", "off"); i.spellcheck = false;
      i.id = "hbChamp-" + c.cle;
      if (c.type !== "secret") { i.value = valeurs[c.cle] || ""; i.oninput = () => { valeurs[c.cle] = i.value; }; }
      f.appendChild(i);
      entrees.push([c, i]);
    });
    if (form.hub) f.appendChild(el("div", "hb-note", "Le hub actuel reste utilisé si l'appairage échoue ou est annulé."));
    const r = el("div", "hb-rang");
    r.appendChild(bouton("b-main", "Connecter", () => {
      const ch = {};
      entrees.forEach((e) => { ch[e[0].cle] = e[1].value.trim(); if (e[0].type === "secret") e[1].value = ""; });
      appairer(t, ch);
    }));
    r.appendChild(bouton("b-small", "Annuler", () => { form = null; trouves = null; erreur = ""; vue = "main"; rendre(); }));
    f.appendChild(r);
    box.appendChild(f);
    return box;
  }
  function rendreSession() {
    const box = el("div", ""), s = session || {}, e = s.etape;
    const t = typeDe(s.type);
    box.appendChild(el("div", "hb-sec", "Appairage" + (t ? " : " + t.nom : "")));
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
      "Cette fenêtre s'ouvre en touchant l'état, en haut de l'écran (« Hub connecté » ou « Hors ligne »).",
      APP.lieu("Elle montre chaque hub connu de cet appareil et son état, et permet de le connecter, de le reconnecter, d'en changer ou de le déconnecter."),
      "La connexion d'un hub suit les étapes affichées (par exemple, appuyer sur un bouton du hub pendant un compte à rebours). Annuler est possible à tout moment.",
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
