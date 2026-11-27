// @zone socle | Choix de la version (V1.6) : classe « tel » (smartphone) ou « tab » (tablette) posée sur <html> avant le premier affichage, d'après le plus petit côté de l'écran (moins de 600 px : smartphone) ou le réglage « Affichage » (localStorage « affichage » : auto | tel | tab ; sans localStorage : auto). Lu une fois au chargement : la rotation ne change jamais de version. Expose window.APP_VERSION {tel, choix, apk} (V1.9 : apk = page affichée par l'application Android, User-Agent « Domowa-APK/ »). V2.2 étape 6 : registre des thèmes window.APP_THEMES (seule liste : réglage « Thème » de navigation.js, page d'appairage, banc), thème posé par l'attribut data-theme de <html> et la balise theme-color, d'après le réglage « Thème » (localStorage « theme » : auto | identifiant du registre ; absent : sombre ; inconnu ou retiré : sombre, sans erreur) ; auto : prefers-color-scheme (clair si le système est clair, suivi en direct ; Android 7 n'a pas de thème système : sombre) ; window.APP_THEME {choix, id, appliquer(), poser(th), recharger(liste), variables, CLES} ; V2.2 étape 10 : thèmes personnalisés (copie locale « themes-perso » de donnees/themes.json, palette posée en variables sur <html>). Chargé dans <head> avant les feuilles de style ; aucune requête, aucune adresse de serveur.
(function () {
  var choix = "auto", cote, tel;
  try { choix = window.localStorage.getItem("affichage") || "auto"; } catch (e) {}
  if (choix !== "tel" && choix !== "tab") choix = "auto";
  cote = Math.min(window.screen.width || 0, window.screen.height || 0) || Math.min(window.innerWidth || 0, window.innerHeight || 0);
  tel = choix === "tel" || (choix === "auto" && cote > 0 && cote < 600);
  document.documentElement.classList.add(tel ? "tel" : "tab");
  window.APP_VERSION = { tel: tel, choix: choix, apk: /Domowa-APK\//.test(navigator.userAgent || "") };

  // Registre des thèmes : id (attribut data-theme, bloc de variables de themes.css), nom affiché, couleur de la barre du navigateur (theme-color ; l'APK est en plein écran immersif, barres système masquées),
  // schema (light | dark : color-scheme, et thème choisi par « Automatique » selon le système). Le premier est le thème par défaut. Ajouter un thème : une ligne ici et un bloc dans themes.css.
  var BASE = [
    { id: "sombre", nom: "Sombre", couleur: "#0d1015", schema: "dark" },
    { id: "clair", nom: "Clair", couleur: "#e4e9f1", schema: "light" },
    { id: "printemps", nom: "Printemps", couleur: "#dde8d8", schema: "light" },
    { id: "ete", nom: "Été", couleur: "#ece0cb", schema: "light" },
    { id: "automne", nom: "Automne", couleur: "#160f0b", schema: "dark" }
  ];
  var THEMES = window.APP_THEMES = [];
  // V2.2 étape 10 : thèmes personnalisés (donnees/themes.json, modules/themes.mjs), copie gardée sur cet appareil (localStorage « themes-perso », écrite par themes-edition.js)
  // pour poser le thème avant le premier affichage. Entrée {id, base, nom?, couleurs} : id = base, thème du registre modifié (jamais le premier, verrouillé) ;
  // id perso-… : thème créé, ajouté au registre après les thèmes d'origine (data-theme de sa base ; Sombre : « sombre-copie », bloc dérivé de themes.css).
  // Couleurs de la palette -> variables de themes.css (CLES de modules/themes.mjs, même liste), posées en style sur <html>.
  var VARS = {
    fond: function (v) { return [["--bg", v], ["--neutre-0", v], ["--fenetre-plein", "linear-gradient(180deg,color-mix(in srgb," + v + " 94%,var(--text))," + v + ")"]]; },
    carte: function (v) { return [["--card", v], ["--carte-haut", v], ["--carte-fond", "linear-gradient(180deg," + v + ",color-mix(in srgb," + v + " 90%,var(--bg)))"], ["--card2", "color-mix(in srgb," + v + " 94%,var(--text))"], ["--carte-fond-2", "color-mix(in srgb," + v + " 60%,var(--bg))"]]; },
    texte: function (v) { return [["--text", v], ["--encre", v], ["--neutre-100", v]]; },
    attenue: function (v) { return [["--muted", v], ["--texte-60", v], ["--texte-60-b", v], ["--texte-66", v], ["--texte-66-b", v], ["--sec-couleur", "color-mix(in srgb," + v + " 70%,var(--text))"]]; }
  };
  var CLES = ["fond", "carte", "texte", "attenue", "accent", "succes", "alerte", "danger", "chaud", "local"];
  function variables(c) {
    var r = [], k, j;
    for (j = 0; j < CLES.length; j++) { k = CLES[j]; if (c && typeof c[k] === "string" && /^#[0-9a-f]{6}$/.test(c[k])) r = r.concat(VARS[k] ? VARS[k](c[k]) : [["--" + k, c[k]]]); }
    return r;
  }
  function lireCache() { var l = []; try { l = JSON.parse(window.localStorage.getItem("themes-perso") || "[]"); } catch (e) {} return Array.isArray(l) ? l : []; }
  function construire(perso) { // registre : thèmes d'origine (modifiés s'il le faut), puis thèmes créés dont la base est connue
    var j, k, e, b, m = {};
    THEMES.length = 0;
    for (j = 0; j < perso.length; j++) { e = perso[j]; if (e && typeof e.id === "string" && e.couleurs && typeof e.couleurs === "object") m[e.id] = e; }
    for (j = 0; j < BASE.length; j++) {
      b = { id: BASE[j].id, nom: BASE[j].nom, couleur: BASE[j].couleur, schema: BASE[j].schema, attr: BASE[j].id, couleurs: {}, origine: true, verrou: j === 0 };
      if (j > 0 && m[b.id] && m[b.id].base === b.id) { b.couleurs = m[b.id].couleurs; b.modifie = true; if (b.couleurs.fond) b.couleur = b.couleurs.fond; }
      THEMES.push(b);
    }
    for (k in m) {
      e = m[k]; if (!/^perso-/.test(k) || typeof e.nom !== "string") continue;
      for (j = 0; j < BASE.length && BASE[j].id !== e.base; j++) {}
      if (j >= BASE.length) continue;
      THEMES.push({ id: k, nom: e.nom, base: e.base, couleur: e.couleurs.fond || BASE[j].couleur, schema: BASE[j].schema, attr: j === 0 ? "sombre-copie" : e.base, couleurs: e.couleurs, perso: true });
    }
  }
  construire(lireCache());
  var t = "", mq = null, i, poses = [];
  try { t = window.localStorage.getItem("theme") || ""; } catch (e) {}
  function connu(id) { for (i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return null; }
  function systeme() { // Automatique : premier thème du schéma du système (clair seulement si le système le demande)
    var clair = !!(mq && mq.matches);
    for (i = 0; i < THEMES.length; i++) if (THEMES[i].schema === (clair ? "light" : "dark")) return THEMES[i];
    return THEMES[0];
  }
  function verifier() { if (t !== "auto" && !connu(t)) { if (t) { try { window.localStorage.removeItem("theme"); } catch (e) {} } t = THEMES[0].id; } } // inconnu ou retiré du registre : oublié, premier thème
  verifier();
  try { if (window.matchMedia) mq = window.matchMedia("(prefers-color-scheme: light)"); } catch (e) {}
  // Pose un thème (attribut, variables de sa palette, theme-color) ; aussi l'aperçu de l'éditeur : poser({attr, couleurs, couleur})
  function poser(th) {
    var d = document.documentElement, m = document.querySelector('meta[name="theme-color"]'), v = variables(th.couleurs), j;
    for (j = 0; j < poses.length; j++) d.style.removeProperty(poses[j]);
    poses = [];
    d.setAttribute("data-theme", th.attr || th.id);
    for (j = 0; j < v.length; j++) { d.style.setProperty(v[j][0], v[j][1]); poses.push(v[j][0]); }
    if (m) m.setAttribute("content", th.couleur);
  }
  function appliquer() {
    var th = t === "auto" ? systeme() : connu(t);
    poser(th);
    window.APP_THEME.id = th.id;
  }
  // Thèmes relus du serveur : copie mise à jour, registre refait, thème reposé ; rend true si le registre a changé
  function recharger(perso) {
    var avant = JSON.stringify(lireCache());
    try { window.localStorage.setItem("themes-perso", JSON.stringify(perso)); } catch (e) {}
    if (avant === JSON.stringify(perso)) return false;
    construire(perso); verifier(); window.APP_THEME.choix = t; appliquer();
    return true;
  }
  window.APP_THEME = { choix: t, id: "", appliquer: appliquer, poser: poser, recharger: recharger, variables: variables, CLES: CLES };
  appliquer();
  // Automatique : suit le système en direct (sans rechargement : toutes les couleurs sont des variables)
  if (mq && t === "auto") { if (mq.addEventListener) mq.addEventListener("change", appliquer); else if (mq.addListener) mq.addListener(appliquer); }
})();
// FIN
