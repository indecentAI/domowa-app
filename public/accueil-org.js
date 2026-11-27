// @zone accueil | Accueil personnalisable (V1.9 révision 3) : ordre des cartes de chaque rubrique, ordre des rubriques, cartes, rubriques et colonne des caméras masquées (GET et POST /api/accueil, POST /api/accueil/defaut ; relu à chaque actualisation : crochet APP.surActualisation 40) ; mode « Organiser l'accueil » (#accOrgBtn du menu « ⋯ », ligne de l'écran Plus du téléphone ; barre .horg-barre : Par défaut en deux appuis, Affichage…, ?, Terminé ; Retour et Échap : APP.modesDessus ; quitté en changeant de vue : crochet APP.surVue 52) : poignée à glisser (défilement de la ligne et de la page au bord) et boutons Avant / Après ; fenêtre « Affichage de l'accueil » (rubriques ▲ ▼, Affichée / Masquée de chaque rubrique, carte et des caméras) ; APP.accueilOrg {trier, decorer, barre, rubriques, vide, poser, actif, sig, glisse, ouvrir, quitter}.
(function () {
  const $ = APP.$, el = APP.el;
  const RUBS = ["pieces", "actions", "categories"], NOMS = { pieces: "Pièces", actions: "Actions", categories: "Catégories" };
  const videM = () => ({ pieces: [], actions: [], categories: [], rubriques: [], cameras: false });
  let ordre = { pieces: [], actions: [], categories: [] }, rubs = RUBS.slice(), masques = videM(), lisible = true, actif = false, tenue = null;
  let attente = {}, tEnvoi = null, enCours = false, defautArme = null, fen = null;
  const vus = {}, tous = {}; // clés affichées de chaque rubrique, dans l'ordre (dernière construction) ; tous : [{cle, nom, masque}], masquées comprises

  const SV = (d) => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
  const AVANT = SV('<path d="M15 6l-6 6 6 6"/>'), APRES = SV('<path d="M9 6l6 6-6 6"/>'), HAUT = SV('<path d="M6 15l6-6 6 6"/>'), BAS = SV('<path d="M6 9l6 6 6-6"/>');
  const OEIL = SV('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
  const OEIL_NON = SV('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
  const POIGNEE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

  // Ordre : clés enregistrées d'abord, dans leur ordre ; élément nouveau (absent de l'ordre enregistré) : au bout, dans l'ordre par défaut.
  // Carte masquée : absente hors du mode Organiser ; dans le mode, affichée grisée (x.masque) pour ne jamais être perdue.
  function trier(rub, items) {
    const rang = {}, m = masques[rub] || [];
    (ordre[rub] || []).forEach((k, i) => { rang[k] = i; });
    const connus = items.filter((x) => rang[x.cle] !== undefined).sort((a, b) => rang[a.cle] - rang[b.cle]);
    let o = connus.concat(items.filter((x) => rang[x.cle] === undefined));
    o.forEach((x) => { x.masque = m.indexOf(x.cle) >= 0; });
    tous[rub] = o.map((x) => ({ cle: x.cle, nom: x.nom, masque: x.masque }));
    if (!actif) o = o.filter((x) => !x.masque);
    vus[rub] = o.map((x) => x.cle);
    return o;
  }
  // Rubriques dans l'ordre choisi : [{cle, masquee}] (home.js n'affiche une rubrique masquée qu'en mode Organiser)
  const rubriques = () => rubs.map((r) => ({ cle: r, masquee: masques.rubriques.indexOf(r) >= 0 }));
  // Élément disparu (pièce supprimée, catégorie vide) : retiré de l'ordre et des masques au prochain enregistrement, sauf pendant une panne (hub, cloud ou
  // serveur injoignable : ses éléments reviendront) : sa place est alors gardée, juste après l'élément qui le précédait.
  const sansPanne = () => !APP.pannesMsg && !APP.connErr && !(APP.stCompte && APP.stCompte.horsLigne && APP.stCompte.horsLigne());
  function fusion(ancien, visibles) {
    const o = visibles.slice();
    if (sansPanne()) return o;
    let prec = null;
    ancien.forEach((k) => {
      if (o.indexOf(k) < 0) { const i = prec === null ? -1 : o.indexOf(prec); o.splice(i + 1, 0, k); }
      prec = k;
    });
    return o.slice(0, 100);
  }

  // Enregistrement : 300 ms après le dernier changement, parties changées seulement (« ordre.<rubrique> », « masques.<rubrique> », « rubriques », « masques.rubriques »,
  // « masques.cameras »), une demande à la fois
  const CLE = /^[A-Za-z0-9_-]{1,80}$/; // même règle que le serveur (ID_RE) : une clé autre n'est jamais envoyée (élément laissé au bout, jamais masqué)
  function planifier(partie) {
    attente[partie] = true;
    clearTimeout(tEnvoi); tEnvoi = setTimeout(envoyer, 300);
    APP.homeRafraichir();
    if (fen) remplir();
  }
  function changer(rub, visibles) {
    ordre[rub] = fusion(ordre[rub] || [], visibles.filter((k) => CLE.test(k)));
    planifier("ordre." + rub);
  }
  function masquer(rub, cle, oui) {
    if (rub === "rubriques" || rub === "cameras") {
      if (rub === "cameras") masques.cameras = oui;
      else masques.rubriques = RUBS.filter((r) => (r === cle ? oui : masques.rubriques.indexOf(r) >= 0));
      planifier("masques." + rub);
      if (rub === "cameras") poser();
      return;
    }
    if (!CLE.test(cle)) return;
    const presentes = (tous[rub] || []).map((x) => x.cle);
    let l = masques[rub].filter((k) => k !== cle);
    if (oui) l.push(cle);
    if (sansPanne()) l = l.filter((k) => presentes.indexOf(k) >= 0);
    masques[rub] = l.slice(0, 100);
    planifier("masques." + rub);
  }
  function deplacerRubrique(r, sens) {
    const i = rubs.indexOf(r), j = i + sens;
    if (i < 0 || j < 0 || j >= rubs.length) return;
    rubs[i] = rubs[j]; rubs[j] = r;
    planifier("rubriques");
  }
  function envoyer() {
    tEnvoi = null;
    if (enCours) { tEnvoi = setTimeout(envoyer, 300); return; }
    const r = Object.keys(attente);
    if (!r.length) return;
    const corps = {};
    r.forEach((p) => {
      const [a, b] = p.split(".");
      if (a === "rubriques") corps.rubriques = rubs.slice();
      else if (a === "ordre") (corps.ordre = corps.ordre || {})[b] = ordre[b];
      else (corps.masques = corps.masques || {})[b] = b === "cameras" ? masques.cameras : masques[b];
    });
    attente = {}; enCours = true;
    APP.api("POST", "/api/accueil", corps, (err, d) => {
      enCours = false;
      if (err) { APP.banner("Réglage de l'accueil non enregistré : " + err, "err"); lire(true, true); return; }
      if (d && d.accueil && !Object.keys(attente).length && !tEnvoi) adopter(d);
    });
  }
  function adopter(d) {
    const a = d.accueil, avant = JSON.stringify([ordre, rubs, masques, lisible]), cam = masques.cameras;
    RUBS.forEach((k) => { ordre[k] = (a.ordre && a.ordre[k]) || []; });
    rubs = Array.isArray(a.rubriques) && a.rubriques.length === RUBS.length ? a.rubriques.slice() : RUBS.slice();
    masques = Object.assign(videM(), a.masques || {});
    lisible = d.lisible !== false;
    poser();
    if (masques.cameras && !cam && !actif && APP.camerasReload) APP.camerasReload(); // colonne masquée : aucun flux ne reste ouvert
    if (fen) remplir();
    return JSON.stringify([ordre, rubs, masques, lisible]) !== avant;
  }
  // Lecture du serveur (un autre appareil a pu changer l'accueil) : jamais pendant un enregistrement ni une carte tenue (sauf force) ; accueil reconstruit
  // s'il change (V2.2 revision 2 : plus de reconstruction forcee au chargement, cause de l'echec intermittent ui-accueil), ou toujours apres un envoi refuse (refaire)
  function lire(force, refaire) {
    if (!force && (enCours || tEnvoi || tenue || Object.keys(attente).length)) return;
    APP.api("GET", "/api/accueil", null, (err, d) => {
      if (err || !d || !d.accueil || enCours || tEnvoi || tenue) return;
      if (adopter(d) || refaire) APP.homeRafraichir();
    });
  }
  // Classes de #viewHome : horg (mode Organiser), hcam-masq (colonne des caméras masquée : cameras.css)
  function poser() {
    const h = $("viewHome");
    h.classList.toggle("horg", actif);
    h.classList.toggle("hcam-masq", !!masques.cameras);
  }
  // Accueil vide hors du mode (tout est masqué) : chemin pour réafficher
  const vide = () => el("div", "horg-vide", "Tout est masqué sur l'accueil. Pour réafficher : " + (APP.tel ? "onglet Plus" : "menu « ⋯ »") + " › Organiser l'accueil › Affichage.");

  // Avant / Après : un pas dans l'ordre affiché (le focus reste sur le même bouton après la reconstruction)
  function pas(rub, cle, sens) {
    const l = (vus[rub] || []).slice(), i = l.indexOf(cle), j = i + sens;
    if (i < 0 || j < 0 || j >= l.length) return;
    l[i] = l[j]; l[j] = cle;
    changer(rub, l);
    const b = document.querySelector('#homeMain .horg-b[data-cle="' + cle + '"][data-sens="' + sens + '"]');
    const autre = document.querySelector('#homeMain .horg-b[data-cle="' + cle + '"][data-sens="' + -sens + '"]');
    if (b && !b.disabled) b.focus(); else if (autre) autre.focus();
  }
  function bouton(cls, html, titre, fn) {
    const b = el("button", cls, "");
    b.innerHTML = html; b.title = titre; b.setAttribute("aria-label", titre); b.onclick = fn;
    return b;
  }
  // Commandes posées sur chaque carte en mode Organiser (la carte elle-même ne répond plus : accueil.css)
  function decorer(rub, items) {
    items.forEach((x, i) => {
      const ov = el("div", "horg-ov"), ctl = el("div", "horg-ctl"), p = el("div", "horg-poig", "");
      const tete = el("div", "horg-tete");
      tete.appendChild(el("span", "horg-nom", x.nom));
      if (x.masque) { tete.appendChild(el("span", "horg-etat", "Masquée")); x.w.classList.add("horg-masquee"); }
      ov.appendChild(tete);
      const av = bouton("horg-b", AVANT, "Placer " + x.nom + " avant", () => pas(rub, x.cle, -1));
      const ap = bouton("horg-b", APRES, "Placer " + x.nom + " après", () => pas(rub, x.cle, 1));
      av.setAttribute("data-cle", x.cle); av.setAttribute("data-sens", "-1"); av.disabled = !lisible || i === 0;
      ap.setAttribute("data-cle", x.cle); ap.setAttribute("data-sens", "1"); ap.disabled = !lisible || i === items.length - 1;
      p.innerHTML = POIGNEE; p.setAttribute("aria-hidden", "true"); p.title = "Glisser pour déplacer";
      if (lisible && items.length > 1) p.addEventListener("pointerdown", (e) => tenir(e, rub, x.w, p)); else p.classList.add("horg-inactif");
      ctl.appendChild(av); ctl.appendChild(p); ctl.appendChild(ap);
      ov.appendChild(ctl);
      x.w.classList.add("horg-w");
      x.w.appendChild(ov);
    });
  }

  // Glisser (sans bibliothèque) : la carte tenue reste dans la page (ce sont les autres qui changent de place : la capture du doigt est gardée) ;
  // place = nombre de cartes avant le doigt (ligne : centre de chaque carte ; grille : ordre de lecture) ; près d'un bord, la ligne ou la page défile.
  const mobiles = (ligne) => [...ligne.children].filter((c) => c.hasAttribute("data-cle"));
  function defileur(n) {
    for (let e = n; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e).overflowY;
      if ((s === "auto" || s === "scroll") && e.scrollHeight > e.clientHeight + 1) return e;
    }
    return document.scrollingElement;
  }
  function placer() {
    const t = tenue, w = t.w, l = mobiles(t.ligne), autres = l.filter((c) => c !== w);
    let n = 0;
    autres.forEach((c) => {
      const r = c.getBoundingClientRect();
      if (t.grille ? (t.y > r.bottom || (t.y >= r.top && t.x > r.left + r.width / 2)) : t.x > r.left + r.width / 2) n++;
    });
    let i = l.indexOf(w);
    while (i > n) { const p = w.previousElementSibling; t.ligne.insertBefore(p, w.nextSibling); i--; }
    while (i < n) { const s = w.nextElementSibling; t.ligne.insertBefore(s, w); i++; }
  }
  function boucle() {
    const t = tenue;
    if (!t) return;
    const r = t.ligne.getBoundingClientRect(), v = t.page === document.scrollingElement ? { top: 0, bottom: innerHeight } : t.page.getBoundingClientRect();
    if (!t.grille) { if (t.x < r.left + 48) t.ligne.scrollLeft -= 12; else if (t.x > r.right - 48) t.ligne.scrollLeft += 12; }
    if (t.y < v.top + 48) t.page.scrollTop -= 12; else if (t.y > v.bottom - 48) t.page.scrollTop += 12;
    placer();
    t.raf = requestAnimationFrame(boucle);
  }
  function tenir(e, rub, w, p) {
    if (tenue || e.button > 0) return;
    e.preventDefault();
    const ligne = w.parentNode;
    tenue = { rub, w, ligne, id: e.pointerId, x: e.clientX, y: e.clientY, grille: getComputedStyle(ligne).display === "grid", page: defileur(ligne), avant: mobiles(ligne).map((c) => c.getAttribute("data-cle")).join() };
    try { p.setPointerCapture(e.pointerId); } catch (x) {}
    w.classList.add("horg-tenue");
    document.addEventListener("pointermove", bouge);
    document.addEventListener("pointerup", lache);
    document.addEventListener("pointercancel", lache);
    tenue.raf = requestAnimationFrame(boucle);
  }
  function bouge(e) { if (tenue && e.pointerId === tenue.id) { tenue.x = e.clientX; tenue.y = e.clientY; } }
  function lache(e) {
    const t = tenue;
    if (!t || e.pointerId !== t.id) return;
    cancelAnimationFrame(t.raf);
    document.removeEventListener("pointermove", bouge);
    document.removeEventListener("pointerup", lache);
    document.removeEventListener("pointercancel", lache);
    tenue = null;
    t.w.classList.remove("horg-tenue");
    const l = mobiles(t.ligne).map((c) => c.getAttribute("data-cle"));
    if (l.join() !== t.avant) changer(t.rub, l); else APP.homeRafraichir();
  }

  // Barre du mode : titre et consigne, « Par défaut » (deux appuis, 8 s), « Affichage… », aide « ? », « Terminé »
  function barre() {
    const b = el("div", "horg-barre"), tx = el("div", "horg-tx");
    tx.appendChild(el("div", "horg-titre", "Organiser l'accueil"));
    tx.appendChild(el("div", "horg-note", lisible ? "Glissez la poignée d'une carte, ou touchez ‹ et › pour la placer avant ou après. « Affichage » : ce qui est montré." : "Réglage de l'accueil illisible sur le serveur (accueil.json) : rien ne peut être changé."));
    b.appendChild(tx);
    const g = el("div", "horg-act");
    const d = el("button", "b-light horg-defaut" + (defautArme ? " horg-arme" : ""), defautArme ? "Confirmer : tout par défaut" : "Par défaut");
    d.disabled = !lisible;
    d.onclick = () => {
      if (!defautArme) { defautArme = setTimeout(() => { defautArme = null; APP.homeRafraichir(); }, 8000); APP.homeRafraichir(); focus(".horg-defaut"); return; }
      clearTimeout(defautArme); defautArme = null;
      clearTimeout(tEnvoi); tEnvoi = null; attente = {};
      APP.api("POST", "/api/accueil/defaut", { confirm: true }, (err, r) => {
        if (err) APP.banner("Accueil par défaut non appliqué : " + err, "err");
        else { adopter(r); APP.banner("Accueil remis par défaut : ordre d'origine, tout affiché.", "ok"); }
        APP.homeRafraichir(); focus(".horg-defaut");
      });
    };
    const v = el("button", "b-light horg-affb", "Affichage…");
    v.disabled = !lisible;
    v.onclick = affichage;
    const a = bouton("horg-aide", "?", "Aide : organiser l'accueil", aide);
    a.textContent = "?";
    const f = el("button", "b-main horg-fin", "Terminé");
    f.onclick = quitter;
    g.appendChild(d); g.appendChild(v); g.appendChild(a); g.appendChild(f);
    b.appendChild(g);
    return b;
  }
  const focus = (sel) => { const e = document.querySelector("#homeMain " + sel); if (e) e.focus(); };

  // Fenêtre « Affichage de l'accueil » (voile sc-scrim : Retour et Échap la ferment) : rubriques (▲ ▼, Affichée / Masquée), caméras, puis chaque carte ;
  // chaque changement s'applique aussitôt à l'accueil (derrière la fenêtre) et est enregistré comme l'ordre
  function bascule(nom, masque, fn, cle) {
    const b = el("button", "horg-bascule" + (masque ? " horg-off" : ""), "");
    b.innerHTML = (masque ? OEIL_NON : OEIL) + "<span>" + (masque ? "Masquée" : "Affichée") + "</span>";
    b.setAttribute("aria-pressed", masque ? "false" : "true");
    b.setAttribute("aria-label", nom + " : " + (masque ? "masquée, toucher pour afficher" : "affichée, toucher pour masquer"));
    b.setAttribute("data-cle", cle);
    b.onclick = fn;
    return b;
  }
  function ligneF(nom, note, boutons) {
    const l = el("div", "horg-ligne"), t = el("div", "horg-lnom");
    t.appendChild(el("span", "", nom));
    if (note) t.appendChild(el("span", "horg-lnote", note));
    l.appendChild(t);
    boutons.forEach((b) => l.appendChild(b));
    return l;
  }
  function remplir() {
    if (!fen) return;
    const c = fen.corps, haut = c.scrollTop, focusCle = document.activeElement && c.contains(document.activeElement) ? document.activeElement.getAttribute("data-cle") : null;
    c.innerHTML = "";
    c.appendChild(el("p", "horg-aidel", "Ce qui est masqué disparaît de l'accueil ; en mode Organiser, il reste visible, grisé. « Par défaut » réaffiche tout. Réglage commun à tous les appareils."));
    c.appendChild(el("div", "sc-sec", "Rubriques"));
    rubriques().forEach((r, i) => {
      const h = bouton("horg-b", HAUT, "Monter la rubrique " + NOMS[r.cle], () => deplacerRubrique(r.cle, -1)), bs = bouton("horg-b", BAS, "Descendre la rubrique " + NOMS[r.cle], () => deplacerRubrique(r.cle, 1));
      h.disabled = i === 0; bs.disabled = i === RUBS.length - 1;
      h.setAttribute("data-cle", "r-" + r.cle + "-h"); bs.setAttribute("data-cle", "r-" + r.cle + "-b");
      c.appendChild(ligneF(NOMS[r.cle], r.cle === "categories" && APP.tel ? "sur le smartphone : onglet Appareils" : "", [h, bs, bascule("Rubrique " + NOMS[r.cle], r.masquee, () => masquer("rubriques", r.cle, !r.masquee), "r-" + r.cle)]));
    });
    c.appendChild(ligneF("Caméras", APP.tel ? "sous les rubriques" : "colonne de droite", [bascule("Caméras", masques.cameras, () => masquer("cameras", null, !masques.cameras), "cameras")]));
    RUBS.forEach((r) => {
      const l = tous[r] || [];
      if (!l.length) return;
      c.appendChild(el("div", "sc-sec", NOMS[r]));
      l.forEach((x) => c.appendChild(ligneF(x.nom, "", [bascule(x.nom, x.masque, () => masquer(r, x.cle, !x.masque), r + "-" + x.cle)])));
    });
    c.scrollTop = haut;
    if (focusCle) { const e = c.querySelector('[data-cle="' + focusCle + '"]'); if (e && !e.disabled) e.focus(); }
  }
  function affichage() {
    if (fen || !APP.stCompte || !APP.stCompte.fenetre) return;
    fen = APP.stCompte.fenetre("Affichage de l'accueil", () => { fen = null; focus(".horg-affb"); });
    fen.corps.classList.add("horg-fen");
    remplir();
  }

  const AIDE = [
    { titre: "Organiser l'accueil", lignes: ["Menu « ⋯ » › Organiser l'accueil (smartphone : onglet Plus). Chaque carte montre une poignée et deux flèches ; elle ne s'ouvre plus et ses boutons ne commandent plus rien tant que le mode est ouvert.", "Terminé, Retour ou Échap : retour à l'accueil normal. Changer d'écran quitte aussi le mode."] },
    { titre: "Déplacer une carte", lignes: ["Glissez la poignée (six points) : la carte se place sous votre doigt ; près du bord, la ligne (ou la page) défile.", "Sans glisser : ‹ place la carte avant sa voisine, › après. Les cartes restent dans leur rubrique.", "La carte « + » reste au bout des pièces."] },
    { titre: "Choisir ce qui s'affiche", lignes: ["« Affichage… » : ordre des rubriques (▲ ▼), et pour chaque rubrique, la colonne des caméras et chaque carte : Affichée ou Masquée.", "Une carte masquée reste visible, grisée et marquée « Masquée », en mode Organiser : rien n'est jamais perdu.", "Si tout est masqué, l'accueil le dit et rappelle où réafficher. Tout OFF et les menus restent toujours là. Les favoris des cartes Scénarios et Animations se choisissent par l'étoile, dans leur onglet."] },
    { titre: "Enregistrement", lignes: ["Chaque changement est enregistré aussitôt dans les données de cet appareil, pour tous les appareils (smartphone, tablette, mode distant).", "Une nouvelle pièce, catégorie ou carte d'action arrive au bout de sa rubrique, affichée. Une pièce supprimée sort de l'ordre ; pendant une panne (hub ou cloud injoignable), sa place est gardée."] },
    { titre: "Par défaut", lignes: ["« Par défaut », puis « Confirmer » dans les 8 secondes : ordre d'origine des rubriques et des cartes, tout réaffiché."] },
  ];
  function aide() {
    if (!APP.stCompte || !APP.stCompte.fenetre) return;
    const f = APP.stCompte.fenetre("Aide : organiser l'accueil", null);
    AIDE.forEach((s) => {
      f.corps.appendChild(el("div", "sc-sec", s.titre));
      s.lignes.forEach((t) => f.corps.appendChild(el("p", "horg-aidel", APP.lieu(t))));
    });
  }

  function ouvrir() {
    if ((APP.view || "home") !== "home") APP.nav.home();
    actif = true;
    poser();
    lire(true);
    APP.homeRafraichir();
    focus(".horg-fin");
  }
  function quitter() {
    if (!actif) return;
    actif = false;
    if (fen) fen.fermer();
    if (tEnvoi) { clearTimeout(tEnvoi); envoyer(); }
    if (defautArme) { clearTimeout(defautArme); defautArme = null; }
    poser();
    if (masques.cameras && APP.camerasReload) APP.camerasReload(); // colonne masquée : aucun flux ne reste ouvert
    APP.homeRafraichir();
  }
  APP.accueilOrg = {
    trier, decorer, barre, rubriques, vide, poser, ouvrir, quitter,
    actif: () => actif, glisse: () => !!tenue,
    sig: () => JSON.stringify([actif, lisible, !!defautArme, ordre, rubs, masques]),
  };
  (APP.modesDessus = APP.modesDessus || []).push({ actif: () => actif, quitter });
  APP.surVue((name) => { if (name !== "home") quitter(); }, 52);
  APP.surActualisation(() => lire(false), 40);
  $("accOrgBtn").onclick = ouvrir;
  lire(true);
})();
// FIN
