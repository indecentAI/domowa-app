// @zone socle | Navigation commune aux deux versions (V1.6) : menu « ⋯ » de l'en-tête (#plusBtn, #plusMenu : Actualiser, Plein écran, Affichage ; V1.9 dans l'APK : Plein écran masqué, « Réglages de l'application » #apkBtn, état du Retour signalé par APP.apk.retour), réglage « Affichage » (APP.affichage : Automatique / Smartphone / Tablette, localStorage « affichage », page rechargée), fermeture de la fenêtre du dessus (APP.fermerDessus : touche Échap, bouton Retour d'Android) et retour à l'écran précédent (pile des vues, crochet APP.surVue 60, history.pushState).
(function () {
  const $ = APP.$, el = APP.el;
  APP.tel = !!(window.APP_VERSION && window.APP_VERSION.tel);

  // Réglage « Affichage » : pris en compte au rechargement de la page (version.js le lit avant le premier affichage)
  const CHOIX = [["auto", "Automatique"], ["tel", "Smartphone"], ["tab", "Tablette"]];
  const choix = () => (window.APP_VERSION && window.APP_VERSION.choix) || "auto";
  function regler(c) {
    if (c === choix()) return;
    try { if (c === "auto") window.localStorage.removeItem("affichage"); else window.localStorage.setItem("affichage", c); }
    catch (e) { APP.banner("Réglage non enregistré : stockage du navigateur indisponible.", "err"); return; }
    window.location.reload();
  }
  function boutons(box, cls) {
    box.innerHTML = "";
    CHOIX.forEach(([c, nom]) => {
      const b = el("button", cls + (c === choix() ? " sel" : ""), nom);
      b.setAttribute("aria-pressed", c === choix() ? "true" : "false");
      b.onclick = () => regler(c);
      box.appendChild(b);
    });
  }
  APP.affichage = { choix: choix, regler: regler, boutons: boutons };

  // Menu « ⋯ » de l'en-tête (tablette ; sur téléphone, son contenu est dans l'écran « Plus »)
  const btn = $("plusBtn"), menu = $("plusMenu");
  const ouvert = () => !menu.classList.contains("hidden");
  function menuPlus(o) {
    menu.classList.toggle("hidden", !o);
    btn.setAttribute("aria-expanded", o ? "true" : "false");
    if (o) { boutons($("affichage"), "paffb"); $("pmStamp").textContent = $("stamp").textContent || ""; } // V1.6 : heure de la dernière lecture (masquée de l'en-tête sur une tablette étroite)
  }
  btn.onclick = (e) => { e.stopPropagation(); menuPlus(!ouvert()); };
  // V1.9, dans l'APK : l'application est déjà en plein écran (« Plein écran » masqué) ; « Réglages de l'application » ouvre ceux de l'APK
  if (APP.apk && APP.apk.present) {
    $("fsBtn").classList.add("hidden");
    $("apkBtn").classList.remove("hidden");
    $("apkBtn").onclick = () => APP.apk.reglages();
  }
  menu.addEventListener("click", (e) => { if (e.target.closest(".pitem")) menuPlus(false); });
  document.addEventListener("click", (e) => { if (ouvert() && !menu.contains(e.target)) menuPlus(false); });

  // Fenêtre du dessus : le menu « ⋯ », puis la dernière fenêtre ouverte (voile .hb-scrim, .sc-scrim, .cj-scrim ou .tf-voile, fermée comme par un appui
  // sur le voile : une fenêtre qui refuse de se fermer, envoi en cours ou appairage, le refuse ici aussi), puis le menu latéral. Rend true si quelque chose était ouvert.
  const visible = (e) => e.getClientRects().length > 0 && !e.classList.contains("hidden");
  APP.fermerDessus = function () {
    if (ouvert()) { menuPlus(false); return true; }
    const L = [...document.querySelectorAll(".hb-scrim, .sc-scrim, .cj-scrim, .tf-voile")].filter(visible);
    if (L.length) { const v = L[L.length - 1]; if (v.onclick) v.onclick({ target: v }); return true; }
    if ($("scrim").classList.contains("open")) { $("scrim").click(); return true; }
    return false;
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && APP.fermerDessus()) e.preventDefault(); });

  // Retour d'Android : ferme la fenêtre du dessus, sinon revient à l'écran précédent ; sur le premier écran, laisse faire le navigateur.
  // Une entrée d'historique « garde » est remise après chaque retour traité. Pile de 30 vues au plus ; aucune donnée gardée hors de la page.
  const pile = [];
  let enRetour = false;
  const ici = () => ({ view: APP.view || "home", room: APP.room, cat: APP.cat || null });
  const meme = (a, b) => a.view === b.view && (a.view !== "lights" || (a.room === b.room && a.cat === b.cat));
  // Crochet de vue (ordre 60, après les vues ; APP.view est posé avant APP.showTab par APP.nav)
  APP.surVue(function () {
    if (enRetour) return;
    const e = ici();
    if (!pile.length || !meme(pile[pile.length - 1], e)) { pile.push(e); if (pile.length > 30) pile.shift(); }
  }, 60);
  function aller(e) {
    if (e.view === "home") APP.nav.home();
    else if (e.view === "lights") APP.nav.list(e.room, e.cat);
    else if (e.view === "scenes") APP.nav.scenes();
    else APP.nav.vue(e.view);
  }
  function garde() { try { window.history.pushState({ dw: 1 }, ""); } catch (e) {} }
  window.addEventListener("popstate", function () {
    let fait = APP.fermerDessus();
    if (!fait && pile.length > 1) {
      const avant = pile.pop(), cible = pile[pile.length - 1];
      enRetour = true;
      try { aller(cible); } finally { enRetour = false; }
      if (!meme(ici(), cible)) pile.push(avant); // départ refusé (brouillon d'animation gardé) : on reste
      fait = true;
    }
    if (fait) garde();
  });
  pile.push(ici());
  try { window.history.replaceState({ dw: 0 }, ""); } catch (e) {}
  garde();
  // V1.9, dans l'APK : l'application est prévenue chaque fois que la page sait, ou ne sait plus, traiter le bouton Retour (fenêtre, menu ou écran
  // précédent) ; sinon le Retour revient à l'application (assistant, sortie). Recalculé à chaque changement de vue et de page (fenêtres ouvertes ou fermées).
  if (APP.apk && APP.apk.present) {
    const peut = () => ouvert() || [...document.querySelectorAll(".hb-scrim, .sc-scrim, .cj-scrim, .tf-voile")].some(visible) || $("scrim").classList.contains("open") || pile.length > 1;
    let t = null;
    const signaler = () => { if (t) return; t = setTimeout(() => { t = null; APP.apk.retour(peut()); }, 100); };
    APP.surVue(signaler, 61);
    window.addEventListener("popstate", signaler);
    new MutationObserver(signaler).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    signaler();
  }
})();
// FIN
