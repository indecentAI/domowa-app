// @zone themes | Fenêtre « Thèmes » (V2.2 étape 10, préfixe th-, cadre hb- de hubs.css) : choix du thème de cet appareil (Automatique, thèmes du registre APP_THEMES, page rechargée) ; éditeur : palette du thème (10 couleurs, CLES de modules/themes.mjs), chaque couleur choisie parmi celles du thème ou librement (input color), aperçu en direct sur toute la page, contrastes vérifiés (4,5:1 : texte et texte atténué sur le fond et les cartes ; enregistrement refusé en dessous) ; Sombre d'origine verrouillé (« Copier »), thèmes du registre modifiables (« Rétablir », deux appuis), thèmes créés (« Nouveau thème » à partir d'un thème, nom, « Supprimer », deux appuis). Serveur : GET /api/themes, POST /api/themes, POST /api/themes/supprimer ; copie locale par APP_THEME.recharger (version.js), relue au premier chargement et à l'ouverture. APP.themes {ouvrir, synchroniser, contraste, palette}.
(function () {
  "use strict";
  const el = APP.el, TH = window.APP_THEME, CLES = TH.CLES;
  const NOMS = { fond: "Fond", carte: "Cartes", texte: "Texte", attenue: "Texte atténué", accent: "Accent", succes: "ON, succès", alerte: "Alerte", danger: "Danger, Tout OFF", chaud: "Chaud", local: "Pièces locales" };
  const LUES = { fond: "--bg", carte: "--card", texte: "--text", attenue: "--muted" }; // variable lue pour chaque couleur (les autres : --<clé>)
  const AIDE = "Choisissez le thème de cet appareil ; « Modifier » change ses couleurs pour tous les appareils. Le thème Sombre d'origine ne se modifie pas : « Copier » en fait un nouveau thème. Texte et texte atténué doivent rester lisibles sur le fond et sur les cartes (contraste 4,5:1 au moins). Les couleurs des lampes restent leurs vraies couleurs.";
  let root = null, body = null, vue = "liste", ed = null, erreur = "", info = "", occupe = false, arme = "", armeT = null, maxi = 20;

  // Couleurs lues dans la page (variables résolues par une sonde) : rgb(), rgba() ou color(srgb r g b) -> #rrggbb
  const hex2 = (n) => ("0" + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
  function enHex(c) {
    let m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(c);
    if (m) return "#" + hex2(m[1] * 255) + hex2(m[2] * 255) + hex2(m[3] * 255);
    m = /rgba?\((\d+), (\d+), (\d+)/.exec(c);
    return m ? "#" + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]) : "#000000";
  }
  function lirePalette() {
    const s = el("span", ""); s.style.cssText = "position:absolute;visibility:hidden"; document.body.appendChild(s);
    const p = {};
    CLES.forEach((k) => { s.style.color = "var(" + (LUES[k] || "--" + k) + ")"; p[k] = enHex(getComputedStyle(s).color); });
    document.body.removeChild(s);
    return p;
  }
  // Palette d'un thème : posé un instant (sans ses couleurs pour l'origine), lu, puis le thème de l'appareil reposé
  function palette(th, origine) {
    TH.poser({ attr: th.attr, couleurs: origine ? {} : th.couleurs, couleur: th.couleur });
    const p = lirePalette();
    TH.appliquer();
    return p;
  }
  // Contraste WCAG entre deux #rrggbb
  function lum(h) { return [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); }
  function contraste(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const PAIRES = [["texte", "fond", "Texte sur le fond", 4.5], ["texte", "carte", "Texte sur les cartes", 4.5], ["attenue", "fond", "Texte atténué sur le fond", 4.5], ["attenue", "carte", "Texte atténué sur les cartes", 4.5], ["accent", "carte", "Accent sur les cartes", 3]];

  // Copie locale relue du serveur (premier chargement, ouverture de la fenêtre, après chaque enregistrement)
  function synchroniser(cb) {
    APP.api("GET", "/api/themes", null, (err, r) => {
      if (!err && r && Array.isArray(r.themes)) { maxi = r.max || maxi; if (TH.recharger(r.themes) && root && vue === "liste") rendre(); }
      if (cb) cb(err, r);
    });
  }
  let lu = false;
  APP.surActualisation(() => { if (!lu) { lu = true; synchroniser(); } }, 58);

  function desarmer() { arme = ""; clearTimeout(armeT); }
  function armer(cle) { arme = cle; clearTimeout(armeT); armeT = setTimeout(() => { arme = ""; rendre(); }, 8000); }
  function fermer() {
    if (!root || occupe) return;
    desarmer(); document.body.removeChild(root); root = null; body = null; vue = "liste"; ed = null; erreur = ""; info = "";
    TH.appliquer(); // aperçu abandonné
  }
  function ouvrir() {
    if (root) return;
    root = el("div", "hb-scrim"); root.id = "thFenetre";
    root.onclick = (e) => { if (e.target === root) { if (vue !== "liste") versListe(); else fermer(); } };
    const panel = el("div", "hb-panel th-panel"), head = el("div", "hb-head"), ics = el("div", "hb-ics"), x = el("button", "hb-ic", "×");
    head.appendChild(el("div", "hb-titre", "Thèmes"));
    x.title = "Fermer"; x.setAttribute("aria-label", "Fermer"); x.onclick = fermer;
    ics.appendChild(x); head.appendChild(ics);
    body = el("div", "hb-body th-body");
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    vue = "liste"; rendre(); synchroniser();
  }
  function versListe() { desarmer(); ed = null; vue = "liste"; erreur = ""; TH.appliquer(); rendre(); }
  const bouton = (cls, texte, fn) => { const b = el("button", cls, texte); b.type = "button"; b.onclick = fn; b.disabled = occupe; return b; };
  function pastilles(c) { const p = el("span", "th-pals"); ["fond", "carte", "texte", "accent"].forEach((k) => { const s = el("span", "th-pal"); s.style.background = c[k]; p.appendChild(s); }); return p; }

  // Vue « liste » : choix de cet appareil, Modifier / Copier, Nouveau thème
  function vueListe(box) {
    const choix = TH.choix;
    box.appendChild(el("div", "th-aide", AIDE));
    box.appendChild(el("div", "hb-sec", "Thème de cet appareil"));
    const l = el("div", "th-liste");
    const auto = el("div", "th-ligne" + (choix === "auto" ? " sel" : ""));
    const ba = bouton("th-choix", "", () => APP.theme.choisir("auto"));
    ba.setAttribute("aria-pressed", choix === "auto" ? "true" : "false");
    ba.appendChild(el("span", "th-nom", "Automatique"));
    ba.appendChild(el("span", "th-tag", "suit Android (10 et suivants) ; Android 7 : Sombre"));
    auto.appendChild(ba); l.appendChild(auto);
    (window.APP_THEMES || []).forEach((t) => {
      const li = el("div", "th-ligne" + (choix === t.id ? " sel" : ""));
      const b = bouton("th-choix", "", () => APP.theme.choisir(t.id));
      b.setAttribute("aria-pressed", choix === t.id ? "true" : "false");
      b.appendChild(pastilles(palette(t)));
      b.appendChild(el("span", "th-nom", t.nom));
      b.appendChild(el("span", "th-tag", t.verrou ? "d'origine, verrouillé" : t.modifie ? "modifié" : t.perso ? "créé" : ""));
      li.appendChild(b);
      li.appendChild(bouton("b-small th-act", t.verrou ? "Copier" : "Modifier", () => editer(t, !!t.verrou)));
      l.appendChild(li);
    });
    box.appendChild(l);
    const nb = (window.APP_THEMES || []).filter((t) => t.perso || t.modifie).length;
    const n = bouton("b-main th-nouveau", "Nouveau thème", () => { desarmer(); vue = "base"; erreur = ""; rendre(); });
    if (nb >= maxi) { n.disabled = true; box.appendChild(el("div", "th-aide", maxi + " thèmes personnalisés au plus : supprimez-en un pour en créer un autre.")); }
    box.appendChild(n);
  }
  // Vue « base » : thème de départ d'un nouveau thème
  function vueBase(box) {
    box.appendChild(bouton("b-small hb-retour", "← Retour", versListe));
    box.appendChild(el("div", "hb-sec", "Nouveau thème à partir de"));
    const l = el("div", "th-liste");
    (window.APP_THEMES || []).forEach((t) => {
      const b = bouton("th-choix th-base", "", () => editer(t, true));
      b.appendChild(pastilles(palette(t))); b.appendChild(el("span", "th-nom", t.nom));
      l.appendChild(b);
    });
    box.appendChild(l);
  }

  // Éditeur. Nouveau (copie) : base = base du thème copié (thème du registre), couleurs de départ = palette du thème copié, nom « <nom> (copie) ».
  function editer(t, copie) {
    desarmer(); erreur = ""; info = "";
    const base = t.perso ? t.base : t.id;
    const bt = (window.APP_THEMES || []).find((x) => x.id === base);
    const origine = palette(bt, true), depart = palette(t);
    let nom = t.nom;
    if (copie) { const noms = (window.APP_THEMES || []).map((x) => x.nom); nom = t.nom + " (copie)"; for (let i = 2; noms.includes(nom) && i < 50; i++) nom = t.nom + " (copie " + i + ")"; nom = nom.slice(0, 30); }
    ed = { id: copie ? null : t.id, base, perso: copie || !!t.perso, attr: copie ? (base === "sombre" ? "sombre-copie" : base) : t.attr, nom, origine, couleurs: Object.assign({}, depart), choisie: "fond", modele: t };
    vue = "edition"; apercu(); rendre();
  }
  // Couleurs envoyées : seulement celles qui diffèrent de la base d'origine
  function differences() { const c = {}; CLES.forEach((k) => { if (ed.couleurs[k] !== ed.origine[k]) c[k] = ed.couleurs[k]; }); return c; }
  function apercu() { TH.poser({ attr: ed.attr, couleurs: differences(), couleur: ed.couleurs.fond }); }
  function controles() { return PAIRES.map(([a, b, lib, min]) => { const r = contraste(ed.couleurs[a], ed.couleurs[b]); return { lib, r, min, ok: r >= min, bloque: min >= 4.5 }; }); }

  function enregistrer() {
    const ko = controles().filter((c) => !c.ok && c.bloque);
    if (ko.length) return;
    if (ed.perso && !String(ed.nom || "").trim()) { erreur = "Donnez un nom au thème."; rendre(); return; }
    const theme = { base: ed.base, couleurs: differences() };
    if (ed.perso) { theme.nom = String(ed.nom).trim(); if (ed.id) theme.id = ed.id; } else theme.id = ed.id;
    occupe = true; erreur = ""; rendre();
    APP.api("POST", "/api/themes", { theme }, (err, r) => {
      occupe = false;
      if (err || !r) { erreur = err || "Réponse inattendue du serveur."; rendre(); return; }
      TH.recharger(r.themes);
      info = "« " + (theme.nom || ed.modele.nom) + " » enregistré" + (TH.id === r.id ? "." : " : touchez-le pour l'utiliser sur cet appareil.");
      versListe();
    });
  }
  function supprimer() {
    occupe = true; erreur = ""; rendre();
    APP.api("POST", "/api/themes/supprimer", { id: ed.id, confirm: true }, (err, r) => {
      occupe = false;
      if (err || !r) { erreur = err || "Réponse inattendue du serveur."; rendre(); return; }
      info = ed.perso ? "« " + ed.nom + " » supprimé." : "« " + ed.modele.nom + " » rétabli.";
      TH.recharger(r.themes); versListe();
    });
  }

  function vueEdition(box) {
    box.appendChild(bouton("b-small hb-retour", "← Retour", versListe));
    const cols = el("div", "th-cols"), g = el("div", "th-col"), d = el("div", "th-col");
    g.appendChild(el("div", "hb-sec", ed.perso ? (ed.id ? "Thème créé" : "Nouveau thème") : "Modifier « " + ed.modele.nom + " »"));
    if (ed.perso) {
      const n = el("input", "th-saisie"); n.type = "text"; n.maxLength = 30; n.value = ed.nom; n.id = "thNom";
      n.setAttribute("aria-label", "Nom du thème"); n.placeholder = "Nom du thème";
      n.oninput = () => { ed.nom = n.value; };
      g.appendChild(n);
    }
    const grille = el("div", "th-grille");
    CLES.forEach((k) => {
      const b = bouton("th-coul" + (ed.choisie === k ? " sel" : ""), "", () => { ed.choisie = k; rendre(); });
      b.setAttribute("aria-pressed", ed.choisie === k ? "true" : "false");
      const s = el("span", "th-pas"); s.style.background = ed.couleurs[k]; b.appendChild(s);
      b.appendChild(el("span", "th-lib", NOMS[k]));
      grille.appendChild(b);
    });
    g.appendChild(grille);
    // Couleur choisie : celles du thème (palette en cours, et la valeur d'origine), ou une autre
    const k = ed.choisie, v = ed.couleurs[k];
    d.appendChild(el("div", "hb-sec", NOMS[k] + " · " + v));
    const props = [];
    CLES.forEach((x) => { if (!props.includes(ed.couleurs[x])) props.push(ed.couleurs[x]); });
    if (!props.includes(ed.origine[k])) props.push(ed.origine[k]);
    const pal = el("div", "th-props");
    props.forEach((c) => {
      const b = bouton("th-prop" + (c === v ? " sel" : ""), "", () => { ed.couleurs[k] = c; apercu(); rendre(); });
      b.style.background = c; b.title = c + (c === ed.origine[k] ? " (d'origine)" : ""); b.setAttribute("aria-label", c + (c === ed.origine[k] ? " (d'origine)" : ""));
      pal.appendChild(b);
    });
    d.appendChild(el("div", "th-sous", "Couleurs du thème"));
    d.appendChild(pal);
    const autre = el("label", "th-autre"), inp = el("input", "");
    inp.type = "color"; inp.value = v; inp.id = "thAutre";
    inp.oninput = () => { ed.couleurs[k] = inp.value.toLowerCase(); apercu(); majContrastes(); };
    inp.onchange = () => rendre();
    autre.appendChild(inp); autre.appendChild(el("span", "", "Autre couleur…"));
    d.appendChild(autre);
    const cb = el("div", "th-contr"); cb.id = "thContr"; d.appendChild(cb);
    const ok = bouton("b-main th-ok", "Enregistrer", enregistrer); ok.id = "thOk";
    if (occupe) { ok.setAttribute("aria-busy", "true"); ok.textContent = "Chargement…"; }
    d.appendChild(ok);
    if (ed.id && (ed.perso || ed.modele.modifie)) {
      const cle = "sup", lib = ed.perso ? "Supprimer" : "Rétablir les couleurs d'origine";
      d.appendChild(bouton("hb-deco th-sup" + (arme === cle ? " arme" : ""), arme === cle ? (ed.perso ? "Supprimer « " + ed.nom + " » ?" : "Rétablir ?") : lib, () => { if (arme === cle) { desarmer(); supprimer(); } else { armer(cle); rendre(); } }));
    }
    cols.appendChild(g); cols.appendChild(d); box.appendChild(cols);
    majContrastes();
  }
  function majContrastes() {
    const cb = document.getElementById("thContr"), ok = document.getElementById("thOk");
    if (!cb) return;
    cb.replaceChildren();
    const c = controles();
    c.forEach((x) => { const l = el("div", "th-cligne" + (x.ok ? "" : x.bloque ? " ko" : " av")); l.appendChild(el("span", "", x.lib)); l.appendChild(el("span", "th-ratio", x.r.toFixed(1).replace(".", ",") + ":1 " + (x.ok ? "✓" : "✗"))); cb.appendChild(l); });
    const bloque = c.some((x) => !x.ok && x.bloque);
    if (bloque) cb.appendChild(el("div", "th-cmsg", "Contraste insuffisant (4,5:1 au moins) : texte difficile à lire, enregistrement impossible."));
    if (ok && !occupe) ok.disabled = bloque;
  }

  function rendre() {
    if (!body) return;
    body.replaceChildren();
    if (info && vue === "liste") body.appendChild(el("div", "hb-ok th-info", info));
    if (vue === "liste") vueListe(body); else if (vue === "base") vueBase(body); else vueEdition(body);
    if (erreur) body.appendChild(el("div", "hb-err", erreur));
  }
  APP.themes = { ouvrir, synchroniser, contraste, palette: lirePalette };
})();
// FIN
