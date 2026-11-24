// @zone equipements | Vue Équipements (#viewEquip, préfixe eq-, V2.1 étape equipements-vue) : tuiles de taille fixe par famille (lampe, prise, store, capteurs, hub, télécommande, enceinte,
// purificateur, repli, absent ; famille déduite des capacités, jamais du modèle ni de la marque ; règle « Vue Équipements » de .claude/rules/equipements.md), action rapide directe (lampe, prise),
// notification (pastille rouge : mise à jour disponible, batterie sous 20 %, problème signalé, air mauvais, alarme), alarme (bordure rouge), enceinte qui joue (bordure ambre). Configuration
// (APP.composer(eq) ; panneau de droite, feuille sur téléphone) : lampe et prise = panneau des lumières (APP.reglages construit selon les capacités de l'équipement ; commandes par APP.applyLights,
// routes existantes de la vue Lumières) puis consommation et options, store = widget position (position visée locale, pas de 5 %, préréglages communs GET/POST /api/equipements/positions),
// autres familles : cartes de equipements-cartes.js (APP.cartes, même widget du hub que la fenêtre « Hubs ») ; repli : valeurs, « Mesures » en grille. Ligne d'informations : la batterie seulement.
// Étape ecriture-generique : autres commandes par APP.cartes.ecrire (POST /api/equipements/:id/capacite), équipement relu remplacé dans la liste ; non écrivable : inactif.
// Filtres Tous / Nouveaux / Absents, Oublier (deux appuis), aide « ? ». GET /api/equipements toutes les 15 s, vue ouverte ; catégorie « Équipements », crochet APP.surVue (ordre 35).
(function () {
  const $ = APP.$, el = APP.el, VUE = "equip";
  let liste = [], pannes = [], existe = false, distant = APP.distant, vue = false, timer = null, rev = 0, filtre = "tous", selId = null, aide = false;
  let selOuvert = false, oubli = null, oubliT = null, R = null, enRetard = null;
  let positions = [0, 10, 50, 80, 100], positionsLues = false, supprimer = false, lpT = null, lpFait = false, geste = false;
  const vusEnvoyes = {}, cibles = {};
  const C = APP.cartes, ALERTES = C.ALERTES, nb = C.nb, texte = C.texte, option = C.option;
  const date = C.date, heure = C.heure;

  // ---------- lecture des capacités ----------
  const caps = C.caps, de = C.de, num = C.num;
  // Appareil du format client (/api/devices) qui porte le ON/OFF d'une lampe ou d'une prise : état frais après une commande
  const appareil = (eq) => { const o = de(eq, "onoff"); return o && APP.find ? APP.find(APP.devices || [], o.element) : null; };
  // Famille d'un équipement : d'après ses capacités (règle « Vue Équipements ») ; hub : famille posée par l'adaptateur pour l'équipement de son hub
  function famille(eq) {
    if (eq.absent) return "absent";
    if (eq.famille === "hub") return "hub";
    const o = de(eq, "onoff");
    if (o && o.role === "eclairage") return "lampe";
    if (o && o.role === "prise") return "prise";
    // Mode de commande : capacité propre aux boutons de commande (21/11 : un bouton genericSwitch réel déclare aussi isOpen par bouton, sans sens pour lui : jamais « Fermée »)
    if (de(eq, "mode_commande")) return "telecommande";
    if (de(eq, "position") || de(eq, "ouverture")) return "store";
    if (de(eq, "lecture")) return "enceinte";
    if (de(eq, "vitesse_predefinie")) return "purificateur";
    if (Object.keys(ALERTES).some((k) => de(eq, k))) return "alarme";
    if (de(eq, "ouvert")) return "ouverture";
    if (de(eq, "presence")) return "mouvement";
    if (["temperature", "humidite", "pm25", "co2", "cov"].some((k) => de(eq, k))) return "air";
    // Télécommande (corrigé le 21/11, une vraie télécommande tombait en repli) : batterie, aucune mesure, et rien d'écrivable hors identifier, mode de commande et groupe commandé
    // (les états lus seulement, ON / niveau / volume reçus des appareils commandés, ne comptent pas)
    if (de(eq, "batterie") && !caps(eq).some((c) => c.groupe === "mesures") && caps(eq).every((c) => !c.ecriture || ["identifier", "identifier_arret", "mode_commande", "groupe_onoff", "groupe_luminosite", "groupe_temperature", "lier"].indexOf(c.cap) >= 0)) return "telecommande";
    return "repli";
  }
  // Notification (règle générale) : mise à jour disponible, batterie sous 20 %, problème signalé par le hub, air mauvais ; raisons dites par la configuration (alarme : pastille aussi, raison à part)
  function raisons(eq) {
    if (eq.absent) return [];
    const r = [], l = de(eq, "logiciel"), b = num(de(eq, "batterie"));
    if (l && (l.etat === "updateAvailable" || l.maj === true)) r.push("Mise à jour disponible" + (typeof l.derniere === "string" && l.derniere ? " : " + l.derniere : ""));
    if (b !== null && b < 20) r.push("Batterie faible : " + nb(b, 0) + " %");
    caps(eq).filter((c) => c.cap === "probleme" && c.valeur === true).forEach((c) => r.push(c.libelle && c.libelle !== "Problème" ? c.libelle : "Problème signalé par le hub"));
    const a = C.raisonAir(eq);
    if (a) r.push(a);
    return r;
  }
  const alarme = (eq) => !eq.absent && caps(eq).some((c) => ALERTES[c.cap] && c.valeur === true);
  const joue = (eq) => { const c = de(eq, "lecture"); return !!(c && typeof c.valeur === "string" && /playing$/i.test(c.valeur)); };
  // Store : sens du mouvement (ouverture, activité, ou position visée déclarée différente de la position)
  function mouvement(eq) {
    const o = de(eq, "ouverture"), a = de(eq, "activite"), p = de(eq, "position"), v = [o && o.valeur, a && a.valeur].filter((x) => typeof x === "string").join(" ");
    if (/\b(up|opening)\b/.test(v)) return "monte";
    if (/\b(down|closing)\b/.test(v)) return "descend";
    if (p && typeof p.cible === "number" && typeof p.valeur === "number" && Math.abs(p.cible - p.valeur) >= 1) return p.cible < p.valeur ? "monte" : "descend";
    return null;
  }

  // ---------- icônes (traits, 22 px) ----------
  const S = (d) => '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const ICONES = {
    lampe: S('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
    prise: S('<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>'),
    store: S('<path d="M4 4h16M6 4v11h12V4M6 8h12M6 12h12M12 15v4"/><circle cx="12" cy="20" r="1"/>'),
    air: S('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
    ouverture: S('<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14.5 12h.01"/>'),
    alarme: S('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
    mouvement: S('<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6 2.5 2v4M7 12l3-4h4l2 3 2 1M10.5 8 9 14"/>'),
    hub: S('<rect x="5" y="5" width="14" height="14" rx="7"/><path d="M12 9v6M9 12h6"/>'),
    telecommande: S('<rect x="8" y="3" width="8" height="18" rx="3"/><path d="M12 7v3M12 14h.01M12 17h.01"/>'),
    enceinte: S('<rect x="6" y="3" width="12" height="18" rx="2.5"/><circle cx="12" cy="14" r="3.2"/><path d="M12 7h.01"/>'),
    purificateur: S('<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M9 8h6M9 11h6M9 14h6"/>'),
    repli: S('<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9h6M9 13h6"/>'),
  };
  ICONES.absent = ICONES.repli;
  const POWER = S('<path d="M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0"/>');
  const LECT = S('<path d="M8 5v14l11-7z"/>'), PAUSE = S('<path d="M8 5v14M16 5v14"/>');

  // ---------- commandes (lampe, prise : routes existantes de la vue Lumières) ----------
  // Après une commande : APP.devices est à jour (réponse de POST /api/lights/apply) ; la liste des équipements est relue sans cache une fois la commande finie
  function apres() { const t = setInterval(() => { if (APP.busy) return; clearInterval(t); if (vue) charger(true); }, 200); }
  function commander(ids, st, msg) { APP.applyLights(ids, st, msg); rendreGrille(); apres(); }
  function bascule(eq) {
    const d = appareil(eq);
    if (!d || d.reachable === false || APP.busy) return;
    commander([d.id], { on: d.isOn !== true }, d.isOn === true ? "OFF." : "ON.");
  }

  // ---------- tuile : trois lignes de taille fixe ----------
  function rond(cls, html, lib) { const b = el("button", "eq-rond" + (cls ? " " + cls : ""), ""); b.innerHTML = html; b.setAttribute("aria-label", lib); return b; }
  // Bouton d'une commande indisponible (lecture seule, injoignable) : état montré, inactif ; un appui ouvre la configuration
  function inactif(b, eq) { b.classList.add("eq-inactif"); b.setAttribute("aria-disabled", "true"); b.title = "Commande indisponible."; b.onclick = (e) => { if (e) e.stopPropagation(); ouvrir(eq); }; return b; }
  // Action rapide d'une capacité : envoi par APP.cartes.ecrire si elle est écrivable, sinon inactive
  // Commande non exposée par le hub : aucun bouton (un élément vide garde la place) ; exposée mais injoignable : inactive
  function rapide(b, eq, c, valeur) { if (!C.expose(c)) return el("span", "eq-sansaction", ""); if (!C.peut(c)) return inactif(b, eq); b.onclick = (e) => { if (e) e.stopPropagation(); C.ecrire(eq, c, valeur); }; return b; }
  function precision(t, txt, cls) { const p = el("div", "eq-prec" + (cls ? " " + cls : "")); if (txt) p.appendChild(el("span", "", txt)); t.appendChild(p); return p; }
  function tuile(eq) {
    const f = famille(eq), hs = !eq.absent && eq.joignable === false, n = raisons(eq), al = alarme(eq), jo = joue(eq);
    const t = el("div", "eq-tuile eq-f-" + f + (eq.id === selId ? " sel" : "") + (eq.absent || hs ? " hs" : "") + (al ? " alarme" : "") + (jo ? " joue" : ""));
    t.setAttribute("data-id", eq.id); t.setAttribute("data-famille", f);
    // Appui ailleurs que sur l'action : ouvre la configuration (bouton couvrant la tuile, sous les actions)
    const o = el("button", "eq-ouvrir", ""); o.setAttribute("aria-label", eq.nom + " : configuration"); o.onclick = () => ouvrir(eq);
    t.appendChild(o);
    if (n.length || al) { const p = el("span", "eq-notif", ""); p.setAttribute("role", "img"); p.setAttribute("aria-label", "Notification : " + (al ? ["Alarme"] : []).concat(n).join(", ")); t.appendChild(p); }
    const l1 = el("div", "eq-l1"), ic = el("span", "eq-ic", "");
    ic.innerHTML = dessin(eq, f); l1.appendChild(ic); l1.appendChild(el("span", "eq-tnom", eq.nom));
    t.appendChild(l1);
    const neuf = () => (eq.nouveau ? el("span", "eq-puce eq-neuf", "Nouveau") : null);
    const val = (txt, cls) => { const v = el("div", "eq-v2" + (cls ? " " + cls : ""), txt); t.appendChild(v); return v; };
    const fin = (p) => { const x = neuf(); if (x) p.insertBefore(x, p.firstChild); };
    if (eq.absent) { val("—"); fin(precision(t, "Absent depuis le " + date(eq.absent_depuis, true))); return t; }
    if (hs) { val("—"); fin(precision(t, "Injoignable")); return t; }
    if (f === "lampe" || f === "prise") {
      const d = appareil(eq), oc = de(eq, "onoff"), on = d ? d.isOn === true : oc && oc.valeur === true;
      const b = rond("eq-power" + (on ? " on" : ""), POWER, on ? "OFF" : "ON");
      if (d && d.reachable !== false) b.onclick = (e) => { e.stopPropagation(); bascule(eq); };
      else inactif(b, eq);
      l1.appendChild(b);
      const lum = num(de(eq, "luminosite")), niveau = d && typeof d.level === "number" ? d.level : lum;
      val(!on ? "OFF" : f === "lampe" && niveau !== null && de(eq, "luminosite") ? Math.round(niveau) + " %" : "ON", on ? "" : "eteint");
      const p = precision(t, "");
      if (f === "lampe" && on) {
        const k = de(eq, "temperature_couleur"), c = de(eq, "couleur");
        const mode = d && d.colorMode ? d.colorMode : k && num(k) !== null ? "temperature" : c ? "color" : null;
        if (mode === "color" && c) { const h = d && typeof d.hue === "number" ? d.hue : (c.valeur && c.valeur.hue) || 0, s = d && typeof d.sat === "number" ? d.sat : (c.valeur && c.valeur.sat) || 1; pastille(p, "hsl(" + Math.round(h) + "," + Math.round(s * 100) + "%,60%)"); p.appendChild(el("span", "", "Couleur")); }
        else if (mode === "temperature" && k) { const kv = d && typeof d.temp === "number" ? d.temp : num(k); if (kv !== null) { pastille(p, APP.colorOf ? APP.colorOf(true, "temperature", null, null, kv) : "#ffd9a8"); p.appendChild(el("span", "", Math.round(kv) + " K")); } }
      }
      const pw = de(eq, "puissance");
      if (f === "prise" && on && pw && num(pw) !== null) p.appendChild(el("span", "", texte(pw)));
      fin(p);
      return t;
    }
    if (f === "store") {
      t.classList.add("eq-trois");
      const pos = num(de(eq, "position")), m = mouvement(eq), l2 = el("div", "eq-l2");
      l2.appendChild(el("span", "eq-v2", pos === null ? "—" : nb(pos, 0) + " %"));
      // ▲ ▼ directs (ouverture up / down) ; le sens en cours devient ■ (stopped)
      const ov = de(eq, "ouverture");
      l2.appendChild(m === "monte" ? rapide(rond("eq-stop", "■", "Stop"), eq, ov, "stopped") : rapide(rond("", "▲", "Monter"), eq, ov, "up"));
      l2.appendChild(m === "descend" ? rapide(rond("eq-stop", "■", "Stop"), eq, ov, "stopped") : rapide(rond("", "▼", "Descendre"), eq, ov, "down"));
      t.appendChild(l2);
      const p = el("div", "eq-prec eq-barre"), barre = el("div", "eq-pbar"), r = el("i", "");
      r.style.width = (pos === null ? 0 : Math.max(0, Math.min(100, pos))) + "%"; barre.appendChild(r); p.appendChild(barre);
      const b = num(de(eq, "batterie"));
      p.appendChild(el("span", "", m === "monte" ? "monte…" : m === "descend" ? "descend…" : b !== null && b < 20 ? "Batterie faible" : ""));
      fin(p); t.appendChild(p);
      return t;
    }
    if (f === "enceinte") {
      if (C.expose(de(eq, "lecture"))) { const b = C.lecturePause(eq, "eq-lect"); if (!C.peut(de(eq, "lecture"))) inactif(b, eq); l1.appendChild(b); }
      val(jo ? "Lecture" : "En pause");
      const vol = de(eq, "volume"), p = precision(t, "", "eq-vol");
      if (vol) {
        const r = document.createElement("input"); r.type = "range"; r.min = 0; r.max = 100; r.value = num(vol) || 0; r.className = "eq-rng";
        r.setAttribute("aria-label", "Volume");
        if (C.peut(vol)) { r.onchange = () => C.ecrire(eq, vol, +r.value); r.onclick = (e) => e.stopPropagation(); } else r.disabled = true;
        if (C.expose(vol)) p.appendChild(r);
        p.appendChild(el("span", "", (num(vol) === null ? "—" : nb(num(vol), 0)) + " %"));
      }
      fin(p);
      return t;
    }
    if (f === "purificateur") {
      const oc = de(eq, "onoff"), v = de(eq, "vitesse_predefinie"), on = oc ? oc.valeur === true : v && v.valeur && v.valeur !== "off";
      l1.appendChild(rapide(rond("eq-power" + (on ? " on" : ""), POWER, on ? "OFF" : "ON"), eq, oc, !on));
      const n2 = de(eq, "niveau"), manuel = v && v.valeur === "on" && num(n2) !== null;
      val(!on ? "OFF" : manuel ? "Vitesse " + nb(num(n2), 0) : v && v.valeur ? option(v, v.valeur) : "ON", on ? "" : "eteint");
      const pm = de(eq, "pm25"), filtre = caps(eq).some((x) => x.cap === "probleme" && x.valeur === true && /filtre/i.test(x.libelle || ""));
      const p = precision(t, filtre ? "Filtre à changer" : "", filtre ? "orange" : "");
      if (!filtre && pm && num(pm) !== null) { const q = C.qualite("pm25", num(pm)); if (q) C.pastille(p, q); p.appendChild(el("span", "", "PM2,5 " + texte(pm))); }
      fin(p);
      return t;
    }
    if (f === "hub") {
      const h = C.tuileHub(eq);
      val(h.v, h.cls || "");
      fin(precision(t, h.p));
      return t;
    }
    if (f === "telecommande") {
      const b = num(de(eq, "batterie")), faible = b !== null && b < 20;
      val("Batterie " + (b === null ? "—" : nb(b, 0) + " %"), faible ? "orange" : "");
      fin(precision(t, faible ? "Batterie faible" : ""));
      return t;
    }
    if (f === "air") {
      const v = ["temperature", "humidite", "co2"].map((k) => de(eq, k)).filter((c) => c && num(c) !== null).slice(0, 2).map(texte);
      val(v.length ? v.join(" · ") : "—");
      // Précision : pastille, mot de qualité et la mesure qui le fixe ; sans mesure de qualité : « Température et humidité »
      const q = C.pire(caps(eq)), p = precision(t, "");
      if (q) { C.pastille(p, q.mot); p.appendChild(el("span", "", C.MOT[q.mot] + " · " + q.c.libelle + " " + C.mille(q.valeur, 0))); }
      else p.appendChild(el("span", "", "Température et humidité"));
      fin(p);
      return t;
    }
    // « depuis… » : heure retenue par le serveur à partir des événements du hub (étape evenements), sinon rien
    if (f === "ouverture") { const c = de(eq, "ouvert"); val(texte(c), c.valeur === true ? "orange" : ""); fin(precision(t, C.depuis(c.depuis))); return t; }
    if (f === "alarme") {
      const c = caps(eq).filter((x) => ALERTES[x.cap])[0], b = num(de(eq, "batterie"));
      val(texte(c), c.valeur === true ? "rouge" : "");
      fin(precision(t, c.valeur === true ? C.depuis(c.depuis) : b !== null ? "Batterie " + nb(b, 0) + " %" : "", c.valeur !== true && b !== null && b < 20 ? "orange" : ""));
      return t;
    }
    if (f === "mouvement") { const c = de(eq, "presence"); val(texte(c), c.valeur === true ? "bleu" : ""); fin(precision(t, c.valeur === true ? "à l'instant" : C.vu(c.derniere))); return t; }
    // Repli : première valeur, aucune action
    const c = caps(eq).filter((x) => !x.prive && x.valeur !== null && x.valeur !== undefined && x.groupe !== "informations")[0];
    val(c ? texte(c) : "—");
    fin(precision(t, c ? c.libelle : ""));
    return t;
  }
  function pastille(p, couleur) { const s = el("i", "eq-teinte"); s.style.background = couleur; p.appendChild(s); }

  // ---------- configuration ----------
  // Icône : celle choisie (pack Équipements, icones.js), sinon celle de la famille
  const dessin = (eq, f) => (eq.icone && APP.icones && APP.icones.svg(eq.icone, 22)) || ICONES[f] || ICONES.repli;
  function entete(eq, f) {
    const h = el("div", "pc-un eq-tete");
    // Bouton d'icône (44 px, petit crayon) : feuille « Icône » ; toucher une icône l'applique aussitôt (absent : icône seule)
    const ic = el(eq.absent || !APP.icones ? "span" : "button", eq.absent || !APP.icones ? "pc-type" : "pc-type eq-icbtn", "");
    ic.innerHTML = dessin(eq, f);
    if (!eq.absent && APP.icones) {
      ic.setAttribute("aria-label", "Changer l'icône de " + eq.nom);
      ic.appendChild(el("i", "eq-crayon", ""));
      ic.onclick = () => APP.icones.ouvrir({ titre: eq.nom, defaut: ICONES[f] || ICONES.repli, actuelle: eq.icone || null,
        choisir: (nom) => APP.icones.poser(eq.id, nom, (err) => { if (err) return; const x = liste.filter((y) => y.id === eq.id)[0]; if (x) { if (nom) x.icone = nom; else delete x.icone; } rendre(); }) });
    }
    h.appendChild(ic);
    h.appendChild(el("span", "pc-unnom", eq.nom));
    const d = appareil(eq);
    // Lampe et prise : pastille de pièce du panneau des lumières (fenêtre « Ranger ») ; autres : pièce en texte
    if ((f === "lampe" || f === "prise") && d && APP.piecesChoix) h.appendChild(APP.piecesChoix.pastille([d.id], eq.nom));
    else if (!eq.absent && f !== "hub") h.appendChild(el("span", "eq-pp", (eq.piece && eq.piece.name) || "Autres"));
    const q = el("button", "eq-aide", "?"); q.setAttribute("aria-label", "Aide"); q.onclick = () => { aide = true; rendreDetail(); };
    h.appendChild(q);
    return h;
  }
  function ligne(lib, val, cls) { const l = el("div", "eq-ligne" + (cls ? " " + cls : "")); l.appendChild(el("span", "eq-l", lib)); l.appendChild(el("b", "", val)); return l; }
  function mesures(eq) {
    const m = caps(eq).filter((c) => c.groupe === "mesures");
    if (!m.length) return null;
    const b = el("div", "eq-carte eq-mesures"), g = el("div", "eq-mes");
    b.appendChild(el("div", "eq-lbl", "Mesures"));
    m.forEach((c) => { const x = el("div", "eq-m" + (ALERTES[c.cap] && c.valeur === true ? " alerte" : "")); x.setAttribute("data-cap", c.cap); x.appendChild(el("span", "", c.libelle)); x.appendChild(el("b", "", texte(c))); g.appendChild(x); });
    b.appendChild(g);
    return b;
  }
  APP.composer = function (eq) {
    const f = famille(eq), box = el("div", "eq-config"), hs = !eq.absent && eq.joignable === false;
    box.setAttribute("data-famille", f);
    if (R) { APP.reglagesRetirer(R); R = null; }
    box.appendChild(entete(eq, f));
    raisons(eq).forEach((r) => box.appendChild(el("div", "eq-raison", r)));
    if (alarme(eq)) box.appendChild(el("div", "eq-raison eq-alarme", caps(eq).filter((c) => ALERTES[c.cap] && c.valeur === true).map(texte).join(", ")));
    if (eq.absent) {
      const c = el("div", "eq-carte");
      c.appendChild(el("div", "eq-note", "Absent du hub depuis le " + date(eq.absent_depuis) + ". Il sera oublié 30 jours après ; son rangement dans les pièces est gardé."));
      const o = el("button", "eq-bouton eq-oublier" + (oubli === eq.id ? " arme" : ""), oubli === eq.id ? "Toucher encore pour oublier" : "Oublier maintenant");
      o.onclick = () => oublier(eq.id);
      c.appendChild(o); box.appendChild(c);
      return box;
    }
    if (hs) box.appendChild(el("div", "eq-note", "Injoignable : dernières valeurs connues, aucune commande."));
    // Familles en lecture (et commandes inactives) : cartes communes ; injoignable : inertes
    const fin = el("div", "eq-cartes" + (hs ? " eq-hs" : ""));
    if (f === "lampe" || f === "prise") { configLumiere(eq, f, box, hs); const k = C.consommation(eq); if (k) fin.appendChild(k); }
    else if (f === "store") configStore(eq, box, hs);
    else if (f === "hub") C.hub(eq, fin, () => rendreDetail(), distant);
    else if (f === "purificateur") C.purificateur(eq, fin);
    else if (f === "enceinte") C.enceinte(eq, fin);
    else if (f === "air") C.air(eq, fin);
    else if (f === "ouverture") C.etat(eq, fin, de(eq, "ouvert"), "orange");
    else if (f === "alarme") C.etat(eq, fin, caps(eq).filter((x) => ALERTES[x.cap])[0], "rouge");
    else if (f === "mouvement") C.mouvement(eq, fin);
    else if (f === "telecommande") C.telecommande(eq, fin, { basculer: (d) => commander([d.id], { on: d.isOn !== true }, d.isOn === true ? "OFF." : "ON."), ouvrirElement: ouvrirElement, rendre: () => rendreDetail() });
    else configSimple(eq, f, fin);
    if (["lampe", "prise", "purificateur", "air", "ouverture", "alarme", "mouvement", "telecommande", "store"].indexOf(f) >= 0) { const o = C.options(eq); if (o) fin.appendChild(o); }
    if (hs) fin.setAttribute("inert", "");
    if (fin.childNodes.length) box.appendChild(fin);
    const i = C.infos(eq);
    if (i) box.appendChild(i);
    return box;
  };
  // Lampe et prise : panneau actuel des lumières (APP.reglages : sections construites selon les capacités de l'équipement), mêmes commandes et mêmes routes
  function configLumiere(eq, f, box, hs) {
    const d = appareil(eq), k = de(eq, "temperature_couleur");
    const liste = ["onoff"].concat(f === "lampe" ? [de(eq, "luminosite") && "luminosite", k && "blanc", de(eq, "couleur") && "couleur"].filter(Boolean) : []);
    const id = d ? d.id : null, ok = !!(id && !hs && d.reachable !== false);
    R = APP.reglages({
      caps: liste, onoff: true, differe: true, titre: false, actif: () => ok,
      kelvin: k && typeof k.min === "number" && typeof k.max === "number" ? [k.min, k.max] : null,
      niveau: (P) => commander([id], { on: true, level: P.level }, "Luminosité réglée."),
      blanc: (P) => commander([id], { on: true, mode: "temperature", kelvin: P.kelvin }, "Blanc appliqué."),
      couleur: (P) => commander([id], { on: true, mode: "color", hue: P.hue, sat: P.sat / 100 }, "Couleur appliquée."),
      on: (v) => { if (ok) commander([id], { on: v }, v ? "ON." : "OFF."); },
    });
    const P = R.P, N = R.N, on = d ? d.isOn === true : !!(de(eq, "onoff") && de(eq, "onoff").valeur);
    if (d) {
      if (typeof d.level === "number") P.level = Math.max(1, Math.min(100, Math.round(d.level)));
      if (liste.indexOf("blanc") >= 0 && liste.indexOf("couleur") >= 0) P.mode = d.colorMode === "color" ? "color" : "temperature";
      if (typeof d.hue === "number") P.hue = Math.round(d.hue) % 360;
      if (typeof d.sat === "number") P.sat = Math.min(100, Math.round(d.sat * 100));
      if (typeof d.temp === "number") P.kelvin = Math.round(d.temp);
    } else if (num(de(eq, "luminosite")) !== null) P.level = Math.max(1, Math.min(100, Math.round(num(de(eq, "luminosite")))));
    N.lit = () => on;
    if (N.bOn) { N.bOn.className = "q-seg" + (on ? " sel on" : ""); N.bOff.className = "q-seg" + (!on ? " sel off" : ""); }
    R.peindre();
    if (!ok) R.root.setAttribute("inert", "");
    const w = el("div", "eq-lumiere" + (ok ? "" : " eq-hs")); w.appendChild(R.root);
    box.appendChild(w);
  }
  // Store : position visée choisie sans rien envoyer (curseur, ▲ ▼ au pas de 5 %, préréglages) ; ▶ « Aller à N % » l'envoie, ■ « Stop » arrête
  function configStore(eq, box, hs) {
    const pc = de(eq, "position"), pos = num(pc), m = mouvement(eq), c = el("div", "eq-carte eq-store");
    if (cibles[eq.id] === undefined) cibles[eq.id] = pc && typeof pc.cible === "number" ? pc.cible : pos === null ? 0 : Math.round(pos);
    const cible = () => cibles[eq.id];
    const h = el("div", "eq-pos");
    h.appendChild(el("span", "eq-lbl", "Position"));
    const v = el("span", "eq-posv", pos === null ? "—" : nb(pos, 0) + " %");
    v.appendChild(el("small", "", m ? " · " + m + " vers " + (pc && typeof pc.cible === "number" ? nb(pc.cible, 0) + " %" : "…") : " · immobile"));
    h.appendChild(v); c.appendChild(h);
    // Position non écrivable : position seule (ni position visée, ni Aller, ni préréglages)
    if (!C.expose(pc)) { if (hs) c.setAttribute("inert", ""); box.appendChild(c); return; }
    const r = el("div", "eq-posrow"), haut = rond("", "▲", "Position visée : monter de 5 %"), bas = rond("", "▼", "Position visée : descendre de 5 %");
    const s = document.createElement("input"); s.type = "range"; s.min = 0; s.max = 100; s.step = 1; s.value = cible(); s.className = "eq-rng eq-cible"; s.setAttribute("aria-label", "Position visée");
    const stop = !!m && C.expose(de(eq, "ouverture")); // « Stop » seulement si l'arrêt est exposé
    const aller = el("button", "eq-aller" + (stop ? " stop" : ""), "");
    const peindre = () => { s.value = cible(); aller.innerHTML = stop ? '<span>■</span>Stop' : "<span>▶</span>Aller à " + cible() + " %"; majPre(); };
    const poser = (x) => { cibles[eq.id] = Math.max(0, Math.min(100, Math.round(x))); peindre(); };
    haut.onclick = () => poser(Math.ceil(cible() / 5) * 5 - 5);
    bas.onclick = () => poser(Math.floor(cible() / 5) * 5 + 5);
    s.oninput = () => poser(+s.value);
    r.appendChild(haut); r.appendChild(s); r.appendChild(bas); c.appendChild(r);
    // ▶ « Aller à N % » (position visée : blindsTargetLevel, sens à vérifier sur un vrai store) ; ■ « Stop » (ouverture stopped)
    const ov = de(eq, "ouverture");
    if (stop) { if (C.peut(ov)) aller.onclick = () => C.ecrire(eq, ov, "stopped"); else inactif(aller, eq); }
    else if (C.peut(pc)) aller.onclick = () => C.ecrire(eq, pc, cible()); else inactif(aller, eq);
    c.appendChild(aller);
    if (hs) c.setAttribute("inert", "");
    box.appendChild(c);
    // Préréglages communs à tous les stores (donnees/stores-positions.json) : appui = position visée, « + » = ajouter la position visée, appui long = supprimer
    const p = el("div", "eq-carte eq-prereg"), g = el("div", "eq-pres");
    p.appendChild(el("span", "eq-lbl", supprimer ? "Préréglages : toucher pour supprimer" : "Préréglages"));
    const boutons = [];
    function majPre() { boutons.forEach((x) => { x.b.className = "eq-pre" + (supprimer ? " suppr" : x.v === cible() ? " sel" : ""); }); if (plus) plus.disabled = positions.indexOf(cible()) >= 0 || positions.length >= 8; }
    let plus = null;
    positions.forEach((x) => {
      const b = el("button", "eq-pre", (supprimer ? "✕ " : "") + x + " %");
      b.setAttribute("aria-label", supprimer ? "Supprimer le préréglage " + x + " %" : "Préréglage " + x + " %");
      b.oncontextmenu = () => false;
      b.onpointerdown = () => { lpFait = false; if (supprimer) return; clearTimeout(lpT); lpT = setTimeout(() => { lpFait = true; modeSupprimer(true); }, 700); };
      b.onpointerup = b.onpointercancel = b.onpointerleave = () => clearTimeout(lpT);
      b.onclick = () => { if (lpFait) { lpFait = false; return; } if (supprimer) retirerPosition(x); else poser(x); };
      boutons.push({ b, v: x }); g.appendChild(b);
    });
    if (supprimer) { const fin = el("button", "eq-pre eq-fini", "Terminé"); fin.onclick = () => modeSupprimer(false); g.appendChild(fin); }
    else { plus = el("button", "eq-pre eq-plus", "+"); plus.setAttribute("aria-label", "Ajouter la position visée aux préréglages"); plus.onclick = () => ajouterPosition(cible()); g.appendChild(plus); }
    p.appendChild(g);
    p.appendChild(el("div", "eq-note", "« + » ajoute la position visée ; appui long sur un préréglage pour le supprimer."));
    if (hs) p.setAttribute("inert", "");
    box.appendChild(p);
    peindre();
  }
  // Mode suppression des préréglages : quitté par « Terminé », un autre équipement ou une autre vue
  function modeSupprimer(v) { supprimer = v; rendreDetail(); }
  function lirePositions() {
    APP.api("GET", "/api/equipements/positions", null, (err, d) => { if (!err && d && Array.isArray(d.positions)) { positions = d.positions; positionsLues = true; rendreDetail(); } });
  }
  function ajouterPosition(x) {
    APP.api("POST", "/api/equipements/positions", { position: x }, (err, d) => { if (err) { APP.banner(err, "warn"); return; } positions = d.positions; rendreDetail(); });
  }
  function retirerPosition(x) {
    APP.api("POST", "/api/equipements/positions/supprimer", { position: x }, (err, d) => { if (err) { APP.banner(err, "warn"); return; } positions = d.positions; if (!positions.length) supprimer = false; rendreDetail(); });
  }
  // Repli : valeurs, « Mesures » en grille
  function configSimple(eq, f, box) {
    const c = el("div", "eq-carte"), w = caps(eq).filter((x) => x.groupe !== "mesures" && x.groupe !== "informations" && x.widget !== "puce");
    w.forEach((x) => c.appendChild(ligne(x.libelle, texte(x))));
    if (w.some((x) => x.ecriture)) c.appendChild(el("div", "eq-note", "Réglages de cet équipement : pas encore de widget dans l'application."));
    (eq.codes || []).forEach((k) => c.appendChild(C.boutonCode(eq, k, () => rendreDetail(), distant)));
    if (c.firstChild) box.appendChild(c);
    const m = mesures(eq);
    if (m) box.appendChild(m);
  }
  function oublier(id) {
    if (oubli !== id) { oubli = id; if (oubliT) clearTimeout(oubliT); oubliT = setTimeout(() => { oubli = null; rendreDetail(); }, 5000); rendreDetail(); return; }
    oubli = null;
    APP.api("POST", "/api/equipements/oublier", { id: id, confirm: true }, (err) => { if (err) APP.banner(err, "warn"); selId = null; charger(); });
  }

  // ---------- sélection et « Nouveau » ----------
  function ouvrir(eq) {
    if (selId !== eq.id) { supprimer = false; const k = C.codeAffiche(); if (k && k.id !== eq.id) C.effacerCode(); }
    selId = eq.id; aide = false; selOuvert = true; vu(eq); rendre();
  }
  // Lampe liée (télécommande) : sa configuration, si elle est un équipement de la liste
  function ouvrirElement(element) { const e = liste.filter((x) => !x.absent && (x.elements || []).indexOf(element) >= 0)[0]; if (e) ouvrir(e); }
  // « Nouveau » : retiré quand l'utilisateur ouvre l'équipement (une demande par équipement)
  function vu(eq) {
    if (!eq || !eq.nouveau || vusEnvoyes[eq.id]) return;
    vusEnvoyes[eq.id] = true;
    APP.api("POST", "/api/equipements/vus", { ids: [eq.id] }, (err) => { if (!err) { eq.nouveau = false; rendreGrille(); } else delete vusEnvoyes[eq.id]; });
  }
  function toutVu() {
    const ids = liste.filter((e) => e.nouveau).map((e) => e.id);
    if (!ids.length) return;
    APP.api("POST", "/api/equipements/vus", { ids: ids.slice(0, 500) }, (err) => { if (err) APP.banner(err, "warn"); filtre = "tous"; charger(); });
  }

  // ---------- aide ----------
  const AIDE = [
    ["Tuiles", "Une tuile par équipement de votre hub, de taille fixe : nom, valeur principale, précision. Le rond d'action commande directement (lampe, prise : ON / OFF) ; un appui ailleurs ouvre la configuration. Capteurs, télécommandes et hub : pas d'action rapide."],
    ["Pastille rouge", "Mise à jour disponible, batterie sous 20 %, problème signalé par le hub, filtre à changer, air mauvais ou alarme : la configuration dit pourquoi. Bordure rouge : alarme (fuite, fumée, CO). Bordure ambre : enceinte qui joue."],
    ["Qualité de l'air", "Mot précédé d'une pastille : vert « bon », blanc « moyen », orange « mauvais ». Seuils : PM2,5 35 et 85 µg/m³, COV 150 et 250, CO₂ 1 000 et 1 600 ppm. La tuile donne le mot de la mesure la moins bonne."],
    ["Configuration", "Lampe et prise : le panneau des lumières, avec seulement ce que l'appareil sait faire, puis la consommation (prise à mesure) et les options. Store : position visée (curseur, ▲ ▼ par 5 %, préréglages communs à tous les stores, gardés sur cet appareil ; « + » ajoute, appui long supprime). Autres équipements : seulement ce que le hub expose. En bas : la batterie."],
    ["Commandes", "Store (▲ ▼, « Aller à N % », Stop), enceinte (lecture, piste, volume, muet, aléatoire), purificateur (ON / OFF, mode, vitesse), options (au retour du courant, verrou enfant, voyant, Identifier), compteur d'une prise (deux appuis), capteur de mouvement (durée, programmation, début et fin), mode de commande d'un bouton, groupe d'une télécommande (ON / OFF, luminosité, blanc), lampes ajoutées à un mode, mise à jour du hub (deux appuis : le hub redémarre). Une commande à la fois par équipement, relue une seconde après ; grisée si le hub ne la permet pas. Par POST /api/equipements/<id>/capacite."],
    ["Icône", "Touchez l'icône en haut de la configuration (petit crayon) : choisissez une icône du pack, ou « Icône par défaut ». Une lampe garde la même icône dans la vue Lumières."],
    ["Alarme", "Fuite, fumée, CO ou gaz : un bandeau rouge reste en haut de toutes les vues tant que l'alarme dure. Le toucher ouvre l'équipement ; la croix le ferme, il revient à l'alarme suivante."],
    ["Depuis…", "Ouverture, fuite : « depuis 12 min » ou « depuis 08:15 » ; mouvement : « vu à 08:15 ». Ces heures viennent des événements du hub, retenues par le serveur : elles sont perdues à son redémarrage (valeur affichée sans heure jusqu'au changement suivant)."],
    ["Télécommande et capteur de mouvement", "Les lampes liées sont listées : ⏻ commande la lampe, › ouvre sa configuration. Télécommande à plusieurs modes : une carte par mode. Si les lampes d'un mode sont rangées dans un même groupe du hub : ON / OFF, luminosité et blanc du groupe. « Ajouter des lampes… » : cochez des lumières ou des prises, puis « Ajouter » (quelques secondes par lampe ; une lampe rangée dans un groupe du hub y reste). Retirer une lampe d'un mode : application IKEA."],
    ["Nouveau et absent", "« Nouveau » reste jusqu'à ce que vous ouvriez l'équipement (filtre « Nouveaux », « Tout marquer comme vu »). Retiré du hub : grisé « Absent depuis … », oublié après 30 jours ou par « Oublier maintenant » (deux appuis) ; son rangement est gardé."],
    ["Hub", "Logiciel, soleil et heure, localisation en texte (jamais enregistrée). Code d'appairage : « Afficher », puis un second appui, sur cet appareil seulement, effacé après 30 secondes. Les mêmes informations s'affichent dans la fenêtre « Hubs » (toucher l'état en haut de l'écran)."],
    ["En cas de panne", "Hub injoignable : signalé en tête de la vue. Équipement injoignable : grisé, dernières valeurs, aucune commande. Lecture GET /api/equipements toutes les 15 secondes, vue ouverte ; commandes des lampes et prises par POST /api/lights/apply."],
  ];
  function rendreAide(box) {
    const p = el("div", "eq-carte eq-aidebox");
    const t = el("div", "pc-un eq-tete"); t.appendChild(el("span", "pc-unnom", "Aide : Équipements"));
    const f = el("button", "eq-aide", "×"); f.setAttribute("aria-label", "Fermer l'aide"); f.onclick = () => { aide = false; rendreDetail(); };
    t.appendChild(f); p.appendChild(t);
    const c = el("div", "eq-aidecorps");
    AIDE.forEach((x) => { c.appendChild(el("div", "eq-lbl", x[0])); c.appendChild(el("p", "", APP.lieu(x[1]))); });
    p.appendChild(c);
    box.appendChild(p);
  }

  // ---------- vue ----------
  function filtres(box) {
    const f = el("div", "eq-filtres"), n = liste.filter((e) => e.nouveau).length, a = liste.filter((e) => e.absent).length;
    const bouton = (cle, lib, badge) => {
      const b = el("button", "eq-filtre" + (filtre === cle ? " on" : ""), lib);
      if (badge) b.appendChild(el("i", "", String(badge)));
      b.onclick = () => { filtre = cle; rendre(); };
      f.appendChild(b);
    };
    bouton("tous", "Tous · " + liste.filter((e) => !e.absent).length);
    if (n || filtre === "nouveaux") bouton("nouveaux", "Nouveaux", n);
    if (a || filtre === "absents") bouton("absents", "Absents", a);
    if (filtre === "nouveaux" && n) { const t = el("button", "eq-filtre eq-toutvu", "Tout marquer comme vu"); t.onclick = toutVu; f.appendChild(t); }
    box.appendChild(f);
  }
  function visibles() {
    if (filtre === "nouveaux") return liste.filter((e) => e.nouveau);
    if (filtre === "absents") return liste.filter((e) => e.absent);
    return liste.filter((e) => !e.absent).concat(liste.filter((e) => e.absent));
  }
  function squelette() {
    const box = $("viewEquip");
    if (box.querySelector("#eqGauche")) return;
    box.innerHTML = "";
    const g = el("div", "eq-gauche"); g.id = "eqGauche"; box.appendChild(g);
    const d = el("aside", "eq-detail"); d.id = "eqDetail"; box.appendChild(d);
    d.addEventListener("pointerdown", () => { geste = true; }, true);
  }
  const lever = () => { geste = false; };
  document.addEventListener("pointerup", lever, true);
  document.addEventListener("pointercancel", lever, true);
  function rendreGrille() {
    const box = $("viewEquip");
    if (!box || !vue) return;
    squelette();
    const g = $("eqGauche"), ancienne = g.querySelector(".eq-grille"), defil = ancienne ? ancienne.scrollTop : 0;
    g.innerHTML = "";
    filtres(g);
    pannes.forEach((p) => g.appendChild(el("div", "eq-panne", p.libelle + " : " + APP.lieu(p.motif))));
    const v = visibles(), grille = el("section", "eq-grille");
    if (!v.length) grille.appendChild(el("div", "eq-vide", existe ? (filtre === "tous" ? "Aucun équipement : connectez un hub (touchez l'état en haut de l'écran)." : "Aucun équipement dans ce filtre.") : "Lecture des équipements…"));
    v.forEach((e) => grille.appendChild(tuile(e)));
    g.appendChild(grille);
    grille.scrollTop = defil;
  }
  // Configuration reconstruite ; relecture (auto) : jamais pendant un geste (doigt posé dans la configuration : curseur, appui long) ni un envoi différé des réglages (reprise ensuite)
  function rendreDetail(auto) {
    const box = $("viewEquip");
    if (!box || !vue) return;
    if ((auto === true && geste) || (R && R.occupe())) { clearTimeout(enRetard); enRetard = setTimeout(() => rendreDetail(true), 700); return; }
    squelette();
    const d = $("eqDetail"), defil = d.scrollTop;
    d.className = "eq-detail" + (selOuvert ? " ouvert" : "");
    if (R) { APP.reglagesRetirer(R); R = null; }
    d.innerHTML = "";
    if (aide) rendreAide(d);
    else {
      const eq = liste.filter((e) => e.id === selId)[0];
      if (eq) d.appendChild(APP.composer(eq));
    }
    const fermer = el("button", "eq-fermer", "Fermer"); fermer.onclick = () => { selOuvert = false; aide = false; rendreDetail(); };
    d.appendChild(fermer);
    d.scrollTop = defil;
  }
  function rendre(auto) {
    if (!vue) return;
    const v = visibles();
    if (!v.some((e) => e.id === selId)) selId = v.length ? v[0].id : null;
    rendreGrille(); rendreDetail(auto === true);
  }

  // ---------- lecture ----------
  // Bandeau d'alarme (alarmes.js) : ouvrir la configuration d'un équipement, dès qu'il est dans la liste (lecture fraîche demandée)
  let aMontrer = null;
  function montrer(id) {
    const e = liste.filter((x) => x.id === id && !x.absent)[0];
    if (e && vue) { aMontrer = null; ouvrir(e); return; }
    aMontrer = id; if (vue) charger(true);
  }
  function charger(frais) {
    const r = ++rev;
    APP.api("GET", "/api/equipements" + (frais ? "?frais=1" : ""), null, (err, d) => {
      if (r !== rev) return;
      if (err || !d || !Array.isArray(d.equipements)) {
        if (err !== "Route inconnue." && vue) { pannes = [{ libelle: "Équipements", motif: err || "réponse inattendue du serveur" }]; rendre(); }
        return;
      }
      liste = d.equipements; pannes = d.pannes || []; distant = !!d.distant || APP.distant; existe = true;
      if (!d.lisible) pannes = pannes.concat([{ libelle: "Suivi des équipements", motif: "equipements.json illisible : « Nouveau » et « Absent » ne sont pas suivis." }]);
      const k = C.codeAffiche();
      if (k && !liste.some((e) => e.id === k.id)) C.effacerCode();
      rendre(true);
      if (aMontrer) { const e = liste.filter((x) => x.id === aMontrer && !x.absent)[0]; aMontrer = null; if (e) ouvrir(e); }
    });
  }
  function demarrer() { if (!timer) timer = setInterval(() => { if (!document.hidden && vue) charger(); }, 15000); }
  function arreter() { if (timer) { clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", () => { if (vue && !document.hidden) charger(); });
  APP.surVue((name) => {
    const propre = name === VUE;
    $("viewEquip").className = "view" + (propre ? "" : " hidden");
    if (vue && !propre) {
      C.effacerCode();
      if (R) { APP.reglagesRetirer(R); R = null; }
      $("viewEquip").innerHTML = ""; selOuvert = false; aide = false; supprimer = false;
    }
    vue = propre;
    if (propre) { if (!positionsLues) lirePositions(); rendre(); demarrer(); charger(); } else arreter();
  }, 35);
  APP.nav.categorie({ key: VUE, label: "Équipements", count: () => null }); // toujours présente, sans nombre : les lumières et prises sont déjà comptées
  APP.equipements = { charger: charger, liste: () => liste, famille: famille, raisons: raisons, montrer: montrer };
  // Écriture générique : équipement relu remplacé dans la liste (sans attendre la lecture suivante) ; échec : relecture
  C.surEquipement((e, id) => {
    if (!vue) return;
    if (!e) { charger(true); return; }
    const i = liste.findIndex((x) => x.id === id);
    if (i >= 0) liste[i] = Object.assign({}, e, { piece: liste[i].piece, nouveau: liste[i].nouveau });
    rendre();
  });
  charger();
})();
// FIN
