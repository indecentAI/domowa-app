// @zone pieces | Fenêtre « Nouvelle pièce » (préfixe np-, allure et classes hb- de la fenêtre Hubs) : carte « + » au bout de la ligne des pièces de l'accueil (APP.homePieces, home.js), crayon et « + » du volet Pièces (APP.nav.outilsPieces, menu.js) ;
// GET /api/pieces (adaptateurs qui savent créer une pièce, leurs pièces et appareils ON/OFF ; pièces locales et appareils indépendants), nom (1 à 30 caractères, doublon refusé parmi les pièces du hub et locales),
// icône dessinée ici (clés génériques déclarées par l'adaptateur), appareils du hub et indépendants (au moins un en tout ; sans pièce en premier ; « quittera <pièce> » ; sans appareil du hub : pièce locale),
// confirmation en deux appuis, POST /api/pieces, compte rendu (créée, déplacés, non déplacés : jamais annulé ni renvoyé), aide « ? ». Aucune marque. APP.pieces {ouvrir, svg, nomIcone, dessinees, cle, propre}.
(function () {
  const el = APP.el;
  // Dessins locaux des icônes de pièce (clé générique -> chemins SVG 24x24 en trait) ; une clé sans dessin n'est pas proposée.
  const ICONES = {
    maison: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    canape: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12.5a1.8 1.8 0 0 1 3.6 0V14h10.8v-1.5a1.8 1.8 0 0 1 3.6 0V18H3z"/><path d="M5 18v2M19 18v2"/>',
    lit: '<path d="M3 6v14"/><path d="M3 15h18v5"/><path d="M21 15v-2.5A2.5 2.5 0 0 0 18.5 10H11v5"/><circle cx="7" cy="12" r="1.8"/>',
    cuisine: '<path d="M4 11h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M2 12h2M20 12h2"/><path d="M8 11V9.5a4 4 0 0 1 8 0V11"/><path d="M12 5.5V4"/>',
    repas: '<path d="M7 3v7a2 2 0 0 0 2 2v9"/><path d="M11 3v7a2 2 0 0 1-2 2"/><path d="M9 3v5"/><path d="M17 21V3c-2 1.5-3 4-3 7 0 1.5 1 2.5 3 2.5"/>',
    bain: '<path d="M3 12h18v2.5A4.5 4.5 0 0 1 16.5 19h-9A4.5 4.5 0 0 1 3 14.5z"/><path d="M6 12V6.5a2 2 0 0 1 4 0V7"/><path d="M7 19l-1 2M17 19l1 2"/>',
    bureau: '<path d="M3 9h18"/><path d="M5 9v11M19 9v11"/><path d="M13 9v6h6"/><path d="M15.5 12h1"/><path d="M8 9V5h5v4"/>',
    porte: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M4 21h16"/><circle cx="14.5" cy="12" r=".6"/>',
    enfant: '<circle cx="12" cy="13" r="6"/><circle cx="7" cy="6.5" r="2.2"/><circle cx="17" cy="6.5" r="2.2"/><circle cx="10" cy="12" r=".5"/><circle cx="14" cy="12" r=".5"/><path d="M10.5 15.5c1 .8 2 .8 3 0"/>',
    voiture: '<path d="M3 16v-3l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3.5 12.5h17"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>',
    plante: '<path d="M7 15h10l-1.3 6H8.3z"/><path d="M12 15V9"/><path d="M12 10c0-3.5 2-5.5 6-5.5 0 3.5-2 5.5-6 5.5z"/><path d="M12 12c0-2.8-1.6-4.5-5-4.5 0 2.8 1.6 4.5 5 4.5z"/>',
    escalier: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
    linge: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 7h14"/><circle cx="12" cy="14" r="4"/><path d="M8 5h.01M11 5h.01"/>',
    atelier: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17a1.5 1.5 0 0 0 2.1 2.1l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.2-.4-.4-2.2z"/>',
  };
  const NOMS = { maison: "Maison", canape: "Salon", lit: "Chambre", cuisine: "Cuisine", repas: "Repas", bain: "Salle de bain", bureau: "Bureau", porte: "Entrée", enfant: "Enfant", voiture: "Garage", plante: "Jardin", escalier: "Escalier", linge: "Buanderie", atelier: "Atelier" };
  const svg = (k, t) => '<svg width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + ICONES[k] + "</svg>";
  // Même comparaison que le serveur (doublons) : sans accents, sans majuscules, espaces réduits.
  const cle = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const propre = (s) => String(s).normalize("NFC").replace(/\s+/g, " ").trim();

  let root = null, body = null, vue = "form", etat = null, chargeErr = "", cible = null;
  let nom = "", icone = null, coches = {}, cochesL = {}, arme = false, armeT = null, envoi = false, erreur = "", resultat = null;

  function charger() {
    etat = null; chargeErr = ""; rendre();
    APP.api("GET", "/api/pieces", null, (err, d) => {
      if (!root) return;
      if (err || !d || !Array.isArray(d.cibles)) { chargeErr = err || "Lecture impossible."; rendre(); return; }
      etat = d;
      const precedente = cible && d.cibles.find((c) => c.adapter === cible.adapter);
      cible = precedente || d.cibles.find((c) => !c.panne) || d.cibles[0] || null;
      if (cible) {
        const ok = {};
        cible.appareils.forEach((a) => { if (coches[a.id]) ok[a.id] = true; });
        coches = ok;
        const okL = {};
        independants().forEach((a) => { if (cochesL[a.id]) okL[a.id] = true; });
        cochesL = okL;
        if (!icone || !iconesDe(cible).includes(icone)) icone = iconesDe(cible)[0] || null;
      }
      rendre();
    });
  }
  const iconesDe = (c) => (c.icones || []).filter((k) => ICONES[k]);
  const independants = () => (etat && Array.isArray(etat.independants) ? etat.independants : []);
  const locales = () => (etat && Array.isArray(etat.locales) ? etat.locales : []);
  function bouton(cls, texte, fn) { const b = el("button", cls, texte); b.onclick = fn; return b; }
  function desarmer() { arme = false; clearTimeout(armeT); }

  // ---------- état du formulaire ----------
  function verdict() {
    const taille = "1 à " + cible.max + " caractères.";
    const n = propre(nom), nb = Object.keys(coches).length + Object.keys(cochesL).length;
    if (!n) return { ok: false, nom: "", aide: taille };
    if ([...n].length > cible.max) return { ok: false, nom: n, err: "Nom trop long : " + cible.max + " caractères au plus." };
    const meme = cible.pieces.concat(locales()).find((p) => cle(p.nom) === cle(n));
    if (meme) return { ok: false, nom: n, err: "Une pièce « " + meme.nom + " » existe déjà." };
    if (cle(n) === cle("Autres")) return { ok: false, nom: n, err: "« Autres » est réservé à la pièce par défaut." };
    if (!icone) return { ok: false, nom: n, aide: "Choisissez une icône." };
    if (!nb) return { ok: false, nom: n, aide: taille, pied: "Cochez au moins un appareil." };
    return { ok: true, nom: n, aide: taille };
  }
  function choisis() { return cible.appareils.filter((a) => coches[a.id]); }
  function choisisL() { return independants().filter((a) => cochesL[a.id]); }
  function quittent() { return choisis().concat(choisisL()).filter((a) => a.piece); }
  const locale = () => !choisis().length && choisisL().length > 0; // sans appareil du hub : pièce locale (sur la tablette)

  function rendreForm() {
    const box = el("div", "");
    if (chargeErr) { box.appendChild(el("div", "hb-err", chargeErr)); box.appendChild(bouton("b-small hb-large", "Réessayer", charger)); return box; }
    if (!etat) { box.appendChild(el("div", "hb-note", "Lecture des pièces…")); return box; }
    if (!cible) { box.appendChild(el("div", "hb-err", "Aucun hub connecté ne permet de créer une pièce. Connectez un hub (fenêtre Hubs, en touchant l'état en haut de l'écran).")); return box; }
    if (etat.cibles.length > 1) {
      const r = el("div", "np-cibles");
      etat.cibles.forEach((c) => r.appendChild(bouton("np-cible" + (c === cible ? " sel" : ""), c.hub || c.nom, () => { if (envoi) return; cible = c; coches = {}; desarmer(); erreur = ""; charger(); })));
      box.appendChild(r);
    }
    if (cible.panne) {
      box.appendChild(el("div", "hb-err", (cible.hub || cible.nom) + " : " + cible.panne + " Aucune pièce ne peut être créée pour l'instant."));
      box.appendChild(bouton("b-small hb-large", "Réessayer", charger));
      return box;
    }
    const v = verdict(), grille = el("div", "np-grille"), g = el("div", "np-col"), d = el("div", "np-col");
    // Nom
    g.appendChild(el("label", "hb-lab", "Nom"));
    const inp = el("input", "hb-in");
    inp.id = "npNom"; inp.value = nom; inp.maxLength = cible.max; inp.disabled = envoi; inp.autocomplete = "off";
    inp.oninput = () => { nom = inp.value; desarmer(); erreur = ""; majPied(); majNom(); };
    g.appendChild(inp);
    const aide = el("div", "np-aide" + (v.err ? " err" : ""), v.err || v.aide);
    aide.id = "npAideNom";
    g.appendChild(aide);
    // Icône
    // V1.6 : nom de l'icône choisie dans l'étiquette (aucune hauteur en plus : la fenêtre tient sans défilement à 1024x600)
    g.appendChild(el("label", "hb-lab", "Icône" + (icone ? " : " + (NOMS[icone] || icone) : "")));
    const ics = el("div", "np-ics");
    iconesDe(cible).forEach((k) => {
      const b = el("button", "np-ic" + (k === icone ? " sel" : ""));
      b.innerHTML = svg(k, 26); b.title = NOMS[k] || k; b.setAttribute("aria-label", NOMS[k] || k); b.disabled = envoi;
      b.onclick = () => { icone = k; desarmer(); rendre(); };
      ics.appendChild(b);
    });
    g.appendChild(ics);
    const ou = el("div", "hb-bloc np-ou"), l = el("div", "hb-ligne");
    l.appendChild(el("span", "hb-lib", "Créée dans"));
    l.appendChild(el("span", "hb-val", locale() ? APP.lieu("cet appareil (pièce locale)") : cible.hub ? cible.hub + " (" + cible.nom + ")" : cible.nom));
    ou.appendChild(l); g.appendChild(ou);
    // Appareils
    d.appendChild(el("label", "hb-lab", "Appareils à y mettre"));
    const liste = el("div", "np-liste");
    const sans = cible.appareils.filter((a) => !a.piece).sort((a, b) => a.nom.localeCompare(b.nom));
    const autres = cible.appareils.filter((a) => a.piece).sort((a, b) => a.piece.nom.localeCompare(b.piece.nom) || a.nom.localeCompare(b.nom));
    const ligne = (a) => {
      const on = !!coches[a.id], b = el("button", "np-app" + (on ? " sel" : ""));
      b.appendChild(el("span", "np-case", on ? "✓" : ""));
      b.appendChild(el("span", "np-anom", a.nom));
      const etiq = !a.joignable ? "injoignable" : a.piece ? (on ? "quittera " + a.piece.nom : a.piece.nom) : "";
      if (etiq) b.appendChild(el("span", "np-dep" + (!a.joignable ? " ko" : ""), etiq));
      b.disabled = envoi;
      b.onclick = () => { if (coches[a.id]) delete coches[a.id]; else coches[a.id] = true; desarmer(); erreur = ""; rendre(); };
      liste.appendChild(b);
    };
    if (sans.length) { liste.appendChild(el("div", "hb-sec np-sec", "Autres (sans pièce)")); sans.forEach(ligne); }
    if (autres.length) { liste.appendChild(el("div", "hb-sec np-sec", "Dans une autre pièce")); autres.forEach(ligne); }
    if (!cible.appareils.length) liste.appendChild(el("div", "hb-note", "Aucun appareil ON/OFF dans ce hub."));
    // Appareils indépendants (V1.4) : rangés sur la tablette seulement, sans effet sur le hub ; sans pièce en premier
    const ind = independants().slice().sort((a, b) => (a.piece ? 1 : 0) - (b.piece ? 1 : 0) || a.nom.localeCompare(b.nom));
    if (ind.length) {
      liste.appendChild(el("div", "hb-sec np-sec", APP.lieu("Appareils indépendants (rangés sur cet appareil)")));
      ind.forEach((a) => {
        const on = !!cochesL[a.id], b = el("button", "np-app np-ind" + (on ? " sel" : ""));
        b.appendChild(el("span", "np-case", on ? "✓" : ""));
        b.appendChild(el("span", "np-anom", a.nom));
        b.appendChild(el("span", "np-dep", a.piece ? (on ? "quittera " + (a.piece.nom || "sa pièce") : (a.piece.nom || "pièce du hub")) : a.genre));
        b.disabled = envoi;
        b.onclick = () => { if (cochesL[a.id]) delete cochesL[a.id]; else cochesL[a.id] = true; desarmer(); erreur = ""; rendre(); };
        liste.appendChild(b);
      });
    }
    d.appendChild(liste);
    grille.appendChild(g); grille.appendChild(d); box.appendChild(grille);
    // Pied : note, confirmation en deux appuis
    const pied = el("div", "np-pied");
    pied.id = "npPied";
    box.appendChild(pied);
    remplirPied(pied, v);
    return box;
  }
  function majNom() {
    const a = document.getElementById("npAideNom");
    if (!a || !cible) return;
    const v = verdict();
    a.className = "np-aide" + (v.err ? " err" : "");
    a.textContent = v.err || v.aide;
  }
  function majPied() { const p = document.getElementById("npPied"); if (p) { p.replaceChildren(); remplirPied(p, verdict()); } }
  function remplirPied(pied, v) {
    const n = choisis().length, m = choisisL().length, q = quittent(), loc = locale();
    const s = (k) => (k > 1 ? "s" : "");
    if (envoi) {
      pied.appendChild(el("div", "hb-note", loc ? "Création en cours…" : "Création en cours dans le hub…"));
      const b = el("button", "b-main np-go", "Création…"); b.disabled = true; pied.appendChild(b);
      return;
    }
    if (arme && v.ok) {
      let t = loc ? "Créer « " + v.nom + APP.lieu(" » sur cet appareil (pièce locale) et y ranger ") + m + " appareil" + s(m) + " indépendant" + s(m)
        : "Créer « " + v.nom + " » dans le hub et y déplacer " + n + " appareil" + s(n) + (m ? ", et y ranger " + m + " appareil" + s(m) + " indépendant" + s(m) : "");
      if (q.length) t += " (" + (q.length === 1 ? "1 quitte " + q[0].piece.nom : q.length + " quittent leur pièce") + ")";
      pied.appendChild(el("div", "hb-note", t + " ?"));
      pied.appendChild(bouton("b-light np-annuler", "Annuler", () => { desarmer(); rendre(); }));
      pied.appendChild(bouton("b-main np-go np-arme", "Confirmer la création", envoyer));
      return;
    }
    let note = v.pied || (loc ? APP.lieu("Sans appareil du hub, la pièce reste sur cet appareil ; elle sera créée dans le hub dès qu'un appareil du hub y sera rangé.")
      : "La pièce est créée dans le hub (" + cible.nom + ") : elle apparaît aussi dans son application.");
    if (!v.pied && q.length) note += " Les appareils cochés quittent leur pièce actuelle.";
    pied.appendChild(el("div", "hb-note", note));
    const b = bouton("b-main np-go", v.nom ? "Créer « " + v.nom + " »" + (n + m ? " (" + (n + m) + " appareil" + s(n + m) + ")" : "") : "Créer la pièce", () => {
      if (!verdict().ok) return;
      arme = true; clearTimeout(armeT); armeT = setTimeout(() => { arme = false; if (root && vue === "form") rendre(); }, 8000); rendre();
    });
    b.disabled = !v.ok;
    pied.appendChild(b);
  }

  function envoyer() {
    const v = verdict();
    if (!v.ok || envoi) return;
    desarmer(); envoi = true; erreur = ""; rendre();
    const corps = { adapter: cible.adapter, nom: v.nom, icone: icone, appareils: choisis().map((a) => a.id), locaux: choisisL().map((a) => a.id) };
    APP.api("POST", "/api/pieces", corps, (err, d) => {
      envoi = false;
      if (!root) { if (!err) APP.refresh(); return; }
      if (err || !d || !d.piece) {
        // Rien à défaire ni à renvoyer : relecture pour que le doublon éventuel soit vu avant un nouvel essai
        erreur = err || "Réponse illisible."; vue = "form"; charger(); return;
      }
      resultat = { r: d, icone: icone, cible: cible };
      vue = "resultat"; rendre();
      APP.refresh();
    });
  }

  function rendreResultat() {
    const box = el("div", ""), d = resultat.r, c = resultat.cible, s = (k) => (k > 1 ? "s" : "");
    const tete = el("div", "np-fait");
    const rond = el("div", "np-rond"); rond.innerHTML = svg(resultat.icone, 30);
    tete.appendChild(rond); tete.appendChild(el("div", "hb-etape", d.piece.nom));
    box.appendChild(tete);
    const r = d.ranges || [];
    let t = "Pièce « " + d.piece.nom + " » créée " + (d.piece.locale ? APP.lieu("sur cet appareil (pièce locale)") : "dans le hub") + (d.confirmee ? "" : " (confirmée après vérification)") + ". ";
    if (!d.piece.locale) t += d.deplaces.length ? d.deplaces.length + " appareil" + s(d.deplaces.length) + " déplacé" + s(d.deplaces.length) + (d.echecs.length ? " : " + d.deplaces.map((a) => a.nom).join(", ") : "") + ". " : "Aucun appareil déplacé. ";
    if (r.length) t += r.length + " appareil" + s(r.length) + " indépendant" + s(r.length) + " rangé" + s(r.length) + ".";
    box.appendChild(el("div", "hb-ok", t));
    if (d.echecs.length) {
      box.appendChild(el("div", "hb-err", "Non déplacé" + s(d.echecs.length) + " : " + d.echecs.map((a) => a.nom + " (" + String(a.motif).replace(/\.$/, "") + ")").join(", ") +
        ". Rien n'a été annulé ni renvoyé ; vous pouvez le" + (d.echecs.length > 1 ? "s" : "") + " déplacer depuis l'application du hub (" + c.nom + "), ou avec la pastille de sa pièce (appareil sélectionné)."));
    }
    box.appendChild(bouton("b-main hb-large", "Fermer", fermer));
    return box;
  }

  const AIDE = [
    { titre: "Créer une pièce", lignes: [
      "1. Touchez « + » au bout de la ligne des pièces de l'accueil (ou « + » en bas de la section Pièces du menu ; sur le smartphone : onglet Plus › Nouvelle pièce).",
      "2. Tapez le nom (1 à 30 caractères ; un nom déjà pris, même avec d'autres majuscules ou accents, est refusé, comme « Autres », réservé à la pièce par défaut) et touchez une icône.",
      APP.lieu("3. Cochez au moins un appareil : ceux qui n'ont pas de pièce sont en haut. Un appareil déjà rangé quitte sa pièce actuelle (« quittera … »). Les appareils indépendants (lave-linge, appareils SmartThings, caméras) sont en bas : ils sont rangés sur cet appareil, sans effet sur le hub."),
      "4. Touchez « Créer », relisez le résumé, puis « Confirmer la création ». La pièce apparaît sur l'accueil.",
    ] },
    { titre: "Ce qu'il faut savoir", lignes: [
      APP.lieu("Avec au moins un appareil du hub, la pièce est créée dans le hub lui-même : elle apparaît aussi dans l'application du hub. Sans appareil du hub, elle reste sur cet appareil (pièce locale) et sera créée dans le hub dès qu'un appareil du hub y sera rangé."),
      "Pour renommer, changer l'icône, ranger des appareils ou supprimer une pièce : crayon de sa carte sur l'accueil (ou appui long sur la carte), ou crayon en bas de la section Pièces du menu.",
      "Si le hub ne répond pas, rien n'est créé et un message l'indique.",
      "Si la pièce est créée mais qu'un appareil n'a pas pu y être déplacé, la fenêtre le dit : rien n'est annulé ni renvoyé automatiquement. Rangez-le ensuite avec la pastille de sa pièce (appareil sélectionné).",
      "« Résultat inconnu » : le hub n'a pas répondu à temps. Rouvrez la fenêtre : si la pièce existe déjà, son nom est refusé ; sinon, vous pouvez réessayer.",
    ] },
  ];
  // Aide « ? » commune aux fenêtres de pièces : « ← Retour » (retour()), puis une section hb-sec / hb-bloc par entrée
  function aide(sections, retour) {
    const box = el("div", "");
    box.appendChild(bouton("b-small hb-retour", "← Retour", retour));
    sections.forEach((s) => {
      box.appendChild(el("div", "hb-sec", s.titre));
      const b = el("div", "hb-bloc");
      s.lignes.forEach((l) => b.appendChild(el("p", "hb-p", l)));
      box.appendChild(b);
    });
    return box;
  }
  const rendreAide = () => aide(AIDE, () => { vue = resultat ? "resultat" : "form"; rendre(); });
  // Cadre commun des fenêtres de pièces (Nouvelle pièce, Pièces, Ranger) : voile hb-scrim (toucher du fond : o.fermer), panneau hb-panel o.panneau,
  // tête (titre, « ? » si o.aide, « × » de classe o.fermerCls), corps hb-body (+ o.corps) -> {root, body}
  function cadre(o) {
    const root = el("div", "hb-scrim");
    root.id = o.id;
    root.onclick = (e) => { if (e.target === root) o.fermer(); };
    const panel = el("div", "hb-panel " + o.panneau), head = el("div", "hb-head"), ics = el("div", "hb-ics");
    head.appendChild(el("div", "hb-titre", o.titre));
    const ic = (t, titre, fn, cls) => { const b = el("button", "hb-ic" + (cls ? " " + cls : ""), t); b.title = titre; b.setAttribute("aria-label", titre); b.onclick = fn; ics.appendChild(b); };
    if (o.aide) ic("?", "Aide", o.aide);
    ic("×", "Fermer", o.fermer, o.fermerCls);
    head.appendChild(ics);
    const body = el("div", "hb-body" + (o.corps ? " " + o.corps : ""));
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    return { root, body };
  }
  function rendre() {
    if (!root) return;
    body.replaceChildren(vue === "aide" ? rendreAide() : vue === "resultat" ? rendreResultat() : rendreForm());
    if (erreur && vue === "form") body.appendChild(el("div", "hb-err", erreur));
    const f = root.querySelector(".np-fermer");
    if (f) f.disabled = envoi;
  }
  function fermer() {
    if (!root || envoi) return;
    desarmer();
    document.body.removeChild(root); root = null; body = null;
    etat = null; cible = null; nom = ""; icone = null; coches = {}; cochesL = {}; erreur = ""; resultat = null; vue = "form";
  }
  function ouvrir() {
    if (root) return;
    ({ root, body } = cadre({ id: "piecesFenetre", panneau: "np-panel", titre: "Nouvelle pièce", fermer, fermerCls: "np-fermer",
      aide: () => { if (envoi) return; vue = vue === "aide" ? (resultat ? "resultat" : "form") : "aide"; rendre(); } }));
    vue = "form"; charger();
  }
  // Accueil : carte « + » au bout de la ligne des pièces (home.js) ; volet de navigation : crayon (fenêtre « Pièces ») et « + » en bas de la section Pièces (menu.js)
  const CRAYON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const PLUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  APP.homePieces(() => {
    const w = el("div", "hwrap hplusw"), b = el("button", "hcard hplus", "");
    b.id = "npOuvrir"; b.title = "Nouvelle pièce"; b.setAttribute("aria-label", "Nouvelle pièce");
    b.innerHTML = PLUS;
    b.onclick = ouvrir;
    w.appendChild(b);
    return w;
  });
  APP.nav.outilsPieces((fermerMenu) => {
    const r = el("div", "np-outils");
    const ed = el("button", "np-outil", ""), nv = el("button", "np-outil", "");
    ed.id = "menuPiecesModifier"; ed.title = "Modifier les pièces"; ed.setAttribute("aria-label", "Modifier les pièces"); ed.innerHTML = CRAYON;
    ed.onclick = () => { fermerMenu(); if (APP.piecesGestion) APP.piecesGestion.ouvrir(APP.view === "lights" && APP.room && APP.room !== "all" && APP.room !== "none" ? APP.room : null); };
    nv.id = "menuPiecesNouvelle"; nv.title = "Nouvelle pièce"; nv.setAttribute("aria-label", "Nouvelle pièce"); nv.innerHTML = PLUS;
    nv.onclick = () => { fermerMenu(); ouvrir(); };
    r.appendChild(ed); r.appendChild(nv);
    return r;
  });
  APP.pieces = { ouvrir: ouvrir, cadre: cadre, aide: aide, svg: svg, nomIcone: (k) => NOMS[k] || k, dessinees: (l) => (l || []).filter((k) => ICONES[k]), cle: cle, propre: propre };
})();
// FIN
