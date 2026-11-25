// @zone equipements | Cartes de la vue Équipements (V2.1 étape cartes-lecture ; décisions : claude/cartes-v2.1.md du projet) : textes des valeurs, qualité de l'air (seuils, mesure la moins bonne :
// fonctions pures, banc/unitaires/equipements-cartes.test.mjs), configurations par famille construites selon les capacités exposées (jamais construites puis cachées) : options communes
// (au retour du courant, verrou enfant, voyant, identifier), consommation d'une prise, purificateur (mode, vitesse, air, filtre), enceinte, capteur d'air (qualité, min / max), ouverture,
// fuite, mouvement (réglages du capteur, appareils commandés), télécommande (mode de commande, lampes liées), hub (logiciel, soleil et heure, localisation, code d'appairage) : même widget
// dans la vue Équipements et la fenêtre « Hubs » (hub connecté). Étape ecriture-generique : toutes les commandes exposées en écriture sont câblées (ecrire : POST /api/equipements/:id/capacite,
// une à la fois par équipement, équipement relu transmis aux auditeurs surEquipement). 21/11 (commandes-exposees) : une commande que le hub ne déclare pas écrivable n'est pas construite
// (une valeur d'état utile reste affichée en texte : mode, vitesse, durée, programmation) ; exposée mais appareil injoignable : construite, inactive. Deux appuis : remise à zéro, installation du hub.
// APP.cartes : chargé avant equipements.js ; aucun accès au document au chargement (essais unitaires dans node:vm).
(function () {
  const el = APP.el;

  // ---------- textes ----------
  const nb = (v, d) => { const p = Math.pow(10, d === undefined ? 1 : d); return String(Math.round(v * p) / p).replace(".", ","); };
  // Nombre avec séparateur des milliers (espace fine insécable) : « 1 120 »
  const mille = (v, d) => { const s = nb(v, d), i = s.indexOf(","), e = i < 0 ? s : s.slice(0, i); return e.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (i < 0 ? "" : s.slice(i)); };
  const unite = (u) => (!u ? "" : u === "%" ? " %" : " " + u);
  const ALERTES = { fuite: ["Aucune fuite", "Fuite détectée"], fumee: ["Aucune fumée", "Fumée détectée"], monoxyde: ["Aucun CO", "CO détecté"], gaz: ["Aucun gaz", "Gaz détecté"] };
  // V2.2 ha-ouvrants : états lus (verrou, alarme, ouvrant), distincts des commandes proposées (options : Verrouiller, Désarmer, Ouvrir…)
  const ETATS = {
    verrou: { locked: "Verrouillée", unlocked: "Déverrouillée", locking: "Verrouillage…", unlocking: "Déverrouillage…", jammed: "Bloquée", open: "Ouverte", opening: "Ouverture…" },
    alarme: { disarmed: "Désarmée", armed_home: "Armée (présence)", armed_away: "Armée (absence)", armed_night: "Armée (nuit)", armed_vacation: "Armée (vacances)",
      armed_custom_bypass: "Armée (personnalisé)", pending: "En attente", arming: "Armement…", disarming: "Désarmement…", triggered: "Déclenchée" },
    ouverture: { open: "Ouverte", closed: "Fermée", opening: "Ouverture…", closing: "Fermeture…", stopped: "Arrêtée", up: "Monte", down: "Descend" },
    // V2.2 ha-media-robots : aspirateur, tondeuse ; lecteur
    robot: { cleaning: "Nettoie", mowing: "Tond", docked: "À la base", idle: "Arrêté", paused: "En pause", returning: "Retour à la base", error: "Erreur" },
    lecture: { playing: "Lecture", paused: "En pause", idle: "Inactif", buffering: "Chargement…", on: "ON", off: "OFF", standby: "Veille" },
  };
  function option(c, k) { const o = ((c && c.options) || []).filter((x) => x.code === k)[0]; return o ? o.libelle : String(k); }

  // ---------- qualité de l'air (cartes, section 3) ----------
  // Seuils : bon jusqu'au premier (compris), moyen jusqu'au second (compris), mauvais au-delà
  const SEUILS = { pm25: [35, 85], cov: [150, 250], co2: [1000, 1600] };
  const RANG_QUALITE = { bon: 0, moyen: 1, mauvais: 2 };
  function qualite(cap, v) {
    const s = SEUILS[cap];
    if (!s || typeof v !== "number" || !isFinite(v)) return null;
    return v <= s[0] ? "bon" : v <= s[1] ? "moyen" : "mauvais";
  }
  // Mesure la moins bonne parmi les capacités (un seul mot par équipement) : {mot, cap, valeur, c} ; à égalité, la première dans l'ordre pm25, cov, co2 ; aucune mesure : null
  function pire(capacites) {
    let r = null;
    ["pm25", "cov", "co2"].forEach((k) => {
      (capacites || []).filter((c) => c && c.cap === k).forEach((c) => {
        const q = qualite(k, c.valeur);
        if (q && (!r || RANG_QUALITE[q] > RANG_QUALITE[r.mot])) r = { mot: q, cap: k, valeur: c.valeur, c: c };
      });
    });
    return r;
  }
  const MOT = { bon: "Bon", moyen: "Moyen", mauvais: "Mauvais" };

  // Valeur lisible d'une capacité (type venu du serveur : référentiel ou nature d'une enveloppe)
  function texte(c) {
    if (!c) return "—";
    const v = c.valeur;
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") {
      if (ALERTES[c.cap]) return ALERTES[c.cap][v ? 1 : 0];
      if (c.cap === "ouvert") return v ? "Ouverte" : "Fermée";
      if (c.cap === "presence") return v ? "Mouvement" : "Calme";
      if (c.cap === "probleme") return v ? "Oui" : "Non";
      return v ? "ON" : "OFF";
    }
    if (typeof v === "number") return c.cap === "cov" ? mille(v, 0) + " (" + qualite("cov", v) + ")" : mille(v, Math.abs(v) >= 100 ? 0 : 1) + unite(c.unite);
    if (c.type === "choix") return ETATS[c.cap] && ETATS[c.cap][v] ? ETATS[c.cap][v] : option(c, v);
    if (c.type === "plage" && typeof v === "object") return nb(v.bas) + " – " + nb(v.haut) + unite(c.unite);
    if (c.type === "couleur" && typeof v === "object") return "teinte " + Math.round(v.hue || 0) + "°";
    return typeof v === "object" ? "—" : String(v);
  }
  const deux = (n) => ("0" + n).slice(-2);
  const date = (iso, court) => { const d = new Date(iso || ""); if (isNaN(d.getTime())) return "–"; const j = deux(d.getDate()) + "/" + deux(d.getMonth() + 1); return court ? j : j + "/" + d.getFullYear(); };
  const heure = (iso) => { const d = new Date(iso || ""); return isNaN(d.getTime()) ? "–" : deux(d.getHours()) + ":" + deux(d.getMinutes()); };
  const pluriel = (n, s) => n + " " + s + (n > 1 ? "s" : "");
  // « depuis… » (heure retenue par le serveur, étape evenements) : moins d'une minute « à l'instant », moins d'une heure « depuis N min », même jour « depuis 08:15 », sinon « depuis le JJ/MM »
  function depuis(iso, maintenant) {
    const d = new Date(iso || ""), n = typeof maintenant === "number" ? maintenant : Date.now();
    if (!iso || isNaN(d.getTime())) return "";
    const m = Math.floor((n - d.getTime()) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return "depuis " + m + " min";
    return new Date(n).toDateString() === d.toDateString() ? "depuis " + heure(iso) : "depuis le " + date(iso, true);
  }
  // V2.2 ha-depuis : dernier appui, dernière activation, dernier lancement (bouton, scène, script) : « 08:15 » le même jour, sinon « 24/11 à 08:15 » ; illisible : ""
  function quand(iso, maintenant) {
    const d = new Date(iso || ""), n = typeof maintenant === "number" ? maintenant : Date.now();
    if (!iso || isNaN(d.getTime())) return "";
    return new Date(n).toDateString() === d.toDateString() ? heure(iso) : date(iso, true) + " à " + heure(iso);
  }
  // Libellé d'une heure d'action (bouton, scène, script) ; null : capacité sans heure à montrer
  const dernier = (c) => (!c || !c.depuis || !quand(c.depuis) ? null : c.cap === "scene" ? "Dernière activation" : c.script ? "Dernier lancement" : c.cap === "action" || c.cap === "identifier" ? "Dernier appui" : null);
  // Dernier passage (mouvement) : « vu à 08:15 », ou « vu le JJ/MM à 08:15 » un autre jour
  function vu(iso, maintenant) {
    const d = new Date(iso || ""), n = typeof maintenant === "number" ? maintenant : Date.now();
    if (!iso || isNaN(d.getTime())) return "";
    return new Date(n).toDateString() === d.toDateString() ? "vu à " + heure(iso) : "vu le " + date(iso, true) + " à " + heure(iso);
  }

  // ---------- lecture des capacités ----------
  const caps = (eq) => (eq && eq.capacites) || [];
  const de = (eq, k) => caps(eq).filter((c) => c.cap === k)[0] || null;
  const num = (c) => (c && typeof c.valeur === "number" ? c.valeur : null);
  // Raison « air mauvais » (notification) : la mesure qui le fixe
  function raisonAir(eq) { const p = pire(caps(eq)); return p && p.mot === "mauvais" ? "Air mauvais : " + p.c.libelle + " " + texte(p.c) : null; }
  // Hub : état du logiciel (À jour, Mise à jour disponible, Installation N %) d'après logiciel (etat, etape, progression ; HA : maj, derniere)
  function logiciel(eq) {
    const l = de(eq, "logiciel");
    if (!l) return null;
    const p = typeof l.progression === "number" ? l.progression : null;
    if (typeof l.etape === "string" && /InProgress$/.test(l.etape) && l.etape !== "checkInProgress") return { etat: "installation", progression: p, l: l };
    if (l.etat === "updateAvailable" || l.maj === true) return { etat: "maj", l: l };
    return { etat: "ajour", l: l };
  }

  // ---------- écriture (étape ecriture-generique : POST /api/equipements/:id/capacite) ----------
  // Une commande à la fois par équipement ; réponse : équipement relu 1 s après, transmis aux auditeurs (vue Équipements, fenêtre « Hubs »). Jamais renvoyée.
  const auditeurs = [], occupes = {};
  const peut = (c) => !!(c && c.ecriture === true && c.disponible !== false);
  // Commande exposée par le hub (déclarée écrivable) : seule condition pour la construire (demande du 21/11 : une commande que le hub ne permet pas n'est pas affichée du tout ;
  // exposée mais appareil injoignable : construite, inactive)
  const expose = (c) => !!(c && c.ecriture === true);
  function ecrire(eq, c, valeur, o) {
    o = o || {};
    if (!peut(c)) return;
    if (occupes[eq.id]) { APP.banner("Une commande est déjà en cours pour cet équipement.", "warn"); return; }
    occupes[eq.id] = true;
    const corps = { element: c.element, cap: c.cap };
    if (valeur !== undefined && valeur !== null) corps.valeur = valeur;
    if (o.confirm) corps.confirm = true;
    // V2.2 ha-ouvrants : paramètres de la commande (code d'alarme ou de serrure, ton, volume, durée) ; jamais gardés après l'envoi
    if (o.options) corps.options = o.options;
    APP.api("POST", "/api/equipements/" + encodeURIComponent(eq.id) + "/capacite", corps, (err, d) => {
      delete occupes[eq.id];
      if (err) { APP.banner(err, "warn"); auditeurs.forEach((f) => { try { f(null, eq.id); } catch (e) { /* auditeur isolé */ } }); return; }
      if (o.ok) APP.banner(o.ok, "ok");
      if (o.apres) o.apres(d && d.equipement);
      auditeurs.forEach((f) => { try { f(d && d.equipement, eq.id); } catch (e) { /* auditeur isolé */ } });
    });
  }
  const surEquipement = (f) => { if (typeof f === "function") auditeurs.push(f); };

  // ---------- widgets (style des menus du panneau des lumières ; choix actif : fond gris clair seul) ----------
  // Commande exposée mais indisponible (appareil injoignable) : construite, inactive
  function inactif(b) { b.classList.add("eq-inactif"); b.setAttribute("aria-disabled", "true"); b.title = "Commande indisponible."; b.onclick = null; return b; }
  // Bouton relié à une capacité : actif seulement si elle est écrivable et disponible
  function lier(b, c, fn) { if (!peut(c)) return inactif(b); b.onclick = (e) => { if (e) e.stopPropagation(); fn(); }; return b; }
  // Deux appuis (remise à zéro, installation du hub) : le premier arme 5 s (texte changé), le second envoie
  const armes = {};
  function deuxAppuis(b, cle, arme, fn) {
    const lib = b.textContent;
    const armer = () => { b.textContent = arme; b.classList.add("arme"); };
    if (armes[cle] > Date.now()) armer();
    b.onclick = (e) => {
      if (e) e.stopPropagation();
      if (armes[cle] > Date.now()) { delete armes[cle]; b.textContent = lib; b.classList.remove("arme"); fn(); return; }
      armes[cle] = Date.now() + 5000; armer();
      setTimeout(() => { if (!(armes[cle] > Date.now())) { b.textContent = lib; b.classList.remove("arme"); } }, 5100);
    };
    return b;
  }
  function carte(titre, cls) { const c = el("div", "eq-carte" + (cls ? " " + cls : "")); if (titre) c.appendChild(el("div", "eq-lbl", titre)); return c; }
  function ligne(lib, val, cls) { const l = el("div", "eq-ligne" + (cls ? " " + cls : "")); l.appendChild(el("span", "eq-l", lib)); l.appendChild(el("b", "", val)); return l; }
  function grand(txt, cls, petit) { const g = el("div", "eq-grand" + (cls ? " " + cls : ""), txt); if (petit) g.appendChild(el("small", "", " " + petit)); return g; }
  // Piste de choix (une seule valeur active) : [code, libellé] ; choisir(code) : envoi (sans fonction : inactive)
  function piste(choix, actif, lib, choisir) {
    const p = el("div", "eq-piste"); p.setAttribute("role", "group"); if (lib) p.setAttribute("aria-label", lib);
    choix.forEach((x) => {
      const b = el("button", "eq-choix" + (x[0] === actif ? " sel" : ""), x[1]); b.setAttribute("aria-pressed", x[0] === actif ? "true" : "false");
      if (choisir) b.onclick = (e) => { if (e) e.stopPropagation(); if (x[0] !== actif) choisir(x[0]); }; else inactif(b);
      p.appendChild(b);
    });
    return p;
  }
  // Piste d'une capacité de type choix
  const pisteCap = (eq, c, choix, lib) => piste(choix, c.valeur, lib, peut(c) ? (k) => ecrire(eq, c, k) : null);
  // ON / OFF d'un appareil : piste q-segs existante (ON vert, OFF gris) ; changer(v) : envoi (sans fonction : inactive)
  function onoff(v, lib, changer) {
    const s = el("div", "q-segs eq-segs"); if (lib) s.setAttribute("aria-label", lib);
    [[true, "ON", " sel on"], [false, "OFF", " sel off"]].forEach((x) => {
      const b = el("button", "q-seg" + (v === x[0] ? x[2] : ""), x[1]);
      if (changer) b.onclick = (e) => { if (e) e.stopPropagation(); if (v !== x[0]) changer(x[0]); }; else inactif(b);
      s.appendChild(b);
    });
    return s;
  }
  const onoffCap = (eq, c, lib) => onoff(c.valeur, lib, peut(c) ? (v) => ecrire(eq, c, v) : null);
  function rangee(lib, w) { const r = el("div", "eq-rangee"); r.appendChild(el("span", "eq-l", lib)); r.appendChild(w); return r; }
  // Bouton d'action pleine largeur (forme de « Luminosité inchangée »)
  function action(lib, cls) { return el("button", "eq-action" + (cls ? " " + cls : ""), lib); }
  function rond(html, lib, cls) { const b = el("button", "eq-rond" + (cls ? " " + cls : ""), ""); b.innerHTML = html; b.setAttribute("aria-label", lib); return b; }
  // − valeur + (réglage pas à pas) ; moins / plus : fonctions d'envoi (absentes : inactifs)
  function pas(val, lib, moins, plus) {
    const r = el("div", "eq-pas"), a = rond("−", lib + " : moins"), b = rond("+", lib + " : plus");
    if (moins) a.onclick = (e) => { if (e) e.stopPropagation(); moins(); }; else inactif(a);
    if (plus) b.onclick = (e) => { if (e) e.stopPropagation(); plus(); }; else inactif(b);
    r.appendChild(a); r.appendChild(el("b", "", val)); r.appendChild(b); return r;
  }
  // Curseur : changer(v) au lâcher (sans fonction : désactivé)
  function curseur(min, max, v, lib, cls, changer) {
    const s = document.createElement("input"); s.type = "range"; s.min = min; s.max = max; s.value = v === null ? min : v;
    s.className = "eq-rng" + (cls ? " " + cls : ""); s.setAttribute("aria-label", lib);
    if (changer) { s.onchange = () => changer(+s.value); s.onclick = (e) => e.stopPropagation(); } else s.disabled = true;
    return s;
  }
  function pastille(p, q) { const s = el("i", "eq-qa eq-qa-" + q); s.setAttribute("aria-hidden", "true"); p.appendChild(s); return s; }
  function barre(v, cls) { const b = el("div", "eq-pbar" + (cls ? " " + cls : "")), r = el("i", ""); r.style.width = Math.max(0, Math.min(100, v || 0)) + "%"; b.appendChild(r); return b; }

  // Identifier (cartes, section 5) : « Identifier (clignote 30 s) » ; pendant le clignotement « ■ Arrêter · 24 s » (choix actif), compte à rebours local
  const clignote = {};
  function identifier(eq) {
    const i = de(eq, "identifier"), st = caps(eq).filter((x) => x.cap === "identifier_arret" && i && x.element === i.element)[0];
    if (!expose(i)) return null;
    // Sans arrêt déclaré (Home Assistant : bouton identify, un appui) : bouton simple, sans compte à rebours
    if (!st) { const s = action("Identifier"); return lier(s, i, () => ecrire(eq, i, undefined, { ok: "Identification demandée." })); }
    const k = eq.id + "|" + i.element, b = action("");
    const peindre = () => {
      const r = Math.ceil(((clignote[k] || 0) - Date.now()) / 1000);
      if (r > 0) { b.textContent = "■ Arrêter · " + r + " s"; b.classList.add("sel"); } else { delete clignote[k]; b.textContent = "Identifier (clignote 30 s)"; b.classList.remove("sel"); }
      return r > 0;
    };
    peindre();
    const t = setInterval(() => { if (!document.body.contains(b)) { clearInterval(t); return; } peindre(); }, 1000);
    if (!peut(i)) return inactif(b);
    b.onclick = (e) => {
      if (e) e.stopPropagation();
      if (clignote[k] > Date.now()) { if (st) ecrire(eq, st, undefined, { apres: () => { delete clignote[k]; peindre(); } }); return; }
      ecrire(eq, i, undefined, { apres: () => { clignote[k] = Date.now() + 30000; peindre(); } });
    };
    return b;
  }
  // Options communes (cartes, sections 5 à 9) : au retour du courant, verrou enfant, voyant, identifier
  const DEMARRAGE = [["startOn", "ON"], ["startPrevious", "Précédent"], ["startToggle", "Inverser"]];
  function options(eq) {
    const c = carte("Options"), d = de(eq, "demarrage"), v = de(eq, "verrou_enfant"), y = de(eq, "voyant"), i = identifier(eq);
    if (expose(d)) {
      c.appendChild(el("div", "eq-l", "Au retour du courant"));
      c.appendChild(pisteCap(eq, d, DEMARRAGE.filter((x) => (d.options || []).some((o) => o.code === x[0])), "Au retour du courant"));
      c.appendChild(el("div", "eq-note", "Inverser : l'interrupteur mural coupé puis remis passe la lampe ON ou OFF sans la sortir du réseau."));
    }
    if (expose(v)) c.appendChild(rangee("Verrou enfant", onoffCap(eq, v, "Verrou enfant")));
    if (expose(y)) c.appendChild(rangee("Voyant", onoffCap(eq, y, "Voyant")));
    if (i) c.appendChild(i);
    return c.childNodes.length > 1 ? c : null;
  }
  // Ligne d'informations : la batterie seulement (cartes, section 2 ; absente sur secteur)
  function infos(eq) {
    const b = num(de(eq, "batterie"));
    if (b === null) return null;
    const l = el("div", "eq-tech" + (b < 20 ? " faible" : ""));
    l.appendChild(el("span", "", b < 20 ? "Batterie faible : " + nb(b, 0) + " %" : "Batterie " + nb(b, 0) + " %"));
    return l;
  }

  // ---------- configurations par famille ----------
  // Prise à mesure : consommation (cartes, section 7) ; remise à zéro en deux appuis
  function consommation(eq) {
    const p = de(eq, "puissance"), e = de(eq, "energie"), r = de(eq, "remise_energie"), a = de(eq, "courant"), t = de(eq, "tension");
    if (!p && !e && !r && !a && !t) return null;
    const c = carte("Consommation");
    if (p) c.appendChild(grand(texte(p)));
    const g = el("div", "eq-mes");
    const m = (lib, val) => { const x = el("div", "eq-m"); x.appendChild(el("span", "", lib)); x.appendChild(el("b", "", val)); g.appendChild(x); };
    if (r && typeof r.mesure === "number") m(r.depuis ? "Depuis le " + date(r.depuis) : "Depuis la remise à zéro", mille(r.mesure, 2) + " kWh");
    if (e) m("Énergie totale", texte(e));
    if (a) m(a.libelle, texte(a));
    if (t) m(t.libelle, texte(t));
    if (g.childNodes.length) c.appendChild(g);
    if (expose(r)) {
      const b = action("Remettre le compteur à zéro");
      if (peut(r)) deuxAppuis(b, eq.id + "|remise", "Toucher encore pour remettre à zéro", () => ecrire(eq, r, undefined, { ok: "Compteur remis à zéro." })); else inactif(b);
      c.appendChild(b);
    }
    return c;
  }
  const MODES_PURIF = [["auto", "Auto"], ["low", "Bas"], ["medium", "Moyen"], ["high", "Haut"]];
  function purificateur(eq, box) {
    const o = de(eq, "onoff"), v = de(eq, "vitesse_predefinie"), n = de(eq, "niveau"), pm = de(eq, "pm25"), f = de(eq, "filtre");
    const c = carte("");
    if (expose(o)) c.appendChild(onoffCap(eq, o, "ON / OFF"));
    if (expose(v)) {
      c.appendChild(el("div", "eq-l", "Mode"));
      c.appendChild(pisteCap(eq, v, MODES_PURIF.filter((x) => (v.options || []).some((y) => y.code === x[0])), "Mode"));
    } else if (v) c.appendChild(ligne("Mode", texte(v)));
    if (n) {
      const auto = v && v.valeur === "auto", max = typeof n.max === "number" ? n.max : null, min = typeof n.min === "number" ? n.min : 0, x = num(n);
      const r = el("div", "eq-rangee eq-vitesse" + (auto ? " eq-gris" : ""));
      r.appendChild(el("span", "eq-l", "Vitesse manuelle"));
      r.appendChild(el("b", "", (x === null ? "—" : nb(x, 0)) + (max !== null ? " / " + max : "")));
      c.appendChild(r);
      // Toucher la vitesse en Auto passe en manuel (la commande de vitesse suffit, d'après la bibliothèque : setMotorState) ; non exposée : valeur seule
      if (expose(n)) {
      const envoyer = peut(n) ? (val) => ecrire(eq, n, Math.max(min, Math.min(max === null ? val : max, Math.round(val)))) : null;
      const l = el("div", "eq-posrow" + (auto ? " eq-gris" : ""));
      const a = rond("−", "Vitesse : moins"), b = rond("+", "Vitesse : plus");
      if (envoyer) { a.onclick = () => envoyer((x === null ? min : x) - 1); b.onclick = () => envoyer((x === null ? min : x) + 1); } else { inactif(a); inactif(b); }
      l.appendChild(a); l.appendChild(curseur(min, max === null ? 100 : max, x, "Vitesse manuelle", "", envoyer)); l.appendChild(b);
      c.appendChild(l);
      if (auto) c.appendChild(el("div", "eq-note", "En Auto : toucher la vitesse passe en manuel."));
      }
    }
    if (c.childNodes.length) box.appendChild(c);
    if (pm) {
      const a = carte("Air"), q = qualite("pm25", num(pm)), g = grand(texte(pm));
      if (q) { const w = el("div", "eq-qual"); pastille(w, q); w.appendChild(g); w.appendChild(el("span", "eq-mot", MOT[q])); a.appendChild(w); } else a.appendChild(g);
      box.appendChild(a);
    }
    if (f) {
      const k = carte("Filtre"), vie = num(f), u = typeof f.utilise === "number" ? f.utilise : null, alerte = caps(eq).some((x) => x.cap === "probleme" && x.valeur === true && /filtre/i.test(x.libelle || ""));
      if (vie && u !== null) {
        k.appendChild(barre(100 * u / vie, alerte ? "usure alerte" : "usure"));
        k.appendChild(ligne("Jours restants", String(Math.max(0, Math.round((vie - u) / 1440)))));
      }
      if (u !== null) k.appendChild(ligne("Utilisé depuis", pluriel(Math.round(u / 1440), "jour")));
      if (vie !== null) k.appendChild(ligne("Durée de vie", pluriel(Math.round(vie / 1440), "jour")));
      if (alerte) k.appendChild(el("div", "eq-raison", "Filtre à changer"));
      box.appendChild(k);
    }
  }
  const LECT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  const joue = (eq) => { const l = de(eq, "lecture"); return !!(l && typeof l.valeur === "string" && /playing$/i.test(l.valeur)); };
  // Lecture / pause (tuile et configuration) : code de l'option selon le hub (DIRIGERA playbackPlaying, playbackPaused… ; Home Assistant play, pause… : V2.2 ha-media-robots)
  const SENS_LECTURE = { play: ["playbackPlaying", "play"], pause: ["playbackPaused", "pause"], previous: ["playbackPrevious", "previous"], next: ["playbackNext", "next"] };
  function codeLecture(c, k) { const o = ((c && c.options) || []).map((x) => x.code); return (SENS_LECTURE[k] || []).filter((x) => o.indexOf(x) >= 0)[0] || null; }
  function lecturePause(eq, cls) {
    const l = de(eq, "lecture"), jo = joue(eq), k = codeLecture(l, jo ? "pause" : "play"), b = rond(jo ? PAUSE : LECT, jo ? "Pause" : "Lecture", cls + (jo ? " on" : ""));
    return k ? lier(b, l, () => ecrire(eq, l, k)) : inactif(b);
  }
  // Répétition : valeurs de repeat non documentées par la bibliothèque, jamais écrivable : non affichée (commande non exposée)
  function enceinte(eq, box) {
    const l = de(eq, "lecture"), m = de(eq, "media"), vol = de(eq, "volume"), mu = de(eq, "muet");
    const c = carte("En cours");
    c.appendChild(el("div", "eq-media", m && m.valeur ? m.valeur : "Rien en cours"));
    if (expose(l)) {
      const r = el("div", "eq-lecteur");
      const pr = codeLecture(l, "previous"), su = codeLecture(l, "next");
      r.appendChild(pr ? lier(rond("⏮", "Précédent"), l, () => ecrire(eq, l, pr)) : inactif(rond("⏮", "Précédent")));
      r.appendChild(lecturePause(eq, "eq-grandrond eq-lect"));
      r.appendChild(su ? lier(rond("⏭", "Suivant"), l, () => ecrire(eq, l, su)) : inactif(rond("⏭", "Suivant")));
      c.appendChild(r);
    }
    if (vol) {
      const muet = !!(mu && mu.valeur === true), r = el("div", "eq-posrow" + (muet ? " eq-gris" : ""));
      if (expose(mu)) r.appendChild(lier(rond(muet ? "🔇" : "🔈", muet ? "Muet : remettre le son" : "Muet", muet ? "sel" : ""), mu, () => ecrire(eq, mu, !muet)));
      if (expose(vol)) r.appendChild(curseur(0, 100, num(vol), "Volume", "", peut(vol) ? (v) => ecrire(eq, vol, v) : null)); else r.appendChild(el("span", "eq-l", "Volume"));
      r.appendChild(el("span", "eq-volv", muet ? "muet" : (num(vol) === null ? "—" : nb(num(vol), 0)) + " %"));
      c.appendChild(r);
    }
    box.appendChild(c);
    const o = carte("Options"), al = de(eq, "aleatoire"), i = identifier(eq);
    // V2.2 ha-media-robots : ON / OFF, source, mode sonore, répétition (lecteurs de Home Assistant) : commandes par type, seulement si exposées
    // libellés propres à la carte (une source de Home Assistant porte le nom de l'entité)
    const LIB = { onoff: "ON / OFF", source: "Source", repetition: "Répétition" };
    ["onoff", "source", "mode", "repetition"].forEach((k) => { const x = de(eq, k); if (expose(x)) o.appendChild(reglage(eq, LIB[k] ? Object.assign({}, x, { libelle: LIB[k] }) : x)); });
    if (expose(al)) o.appendChild(rangee("Lecture aléatoire", onoffCap(eq, al, "Lecture aléatoire")));
    if (i) o.appendChild(i);
    if (o.childNodes.length > 1) box.appendChild(o);
  }
  // Capteur d'air (cartes, section 11) : qualité (mot en grand, chaque mesure avec sa pastille, min / max), température et humidité
  function air(eq, box) {
    const q = ["pm25", "cov", "co2"].map((k) => de(eq, k)).filter((c) => c && num(c) !== null), p = pire(caps(eq));
    if (q.length && p) {
      const c = carte("Qualité de l'air"), w = el("div", "eq-qual");
      pastille(w, p.mot); w.appendChild(grand(MOT[p.mot])); c.appendChild(w);
      q.forEach((m) => {
        const r = el("div", "eq-qligne"); r.setAttribute("data-cap", m.cap);
        pastille(r, qualite(m.cap, num(m))); r.appendChild(el("span", "eq-l", m.libelle)); r.appendChild(el("b", "", m.cap === "cov" ? mille(num(m), 0) : texte(m)));
        c.appendChild(r);
        if (typeof m.mini === "number" || typeof m.maxi === "number") c.appendChild(el("div", "eq-note eq-minmax", "mesuré : min " + (typeof m.mini === "number" ? mille(m.mini, 0) : "—") + " · max " + (typeof m.maxi === "number" ? mille(m.maxi, 0) : "—")));
      });
      box.appendChild(c);
    }
    const th = ["temperature", "humidite"].map((k) => de(eq, k)).filter(Boolean);
    if (th.length) {
      const c = carte("Température et humidité"), g = el("div", "eq-mes");
      th.forEach((m) => { const x = el("div", "eq-m"); x.setAttribute("data-cap", m.cap); x.appendChild(el("span", "", m.libelle)); x.appendChild(el("b", "", texte(m))); g.appendChild(x); });
      c.appendChild(g); box.appendChild(c);
    }
  }
  // Ouverture, fuite et autres alarmes : état (mot en grand, « depuis… » quand le serveur le sait : étape evenements)
  function etat(eq, box, c, cls) {
    const k = carte("État");
    k.appendChild(grand(texte(c), c.valeur === true ? cls : "", depuis(c.depuis)));
    box.appendChild(k);
  }
  // Mouvement (cartes, section 14) : état, réglages du capteur (sensorConfig : durée par minute, programmation, début et fin), appareils commandés (lecture)
  const SOLEIL = { sunset: "Coucher du soleil", sunrise: "Lever du soleil" };
  // Condition d'horaire -> texte envoyé (« 22:00 », « sunset-30 ») ; horaire complet : « debut|fin »
  const versTexte = (c) => (!c ? "" : SOLEIL[c.time] ? c.time + (c.offset ? (c.offset > 0 ? "+" : "") + c.offset : "") : c.time);
  const decaler = (hhmm, m) => { const p = String(hhmm).split(":"), t = ((+p[0] * 60 + +p[1] + m) % 1440 + 1440) % 1440; return deux(Math.floor(t / 60)) + ":" + deux(t % 60); };
  function condition(eq, ho, lib, cle, soleilDefaut, heureDefaut) {
    const c = ho[cle], soleil = !!(c && SOLEIL[c.time]), w = el("div", "eq-cond");
    const envoyer = peut(ho.c) ? (n) => { const x = { debut: ho.debut, fin: ho.fin }; x[cle] = n; if (x.debut && x.fin) ecrire(eq, ho.c, versTexte(x.debut) + "|" + versTexte(x.fin)); } : null;
    w.appendChild(rangee(lib, piste([["heure", "Heure"], ["soleil", "Soleil"]], c ? (soleil ? "soleil" : "heure") : null, lib,
      envoyer ? (k) => envoyer(k === "soleil" ? { time: soleilDefaut, offset: 0 } : { time: heureDefaut }) : null)));
    if (c) {
      const o = c.offset || 0;
      const bouger = (m) => (soleil ? { time: c.time, offset: Math.max(-180, Math.min(180, o + m)) } : { time: decaler(c.time, m) });
      w.appendChild(pas(soleil ? SOLEIL[c.time] + (o ? (o < 0 ? " − " : " + ") + Math.abs(o) + " min" : "") : c.time, lib,
        envoyer ? () => envoyer(bouger(-15)) : null, envoyer ? () => envoyer(bouger(15)) : null));
    }
    return w;
  }
  function mouvement(eq, box) {
    const pr = de(eq, "presence"), lx = de(eq, "lux"), k = carte("État");
    k.appendChild(grand(texte(pr), pr.valeur === true ? "bleu" : "", pr.valeur === true ? "à l'instant" : vu(pr.derniere)));
    if (lx) k.appendChild(ligne(lx.libelle, texte(lx)));
    box.appendChild(k);
    const du = de(eq, "duree_allumage"), pg = de(eq, "programmation"), ho = de(eq, "horaire");
    if (du || pg) {
      const r = carte("Réglages du capteur");
      if (du && !expose(du)) r.appendChild(ligne("Lumières ON pendant", num(du) === null ? "—" : Math.round(num(du) / 60) + " min"));
      else if (du) {
        const m = num(du) === null ? null : Math.round(num(du) / 60), env = peut(du) ? (x) => ecrire(eq, du, Math.max(1, x) * 60) : null;
        r.appendChild(rangee("Lumières ON pendant", pas(m === null ? "—" : m + " min", "Lumières ON pendant", env && m !== null && m > 1 ? () => env(m - 1) : null, env && m !== null ? () => env(m + 1) : null)));
      }
      if (expose(pg)) r.appendChild(rangee("Programmation horaire", onoffCap(eq, pg, "Programmation horaire")));
      else if (pg) r.appendChild(ligne("Programmation horaire", texte(pg)));
      if (pg && pg.valeur === true && ho && !expose(ho)) r.appendChild(ligne("Horaire", [ho.debut, ho.fin].map((x) => (!x ? "—" : SOLEIL[x.time] ? SOLEIL[x.time] + (x.offset ? (x.offset < 0 ? " − " : " + ") + Math.abs(x.offset) + " min" : "") : x.time)).join(" → ")));
      else if (pg && pg.valeur === true && ho) {
        const h = { c: ho, debut: ho.debut, fin: ho.fin };
        r.appendChild(condition(eq, h, "Début", "debut", "sunset", "22:00"));
        r.appendChild(condition(eq, h, "Fin", "fin", "sunrise", "07:00"));
      }
      box.appendChild(r);
    }
    lies(eq, box, "Appareils commandés", null);
  }
  // Lampes liées (remoteLinks, liens faits dans l'application IKEA, lecture) : ⏻ par lampe (routes de la vue Lumières) et › vers sa configuration ; element : seulement celles de ce mode
  function lies(eq, box, titre, ctx, element) {
    const l = (eq.lies || []).filter((x) => !element || (x.par || []).indexOf(element) >= 0);
    if (!l.length) return null;
    const c = titre === null ? box : carte(titre);
    l.forEach((x) => {
      const r = el("div", "eq-lie"), d = APP.find ? APP.find(APP.devices || [], x.element) : null;
      r.appendChild(el("span", "eq-l", x.nom));
      if (ctx && d) {
        const b = rond('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>', x.nom + " : " + (d.isOn ? "OFF" : "ON"), "eq-power" + (d.isOn ? " on" : ""));
        if (d.reachable !== false) b.onclick = () => ctx.basculer(d); else inactif(b);
        r.appendChild(b);
      }
      if (ctx && ctx.ouvrirElement) { const g = rond("›", x.nom + " : configuration", "eq-suite"); g.onclick = () => ctx.ouvrirElement(x.element); r.appendChild(g); }
      c.appendChild(r);
    });
    if (c !== box) box.appendChild(c);
    return c;
  }
  // « Ajouter des lampes… » (V2.1 étape telecommande-lampes) : liste des lumières et prises du hub non commandées par ce mode (options de lier), cases à cocher ; « Ajouter » envoie
  // une commande par lampe, l'une après l'autre (confirm : modifie la configuration du hub). Retrait : application IKEA (aucune commande du hub). État gardé ici pendant les relectures.
  const choixLier = {};
  function ajouter(eq, c, box, rendre) {
    const k = eq.id + "|" + c.element, st = choixLier[k];
    if (!st) {
      const b = action((c.options || []).length ? "Ajouter des lampes…" : "Toutes les lampes sont déjà commandées");
      if (!(c.options || []).length) inactif(b); else lier(b, c, () => { choixLier[k] = { choisis: [], envoi: null }; rendre(); });
      box.appendChild(b);
      return;
    }
    const liste = el("div", "eq-lierliste"); liste.setAttribute("role", "group"); liste.setAttribute("aria-label", "Lampes à ajouter");
    (c.options || []).forEach((o) => {
      const pris = st.choisis.indexOf(o.code) >= 0, b = el("button", "eq-liercase" + (pris ? " sel" : ""), o.libelle);
      b.setAttribute("aria-pressed", pris ? "true" : "false");
      if (st.envoi) inactif(b); else b.onclick = (e) => { if (e) e.stopPropagation(); if (pris) st.choisis.splice(st.choisis.indexOf(o.code), 1); else st.choisis.push(o.code); rendre(); };
      liste.appendChild(b);
    });
    box.appendChild(liste);
    box.appendChild(el("div", "eq-note", st.envoi ? "Ajout " + st.envoi.n + " / " + st.envoi.total + "… (quelques secondes par lampe)" : "Une lampe rangée dans un groupe du hub y reste. Pour retirer une lampe d'un mode : application IKEA."));
    const r = el("div", "eq-lierbtns"), ok = action(st.choisis.length ? "Ajouter (" + st.choisis.length + ")" : "Ajouter"), non = action("Annuler");
    if (st.envoi || !st.choisis.length || !peut(c)) inactif(ok); else ok.onclick = (e) => {
      if (e) e.stopPropagation();
      const ids = st.choisis.slice(), total = ids.length;
      let n = 0, cur = eq;
      const suivant = () => {
        if (!ids.length) { delete choixLier[k]; APP.banner(APP.cartes.pluriel(total, "lampe") + (total > 1 ? " ajoutées." : " ajoutée."), "ok"); rendre(); return; }
        const id = ids.shift(); n++;
        st.envoi = { n: n, total: total }; rendre();
        const lc = caps(cur).filter((x) => x.cap === "lier" && x.element === c.element)[0] || c;
        ecrire(cur, lc, id, { confirm: true, apres: (e2) => { if (e2) cur = e2; st.choisis.splice(st.choisis.indexOf(id), 1); suivant(); } });
        if (!occupes[cur.id]) { st.envoi = null; rendre(); } // refus immédiat (commande déjà en cours)
      };
      suivant();
    };
    if (st.envoi) inactif(non); else non.onclick = (e) => { if (e) e.stopPropagation(); delete choixLier[k]; rendre(); };
    r.appendChild(ok); r.appendChild(non);
    box.appendChild(r);
  }
  // Échec d'un ajout : choix gardé, envoi arrêté (l'équipement est relu par la vue)
  surEquipement((e, id) => { if (e === null) Object.keys(choixLier).forEach((k) => { if (k.indexOf(id + "|") === 0 && choixLier[k].envoi) choixLier[k].envoi = null; }); });
  // Télécommande (cartes, section 15 ; V2.1 étape telecommande-lampes) : une carte par mode (élément de la télécommande : « Mode N » s'il y en a plusieurs) : mode de commande (piste si
  // exposé, sinon texte), groupe commandé (groupe du hub commun aux lampes du mode : ON / OFF, luminosité, blanc, chacun s'il est exposé), lampes du mode, « Ajouter des lampes… » (lier exposé).
  const MODE_CAPS = ["mode_commande", "groupe_onoff", "groupe_luminosite", "groupe_temperature", "lier"];
  function telecommande(eq, box, ctx) {
    const els = [];
    (eq.elements || []).forEach((e) => { if (caps(eq).some((c) => c.element === e && MODE_CAPS.indexOf(c.cap) >= 0) || (eq.lies || []).some((x) => (x.par || []).indexOf(e) >= 0)) els.push(e); });
    const rendre = ctx && ctx.rendre ? ctx.rendre : () => {};
    els.forEach((e, i) => {
      const c = carte(els.length > 1 ? "Mode " + (i + 1) : "Lampes commandées");
      const a = (k) => caps(eq).filter((x) => x.cap === k && x.element === e)[0] || null;
      const m = a("mode_commande"), go = a("groupe_onoff"), gl = a("groupe_luminosite"), gt = a("groupe_temperature"), li = a("lier");
      if (expose(m)) c.appendChild(pisteCap(eq, m, (m.options || []).map((o) => [o.code, o.libelle]), "Mode de commande"));
      else if (m && m.valeur !== null && m.valeur !== undefined) c.appendChild(ligne("Commande", texte(m)));
      if (expose(go) || expose(gl) || expose(gt)) {
        const nom = go && go.libelle ? go.libelle : "Groupe commandé";
        c.appendChild(el("div", "eq-sous", nom));
        if (expose(go)) c.appendChild(onoffCap(eq, go, "Groupe : ON / OFF"));
        if (expose(gl)) c.appendChild(rangee("Luminosité · " + (num(gl) === null ? "—" : nb(num(gl), 0) + " %"), curseur(gl.min || 1, gl.max || 100, num(gl), "Luminosité du groupe", "", peut(gl) ? (v) => ecrire(eq, gl, v) : null)));
        if (expose(gt)) c.appendChild(rangee("Blanc · " + (num(gt) === null ? "—" : mille(num(gt), 0) + " K"), curseur(gt.min, gt.max, num(gt), "Blanc du groupe", "", peut(gt) ? (v) => ecrire(eq, gt, v) : null)));
      }
      lies(eq, c, null, ctx, e);
      if (expose(li)) ajouter(eq, li, c, rendre);
      box.appendChild(c);
    });
  }

  // ---------- hub (vue Équipements et fenêtre « Hubs ») ----------
  // Code d'appairage sur demande (deux appuis, écoute locale seulement ; effacé après 30 s, au changement de sélection, de vue ou à la fermeture de la fenêtre)
  let code = null, codeT = null, arme = null, armeT = null, redessiner = null;
  // V2.2 ha-localisation : position GPS (capacité privée coordonnees, hub et traceurs) affichée de même sur demande (deux appuis, 30 s, effacée avec le code)
  let pos = null, posT = null;
  function effacerCode() { const r = redessiner; code = null; pos = null; oublierSaisie(); if (codeT) { clearTimeout(codeT); codeT = null; } if (posT) { clearTimeout(posT); posT = null; } arme = null; if (armeT) { clearTimeout(armeT); armeT = null; } if (r) r(); }
  // Coordonnées « lat, lon (± m) » -> lien geo: (application de cartes de l'appareil : notre application ne contacte aucun service de cartes) ; illisible : null
  function lienGeo(t) {
    // Nombres repris tels qu'écrits (jamais réécrits par JavaScript, qui peut donner 1e-7) : forme stricte attendue par l'APK (logique/Origine.cartes)
    const m = /^\s*(-?\d{1,2}(?:\.\d{1,17})?),\s*(-?\d{1,3}(?:\.\d{1,17})?)(?![\d.])/.exec(String(t || ""));
    if (!m) return null;
    const la = +m[1], lo = +m[2];
    return la >= -90 && la <= 90 && lo >= -180 && lo <= 180 ? "geo:" + m[1] + "," + m[2] + "?q=" + m[1] + "," + m[2] : null;
  }
  function boutonPosition(eq, k, rendre) {
    const b = el("div", "eq-code"), cle = eq.id + "|" + k.element + "|" + k.cap;
    if (pos && pos.cle === cle) {
      b.appendChild(el("span", "eq-l", "Position"));
      b.appendChild(el("b", "eq-codev", String(k.valeur)));
      const g = lienGeo(k.valeur);
      // Application Android (APK) : depuis la V2.2 (apk-geo), elle ouvre les liens geo: et l'annonce (APP.apk.geo) ; un ancien APK les refuse : pas de lien, dit
      if (g && (!(APP.apk && APP.apk.present) || APP.apk.geo)) { const a = el("a", "eq-bouton eq-carte-lien", "Ouvrir dans Cartes"); a.href = g; a.rel = "noopener"; b.appendChild(a); }
      else if (g) b.appendChild(el("span", "eq-note", "« Ouvrir dans Cartes » : mettez à jour l'application Android, ou ouvrez Domowa dans un navigateur."));
      const x = el("button", "eq-bouton eq-masquer", "Masquer"); x.onclick = effacerCode; b.appendChild(x);
      return b;
    }
    const a = arme === cle, btn = el("button", "eq-bouton eq-position" + (a ? " arme" : ""), a ? "Toucher encore pour afficher" : "Afficher la position");
    btn.onclick = () => {
      redessiner = rendre;
      if (arme !== cle) { arme = cle; if (armeT) clearTimeout(armeT); armeT = setTimeout(() => { arme = null; rendre(); }, 5000); rendre(); return; }
      arme = null; if (armeT) { clearTimeout(armeT); armeT = null; }
      pos = { id: eq.id, cle };
      if (posT) clearTimeout(posT);
      posT = setTimeout(effacerCode, 30000); // jamais gardée
      rendre();
    };
    b.appendChild(btn);
    return b;
  }
  // Présence (personne, traceur : capacité localisation) : zone en grand, position sur demande
  function presence(eq, box, rendre) {
    const z = de(eq, "localisation"), c = carte("Présence");
    c.appendChild(grand(z && z.valeur ? String(z.valeur) : "—", z && z.maison ? "vert" : ""));
    const k = de(eq, "coordonnees");
    if (k) { c.appendChild(boutonPosition(eq, k, rendre)); c.appendChild(el("div", "eq-note", "Position à l'écran seulement, 30 secondes, jamais enregistrée. « Ouvrir dans Cartes » la passe à l'application de cartes de l'appareil.")); }
    box.appendChild(c);
  }
  function boutonCode(eq, k, rendre, distant) {
    const b = el("div", "eq-code");
    const ici = code && code.id === eq.id && code.element === k.element && code.cap === k.cap;
    if (distant) { b.appendChild(el("span", "eq-l", k.libelle)); b.appendChild(el("span", "eq-note", APP.lieu("Affichable sur cet appareil seulement (machine du serveur)."))); return b; }
    if (ici) {
      b.appendChild(el("span", "eq-l", k.libelle));
      b.appendChild(el("b", "eq-codev", code.valeur));
      const x = el("button", "eq-bouton eq-masquer", "Masquer"); x.onclick = effacerCode; b.appendChild(x);
      return b;
    }
    const cle = eq.id + "|" + k.element + "|" + k.cap, a = arme === cle;
    const btn = el("button", "eq-bouton eq-montrer" + (a ? " arme" : ""), a ? "Toucher encore pour afficher" : "Afficher : " + k.libelle);
    btn.onclick = () => {
      redessiner = rendre;
      if (arme !== cle) { arme = cle; if (armeT) clearTimeout(armeT); armeT = setTimeout(() => { arme = null; rendre(); }, 5000); rendre(); return; }
      arme = null; if (armeT) { clearTimeout(armeT); armeT = null; }
      APP.api("POST", "/api/equipements/code", { id: eq.id, element: k.element, cap: k.cap }, (err, d) => {
        if (err || !d || !d.code) { APP.banner(err || "Code indisponible.", "warn"); rendre(); return; }
        code = { id: eq.id, element: k.element, cap: k.cap, valeur: String(d.code.valeur) };
        if (codeT) clearTimeout(codeT);
        codeT = setTimeout(effacerCode, 30000); // jamais gardé
        rendre();
      });
    };
    b.appendChild(btn);
    return b;
  }
  // Configuration du hub (cartes, section 16) : logiciel, soleil et heure, localisation en texte (à l'écran seulement), code d'appairage, options
  function hub(eq, box, rendre, distant) {
    const lg = logiciel(eq);
    if (lg) {
      const c = carte("Logiciel");
      if (lg.etat === "installation") {
        c.appendChild(grand("Installation", "orange", lg.progression !== null ? nb(lg.progression, 0) + " %" : ""));
        c.appendChild(barre(lg.progression || 0));
        c.appendChild(el("div", "eq-note", "Installation en cours : ne pas débrancher le hub."));
      } else if (lg.etat === "maj") {
        c.appendChild(grand("Mise à jour", "orange", lg.l.derniere ? lg.l.derniere + " disponible" : "disponible"));
        // Installer : deux appuis (« Confirmer : le hub redémarre »), confirm envoyé (commande sensible)
        const k = de(eq, "maj_installer");
        if (expose(k)) {
          const b = action("Installer…");
          if (peut(k)) deuxAppuis(b, eq.id + "|maj", "Confirmer : le hub redémarre", () => ecrire(eq, k, undefined, { confirm: true, ok: "Installation demandée : le hub va redémarrer." })); else inactif(b);
          c.appendChild(b);
        }
      } else {
        c.appendChild(grand("À jour"));
        const k = de(eq, "maj_rechercher");
        if (expose(k)) c.appendChild(lier(action("Rechercher une mise à jour"), k, () => ecrire(eq, k, undefined, { ok: "Recherche demandée au hub." })));
      }
      if (lg.l.valeur) c.appendChild(ligne("Version installée", String(lg.l.valeur)));
      box.appendChild(c);
    }
    const sc = de(eq, "soleil_coucher"), sl = de(eq, "soleil_lever"), fz = de(eq, "fuseau");
    if (sc || sl || fz) {
      const c = carte("Soleil et heure");
      if (sc) c.appendChild(ligne("Prochain coucher", heure(sc.valeur)));
      if (sl) c.appendChild(ligne("Prochain lever", heure(sl.valeur)));
      if (fz) c.appendChild(ligne("Fuseau", texte(fz)));
      box.appendChild(c);
    }
    // Localisation : zone en texte ; coordonnées sur demande (V2.2 ha-localisation, décision du 24/11 : position affichable sur demande seulement)
    const loc = caps(eq).filter((x) => x.cap === "localisation" || x.cap === "coordonnees");
    if (loc.length) { const c = carte("Localisation"); loc.forEach((x) => c.appendChild(x.cap === "coordonnees" ? boutonPosition(eq, x, rendre) : ligne(x.libelle, texte(x)))); c.appendChild(el("div", "eq-note", "À l'écran seulement, jamais enregistrée.")); box.appendChild(c); }
    if ((eq.codes || []).length) { const c = carte("Code d'appairage"); eq.codes.forEach((k) => c.appendChild(boutonCode(eq, k, rendre, distant))); box.appendChild(c); }
    const o = options(eq);
    if (o) box.appendChild(o);
  }
  // Tuile du hub : « À jour » ; « Mise à jour » (orange) ; « Installation » « 45 % »
  function tuileHub(eq) {
    const lg = logiciel(eq);
    if (!lg) return { v: "Hub", p: "" };
    if (lg.etat === "installation") return { v: "Installation", cls: "orange", p: lg.progression !== null ? nb(lg.progression, 0) + " %" : "" };
    if (lg.etat === "maj") return { v: "Mise à jour", cls: "orange", p: (lg.l.derniere ? lg.l.derniere + " " : "") + "disponible" };
    return { v: "À jour", p: "" };
  }

  // ---------- repli par type (V2.2 ha-ecriture ; conception §5) : commande d'une capacité sans widget propre, d'après son type ----------
  // Construit seulement si la capacité est exposée en écriture (sinon : sa valeur en texte). Booléen : ON / OFF ; choix : piste (3 au plus) ou pastilles ; nombre : − valeur + locaux
  // puis « Appliquer » (un seul envoi) ; texte, date, heure : champ puis « Envoyer » ; aucune valeur : bouton (sensible : deux appuis, confirm). Autres types : valeur en texte.
  // Brouillons (valeur choisie non envoyée) gardés par capacité jusqu'à l'envoi ou au rechargement de la page.
  const brouillons = {};
  const TYPES_REGLAGE = ["booleen", "choix", "nombre", "texte", "aucune"];
  const regle = (c) => !!(c && expose(c) && TYPES_REGLAGE.indexOf(c.type) >= 0);
  function bloc(lib) { const r = el("div", "eq-reglage"); r.appendChild(el("span", "eq-l", lib)); return r; }
  function reglage(eq, c) {
    const lib = c.libelle || c.cap;
    if (!regle(c)) return ligne(lib, texte(c));
    const k = eq.id + "|" + c.element + "|" + c.cap;
    if (c.type === "booleen") return rangee(lib, onoffCap(eq, c, lib));
    if (c.type === "choix") {
      const o = (c.options || []).map((x) => [x.code, x.libelle]), r = bloc(lib);
      if (o.length <= 3) { r.appendChild(pisteCap(eq, c, o, lib)); return r; }
      const g = el("div", "eq-pres"); g.setAttribute("role", "group"); g.setAttribute("aria-label", lib);
      o.forEach((x) => {
        const b = el("button", "eq-pre" + (x[0] === c.valeur ? " sel" : ""), x[1]); b.setAttribute("aria-pressed", x[0] === c.valeur ? "true" : "false");
        if (peut(c)) b.onclick = (e) => { if (e) e.stopPropagation(); if (x[0] !== c.valeur) ecrire(eq, c, x[0]); }; else inactif(b);
        g.appendChild(b);
      });
      r.appendChild(g); return r;
    }
    if (c.type === "nombre") return reglageNombre(eq, c, lib, k);
    if (c.type === "texte") return reglageTexte(eq, c, lib, k);
    const b = action(lib);
    if (!peut(c)) return inactif(b);
    if (c.sensible) return deuxAppuis(b, k, "Confirmer : " + lib, () => ecrire(eq, c, undefined, { confirm: true, ok: "Commande envoyée." }));
    return lier(b, c, () => ecrire(eq, c, undefined, { ok: "Commande envoyée." }));
  }
  function reglageNombre(eq, c, lib, k) {
    const p = typeof c.pas === "number" && c.pas > 0 ? c.pas : 1, mi = typeof c.min === "number" ? c.min : null, ma = typeof c.max === "number" ? c.max : null;
    const dec = Math.min(4, (String(p).split(".")[1] || "").length);
    const v0 = typeof c.valeur === "number" ? c.valeur : (mi !== null ? mi : 0);
    let v = typeof brouillons[k] === "number" ? brouillons[k] : v0;
    const r = bloc(lib), l = el("div", "eq-rangee"), val = el("b", "", ""), moins = rond("−", lib + " : moins"), plus = rond("+", lib + " : plus"), env = action("Appliquer");
    const pasD = el("div", "eq-pas"); pasD.appendChild(moins); pasD.appendChild(val); pasD.appendChild(plus);
    const envoyer = () => { if (v === v0) return; delete brouillons[k]; ecrire(eq, c, v, c.sensible ? { confirm: true } : undefined); };
    l.appendChild(pasD); l.appendChild(env); r.appendChild(l);
    // valeur sur la grille du pas (comptée depuis le minimum, comme le serveur), bornée
    const grille = (x) => { const b = mi !== null ? mi : 0; let y = +(b + Math.round((x - b) / p) * p).toFixed(dec); if (mi !== null) y = Math.max(mi, y); if (ma !== null) y = Math.min(ma, y); return y; };
    const peindre = () => {
      val.textContent = nb(v, dec) + unite(c.unite);
      moins.disabled = mi !== null && v <= mi; plus.disabled = ma !== null && v >= ma; env.disabled = v === v0;
    };
    if (!peut(c)) { inactif(moins); inactif(plus); inactif(env); peindre(); return r; }
    const changer = (d) => (e) => { if (e) e.stopPropagation(); v = grille(v + d); brouillons[k] = v; peindre(); };
    moins.onclick = changer(-p); plus.onclick = changer(p);
    // V2.2 ha-ouvrants : commande sensible (position d'une vanne, d'une porte de garage) : deux appuis, confirm
    if (c.sensible) deuxAppuis(env, k, "Confirmer ?", envoyer); else env.onclick = (e) => { if (e) e.stopPropagation(); envoyer(); };
    peindre(); return r;
  }
  // Texte et date / heure (widget date) : champ du navigateur (date, time, datetime-local), envoyé tel quel (le serveur vérifie le format)
  function valeurChamp(c) {
    const v = typeof c.valeur === "string" ? c.valeur : "";
    if (c.format === "time") return v.slice(0, 5);
    if (c.format === "datetime") { const d = new Date(v); return isNaN(d.getTime()) ? "" : d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()) + "T" + deux(d.getHours()) + ":" + deux(d.getMinutes()); }
    return v;
  }
  function reglageTexte(eq, c, lib, k) {
    const r = bloc(lib), l = el("div", "eq-rangee"), i = el("input", "eq-saisie"), env = action("Envoyer");
    i.type = c.format === "date" ? "date" : c.format === "time" ? "time" : c.format === "datetime" ? "datetime-local" : "text";
    i.setAttribute("aria-label", lib);
    if (typeof c.longueur_max === "number" && c.longueur_max > 0) i.maxLength = c.longueur_max;
    const v0 = valeurChamp(c);
    i.value = typeof brouillons[k] === "string" ? brouillons[k] : v0;
    const peindre = () => { env.disabled = i.value === v0 || (c.format && !i.value); };
    l.appendChild(i); l.appendChild(env); r.appendChild(l);
    if (!peut(c)) { i.disabled = true; inactif(env); return r; }
    i.oninput = () => { brouillons[k] = i.value; peindre(); };
    i.onclick = (e) => { if (e) e.stopPropagation(); };
    env.onclick = (e) => { if (e) e.stopPropagation(); if (env.disabled) return; const s = i.value; delete brouillons[k]; ecrire(eq, c, s); };
    peindre(); return r;
  }
  // ---------- ouvrants et sécurité (V2.2 ha-ouvrants ; décision du 24/11 : basiques, « un peu comme des switch », piste ON / OFF q-segs) ----------
  // Serrure, alarme, vanne, sirène : piste de deux états (q-segs) ; le sens risqué (déverrouiller, désarmer, ouvrir une vanne, déclencher la sirène) en deux appuis
  // (« Confirmer ? », 5 s), l'autre en un appui ; toutes sensibles pour le serveur : confirm envoyé dans les deux cas. Jamais dans un groupe, une scène, une animation ni Tout OFF.
  // Code d'alarme ou de serrure (code_format déclaré) : champ masqué tapé à chaque fois, clavier chiffres ou texte (clavier_code) ; gardé en mémoire 30 s au plus après la
  // dernière frappe (reconstruction de la configuration), effacé à l'envoi, au changement de sélection ou de vue (effacerCode) ; jamais stocké, journalisé ni renvoyé.
  let saisie = null, saisieT = null;
  function oublierSaisie() { saisie = null; if (saisieT) { clearTimeout(saisieT); saisieT = null; } }
  function champCode(eq, c) {
    const cle = eq.id + "|" + c.element, i = el("input", "eq-saisie eq-codesaisi");
    i.type = "password"; i.autocomplete = "off"; i.setAttribute("autocomplete", "off"); i.setAttribute("aria-label", "Code");
    i.setAttribute("inputmode", c.clavier_code === "chiffres" ? "numeric" : "text"); i.maxLength = 64; i.spellcheck = false;
    i.placeholder = "Code";
    if (saisie && saisie.cle === cle) i.value = saisie.v;
    i.oninput = () => { saisie = { cle, v: i.value }; if (saisieT) clearTimeout(saisieT); saisieT = setTimeout(() => { oublierSaisie(); i.value = ""; }, 30000); };
    i.onclick = (e) => { if (e) e.stopPropagation(); };
    const r = el("div", "eq-rangee"); r.appendChild(el("span", "eq-l", "Code")); r.appendChild(i);
    return { r, lire: () => i.value, vider: () => { i.value = ""; oublierSaisie(); } };
  }
  // Piste de deux états : choix [[code, libellé, classe (on | off), risqué]] ; actif : code actif ; choisir(code) : envoi (sans fonction : inactive)
  function deuxEtats(cle, choix, actif, lib, choisir) {
    const s = el("div", "q-segs eq-segs eq-segs-l"); if (lib) s.setAttribute("aria-label", lib);
    choix.forEach((x) => {
      const b = el("button", "q-seg" + (x[0] === actif ? " sel " + x[2] : ""), x[1]); b.setAttribute("aria-pressed", x[0] === actif ? "true" : "false");
      if (!choisir) inactif(b);
      else if (x[3] && x[0] !== actif) deuxAppuis(b, cle + "|" + x[0], "Confirmer ?", () => choisir(x[0]));
      else b.onclick = (e) => { if (e) e.stopPropagation(); if (x[0] !== actif) choisir(x[0]); };
      s.appendChild(b);
    });
    return s;
  }
  const ETAT_VERROU = { locked: "lock", locking: "lock", unlocked: "unlock", unlocking: "unlock", open: "unlock", opening: "unlock" };
  // Code requis avant l'envoi (le serveur le vérifie aussi) : bandeau, rien envoyé
  function avecCode(eq, c, champ, requis, valeur, ok) {
    const v = champ ? champ.lire() : "";
    if (requis && !v) { APP.banner("Tapez le code.", "warn"); return; }
    const o = { confirm: true, ok };
    if (champ && v) o.options = { code: v };
    if (champ) champ.vider();
    ecrire(eq, c, valeur, o);
  }
  function serrure(eq, box) {
    const c = de(eq, "verrou"), k = carte("Serrure"), v = c && c.valeur;
    k.appendChild(grand(texte(c), v === "unlocked" || v === "open" ? "orange" : v === "jammed" ? "rouge" : v === "locked" ? "vert" : ""));
    if (expose(c)) {
      const champ = c.clavier_code ? champCode(eq, c) : null;
      if (champ) k.appendChild(champ.r);
      k.appendChild(deuxEtats(eq.id + "|verrou", [["lock", "Verrouillée", "on", false], ["unlock", "Déverrouillée", "off", true]], ETAT_VERROU[v] || null, "Serrure",
        peut(c) ? (x) => avecCode(eq, c, champ, !!champ, x, x === "lock" ? "Verrouillage demandé." : "Déverrouillage demandé.") : null));
      if (v === "jammed") k.appendChild(el("div", "eq-note", "La serrure signale un blocage : vérifiez la porte."));
    }
    box.appendChild(k);
  }
  function centrale(eq, box) {
    const c = de(eq, "alarme"), k = carte("Alarme"), v = c && typeof c.valeur === "string" ? c.valeur : null;
    const arme = !!v && v !== "disarmed" && v !== "disarming";
    k.appendChild(grand(texte(c), v === "triggered" ? "rouge" : arme ? "vert" : ""));
    if (expose(c)) {
      const modes = (c.options || []).filter((x) => x.code !== "disarm"), champ = c.clavier_code ? champCode(eq, c) : null;
      const reqArme = !!champ && c.code_requis !== false;
      if (champ) k.appendChild(champ.r);
      const envoi = (x) => avecCode(eq, c, champ, x === "disarm" ? !!champ : reqArme, x, x === "disarm" ? "Désarmement demandé." : "Armement demandé.");
      const choisir = peut(c) ? (x) => { if (x !== "arm") return envoi(x); if (modes.length === 1) return envoi(modes[0].code); APP.banner("Choisissez le mode d'armement ci-dessous.", "warn"); } : null;
      k.appendChild(deuxEtats(eq.id + "|alarme", [["disarm", "Désarmée", "off", true], ["arm", "Armée", "on", false]], v ? (arme ? "arm" : "disarm") : null, "Alarme", choisir));
      // Plusieurs modes d'armement : pastilles (le mode actif en surbrillance), un appui
      if (modes.length > 1) {
        const g = el("div", "eq-pres"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Mode d'armement");
        modes.forEach((x) => {
          const actif = v === x.code.replace(/^arm_/, "armed_"), b = el("button", "eq-pre" + (actif ? " sel" : ""), x.libelle.replace(/^Armer \((.*)\)$/, "$1").replace(/^./, (m) => m.toUpperCase()));
          b.setAttribute("aria-pressed", actif ? "true" : "false"); b.setAttribute("aria-label", x.libelle);
          if (peut(c)) b.onclick = (e) => { if (e) e.stopPropagation(); if (!actif) envoi(x.code); }; else inactif(b);
          g.appendChild(b);
        });
        k.appendChild(g);
      }
    }
    box.appendChild(k);
  }
  function vanne(eq, box) {
    const c = de(eq, "ouverture"), p = de(eq, "position"), k = carte("Vanne"), v = c && c.valeur;
    const ouverte = v === "open" || v === "opening", pos = num(p);
    k.appendChild(grand(texte(c), ouverte ? "bleu" : "", pos !== null ? nb(pos, 0) + " %" : ""));
    if (expose(c)) {
      const o = (c.options || []).map((x) => x.code), ch = [];
      if (o.indexOf("open") >= 0) ch.push(["open", "Ouverte", "on", true]);
      if (o.indexOf("close") >= 0) ch.push(["close", "Fermée", "off", false]);
      k.appendChild(deuxEtats(eq.id + "|vanne", ch, v === "open" || v === "opening" ? "open" : v === "closed" || v === "closing" ? "close" : null, "Vanne",
        peut(c) ? (x) => ecrire(eq, c, x, { confirm: true, ok: x === "open" ? "Ouverture demandée." : "Fermeture demandée." }) : null));
      if (o.indexOf("stop") >= 0 && (v === "opening" || v === "closing")) { const b = action("■ Arrêt"); lier(b, c, () => ecrire(eq, c, "stop", { confirm: true })); k.appendChild(b); }
    }
    if (p && expose(p)) k.appendChild(reglage(eq, p));
    box.appendChild(k);
  }
  // Sirène : ON en deux appuis (déclencher), OFF en un ; ton, volume et durée seulement s'ils sont déclarés : choisis ici, envoyés avec le ON (sinon : ceux de l'appareil)
  const sons = {};
  function sirene(eq, box, rendre) {
    const c = de(eq, "sirene"), k = carte("Sirène"), cle = eq.id + "|" + (c ? c.element : "");
    const p = sons[cle] || (sons[cle] = { ton: null, volume: null, duree: null });
    k.appendChild(grand(c && c.valeur === true ? "ON" : c && c.valeur === false ? "OFF" : "—", c && c.valeur === true ? "rouge" : ""));
    if (!expose(c)) { box.appendChild(k); return; }
    const opts = () => { const o = {}; if (p.ton !== null) o.ton = p.ton; if (p.volume !== null) o.volume = p.volume; if (p.duree !== null) o.duree = p.duree; return Object.keys(o).length ? o : undefined; };
    k.appendChild(deuxEtats(cle, [[true, "ON", "on", true], [false, "OFF", "off", false]], typeof c.valeur === "boolean" ? c.valeur : null, "Sirène",
      peut(c) ? (x) => ecrire(eq, c, x, { confirm: true, options: x === true ? opts() : undefined, ok: x === true ? "Sirène déclenchée." : "Sirène arrêtée." }) : null));
    const re = () => { if (rendre) rendre(); };
    if (Array.isArray(c.tons) && c.tons.length) {
      const r = bloc("Ton"), g = el("div", "eq-pres"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Ton");
      [{ code: null, libelle: "Par défaut" }].concat(c.tons).forEach((x) => {
        const b = el("button", "eq-pre" + (p.ton === x.code ? " sel" : ""), x.libelle); b.setAttribute("aria-pressed", p.ton === x.code ? "true" : "false");
        b.onclick = (e) => { if (e) e.stopPropagation(); p.ton = x.code; re(); };
        g.appendChild(b);
      });
      r.appendChild(g); k.appendChild(r);
    }
    if (c.volume_reglable) k.appendChild(rangee("Volume", pas(p.volume === null ? "Par défaut" : p.volume + " %", "Volume",
      p.volume === 0 ? null : () => { p.volume = p.volume === null ? 50 : Math.max(0, p.volume - 10); re(); }, p.volume === 100 ? null : () => { p.volume = p.volume === null ? 50 : Math.min(100, p.volume + 10); re(); })));
    if (c.duree_reglable) k.appendChild(rangee("Durée", pas(p.duree === null ? "Par défaut" : p.duree + " s", "Durée",
      p.duree === 5 ? null : () => { p.duree = p.duree === null ? 30 : Math.max(5, p.duree - 5); re(); }, p.duree === 300 ? null : () => { p.duree = p.duree === null ? 30 : Math.min(300, p.duree + 5); re(); })));
    if (c.tons || c.volume_reglable || c.duree_reglable) k.appendChild(el("div", "eq-note", "Ton, volume et durée : envoyés avec le prochain ON."));
    box.appendChild(k);
  }
  // Robot (aspirateur, tondeuse ; V2.2 ha-media-robots) : état, commandes déclarées en boutons (un appui), vitesse d'aspiration par type ; rien de sensible
  const ORDRE_ROBOT = ["start", "start_mowing", "pause", "stop", "return_to_base", "dock", "clean_spot", "locate"];
  function robot(eq, box) {
    const c = de(eq, "robot"), k = carte("Robot"), v = c && c.valeur;
    k.appendChild(grand(texte(c), v === "error" ? "rouge" : v === "cleaning" || v === "mowing" ? "vert" : ""));
    if (expose(c)) {
      const g = el("div", "eq-pres"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Commandes du robot");
      (c.options || []).slice().sort((a, b) => ORDRE_ROBOT.indexOf(a.code) - ORDRE_ROBOT.indexOf(b.code)).forEach((x) => {
        const b = el("button", "eq-pre", x.libelle);
        lier(b, c, () => ecrire(eq, c, x.code, { ok: x.libelle + " : demandé." }));
        g.appendChild(b);
      });
      k.appendChild(g);
    }
    const vi = de(eq, "vitesse_predefinie");
    if (vi) k.appendChild(reglage(eq, vi));
    box.appendChild(k);
  }
  // Ouvrant (store, volet, porte de garage) : code de l'option qui correspond à un sens (DIRIGERA : up, down, stopped ; Home Assistant : open, close, stop) ; absente : null
  const SENS_OUVERTURE = { monte: ["up", "open"], descend: ["down", "close"], stop: ["stopped", "stop"] };
  function codeOuverture(c, sens) { const o = ((c && c.options) || []).map((x) => x.code); return (SENS_OUVERTURE[sens] || []).filter((x) => o.indexOf(x) >= 0)[0] || null; }
  // ---------- chauffage (V2.2 ha-climat, cadran ha-thermostat ; décisions du 24/11) ----------
  // Cadran de température (même géométrie que le cadran de luminosité de reglages.js : arc de 270°, rayon 80, curseur rond, lueur floue) : arc bleu (froid) -> rouge (chaud),
  // échelle d'un climat intérieur 14-26 °C (57-79 °F), jaune de 19 à 21 °C ; appareil dont les bornes sortent de ce climat (chauffe-eau) : ses propres bornes ; consigne choisie
  // sur les bornes déclarées dans cette échelle, au pas déclaré (0,5 par défaut) ; envoi au lâcher du doigt (un envoi), − / + : un envoi 0,9 s après le dernier appui ;
  // refusée en mode OFF (en_off) ; repère de la température mesurée sur l'arc.
  // Halo (rouge : chauffe, bleu : refroidit) qui éclaire la carte et la tuile : activité de Home Assistant (hvac_action) si connue ; sinon déduite du mode et de l'écart
  // consigne - mesure (0,2 °C de tolérance) ; sans mesure : du mode seul (chauffe : rouge, clim : bleu, intensité fixe ; auto : rien) ; déduite : puce « Mode chauffe ».
  // Intensité : 0,25 à 1 selon l'écart (5 °C ou plus : 1) ; sans écart connu : 0,35.
  const ACTIVITE = { heating: "Chauffe", idle: "Au repos", off: "Arrêté", cooling: "Refroidit", drying: "Déshumidification", fan: "Ventilation", preheating: "Préchauffage", defrosting: "Dégivrage" };
  const absorbee = (c, k) => ((c && c.absorbees) || []).filter((x) => x.cap === k)[0] || null;
  const MODES_CHAUD = ["heat", "heat_cool", "auto"], MODES_FROID = ["cool", "heat_cool", "auto"];
  function chaud(eq) {
    const cs = de(eq, "consigne_temperature"), m = de(eq, "mode"), o = de(eq, "onoff"), a = de(eq, "activite");
    const mesure = absorbee(cs, "temperature") || de(eq, "temperature");
    const ao = absorbee(m, "onoff"), off = !!(m && m.valeur === "off") || !!(o && o.valeur === false) || !!(ao && ao.valeur === false);
    const r = { cs, m, o: o && o.role === "chauffage" ? o : null, a, mesure, off, chauffe: false, refroidit: false, estime: false, intensite: 0, activite: null };
    if (off) { r.activite = "Arrêté"; return r; }
    const v = (c) => (c && typeof c.valeur === "number" ? c.valeur : null), ecart = v(cs) !== null && v(mesure) !== null ? v(cs) - v(mesure) : null;
    const force = ecart === null ? 0.35 : 0.25 + 0.75 * Math.min(Math.abs(ecart), 5) / 5;
    if (a && typeof a.valeur === "string" && a.valeur) {
      r.chauffe = a.valeur === "heating" || a.valeur === "preheating"; r.refroidit = a.valeur === "cooling";
      r.activite = ACTIVITE[a.valeur] || a.valeur;
    } else {
      // Sans activité : appareil de chauffage seul (modes sans heat ni cool, ex. chauffe-eau ; ou sans mode) : chauffe ; sinon d'après le mode
      const mv = m && m.valeur, opts = ((m && m.options) || []).map((x) => x.code);
      const chauffant = !mv || (opts.indexOf("heat") < 0 && opts.indexOf("cool") < 0), peutChaud = chauffant || MODES_CHAUD.indexOf(mv) >= 0, peutFroid = !chauffant && MODES_FROID.indexOf(mv) >= 0;
      if (ecart !== null) { r.chauffe = peutChaud && ecart > 0.2; r.refroidit = peutFroid && ecart < -0.2; }
      else { r.chauffe = chauffant || mv === "heat"; r.refroidit = mv === "cool"; }
      r.estime = true;
      r.activite = r.chauffe ? "Mode chauffe" : r.refroidit ? "Mode clim" : ecart !== null ? "Au repos" : null;
    }
    if (r.chauffe || r.refroidit) r.intensite = force;
    return r;
  }
  // Plage de consigne (climatiseur) : « 19–24 °C »
  const plage = (c) => (c && c.valeur && typeof c.valeur.bas === "number" && typeof c.valeur.haut === "number" ? nb(c.valeur.bas, 1) + "–" + nb(c.valeur.haut, 1) + unite(c.unite || "°C") : "—");
  const degres = (c) => (c && typeof c.valeur === "number" ? nb(c.valeur, 1) + unite(c.unite || "°C") : "—");
  // Halo : variables CSS de la carte ou de la tuile (classe eq-halo ; .eq-halo::before de equipements.css)
  function halo(n, h, tuile) {
    const i = h && (h.chauffe || h.refroidit) ? h.intensite : 0;
    n.classList.toggle("eq-halo", i > 0);
    if (!i) return;
    n.style.setProperty("--hc", h.chauffe ? "255,72,48" : "64,150,255");
    n.style.setProperty("--ha", (0.08 + (tuile ? 0.3 : 0.32) * i).toFixed(2));
    n.style.setProperty("--hb", Math.round((tuile ? 8 : 10) + (tuile ? 16 : 14) * i) + "px"); // 24 px au plus : plafond des lueurs fonctionnelles (banc, LUMIERES)
    n.style.setProperty("--hs", (0.12 + 0.33 * i).toFixed(2));
  }
  // Échelle du cadran (pure, essais unitaires) : {bas, haut, min, max} ; teinte(f) bleu -> jaune (19-21 °C) -> rouge
  function echelle(c) {
    const f = !!(c && c.unite && /F/.test(c.unite)), bas = f ? 57 : 14, haut = f ? 79 : 26;
    const mi = c && typeof c.min === "number" ? c.min : bas, ma = c && typeof c.max === "number" ? c.max : haut;
    if (mi > haut || ma < bas) return { bas: mi, haut: ma, min: mi, max: ma, propre: true };
    const a = Math.max(mi, bas), b = Math.min(ma, haut);
    return b - a >= 1 ? { bas, haut, min: a, max: b, propre: false } : { bas: mi, haut: ma, min: mi, max: ma, propre: true };
  }
  const STOPS = [[0, [61, 123, 255]], [0.24, [127, 196, 255]], [5 / 12, [255, 214, 120]], [7 / 12, [255, 214, 120]], [0.8, [255, 138, 76]], [1, [255, 64, 64]]];
  function teinte(f) {
    f = Math.max(0, Math.min(1, f));
    for (let i = 1; i < STOPS.length; i++) if (f <= STOPS[i][0]) { const a = STOPS[i - 1], b = STOPS[i], t = (f - a[0]) / (b[0] - a[0] || 1); return "rgb(" + a[1].map((x, k) => Math.round(x + (b[1][k] - x) * t)).join(",") + ")"; }
    return "rgb(255,64,64)";
  }
  const SVGNS = "http://www.w3.org/2000/svg", RAYON = 80;
  function sv(tag, at) { const e = document.createElementNS(SVGNS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; }
  const point = (f) => { const a = (135 + 270 * f) * Math.PI / 180; return [100 + RAYON * Math.cos(a), 100 + RAYON * Math.sin(a)]; };
  const arcD = (f0, f1) => { const a = point(f0), b = point(f1); return "M" + a[0].toFixed(2) + " " + a[1].toFixed(2) + " A" + RAYON + " " + RAYON + " 0 0 1 " + b[0].toFixed(2) + " " + b[1].toFixed(2); };
  let numCadran = 0;
  function cadran(eq, c, h) {
    const E = echelle(c), p = typeof c.pas === "number" && c.pas > 0 ? c.pas : 0.5, dec = Math.min(2, (String(p).split(".")[1] || "").length), N = 54;
    const k = eq.id + "|" + c.element + "|consigne", fr = (x) => (x - E.bas) / (E.haut - E.bas);
    const v0 = typeof c.valeur === "number" ? c.valeur : E.min;
    let v = typeof brouillons[k] === "number" ? brouillons[k] : v0, attente = null, glisse = false;
    const actif = peut(c) && !c.en_off;
    const r = el("div", "eq-thermo" + (actif ? "" : " inactif")), rang = el("div", "eq-thermo-rang");
    const moins = rond("−", "Consigne : moins"), plus = rond("+", "Consigne : plus"), boite = el("div", "eq-thermo-cadran");
    const fid = "eqth" + (++numCadran), svg = sv("svg", { viewBox: "0 0 200 200", "class": "eq-thermo-svg", role: "slider", "aria-label": "Consigne", tabindex: actif ? "0" : "-1" });
    const defs = sv("defs", {}), flt = sv("filter", { id: fid, x: "-50%", y: "-50%", width: "200%", height: "200%" });
    flt.appendChild(sv("feGaussianBlur", { stdDeviation: "7" })); defs.appendChild(flt); svg.appendChild(defs);
    const piste = sv("g", { "class": "eq-thermo-piste" });
    for (let i = 0; i < N; i++) piste.appendChild(sv("path", { d: arcD(i / N, Math.min(1, (i + 1) / N + 0.004)), stroke: teinte((i + 0.5) / N) }));
    svg.appendChild(piste);
    svg.appendChild(sv("circle", { cx: 100, cy: 100, r: 64, fill: "#11151c", stroke: "#262c37", "stroke-width": 1 }));
    const lueur = sv("g", { "class": "eq-thermo-lueur", filter: "url(#" + fid + ")" }), rempli = sv("g", { "class": "eq-thermo-rempli" });
    svg.appendChild(lueur); svg.appendChild(rempli);
    const mes = h.mesure && typeof h.mesure.valeur === "number" ? h.mesure.valeur : null;
    if (mes !== null) { const q = point(Math.max(0, Math.min(1, fr(mes)))); svg.appendChild(sv("circle", { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 4, "class": "eq-thermo-mesure" })); }
    const ombre = sv("circle", { r: 12, fill: "#000", "fill-opacity": 0.55, filter: "url(#" + fid + ")" }), pouce = sv("circle", { r: 11, "class": "eq-thermo-pouce" });
    svg.appendChild(ombre); svg.appendChild(pouce);
    boite.appendChild(svg);
    const centre = el("div", "eq-thermo-centre"), num = el("div", "eq-thermo-num", ""), u = el("div", "eq-thermo-u", unite(c.unite || "°C").trim());
    centre.appendChild(num); centre.appendChild(u);
    if (mes !== null) centre.appendChild(el("div", "eq-thermo-mes", "mesuré " + nb(mes, 1) + unite(h.mesure.unite || c.unite || "°C")));
    boite.appendChild(centre);
    rang.appendChild(moins); rang.appendChild(boite); rang.appendChild(plus); r.appendChild(rang);
    const lumiere = (h.chauffe || h.refroidit) ? (h.chauffe ? "rgb(255,72,48)" : "rgb(64,150,255)") : null;
    const peindre = () => {
      const fv = Math.max(0, Math.min(1, fr(v))), n = Math.max(1, Math.round(fv * N));
      rempli.textContent = ""; lueur.textContent = "";
      for (let i = 0; i < n && fv > 0; i++) {
        const d = arcD(i * fv / n, Math.min(fv, (i + 1) * fv / n + 0.004));
        rempli.appendChild(sv("path", { d, stroke: teinte((i + 0.5) * fv / n) }));
        if (lumiere && !glisse) lueur.appendChild(sv("path", { d, stroke: lumiere }));
      }
      lueur.style.opacity = lumiere ? (0.35 + 0.65 * h.intensite).toFixed(2) : "0";
      const q = point(fv);
      pouce.setAttribute("cx", q[0].toFixed(1)); pouce.setAttribute("cy", q[1].toFixed(1)); pouce.setAttribute("stroke", actif ? teinte(fv) : "#6b7280");
      ombre.setAttribute("cx", q[0].toFixed(1)); ombre.setAttribute("cy", (q[1] + 2).toFixed(1));
      num.textContent = c.en_off ? "OFF" : nb(v, dec);
      svg.setAttribute("aria-valuenow", String(v)); svg.setAttribute("aria-valuetext", nb(v, dec) + unite(c.unite || "°C"));
      moins.disabled = !actif || v <= E.min; plus.disabled = !actif || v >= E.max;
    };
    const grille = (x) => { let y = +(E.min + Math.round((x - E.min) / p) * p).toFixed(dec); return Math.max(E.min, Math.min(E.max, y)); };
    const envoyer = () => { clearTimeout(attente); attente = null; if (v === v0) { delete brouillons[k]; return; } delete brouillons[k]; ecrire(eq, c, v, { ok: "Consigne envoyée." }); };
    peindre();
    if (!actif) { inactif(moins); inactif(plus); if (c.en_off) r.appendChild(el("div", "eq-note", "Consigne indisponible en mode OFF.")); return r; }
    const pas = (d) => (e) => { if (e) e.stopPropagation(); v = grille(v + d); brouillons[k] = v; peindre(); clearTimeout(attente); attente = setTimeout(envoyer, 900); };
    moins.onclick = pas(-p); plus.onclick = pas(p);
    const versValeur = (e) => {
      const b = svg.getBoundingClientRect(), dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
      let a = (Math.atan2(dy, dx) * 180 / Math.PI - 135 + 720) % 360;
      if (a > 270) a = a > 315 ? 0 : 270;
      return grille(E.bas + (a / 270) * (E.haut - E.bas));
    };
    svg.onpointerdown = (e) => {
      e.stopPropagation(); glisse = true; APP.dragging = true; clearTimeout(attente);
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* capture refusée : glissé sans capture */ }
      v = versValeur(e); brouillons[k] = v; peindre();
      svg.onpointermove = (ev) => { v = versValeur(ev); brouillons[k] = v; peindre(); };
      svg.onpointerup = svg.onpointercancel = () => { svg.onpointermove = svg.onpointerup = svg.onpointercancel = null; glisse = false; APP.dragging = false; peindre(); envoyer(); };
    };
    svg.onkeydown = (e) => { const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? p : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -p : 0; if (d) { e.preventDefault(); pas(d)(); } };
    return r;
  }
  // Pastilles de choix (mode, préréglage) ; OFF en deux appuis si deuxOff
  function pastilles(eq, c, lib, deuxOff) {
    const r = bloc(lib), g = el("div", "eq-pres"); g.setAttribute("role", "group"); g.setAttribute("aria-label", lib);
    (c.options || []).forEach((x) => {
      const b = el("button", "eq-pre" + (x.code === c.valeur ? " sel" : ""), x.libelle); b.setAttribute("aria-pressed", x.code === c.valeur ? "true" : "false");
      if (!peut(c)) inactif(b);
      else if (deuxOff && x.code === "off" && c.valeur !== "off") deuxAppuis(b, eq.id + "|" + c.element + "|off", "OFF ?", () => ecrire(eq, c, "off", { ok: "OFF." }));
      else b.onclick = (e) => { if (e) e.stopPropagation(); if (x.code !== c.valeur) ecrire(eq, c, x.code); };
      g.appendChild(b);
    });
    r.appendChild(g); return r;
  }
  function chauffage(eq, box) {
    const h = chaud(eq), c = carte("Chauffage", "eq-chauffe-carte");
    halo(c, h, false);
    if (h.activite) { const t = c.firstChild; const pu = el("span", "eq-thermo-puce" + (h.chauffe ? " chaud" : h.refroidit ? " froid" : ""), h.activite); if (t) t.appendChild(pu); else c.appendChild(pu); }
    if (expose(h.o)) c.appendChild(rangee("ON / OFF", onoffCap(eq, h.o, "ON / OFF")));
    if (h.cs) c.appendChild(expose(h.cs) ? cadran(eq, h.cs, h) : grand(h.off ? "OFF" : degres(h.cs), "", h.mesure && typeof h.mesure.valeur === "number" ? "mesuré " + degres(h.mesure) : ""));
    else c.appendChild(grand(h.off ? "OFF" : plage(de(eq, "consigne_plage")), "", h.mesure && typeof h.mesure.valeur === "number" ? "mesuré " + degres(h.mesure) : ""));
    if (expose(h.m)) c.appendChild(pastilles(eq, h.m, "Mode", true)); else if (h.m && h.m.valeur) c.appendChild(ligne("Mode", option(h.m, h.m.valeur)));
    const pr = de(eq, "prereglage");
    if (expose(pr)) c.appendChild(pastilles(eq, pr, pr.libelle && pr.libelle !== "Préréglage" ? pr.libelle : "Préréglage", false)); else if (pr && pr.valeur) c.appendChild(ligne("Préréglage", option(pr, pr.valeur)));
    box.appendChild(c);
    // Autres capacités principales (plage, humidité, ventilation, oscillation, absence…) : repli par type
    const pris = [h.cs, h.m, h.o, h.a, pr].filter(Boolean);
    const autres = caps(eq).filter((x) => pris.indexOf(x) < 0 && x.groupe !== "mesures" && x.groupe !== "informations" && x.widget !== "puce" && x.cap !== "maj_installer" && x.cap !== "onoff");
    if (autres.length) {
      const k = carte("Réglages");
      autres.forEach((x) => k.appendChild(reglage(eq, x)));
      if (autres.some((x) => x.ecriture && !regle(x))) k.appendChild(el("div", "eq-note", "Certains réglages de cet équipement n'ont pas encore de widget dans l'application."));
      box.appendChild(k);
    }
  }

  // Mise à jour d'un équipement (hors hub, qui a sa carte Logiciel) : « Installer… » en deux appuis, confirm (commande sensible)
  function majInstaller(eq) {
    const k = de(eq, "maj_installer");
    if (!expose(k)) return null;
    const c = carte("Logiciel"), l = de(eq, "logiciel");
    c.appendChild(grand("Mise à jour", "orange", l && l.derniere ? l.derniere + " disponible" : "disponible"));
    const b = action("Installer…");
    if (peut(k)) deuxAppuis(b, eq.id + "|maj|" + k.element, "Confirmer l'installation", () => ecrire(eq, k, undefined, { confirm: true, ok: "Installation demandée." })); else inactif(b);
    c.appendChild(b);
    if (l && l.valeur) c.appendChild(ligne("Version installée", String(l.valeur)));
    return c;
  }

  APP.cartes = {
    ALERTES, ecrire, surEquipement, peut, expose, lier, deuxAppuis, lecturePause, joue, SEUILS, MOT, nb, mille, unite, option, texte, date, heure, pluriel, depuis, vu, quand, dernier, caps, de, num, qualite, pire, raisonAir, logiciel,
    inactif, carte, ligne, grand, piste, onoff, onoffCap, pisteCap, action, pastille, barre, options, infos, consommation, purificateur, enceinte, air, etat, mouvement, telecommande, lies,
    hub, tuileHub, boutonCode, effacerCode, codeAffiche: () => code || pos || (saisie ? { id: saisie.cle.split("|")[0] } : null), presence, ETATS, serrure, centrale, vanne, sirene, codeOuverture, deuxEtats, robot, codeLecture, lienGeo, reglage, regle, majInstaller, valeurChamp, chaud, chauffage, degres, plage, ACTIVITE, halo, echelle, teinte,
  };
})();
// FIN
