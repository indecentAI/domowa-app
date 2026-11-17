// @zone animations | Onglet Animations (V1.5, #viewAnim, prefixe an-) : liste (lancer, arreter, modifier, dupliquer, supprimer ; animations en cours, lampes ignorees, suspension),
// editeur en liste d'etapes (comme le volet Animation de PowerPoint) avec frise en apercu et controle de cadence en direct (POST /api/animations/verifier), Essayer ;
// assistants (cycle de couleurs, respiration, aube, crepuscule, vague, bougie, feu de cheminee, sous l'eau, aurore boreale, pastels, arc-en-ciel defilant, coucher de soleil, veilleuse, fete : decalage minimal ajoute s'il le faut) ; choix ordonne des lampes ; aide « ? » ; V1.6, telephone (APP.tel) : « + Nouvelle animation » dans un pied, editeur en volets Etapes / Etape / Animation en portrait.
// Favorites (etoile, POST /api/animations/:id/favori) : icones dans la carte « Animations » de la ligne Actions de l'accueil (APP.homeActions, APP.homeFavoris de home.js),
// toucher = lancer ou arreter ; entree du menu (APP.nav.action) ; APP.animations {majEtat}. Lecture GET /api/animations a chaque actualisation (crochet APP.surActualisation, ordre 20), toutes les 4 s si une animation tourne ou si l'onglet est ouvert.
// Aucune regle de prevision (etats changeants) : l'affichage suit la reponse de chaque POST. Crochet de vue APP.surVue (ordre 10).
(function () {
  const $ = APP.$, el = APP.el, VUE = "animations";
  let etat = { animations: [], enCours: [], finies: [], limites: null, lampes: null };
  let ouverte = false, mode = "liste", brouillon = null, editId = null, choix = 0, volet = "etapes", modifie = false, verif = null, verifT = null, verifRev = 0, envoi = false, pollT = null, carte = null;

  // --- Formats
  const virgule = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  function duree(s) {
    if (s < 60) return virgule(s) + " s";
    if (s < 3600) { const m = Math.floor(s / 60), r = Math.round(s - m * 60); return m + " min" + (r ? " " + r + " s" : ""); }
    const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60); return h + " h" + (m ? " " + m + " min" : "");
  }
  const plur = (n, mot) => n + " " + mot + (n > 1 ? "s" : "");
  // Instants des etapes (meme calcul que horaire() de modules/animations-plan.mjs) : [{debut, fin}] et cycle
  function horaire(a) {
    const et = []; let prec = null;
    a.etapes.forEach((e) => {
      const base = !prec ? 0 : (e.depart === "avec" ? prec.debut : prec.fin);
      const debut = base + (e.delai || 0), fin = debut + (e.lampes.length - 1) * (e.decalage || 0) + e.duree;
      prec = { debut, fin }; et.push(prec);
    });
    return { etapes: et, cycle: Math.max(1, ...et.map((x) => x.fin)) };
  }
  const nomLampe = (id) => { const l = (etat.lampes || []).find((x) => x.id === id); return l ? l.nom : "(lampe absente)"; };
  function couleurCible(e) {
    if (e.off) return "#20252f";
    if (e.cible && e.cible.type === "couleur") return APP.colorOf(true, "color", e.cible.teinte, e.cible.saturation / 100);
    if (e.cible && e.cible.type === "blanc") return APP.colorOf(true, "temperature", null, null, e.cible.kelvin);
    return "rgba(233,238,247," + (0.25 + 0.6 * (e.luminosite || 50) / 100) + ")";
  }
  const COURBES = [["lineaire", "Linéaire"], ["acceleree", "Accélérée"], ["ralentie", "Ralentie"], ["douce", "Douce"]];
  function resumeEtape(e, i) {
    let c = "OFF";
    if (!e.off) {
      const p = [];
      if (e.cible && e.cible.type === "couleur") p.push(e.cible.saturation < 15 ? "blanc pur" : "teinte " + e.cible.teinte + "°");
      if (e.cible && e.cible.type === "blanc") p.push(e.cible.kelvin + " K");
      if (e.luminosite) p.push(e.luminosite + " %");
      c = "Vers " + (p.length ? p.join(", ") : "?");
    }
    const t = [plur(e.lampes.length, "lampe"), duree(e.duree)];
    if (e.decalage) t.push("décalage " + duree(e.decalage));
    if (i > 0) t.push((e.depart === "avec" ? "avec" : "après") + " la précédente" + (e.delai ? " + " + duree(e.delai) : ""));
    else if (e.delai) t.push("après " + duree(e.delai));
    if (!e.off && e.courbe !== "lineaire") t.push(COURBES.find((x) => x[0] === e.courbe)[1].toLowerCase());
    return [c, t.join(" · ")];
  }
  const enCoursDe = (id) => etat.enCours.find((r) => r.cle === id) || null;

  // --- Lecture et etat
  function majEtat(d) {
    if (!d) return;
    ["animations", "enCours", "finies", "limites", "lampes"].forEach((k) => { if (d[k] !== undefined && (k !== "lampes" || d[k])) etat[k] = d[k]; });
    planifier();
    if (carte) majCarte();
    if (ouverte) rendre(); // l'editeur ne se reconstruit pas (saisie gardee) : seuls ses boutons suivent
    if (APP.renderHome) APP.renderHome();
    if (APP.view === "scenes" && APP.renderScenes) APP.renderScenes();
  }
  function charger(cb) {
    APP.api("GET", "/api/animations", null, (err, d) => { if (!err && d) majEtat(d); if (cb) cb(err); });
  }
  function planifier() {
    const besoin = etat.enCours.length > 0 || ouverte;
    if (besoin && !pollT) pollT = setInterval(() => { if (!document.hidden) charger(); }, 4000);
    if (!besoin && pollT) { clearInterval(pollT); pollT = null; }
  }
  APP.surActualisation(charger, 20);
  function poster(url, corps, okMsg, cb) {
    if (envoi) return;
    envoi = true; if (ouverte) rendre();
    APP.api("POST", url, corps || {}, (err, d) => {
      envoi = false;
      if (err) { APP.banner(err, "err"); if (ouverte) rendre(); if (cb) cb(err, d); return; }
      majEtat(d);
      if (okMsg) APP.banner(okMsg, "ok");
      if (cb) cb(null, d);
    });
  }

  // --- Fenetres (cadre et classes hb- de la fenetre Hubs)
  function fenetre(titre, large) {
    const scrim = el("div", "hb-scrim an-fen"), panel = el("div", "hb-panel" + (large ? " an-large" : "")), head = el("div", "hb-head"), body = el("div", "hb-body");
    const fermer = () => { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); };
    head.appendChild(el("div", "hb-titre", titre));
    const x = el("button", "hb-ic", "×"); x.setAttribute("aria-label", "Fermer"); x.onclick = fermer;
    head.appendChild(x);
    panel.appendChild(head); panel.appendChild(body); scrim.appendChild(panel);
    scrim.onclick = (e) => { if (e.target === scrim) fermer(); };
    document.body.appendChild(scrim);
    return { body, fermer, panel };
  }
  function bouton(cls, texte, fn) { const b = el("button", cls, texte); b.onclick = fn; return b; }

  // --- Aide « ? »
  const AIDE = [
    { titre: "Principe", lignes: [
      "Une animation est une suite d'étapes. Chaque étape fait glisser des lampes choisies vers une couleur ou un blanc et une luminosité, pendant une durée : c'est la lampe qui fait le fondu.",
      "Il n'y a pas de valeur fixe : une étape part toujours de l'état où la lampe se trouve. Pour garder une couleur un moment, faites une étape plus longue.",
    ] },
    { titre: "Étapes", lignes: [
      "Départ « après la précédente » : l'étape commence quand la précédente est finie (toutes ses lampes). « Avec la précédente » : elle commence en même temps. Le délai s'ajoute dans les deux cas.",
      "« OFF » (sur la ligne Luminosité) : la lampe passe OFF, avec le fondu de la lampe. Une étape suivante la repasse ON (à sa dernière luminosité), puis la fait glisser. Pour une extinction lente : une étape vers 1 %, puis une étape OFF.",
      "Courbe : linéaire (fondu de la lampe), accélérée (lente puis rapide), ralentie (rapide puis lente), douce (lente au début et à la fin). Les courbes autres que linéaire se font en 2 à 4 petits glissements : elles comptent plusieurs commandes.",
    ] },
    { titre: "Sur le téléphone", lignes: [
      "En portrait, l'éditeur a trois volets : Étapes (frise et liste des étapes), Étape (l'étape choisie : lampes, luminosité, couleur, départ, durée, décalage, courbe) et Animation (nom, icône, En boucle, Retour au départ). Toucher une étape, ou en ajouter une, ouvre le volet Étape. Essayer et Enregistrer restent en bas.",
      "En paysage, l'éditeur est comme sur la tablette : étapes à gauche, étape choisie à droite. Tourner le téléphone garde le brouillon."
    ] },
    { titre: "Vagues (décalage)", lignes: [
      "Le décalage fait démarrer chaque lampe un peu après la précédente, dans l'ordre où vous les avez choisies (les numéros dans la liste des lampes). Exemple : 8 lampes en cercle, bleu en 0,5 s puis blanc en 0,5 s avec la précédente + 0,5 s, décalage 0,5 s, en boucle : le bleu fait le tour.",
    ] },
    { titre: "Limites (pour le hub et pour les yeux)", lignes: [
      "4 commandes par seconde au plus en tout, et 0,5 s au moins entre deux changements d'une même lampe (pas de clignotement). Le bandeau du haut de l'éditeur indique le pic et dit ce qui dépasse.",
      "Le hub n'applique qu'une valeur par commande : changer la luminosité et la couleur (ou le blanc) d'une lampe en même temps fait deux commandes, envoyées l'une juste après l'autre (les deux fondus avancent ensemble). Passer une lampe ON en ajoute une. Avec plusieurs lampes, un petit décalage ou « Luminosité inchangée » laisse plus de place.",
      "Au-delà de 4 lampes, un changement simultané dépasse le plafond : ajoutez un petit décalage (les modèles le font d'eux-mêmes).",
      "3 animations au plus en même temps ; une lampe n'est animée que par une seule.",
    ] },
    { titre: "Lancer et arrêter", lignes: [
      "« Essayer » lance l'animation sans l'enregistrer. « Lancer » sur une carte lance une animation enregistrée.",
      "Arrêt : bouton « Arrêter », ou fin d'une animation sans boucle. Avec « retour au départ », les lampes reviennent en 1 s à leur état du lancement.",
      "Tout OFF arrête toutes les animations. Une commande donnée depuis l'application à une lampe animée la retire de l'animation ; une lampe passée OFF hors de l'application aussi. Une lampe injoignable est ignorée ; si le hub ne répond plus, l'animation est suspendue puis reprend (arrêtée après 5 min).",
      APP.distant ? "Après un redémarrage du serveur, aucune animation ne reprend." : "Après un redémarrage du serveur (ou de cet appareil), aucune animation ne reprend.",
    ] },
    { titre: "Favorites et accueil", lignes: [
      "Touchez l'étoile d'une animation pour en faire une favorite : son icône apparaît dans la carte « Animations » de l'accueil, comme les scénarios favoris dans la carte « Scénarios ».",
      "Sur l'accueil, toucher l'icône lance l'animation ; elle s'entoure de blanc tant que l'animation tourne, et la toucher à nouveau l'arrête. Toucher le reste de la carte ouvre l'onglet Animations.",
    ] },
  ];
  function aide() {
    const f = fenetre("Aide : animations");
    AIDE.forEach((s) => {
      f.body.appendChild(el("div", "hb-sec", s.titre));
      const b = el("div", "hb-bloc");
      s.lignes.forEach((l) => b.appendChild(el("p", "hb-p", l)));
      f.body.appendChild(b);
    });
    f.body.appendChild(bouton("b-main hb-large", "Fermer", f.fermer));
  }

  // --- Choix ordonne des lampes (ordre = ordre du decalage)
  function choisirLampes(titre, actuelles, fini) {
    const f = fenetre(titre), sel = actuelles.slice(), lampes = etat.lampes || [];
    function rendreChoix() {
      f.body.innerHTML = "";
      f.body.appendChild(el("p", "hb-note", "Touchez les lampes dans l'ordre voulu : le numéro est l'ordre du décalage (vague). " + (etat.limites ? etat.limites.lampes : 20) + " lampes au plus."));
      if (!lampes.length) f.body.appendChild(el("div", "hb-err", "Aucune lampe animable (hub injoignable ?)."));
      const pieces = [];
      lampes.forEach((l) => { const p = l.piece || "Autres"; if (pieces.indexOf(p) < 0) pieces.push(p); });
      pieces.forEach((p) => {
        f.body.appendChild(el("div", "hb-sec", p));
        const g = el("div", "an-lgrille");
        lampes.filter((l) => (l.piece || "Autres") === p).forEach((l) => {
          const k = sel.indexOf(l.id), b = el("button", "an-lampe" + (k >= 0 ? " sel" : ""), "");
          b.appendChild(el("span", "an-num", k >= 0 ? String(k + 1) : ""));
          const t = el("span", "an-ltxt", "");
          t.appendChild(el("span", "an-lnom", l.nom));
          t.appendChild(el("span", "an-lcap", (l.couleur ? "couleur" : l.blanc ? "blanc réglable" : "luminosité") + (l.joignable ? "" : " · injoignable")));
          b.appendChild(t);
          b.onclick = () => { if (k >= 0) sel.splice(k, 1); else if (sel.length < 20) sel.push(l.id); rendreChoix(); };
          g.appendChild(b);
        });
        f.body.appendChild(g);
      });
      const r = el("div", "hb-rang");
      r.appendChild(bouton("b-light", "Inverser l'ordre", () => { sel.reverse(); rendreChoix(); }));
      r.appendChild(bouton("b-light", "Effacer", () => { sel.length = 0; rendreChoix(); }));
      const ok = bouton("b-main an-ok", sel.length ? "OK (" + sel.length + ")" : "OK", () => { f.fermer(); fini(sel.slice()); });
      ok.disabled = !sel.length;
      r.appendChild(ok);
      f.body.appendChild(r);
    }
    rendreChoix();
  }

  // --- Icone (memes icones que les scenarios : APP.sceneIcons de scenes.js)
  function choisirIcone(actuelle, fini) {
    const wrap = el("div", "ipick"), pan = el("div", "ipanel"), grid = el("div", "igrid");
    const fermer = () => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
    wrap.onclick = (e) => { if (e.target === wrap) fermer(); };
    pan.appendChild(el("div", "ititle", "Icône de l'animation"));
    (APP.sceneIcons || []).forEach((ic) => {
      const b = el("button", "iopt" + (actuelle === ic.k ? " sel" : ""), "");
      b.innerHTML = APP.sceneIcon(ic.k); b.title = ic.t; b.setAttribute("aria-label", ic.t);
      b.onclick = () => { fermer(); fini(ic.k); };
      grid.appendChild(b);
    });
    pan.appendChild(grid);
    pan.appendChild(bouton("inone", "Aucune icône", () => { fermer(); fini(null); }));
    wrap.appendChild(pan); document.body.appendChild(wrap);
  }

  // --- Assistants (modeles) : etapes generees pour les lampes choisies ; decalage minimal ajoute si le plafond l'exige
  const et = (o) => Object.assign({ depart: "apres", delai: 0, decalage: 0, courbe: "lineaire", luminosite: null, cible: null }, o);
  const coul = (t, s) => ({ type: "couleur", teinte: t, saturation: s }), blanc = (k) => ({ type: "blanc", kelvin: k });
  const MODELES = [
    { cle: "cycle", nom: "Cycle de couleurs", icone: "palette", texte: "Rouge, vert, bleu, en boucle (20 s par couleur).", fab: (L, d) => ({ boucle: true, reset: false, etapes: [
      et({ lampes: L, duree: 20, decalage: d, cible: coul(0, 100) }), et({ lampes: L, duree: 20, decalage: d, cible: coul(120, 100) }), et({ lampes: L, duree: 20, decalage: d, cible: coul(240, 100) })] }) },
    { cle: "respiration", nom: "Respiration", icone: "cloud", texte: "La luminosité descend puis remonte doucement, en boucle (3 s + 3 s).", fab: (L, d) => ({ boucle: true, reset: true, etapes: [
      et({ lampes: L, duree: 3, decalage: d, courbe: "douce", luminosite: 15 }), et({ lampes: L, duree: 3, decalage: d, courbe: "douce", luminosite: 100 })] }) },
    { cle: "aube", nom: "Aube", icone: "sunrise", texte: "ON au minimum en blanc très chaud, monte à 20 %, puis blanc neutre à 100 % (10 min + 20 min).", fab: (L, d) => ({ boucle: false, reset: false, etapes: [
      et({ lampes: L, duree: 1, decalage: Math.max(1, d), luminosite: 1, cible: blanc(2200) }), et({ lampes: L, duree: 600, decalage: d, courbe: "douce", luminosite: 20 }),
      et({ lampes: L, duree: 1200, decalage: d, courbe: "douce", luminosite: 100, cible: blanc(4000) })] }) },
    { cle: "crepuscule", nom: "Crépuscule", icone: "sunset", texte: "Glisse vers un blanc chaud à 30 %, puis vers 1 %, puis OFF (10 min + 10 min).", fab: (L, d) => ({ boucle: false, reset: false, etapes: [
      et({ lampes: L, duree: 600, decalage: d, courbe: "douce", luminosite: 30, cible: blanc(2200) }), et({ lampes: L, duree: 600, decalage: d, courbe: "ralentie", luminosite: 1 }),
      et({ lampes: L, duree: 0.5, decalage: d, off: true })] }) },
    { cle: "vague", nom: "Vague", icone: "sparkles", texte: "Un bleu passe de lampe en lampe dans l'ordre choisi, en boucle (0,5 s par lampe).", fab: (L, d) => ({ boucle: true, reset: true, etapes: [
      et({ lampes: L, duree: 0.5, decalage: Math.max(0.5, d), cible: coul(240, 100) }), et({ lampes: L, depart: "avec", delai: 0.5, duree: 0.5, decalage: Math.max(0.5, d), cible: coul(0, 0) })] }) },
    // Modeles inspires des effets du commerce (bougie, cheminee, ocean, aurore, pastels, prisme, fete...) : fondus de 1 s au moins, decalage qui desynchronise les lampes
    { cle: "bougie", nom: "Bougie", icone: "flame", texte: "Blanc très chaud dont la luminosité vacille doucement, chaque lampe à son rythme.", fab: (L, d) => ({ boucle: true, reset: true, etapes: [
      et({ lampes: L, duree: 1.5, decalage: Math.max(0.7, d), luminosite: 60, cible: blanc(2200) }), et({ lampes: L, duree: 1, decalage: Math.max(0.7, d), luminosite: 35 }),
      et({ lampes: L, duree: 2, decalage: Math.max(0.7, d), luminosite: 70 }), et({ lampes: L, duree: 1.2, decalage: Math.max(0.7, d), luminosite: 45 })] }) },
    { cle: "cheminee", nom: "Feu de cheminée", icone: "home", texte: "Orange, rouge et ambre qui se mêlent, luminosité changeante (lampes couleur).", fab: (L, d) => ({ boucle: true, reset: true, etapes: [
      et({ lampes: L, duree: 2, decalage: Math.max(0.6, d), luminosite: 70, cible: coul(25, 100) }), et({ lampes: L, duree: 1.5, decalage: Math.max(0.6, d), luminosite: 45, cible: coul(8, 100) }),
      et({ lampes: L, duree: 2.5, decalage: Math.max(0.6, d), luminosite: 85, cible: coul(38, 90) }), et({ lampes: L, duree: 1.5, decalage: Math.max(0.6, d), luminosite: 55, cible: coul(15, 100) })] }) },
    { cle: "ocean", nom: "Sous l'eau", icone: "wind", texte: "Bleus et cyans qui ondulent d'une lampe à l'autre (environ 18 s par vague).", fab: (L, d) => ({ boucle: true, reset: true, etapes: [
      et({ lampes: L, duree: 6, decalage: Math.max(1.5, d), luminosite: 60, cible: coul(215, 100) }), et({ lampes: L, depart: "avec", delai: 6, duree: 5, decalage: Math.max(1.5, d), luminosite: 85, cible: coul(188, 80) }),
      et({ lampes: L, depart: "avec", delai: 5, duree: 7, decalage: Math.max(1.5, d), luminosite: 40, cible: coul(235, 100) })] }) },
    { cle: "aurore", nom: "Aurore boréale", icone: "moon", texte: "Vert, turquoise et violet qui glissent très lentement (15 s par couleur).", fab: (L, d) => ({ boucle: true, reset: true, etapes: [
      et({ lampes: L, duree: 15, decalage: Math.max(3, d), luminosite: 60, cible: coul(130, 90) }), et({ lampes: L, depart: "avec", delai: 15, duree: 15, decalage: Math.max(3, d), luminosite: 80, cible: coul(172, 85) }),
      et({ lampes: L, depart: "avec", delai: 15, duree: 15, decalage: Math.max(3, d), luminosite: 50, cible: coul(280, 70) })] }) },
    { cle: "pastels", nom: "Pastels", icone: "heart", texte: "Rose, bleu ciel, jaune et lavande très doux, en boucle (10 s par couleur).", fab: (L, d) => ({ boucle: true, reset: true, etapes: [
      et({ lampes: L, duree: 10, decalage: d, luminosite: 70, cible: coul(330, 35) }), et({ lampes: L, duree: 10, decalage: d, cible: coul(200, 35) }),
      et({ lampes: L, duree: 10, decalage: d, cible: coul(50, 40) }), et({ lampes: L, duree: 10, decalage: d, cible: coul(270, 35) })] }) },
    { cle: "prisme", nom: "Arc-en-ciel défilant", icone: "zap", texte: "Les six couleurs de l'arc-en-ciel avancent de lampe en lampe (4 s par couleur, plus avec beaucoup de lampes).", fab: (L, d) => {
      const t = Math.max(4, Math.ceil(L.length / 3.5 * 10) / 10);
      return { boucle: true, reset: true, etapes: [0, 60, 120, 180, 240, 300].map((h) => et({ lampes: L, depart: h ? "avec" : "apres", delai: h ? t : 0, duree: t, decalage: Math.max(1, d), cible: coul(h, 100) })) };
    } },
    { cle: "soleil", nom: "Coucher de soleil", icone: "sun", texte: "Orange, rose puis rouge profond de plus en plus bas, puis OFF (environ 18 min).", fab: (L, d) => ({ boucle: false, reset: false, etapes: [
      et({ lampes: L, duree: 300, decalage: d, courbe: "douce", luminosite: 80, cible: coul(30, 100) }), et({ lampes: L, duree: 300, decalage: d, courbe: "douce", luminosite: 50, cible: coul(340, 70) }),
      et({ lampes: L, duree: 300, decalage: d, courbe: "douce", luminosite: 20, cible: coul(5, 100) }), et({ lampes: L, duree: 180, decalage: d, courbe: "ralentie", luminosite: 1 }),
      et({ lampes: L, duree: 0.5, decalage: d, off: true })] }) },
    { cle: "veilleuse", nom: "Veilleuse", icone: "bed", texte: "Glisse en 2 min vers un blanc très chaud à 10 %, puis reste ainsi.", fab: (L, d) => ({ boucle: false, reset: false, etapes: [
      et({ lampes: L, duree: 120, decalage: d, courbe: "ralentie", luminosite: 10, cible: blanc(2200) })] }) },
    // Fete : une couleur par lampe et par seconde et demie au moins ; plus de lampes = changements plus lents (4 commandes par seconde au plus)
    { cle: "fete", nom: "Fête", icone: "music", texte: "Couleurs vives qui changent de lampe en lampe, sans clignotement (fondus de 1,5 s au moins).", fab: (L, d) => {
      const t = Math.max(1.5, Math.ceil(L.length / 3.5 * 10) / 10);
      return { boucle: true, reset: true, etapes: [0, 120, 240, 60, 300, 180].map((h) => et({ lampes: L, depart: h ? "avec" : "apres", delai: h ? t : 0, duree: t, decalage: Math.max(0.5, d), cible: coul(h, 100) })) };
    } },
  ];
  function assistants() {
    const f = fenetre("À partir d'un modèle");
    f.body.appendChild(el("p", "hb-note", "Choisissez un modèle, puis ses lampes (dans l'ordre de la vague) : l'éditeur s'ouvre, tout reste modifiable avant d'enregistrer."));
    MODELES.forEach((m) => {
      const b = el("button", "an-modele", "");
      const ic = el("span", "an-mic", ""); ic.innerHTML = APP.sceneIcon(m.icone, 24) || ""; b.appendChild(ic);
      const t = el("span", "an-ltxt", ""); t.appendChild(el("span", "an-lnom", m.nom)); t.appendChild(el("span", "an-lcap", m.texte)); b.appendChild(t);
      b.onclick = () => { f.fermer(); choisirLampes("Lampes : " + m.nom, [], (L) => genererModele(m, L)); };
      f.body.appendChild(b);
    });
  }
  function genererModele(m, L) {
    const essais = [0, 0.25, 0.5, 1, 2, 4];
    (function suivant(i) {
      const a = Object.assign({ nom: m.nom, icone: m.icone }, m.fab(L, essais[i]));
      APP.api("POST", "/api/animations/verifier", { animation: a }, (err, v) => {
        if (!err && v && !v.ok && i + 1 < essais.length && /Trop rapide|moins de 0,5 s/.test(v.erreurs.join())) { suivant(i + 1); return; }
        ouvrirEditeur(a, null, true);
        if (essais[i] > 0) APP.banner("Décalage de " + virgule(essais[i]) + " s ajouté entre les lampes pour rester sous 4 commandes par seconde.", "ok");
      });
    })(0);
  }

  // --- Liste
  function rendre() {
    const v = $("viewAnim");
    if (mode === "editeur") { majBoutonsEditeur(); return; }
    v.innerHTML = "";
    const barre = el("div", "an-barre");
    const nouvelle = bouton("b-main an-nouv", "+ Nouvelle animation", () => ouvrirEditeur(null, null, false));
    if (!APP.tel) barre.appendChild(nouvelle); // V1.6 : sur le téléphone, dans le pied collé en bas (ajouté en fin de vue)
    barre.appendChild(bouton("b-light", "À partir d'un modèle", assistants));
    barre.appendChild(el("span", "hint", APP.lieu("Tourne sur cet appareil ; 4 commandes par seconde au plus.")));
    const q = bouton("hb-ic an-aide", "?", aide); q.setAttribute("aria-label", "Aide");
    barre.appendChild(q);
    v.appendChild(barre);
    // Animations en cours (dont essais) et fins notables
    if (etat.enCours.length) {
      const b = el("div", "an-cours");
      etat.enCours.forEach((r) => {
        const l = el("div", "an-run" + (r.etat === "suspendue" ? " susp" : ""));
        const t = el("div", "an-rtxt", "");
        t.appendChild(el("span", "an-rnom", (r.etat === "suspendue" ? "⏸ " : "▶ ") + r.nom));
        const d = [plur(r.lampes.length, "lampe"), r.boucle ? "en boucle" : "cycle de " + duree(r.cycle)];
        if (r.etat === "suspendue") d.push("suspendue : " + r.motif);
        if (r.ignorees.length) d.push("ignorée(s) : " + r.ignorees.map((x) => x.nom + " (" + x.motif + ")").join(", "));
        t.appendChild(el("span", "an-rdet", d.join(" · ")));
        l.appendChild(t);
        l.appendChild(bouton("b-small an-arret", "Arrêter", () => poster("/api/animations/" + (r.essai ? "essai" : r.cle) + "/arreter", {}, "Animation arrêtée.")));
        b.appendChild(l);
      });
      v.appendChild(b);
    }
    const liste = el("div", "an-liste");
    if (!etat.animations.length) liste.appendChild(el("p", "an-vide", "Aucune animation. Créez-en une, ou partez d'un modèle."));
    etat.animations.forEach((a) => liste.appendChild(carteAnim(a)));
    v.appendChild(liste);
    const fin = etat.finies[0];
    if (fin && (fin.raison === "panne" || fin.raison === "vide") && Date.now() - new Date(fin.fin).getTime() < 60000) v.appendChild(el("div", "hb-err an-fin", "« " + fin.nom + " » arrêtée : " + fin.motif));
    if (APP.tel) { const pied = el("div", "an-pied"); pied.appendChild(nouvelle); v.appendChild(pied); }
  }
  const ICON_EDIT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICON_COPIE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
  const ICON_STAR = '<svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="12 2.5 15.1 8.7 22 9.7 17 14.5 18.2 21.4 12 18.1 5.8 21.4 7 14.5 2 9.7 8.9 8.7"/></svg>';
  const ICON_TRASH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
  function icBouton(svg, titre, fn, cls) { const b = el("button", "sicon " + (cls || ""), ""); b.innerHTML = svg; b.title = titre; b.setAttribute("aria-label", titre); b.onclick = fn; return b; }
  function carteAnim(a) {
    const r = enCoursDe(a.id), c = el("div", "scard an-carte" + (r ? " actif" : "")), head = el("div", "shead");
    const slot = el("div", "sslot" + (a.icone ? "" : " empty"), ""); slot.innerHTML = (a.icone && APP.sceneIcon(a.icone)) || "";
    head.appendChild(slot);
    const nm = el("div", "sname", a.nom); nm.title = a.nom; head.appendChild(nm);
    head.appendChild(icBouton(ICON_EDIT, "Modifier", () => ouvrirEditeur(a, a.id, false)));
    head.appendChild(icBouton(ICON_COPIE, "Dupliquer", () => poster("/api/animations/" + a.id + "/dupliquer", {}, "Animation dupliquée.")));
    const star = bouton("sstar" + (a.fav ? " on" : ""), "", () => poster("/api/animations/" + a.id + "/favori", { fav: !a.fav }, null));
    star.innerHTML = ICON_STAR; star.title = a.fav ? "Retirer des favoris" : "Ajouter aux favoris";
    star.setAttribute("aria-label", star.title); star.setAttribute("aria-pressed", a.fav ? "true" : "false");
    head.appendChild(star);
    c.appendChild(head);
    const h = horaire(a), lampes = new Set(); a.etapes.forEach((e) => e.lampes.forEach((l) => lampes.add(l)));
    const sw = el("div", "dots");
    a.etapes.forEach((e) => { const d = el("div", "dot an-dot"); d.style.background = couleurCible(e); sw.appendChild(d); });
    c.appendChild(sw);
    c.appendChild(el("div", "tsub", [plur(a.etapes.length, "étape"), plur(lampes.size, "lampe"), (a.boucle ? "en boucle, cycle " : "") + duree(h.cycle)].join(" · ") + (a.reset ? " · retour au départ" : "")));
    if (r) c.appendChild(el("div", "an-etat" + (r.etat === "suspendue" ? " susp" : ""), r.etat === "suspendue" ? "Suspendue : " + r.motif : "En cours"));
    const row = el("div", "srow");
    const go = bouton(r ? "sapply an-stop" : "sapply b-main", r ? "Arrêter" : "Lancer", () => poster("/api/animations/" + a.id + "/" + (r ? "arreter" : "lancer"), {}, r ? "« " + a.nom + " » arrêtée." : "« " + a.nom + " » lancée."));
    go.disabled = envoi;
    row.appendChild(go);
    const del = bouton("sdel", "", () => { if (confirm("Supprimer l'animation « " + a.nom + " » ?")) poster("/api/animations/" + a.id + "/supprimer", {}, "Animation supprimée."); });
    del.innerHTML = ICON_TRASH; del.title = "Supprimer"; del.setAttribute("aria-label", "Supprimer");
    row.appendChild(del);
    c.appendChild(row);
    return c;
  }

  // --- Editeur
  const nouvelleEtape = (prec) => prec ? JSON.parse(JSON.stringify(Object.assign({}, prec, { depart: "apres", delai: 0 }))) : et({ lampes: [], duree: 2, luminosite: 100, cible: coul(240, 100) });
  function ouvrirEditeur(a, id, neuf) {
    brouillon = a ? JSON.parse(JSON.stringify(a)) : { nom: "Nouvelle animation", boucle: true, reset: true, etapes: [nouvelleEtape(null)] };
    delete brouillon.id;
    editId = id; choix = 0; volet = "etapes"; modifie = !!neuf || !a; verif = null; mode = "editeur";
    if (APP.view !== VUE) APP.nav.vue(VUE); else construireEditeur();
    if (!brouillon.etapes[0].lampes.length) setTimeout(() => choisirLampes("Lampes de l'étape 1", [], (L) => { brouillon.etapes[0].lampes = L; change(); }), 0);
  }
  function quitterEditeur() {
    if (modifie && !confirm("Quitter sans enregistrer les changements ?")) return;
    mode = "liste"; brouillon = null; rendre();
  }
  function change() { modifie = true; construireEditeur(); }
  // Changement d'une valeur de l'etape choisie (reglages, sans changement de structure) : formulaire garde tel quel (geste en cours, defilement), frise, liste et controle mis a jour
  function majPartielle() { modifie = true; const l = ed.liste.scrollTop; dessinerFrise(); listeEtapes(); ed.liste.scrollTop = l; verifier(); majBoutonsEditeur(); }
  let ed = null; // elements de l'editeur
  // Reconstruction de l'editeur (changement de structure) : positions de defilement de la liste des etapes et de l'etape choisie gardees
  function construireEditeur() {
    const v = $("viewAnim"), garde = ed ? { f: ed.form.scrollTop, l: ed.liste.scrollTop } : null;
    if (ed && ed.reglages) APP.reglagesRetirer(ed.reglages);
    v.innerHTML = "";
    const box = el("div", "an-ed"), tete = el("div", "an-tete");
    tete.appendChild(bouton("b-small an-retour", "‹ Animations", quitterEditeur));
    const slot = el("button", "sslot" + (brouillon.icone ? "" : " empty"), ""); slot.innerHTML = (brouillon.icone && APP.sceneIcon(brouillon.icone)) || "+";
    slot.title = "Icône"; slot.onclick = () => choisirIcone(brouillon.icone, (k) => { if (k) brouillon.icone = k; else delete brouillon.icone; change(); });
    // V1.6 : réglages de l'animation et actions regroupés (display:contents sur la tablette : même disposition) ; téléphone en portrait : volet Animation et pied
    const gAnim = el("div", "an-g-anim"), gAct = el("div", "an-g-act");
    gAnim.appendChild(slot);
    const nom = el("input", "hb-in an-nom"); nom.value = brouillon.nom; nom.maxLength = 40; nom.setAttribute("aria-label", "Nom");
    nom.oninput = () => { brouillon.nom = nom.value; modifie = true; verifier(); };
    gAnim.appendChild(nom);
    gAnim.appendChild(bascule("En boucle", brouillon.boucle, (x) => { brouillon.boucle = x; change(); }));
    gAnim.appendChild(bascule("Retour au départ", brouillon.reset, (x) => { brouillon.reset = x; change(); }));
    tete.appendChild(gAnim);
    const essai = bouton("b-light an-essai", "Essayer", () => {
      if (enCoursDe("essai")) poster("/api/animations/essai/arreter", {}, "Essai arrêté.");
      else poster("/api/animations/essai", { animation: brouillon }, "Essai lancé (non enregistré).");
    });
    const enr = bouton("b-main an-enr", "Enregistrer", enregistrer);
    gAct.appendChild(essai); gAct.appendChild(enr); tete.appendChild(gAct);
    const q = bouton("hb-ic an-aide", "?", aide); q.setAttribute("aria-label", "Aide"); tete.appendChild(q);
    box.appendChild(tete);
    if (APP.tel) { // V1.6 : volets du téléphone (visibles en portrait seulement, animations.css) ; changer de volet ne reconstruit rien
      box.classList.add("an-v-" + volet);
      const vb = el("div", "an-volets");
      [["etapes", "Étapes"], ["etape", "Étape"], ["animation", "Animation"]].forEach(([k, t]) => {
        const b = bouton("an-volet" + (k === volet ? " sel" : ""), t, () => montrerVolet(k));
        b.setAttribute("data-volet", k); b.setAttribute("aria-pressed", k === volet ? "true" : "false");
        vb.appendChild(b);
      });
      box.appendChild(vb);
    }
    const charge = el("div", "an-charge", "Contrôle…");
    box.appendChild(charge);
    const frise = el("div", "an-frise");
    box.appendChild(frise);
    const corps = el("div", "an-corps"), liste = el("div", "an-etapes"), form = el("div", "an-form");
    corps.appendChild(liste); corps.appendChild(form); box.appendChild(corps);
    v.appendChild(box);
    ed = { box, essai, enr, charge, frise, liste, form, reglages: null };
    dessinerFrise(); listeEtapes(); formEtape(); majBoutonsEditeur(); verifier();
    if (garde) { form.scrollTop = garde.f; liste.scrollTop = garde.l; }
  }
  // V1.6 : volet affiché sur le téléphone en portrait (Étapes : frise et liste ; Étape : étape choisie ; Animation : nom, icône, boucle, retour)
  function montrerVolet(k) {
    volet = k;
    if (!ed || !ed.box) return;
    ed.box.classList.remove("an-v-etapes", "an-v-etape", "an-v-animation"); ed.box.classList.add("an-v-" + k);
    ed.box.querySelectorAll(".an-volet").forEach((b) => { const s = b.getAttribute("data-volet") === k; b.classList.toggle("sel", s); b.setAttribute("aria-pressed", s ? "true" : "false"); });
    if (k === "etape") ed.form.scrollTop = 0;
  }
  function bascule(texte, val, fn) {
    const b = el("button", "an-bas" + (val ? " on" : ""), texte);
    b.setAttribute("aria-pressed", val ? "true" : "false");
    b.onclick = () => fn(!val);
    return b;
  }
  function majBoutonsEditeur() {
    if (!ed || mode !== "editeur") return;
    const e = enCoursDe("essai");
    ed.essai.textContent = e ? "Arrêter l'essai" : "Essayer";
    ed.essai.disabled = envoi || (!e && !(verif && verif.ok));
    ed.enr.disabled = envoi || !(verif && verif.ok) || !brouillon.nom.trim();
  }
  function verifier() {
    clearTimeout(verifT);
    const rev = ++verifRev;
    verifT = setTimeout(() => {
      APP.api("POST", "/api/animations/verifier", { animation: brouillon }, (err, v) => {
        if (rev !== verifRev || !ed) return;
        verif = err ? { ok: false, erreurs: [err] } : v;
        const lim = etat.limites ? etat.limites.plafond : 4;
        ed.charge.className = "an-charge " + (verif.ok ? "ok" : "ko");
        ed.charge.textContent = verif.ok
          ? "Pic : " + verif.pic + " commande" + (verif.pic > 1 ? "s" : "") + " par seconde (" + lim + " au plus) · " + verif.commandes + " commandes par cycle · cycle " + duree(verif.cycle)
          : (verif.erreurs || []).join(" ");
        majBoutonsEditeur();
      });
    }, 250);
  }
  function enregistrer() {
    const url = editId ? "/api/animations/" + editId + "/modifier" : "/api/animations";
    poster(url, { animation: brouillon }, null, (err, d) => {
      if (err) return;
      modifie = false;
      if (!editId && d && d.animation) editId = d.animation.id;
      APP.banner("Animation « " + brouillon.nom.trim() + " » enregistrée." + (d && d.enMarche ? " Relancez-la pour appliquer les changements." : ""), "ok");
      mode = "liste"; brouillon = null; rendre();
    });
  }
  // Frise : une ligne par lampe (ordre de premiere apparition), un bloc par etape (debut de la lampe n°k = debut + k x decalage), etape choisie entouree
  function dessinerFrise() {
    const f = ed.frise, h = horaire(brouillon), ordre = [];
    brouillon.etapes.forEach((e) => e.lampes.forEach((l) => { if (ordre.indexOf(l) < 0) ordre.push(l); }));
    f.innerHTML = "";
    const n = Math.max(1, ordre.length), H = 64, rh = H / n, W = 1000, NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("class", "an-svg");
    brouillon.etapes.forEach((e, i) => {
      e.lampes.forEach((l, k) => {
        const s = h.etapes[i].debut + k * (e.decalage || 0), r = document.createElementNS(NS, "rect");
        r.setAttribute("x", (s / h.cycle * W).toFixed(1)); r.setAttribute("y", (ordre.indexOf(l) * rh + rh * 0.12).toFixed(2));
        r.setAttribute("width", Math.max(2, e.duree / h.cycle * W).toFixed(1)); r.setAttribute("height", (rh * 0.76).toFixed(2));
        r.setAttribute("rx", Math.min(3, rh / 3)); r.setAttribute("fill", couleurCible(e));
        r.setAttribute("class", "an-bloc" + (i === choix ? " sel" : ""));
        r.addEventListener("click", () => { choix = i; listeEtapes(); formEtape(); dessinerFrise(); if (APP.tel) montrerVolet("etape"); });
        svg.appendChild(r);
      });
    });
    f.appendChild(svg);
    const ax = el("div", "an-axe");
    ax.appendChild(el("span", "", "0 s"));
    ax.appendChild(el("span", "", plur(ordre.length, "lampe") + " · " + plur(brouillon.etapes.length, "étape") + (brouillon.boucle ? " · ↻ en boucle" : "")));
    ax.appendChild(el("span", "", duree(h.cycle)));
    f.appendChild(ax);
  }
  function listeEtapes() {
    const L = ed.liste;
    L.innerHTML = "";
    brouillon.etapes.forEach((e, i) => {
      const it = el("div", "an-et" + (i === choix ? " sel" : "")), r = resumeEtape(e, i);
      const sw = el("span", "an-sw"); sw.style.background = couleurCible(e); it.appendChild(sw);
      const t = el("div", "an-ettxt");
      t.appendChild(el("div", "an-et1", (i + 1) + ". " + r[0]));
      t.appendChild(el("div", "an-et2", r[1]));
      it.appendChild(t);
      it.onclick = () => { choix = i; listeEtapes(); ed.form.scrollTop = 0; formEtape(); dessinerFrise(); if (APP.tel) montrerVolet("etape"); };
      const outils = el("div", "an-etout");
      const mk = (txt, titre, fn, off) => { const b = el("button", "an-mini", txt); b.title = titre; b.setAttribute("aria-label", titre); b.disabled = !!off; b.onclick = (ev) => { ev.stopPropagation(); fn(); }; outils.appendChild(b); };
      mk("↑", "Monter", () => { const x = brouillon.etapes.splice(i, 1)[0]; brouillon.etapes.splice(i - 1, 0, x); choix = i - 1; change(); }, i === 0);
      mk("↓", "Descendre", () => { const x = brouillon.etapes.splice(i, 1)[0]; brouillon.etapes.splice(i + 1, 0, x); choix = i + 1; change(); }, i === brouillon.etapes.length - 1);
      mk("⧉", "Dupliquer l'étape", () => { brouillon.etapes.splice(i + 1, 0, nouvelleEtape(e)); choix = i + 1; change(); }, brouillon.etapes.length >= 40);
      mk("×", "Supprimer l'étape", () => { brouillon.etapes.splice(i, 1); choix = Math.max(0, Math.min(choix, brouillon.etapes.length - 1)); change(); }, brouillon.etapes.length <= 1);
      it.appendChild(outils);
      L.appendChild(it);
    });
    const plus = bouton("b-light an-ajout", "+ Ajouter une étape", () => { brouillon.etapes.push(nouvelleEtape(brouillon.etapes[brouillon.etapes.length - 1])); choix = brouillon.etapes.length - 1; if (APP.tel) volet = "etape"; change(); });
    plus.disabled = brouillon.etapes.length >= 40;
    L.appendChild(plus);
  }
  // Pas des valeurs de temps : 0,1 s sous 2 s, 0,5 s sous 10 s, 1 s sous 60 s, 10 s sous 10 min, 1 min au-dela
  const pas = (v, sens) => { const x = sens > 0 ? v : v - 0.001; return x < 2 ? 0.1 : x < 10 ? 0.5 : x < 60 ? 1 : x < 600 ? 10 : 60; };
  function regle(lib, val, min, max, fn, aideTxt) {
    const r = el("div", "an-champ");
    r.appendChild(el("div", "an-lib", lib));
    const g = el("div", "an-pas");
    const moins = el("button", "an-mini an-pm", "−"), plus = el("button", "an-mini an-pm", "+"), v = el("span", "an-val", duree(val));
    const regler = (x) => { x = Math.round(Math.max(min, Math.min(max, x)) * 10) / 10; fn(x); };
    moins.onclick = () => regler(val - pas(val, -1)); plus.onclick = () => regler(val + pas(val, 1));
    moins.disabled = val <= min; plus.disabled = val >= max;
    moins.setAttribute("aria-label", lib + " moins"); plus.setAttribute("aria-label", lib + " plus");
    g.appendChild(moins); g.appendChild(v); g.appendChild(plus);
    r.appendChild(g);
    if (aideTxt) r.appendChild(el("div", "an-aidetxt", aideTxt));
    return r;
  }
  function segments(lib, opts, val, fn, off) {
    const r = el("div", "an-champ");
    r.appendChild(el("div", "an-lib", lib));
    const g = el("div", "an-seg");
    opts.forEach((o) => { const b = el("button", "an-segb" + (o[0] === val ? " on" : ""), o[1]); b.disabled = !!off; b.onclick = () => fn(o[0]); g.appendChild(b); });
    r.appendChild(g);
    return r;
  }
  // Reglages d'une etape avant « OFF » : rendus quand OFF est touche a nouveau (pendant l'edition seulement)
  const avantOff = new WeakMap();
  function formEtape() {
    const F = ed.form, e = brouillon.etapes[choix];
    F.innerHTML = "";
    const set = (k, v) => { e[k] = v; change(); };
    // Lampes
    const lr = el("div", "an-champ");
    lr.appendChild(el("div", "an-lib", "Lampes (ordre de la vague)"));
    const lb = bouton("an-lampes", (e.lampes.length ? plur(e.lampes.length, "lampe") + " : " + e.lampes.map(nomLampe).join(", ") : "Choisir les lampes") + " ›", () => choisirLampes("Lampes de l'étape " + (choix + 1), e.lampes, (L) => set("lampes", L)));
    lr.appendChild(lb); F.appendChild(lr);
    // Couleur et luminosite : memes reglages que le panneau des lumieres (APP.reglages de reglages.js, option curseur : luminosite en curseur horizontal en tete de la carte, Blanc / Couleur, teinte, intensite,
    // couleurs rapides et personnalisees), plus « Inchangée » et « OFF » ; les deux se reglent ensemble dans la meme etape.
    if (ed.reglages) { APP.reglagesRetirer(ed.reglages); ed.reglages = null; }
    {
      // OFF : la lampe passe OFF (fondu de la lampe) ; quitter OFF reconstruit le formulaire (courbe)
      const allume = () => { if (!e.off) return false; delete e.off; return true; };
      const R = APP.reglages({
        inchange: true, curseur: true, off: true,
        niveau: (Q) => { const c = allume(); e.luminosite = Q.level; if (c) change(); else majPartielle(); },
        blanc: (Q) => { e.cible = blanc(Q.kelvin); majPartielle(); },
        couleur: (Q) => { e.cible = coul(Q.hue, Q.sat); majPartielle(); },
        inchangee: (Q) => { const c = allume(); if (Q.mode === "aucune") e.cible = null; if (Q.garde) e.luminosite = null; if (c) change(); else majPartielle(); },
        eteindre: (Q) => {
          if (Q.off) { avantOff.set(e, { luminosite: e.luminosite, cible: e.cible, courbe: e.courbe }); e.off = true; e.luminosite = null; e.cible = null; e.courbe = "lineaire"; }
          else { delete e.off; Object.assign(e, avantOff.get(e) || { luminosite: Q.level }); if (!e.luminosite && !e.cible) e.luminosite = Q.level; }
          change();
        },
      });
      const Q = R.P;
      Q.off = !!e.off; Q.level = e.luminosite || 100; Q.garde = !e.luminosite && !e.off;
      if (e.cible && e.cible.type === "couleur") { Q.mode = "color"; Q.hue = e.cible.teinte; Q.sat = e.cible.saturation; }
      else if (e.cible && e.cible.type === "blanc") { Q.mode = "temperature"; Q.kelvin = e.cible.kelvin; }
      else Q.mode = "aucune";
      R.peindre();
      ed.reglages = R;
      const c = el("div", "an-champ");
      c.appendChild(el("div", "an-lib", "Luminosité et couleur visées"));
      const box = el("div", "an-reglages"); box.appendChild(R.root);
      c.appendChild(box);
      if (e.off) c.appendChild(el("div", "an-aidetxt", "La lampe passe OFF au début de l'étape (fondu de la lampe) ; la durée compte pour l'enchaînement."));
      else if (!e.luminosite && !e.cible) c.appendChild(el("div", "an-aidetxt", "Choisissez au moins une luminosité, un blanc, une couleur ou OFF."));
      F.appendChild(c);
    }
    F.appendChild(segments("Départ", [["apres", "Après la précédente"], ["avec", "Avec la précédente"]], e.depart, (x) => set("depart", x), choix === 0));
    const g = el("div", "an-grille");
    g.appendChild(regle("Délai", e.delai, 0, 3600, (x) => set("delai", x)));
    g.appendChild(regle("Durée", e.duree, 0.5, 3600, (x) => set("duree", x)));
    g.appendChild(regle("Décalage entre lampes", e.decalage, 0, 60, (x) => set("decalage", x), e.lampes.length > 1 ? "La lampe n°2 démarre " + duree(e.decalage) + " après la n°1, etc." : null));
    F.appendChild(g);
    if (!e.off) F.appendChild(segments("Courbe", COURBES, e.courbe, (x) => set("courbe", x)));
    if (!e.off && e.courbe !== "lineaire") F.appendChild(el("div", "an-aidetxt", e.duree < 2 ? "Moins de 2 s : fondu linéaire de la lampe." : "Faite en " + Math.min(4, Math.floor(e.duree / 0.5)) + " petits glissements (une commande chacun, deux si la luminosité et la couleur changent ensemble)."));
  }

  // --- Navigation, accueil
  APP.surVue((name) => {
    $("viewAnim").className = "view" + (name === VUE ? "" : " hidden");
    const etait = ouverte;
    ouverte = name === VUE;
    if (ouverte) { if (mode === "editeur" && brouillon) construireEditeur(); else { mode = "liste"; rendre(); } if (!etait) charger(); }
    planifier();
  }, 10);
  APP.nav.action({ key: VUE, label: "Animations" });
  // Carte « Animations » de l'accueil (meme forme que la carte Scenarios : APP.homeFavoris) : une icone par favorite, anneau blanc tant
  // qu'elle tourne ; toucher une icone lance l'animation, ou l'arrete si elle tourne. Favorites changees : accueil reconstruit.
  let favBtns = [], favSig = "";
  const favorites = () => etat.animations.filter((a) => a.fav === true);
  const sigFav = () => favorites().map((a) => a.id + ":" + (a.icone || "") + ":" + a.nom).join("|");
  function basculer(a) {
    const r = enCoursDe(a.id);
    poster("/api/animations/" + a.id + "/" + (r ? "arreter" : "lancer"), {}, r ? "« " + a.nom + " » arrêtée." : "« " + a.nom + " » lancée.");
  }
  function majCarte() {
    if (sigFav() !== favSig) { favSig = sigFav(); if (APP.homeRafraichir) APP.homeRafraichir(); return; }
    const n = etat.animations.length, k = etat.enCours.length, s = carte.querySelector(".hcount");
    s.textContent = k ? k + " en cours" : n ? plur(n, "animation") : "Aucune animation";
    carte.className = "hcard hscen an-hcarte" + (k ? " actif" : "");
    favBtns.forEach((x) => {
      const on = !!enCoursDe(x.a.id);
      x.b.className = "hpow hscn " + (on ? "on" : "off");
      x.b.setAttribute("aria-label", x.a.nom + (on ? " (en cours)" : ""));
    });
  }
  APP.homeActions(() => {
    const f = favorites();
    const r = APP.homeFavoris({ nom: "Animations", compte: "", ouvrir: () => APP.nav.vue(VUE), favoris: f.map((a) => ({ icone: a.icone && APP.sceneIcon(a.icone, 20), titre: a.nom, clic: () => basculer(a) })) });
    carte = r.carte; favSig = sigFav();
    favBtns = f.map((a, i) => ({ a, b: r.boutons[i] }));
    majCarte();
    return r.w;
  }, "animations"); // V1.9 révision 3 : clé de la carte dans l'ordre de l'accueil
  APP.animations = { majEtat };
  charger();
})();
// FIN
