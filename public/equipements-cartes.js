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
    if (c.type === "choix") return option(c, v);
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
  // Lecture / pause (tuile et configuration) : lecture playbackPaused ou playbackPlaying
  function lecturePause(eq, cls) {
    const l = de(eq, "lecture"), jo = joue(eq);
    return lier(rond(jo ? PAUSE : LECT, jo ? "Pause" : "Lecture", cls + (jo ? " on" : "")), l, () => ecrire(eq, l, jo ? "playbackPaused" : "playbackPlaying"));
  }
  // Répétition : valeurs de repeat non documentées par la bibliothèque, jamais écrivable : non affichée (commande non exposée)
  function enceinte(eq, box) {
    const l = de(eq, "lecture"), m = de(eq, "media"), vol = de(eq, "volume"), mu = de(eq, "muet");
    const c = carte("En cours");
    c.appendChild(el("div", "eq-media", m && m.valeur ? m.valeur : "Rien en cours"));
    if (expose(l)) {
      const r = el("div", "eq-lecteur");
      r.appendChild(lier(rond("⏮", "Précédent"), l, () => ecrire(eq, l, "playbackPrevious")));
      r.appendChild(lecturePause(eq, "eq-grandrond eq-lect"));
      r.appendChild(lier(rond("⏭", "Suivant"), l, () => ecrire(eq, l, "playbackNext")));
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
  function effacerCode() { const r = redessiner; code = null; if (codeT) { clearTimeout(codeT); codeT = null; } arme = null; if (armeT) { clearTimeout(armeT); armeT = null; } if (r) r(); }
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
    const loc = caps(eq).filter((x) => x.cap === "localisation" || x.cap === "coordonnees");
    if (loc.length) { const c = carte("Localisation"); loc.forEach((x) => c.appendChild(ligne(x.libelle, texte(x)))); c.appendChild(el("div", "eq-note", "À l'écran seulement, jamais enregistrée.")); box.appendChild(c); }
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

  APP.cartes = {
    ALERTES, ecrire, surEquipement, peut, expose, lier, deuxAppuis, lecturePause, joue, SEUILS, MOT, nb, mille, unite, option, texte, date, heure, pluriel, depuis, vu, caps, de, num, qualite, pire, raisonAir, logiciel,
    inactif, carte, ligne, grand, piste, onoff, onoffCap, pisteCap, action, pastille, barre, options, infos, consommation, purificateur, enceinte, air, etat, mouvement, telecommande, lies,
    hub, tuileHub, boutonCode, effacerCode, codeAffiche: () => code,
  };
})();
// FIN
