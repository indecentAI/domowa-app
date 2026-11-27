// @zone telephone | Version smartphone (V1.6, classe « tel » posée par version.js ; inactif sur tablette) : barre d'onglets #onglets (portrait : en bas ; paysage : rail à gauche avec Tout OFF), écran « Appareils » (#viewAppareils : Tous les appareils et catégories), écran « Plus » (#viewPlus : Pièces, Nouvelle pièce, caméras, hubs, compte SmartThings, Mise à jour, Appareils autorisés, Réglages de l'application (APK), Organiser l'accueil, actualiser, plein écran, affichage) ; feuille de réglages (APP.telFeuille : #panel monté du bas en portrait, voile .tf-voile) ; crochet APP.surVue 5 (vues appareils et plus, onglet actif) ; crochet de rendu 25 (liste des catégories, titre).
(function () {
  const $ = APP.$, el = APP.el;
  if (!APP.tel) return;
  const SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
  const ONGLETS = [
    { cle: "home", nom: "Accueil", ic: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>', aller: () => APP.nav.home() },
    { cle: "appareils", nom: "Appareils", ic: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>', aller: () => APP.nav.vue("appareils") },
    { cle: "scenes", nom: "Scénarios", ic: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', aller: () => APP.nav.scenes() },
    { cle: "animations", nom: "Animations", ic: '<path d="M4 12c2-6 4-6 6 0s4 6 6 0 3-5 4-3"/>', aller: () => APP.nav.vue("animations") },
    { cle: "plus", nom: "Plus", ic: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', aller: () => APP.nav.vue("plus") }
  ];
  // Onglet actif d'après la vue : une pièce ouverte depuis l'accueil reste sous « Accueil », une vue à plat ou une catégorie sous « Appareils »
  function actif() {
    const v = APP.view || "home";
    if (v === "home" || v === "scenes" || v === "animations" || v === "plus") return v;
    if (v === "lights" && APP.room !== "all") return "home";
    return "appareils";
  }
  const nav = $("onglets"), boutons = {};
  ONGLETS.forEach((o) => {
    const b = el("button", "onglet", "");
    b.innerHTML = SVG + o.ic + "</svg>";
    b.appendChild(el("span", "", o.nom));
    b.setAttribute("aria-label", o.nom);
    b.onclick = () => { if (APP.fermerDessus) APP.fermerDessus(); o.aller(); };
    boutons[o.cle] = b; nav.appendChild(b);
  });
  // Paysage : Tout OFF en bas du rail (l'en-tête est masqué) ; même action que le bouton de l'en-tête
  const off = el("button", "onglet tf-off b-warn", "");
  off.id = "alloffRail"; off.textContent = "Tout OFF";
  off.onclick = () => $("alloff").click();
  nav.appendChild(off);
  function majOnglets() {
    const a = actif();
    Object.keys(boutons).forEach((k) => { if (k === a) boutons[k].setAttribute("aria-current", "page"); else boutons[k].removeAttribute("aria-current"); });
  }

  // Écran « Appareils » : tous les appareils, puis les catégories (lumières, prises, puis catégories à vue propre : électroménager, familles SmartThings)
  const ligne = (texte, nb, fn, cls) => {
    const b = el("button", "tf-ligne" + (cls ? " " + cls : ""), "");
    b.appendChild(el("span", "tf-nom", texte));
    if (nb !== null && nb !== undefined) b.appendChild(el("span", "tf-nb", String(nb)));
    b.onclick = fn; return b;
  };
  function rendreAppareils() {
    const box = $("viewAppareils"), md = APP.nav.model();
    box.replaceChildren();
    const l = el("div", "tf-liste");
    l.appendChild(ligne("Tous les appareils", md.total, () => APP.nav.list("all", null)));
    if (md.cats.length || md.ext.length) l.appendChild(el("div", "tf-sec", "Catégories"));
    md.cats.forEach((c) => l.appendChild(ligne(c.label, c.count, () => APP.nav.list("all", c.key))));
    md.ext.forEach((c) => l.appendChild(ligne(c.label, c.count, () => APP.nav.vue(c.key))));
    box.appendChild(l);
  }

  // Écran « Plus » : gestion et réglages (même contenu que le menu « ⋯ » de la tablette, plus les fenêtres de gestion)
  function rendrePlus() {
    const box = $("viewPlus");
    box.replaceChildren();
    const l = el("div", "tf-liste");
    l.appendChild(el("div", "tf-sec", "Gestion"));
    if (APP.piecesGestion) l.appendChild(ligne("Pièces", null, () => APP.piecesGestion.ouvrir()));
    if (APP.pieces) l.appendChild(ligne("Nouvelle pièce", null, () => APP.pieces.ouvrir()));
    if (APP.camerasOpen) l.appendChild(ligne("Caméras", null, () => APP.camerasOpen()));
    if (APP.hubs) l.appendChild(ligne("Hubs", null, () => APP.hubs.ouvrir()));
    if (APP.stCompte) l.appendChild(ligne("Compte SmartThings", null, () => APP.stCompte.ouvrir()));
    if (APP.maj) l.appendChild(ligne("Mise à jour", APP.maj.etat() && APP.maj.etat().etat === "disponible" ? "●" : null, () => APP.maj.ouvrir(), "tf-maj"));
    if (APP.clients) l.appendChild(ligne("Appareils autorisés", null, () => APP.clients.ouvrir()));
    if (APP.apk && APP.apk.present) l.appendChild(ligne("Réglages de l'application", null, () => APP.apk.reglages(), "tf-apk")); // V1.9 : APK seulement
    l.appendChild(el("div", "tf-sec", "Écran"));
    if (APP.accueilOrg) l.appendChild(ligne("Organiser l'accueil", null, () => APP.accueilOrg.ouvrir(), "tf-org")); // V1.9 révision 3
    const a = ligne("Actualiser", null, () => APP.refresh());
    const st = el("span", "tf-nb", $("stamp").textContent || ""); st.id = "tfStamp"; a.appendChild(st);
    l.appendChild(a);
    if (!(APP.apk && APP.apk.present)) l.appendChild(ligne("Plein écran", null, () => $("fsBtn").click())); // V1.9 : l'APK est déjà en plein écran
    l.appendChild(el("div", "tf-sec", "Affichage"));
    const aff = el("div", "tf-aff");
    APP.affichage.boutons(aff, "tf-affb");
    l.appendChild(aff);
    l.appendChild(el("div", "tf-aide", "Automatique : smartphone si le plus petit côté de l'écran fait moins de 600 px. Le choix est pris en compte aussitôt (page rechargée) et gardé sur cet appareil."));
    l.appendChild(el("div", "tf-sec", "Thème")); // V2.2 étape 6 ; étape 10 : choix et personnalisation dans la fenêtre « Thèmes »
    l.appendChild(ligne("Thème", APP.theme.nom(), () => APP.themes.ouvrir(), "tf-theme"));
    box.appendChild(l);
  }

  // Feuille de réglages (V1.6, étape 4) : en portrait, le panneau des commandes (#panel, panel.js) monte du bas sur un voile .tf-voile (fermée par le voile,
  // la poignée, un glisser vers le bas, Retour ou Échap : APP.fermerDessus) ; en paysage, il reste en colonne de droite (rien à ouvrir).
  const panel = $("panel"), voile = el("div", "tf-voile hidden"), poignee = el("button", "tf-poignee", "");
  const paysage = () => window.matchMedia("(orientation: landscape)").matches;
  function fermerFeuille() { panel.classList.remove("tf-ouverte"); voile.classList.add("hidden"); }
  function ouvrirFeuille() { if (paysage()) return; panel.classList.add("tf-ouverte"); voile.classList.remove("hidden"); panel.scrollTop = 0; }
  voile.onclick = (e) => { if (e.target === voile) fermerFeuille(); };
  document.body.appendChild(voile);
  poignee.setAttribute("aria-label", "Fermer les réglages"); poignee.type = "button";
  poignee.onclick = fermerFeuille;
  let y0 = null;
  panel.addEventListener("touchstart", (e) => { y0 = panel.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  panel.addEventListener("touchend", (e) => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 80) fermerFeuille(); y0 = null; }, { passive: true });
  panel.insertBefore(poignee, panel.firstChild);
  APP.telFeuille = { ouvrir: ouvrirFeuille };

  // Crochet de vue (ordre 5, avant les autres vues) : feuille fermée et sélection quittée d'abord, puis vues Appareils et Plus, onglet actif
  APP.surVue(function (name) {
    fermerFeuille();
    if (name !== "lights") APP.telSel = false;
    $("viewAppareils").className = "view tf-vue" + (name === "appareils" ? "" : " hidden");
    $("viewPlus").className = "view tf-vue" + (name === "plus" ? "" : " hidden");
    if (name === "plus") rendrePlus();
    majOnglets();
  }, 5);
  APP.onRender(function () {
    if (APP.view === "appareils") { rendreAppareils(); $("where").textContent = "Appareils"; }
    else if (APP.view === "plus") { $("where").textContent = "Plus"; const s = $("tfStamp"); if (s) s.textContent = $("stamp").textContent || ""; }
    majOnglets();
  }, 25);
  majOnglets();
})();
// FIN
