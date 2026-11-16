// @zone electromenager | Vue Electromenager (#viewElectro, prefixe e-) : tuile compacte par lave-linge dans la carte SmartThings ; fenetre de detail : en cycle, carte d'etat et Pause / Reprise / Arret (confirmation a l'ecran) ; machine prete, selecteur rond, curseurs temperature et essorage, envoi groupe (POST /reglages) ; lecture GET /api/washers toutes les 15 s tant que la vue ou la fenetre est ouverte ; regle APP.prevoir ; categorie exterieure (APP.nav.categorie) ; crochet de vue APP.surVue (ordre 30).
// Temps restant, progression, heure de fin et phase : seulement en cours ou en pause (le serveur les met a null sinon). Etat inconnu : libelle neutre "Autre état".
(function () {
  var $ = APP.$, el = APP.el, VUE = "electro";
  var washers = [], panne = null, existe = false, ouverte = false, timer = null, rev = 0;
  var envoi = null, arme = null, armeT = null; // envoi : id en cours de commande ; arme : Arret en attente de confirmation (5 s)
  // Qualite 2026-11-14 : curseur tenu au doigt (geste) : la fenetre n'est pas reconstruite (relecture des 15 s, rotation), sinon le curseur glisse
  // disparait sous le doigt ; la reconstruction demandee pendant le geste (aRefaire) est faite des que le doigt se leve.
  var geste = false, aRefaire = false;
  function finGeste() { if (!geste) return; geste = false; if (aRefaire) { aRefaire = false; majDetail(); } }
 var ETATS = { pret: "Prêt", en_cours: "En cours", pause: "En pause", hors_ligne: "Hors ligne" };
  var PHASES = { wash: "Lavage", rinse: "Rinçage", spin: "Essorage" };

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function heure(iso) { var d = new Date(iso); return iso && !isNaN(d.getTime()) ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : null; }
  function duree(min) { var m = Math.max(0, Math.round(min)), h = Math.floor(m / 60); return h ? h + " h " + pad(m % 60) : m + " min"; }
 function programme(w) { var m = /Course_([A-Za-z0-9]+)$/.exec(w.programme || ""); return w.programmeNom || (m ? "code " + m[1] : (w.programme || "inconnu")); }
  var TEMP = { cold: "Froid", tapCold: "Eau froide", none: "–" }, ESSO = { noSpin: "Sans essorage", rinseHold: "Arrêt cuve pleine", none: "–" };
  function temperature(v) { return v === null || v === undefined ? "inconnue" : (/^\d+$/.test(v) ? v + " °C" : (TEMP[v] || v)); }
  function essorage(v) { return v === null || v === undefined ? "inconnu" : (/^\d+$/.test(v) ? v + " tr/min" : (ESSO[v] || v)); }
  function phase(p) { return PHASES[p] || p; }
  function onoff(v, siOff) { return v === null || v === undefined ? "inconnu" : (v ? "ON" : "OFF" + (siOff || "")); }
  function ligne(box, lib, val) {
    var r = el("div", "e-ligne");
    r.appendChild(el("span", "e-lib", lib));
    r.appendChild(el("span", "e-val", val));
    box.appendChild(r);
  }

  function carte(w) {
    var c = el("div", "e-carte" + (w.perime ? " perime" : "")), tete = el("div", "e-tete"), lib = ETATS[w.etat];
    var actif = w.etat === "en_cours" || w.etat === "pause", d, barre, p, ph, i;
    tete.appendChild(el("div", "e-etat " + (lib ? w.etat : "autre"), lib || "Autre état"));
    c.appendChild(tete);
 if (!lib && w.brut) c.appendChild(el("div", "e-note", "État signalé par la machine : " + w.brut));
    if (w.etat === "hors_ligne") c.appendChild(el("div", "e-note", "Machine éteinte ou non connectée au Wi-Fi : dernières valeurs connues."));
    if (actif) {
      d = el("div", "e-grand");
      d.appendChild(el("div", "e-restant", w.restantMin !== null ? duree(w.restantMin) : "–"));
      d.appendChild(el("div", "e-sous", heure(w.fin) ? "restant · fin prévue à " + heure(w.fin) : "restant"));
      c.appendChild(d);
      if (w.progression !== null) {
        barre = el("div", "e-barre"); p = el("div", "e-prog");
        p.style.width = Math.max(0, Math.min(100, w.progression)) + "%";
        barre.appendChild(p); c.appendChild(barre);
      }
      if (w.phases && w.phases.length) {
        ph = el("div", "e-phases");
        for (i = 0; i < w.phases.length; i++) ph.appendChild(el("span", "e-phase" + (w.phases[i].nom === w.phase ? " sel" : ""), phase(w.phases[i].nom)));
        c.appendChild(ph);
      }
    }
    if (actif) c.appendChild(boutons(w));
    d = el("div", "e-details");
 ligne(d, "Programme", programme(w));
    ligne(d, "Température", temperature(w.temperature));
    ligne(d, "Essorage", essorage(w.essorage));
    if (actif && w.progression !== null) ligne(d, "Progression", Math.round(w.progression) + " %");
    if (actif && w.phase) ligne(d, "Phase", phase(w.phase));
    ligne(d, "Sécurité enfant", onoff(w.verrouEnfant));
    ligne(d, "Commande à distance", onoff(w.telecommande, " (Smart Control à activer sur la machine)"));
    ligne(d, "Dernière lecture", (heure(w.maj) || "–") + (w.perime ? " (données périmées)" : ""));
    c.appendChild(d);
    return c;
  }
  var LIBS = { pause: "Pause", reprendre: "Reprise", arreter: "Arrêt" };
  function bouton(w, action, permis, cls) {
    var ici = action === "arreter" && arme === w.id;
    var b = el("button", "e-cmd" + (cls ? " " + cls : "") + (ici ? " arme" : ""), ici ? "Confirmer l’arrêt" : LIBS[action]);
    b.disabled = !permis || envoi !== null;
    b.onclick = function () {
      if (action === "arreter" && !ici) {
        arme = w.id; clearTimeout(armeT);
        armeT = setTimeout(function () { arme = null; afficher(); }, 5000);
        afficher(); return;
      }
      arme = null; clearTimeout(armeT);
      envoyer(w, action);
    };
    return b;
  }
  function boutons(w) {
    var box = el("div", ""), row = el("div", "e-cmds"), c = w.commandes || {};
    if (w.etat === "pause") row.appendChild(bouton(w, "reprendre", c.reprise)); else row.appendChild(bouton(w, "pause", c.pause));
    row.appendChild(bouton(w, "arreter", c.arret, "arret"));
    box.appendChild(row);
    if (envoi === w.id) box.appendChild(el("div", "e-envoi", "Commande envoyée, relecture de l’état…"));
    else if (w.perime) box.appendChild(el("div", "e-note", "Commandes indisponibles : données périmées (cloud injoignable)."));
    else if (w.telecommande !== true) box.appendChild(el("div", "e-note", "Commande à distance OFF : appui court sur Smart Control de la machine."));
    else if (w.droits === false) box.appendChild(el("div", "e-note", "Autorisation en lecture seule : icône compte, Reconnecter avec les commandes."));
    return box;
  }
  // ---------- Selecteur rond (machine prete) ----------
  // A gauche : programmes declares par la machine, dans l'ordre de son selecteur, autour d'un cadran ; appui -> le programme s'illumine et l'aiguille tourne.
  // A droite : deux curseurs verticaux (temperature, essorage) gradues avec les valeurs que la machine declare pour le programme (supportedOptions),
  // valeur par defaut du programme en vert (« valeur par defaut » en bas du curseur quand elle est choisie) ;
  // glisser, toucher une graduation ou - / + ; modifications locales. « Envoyer a la machine » transmet en une fois ce qui a change (programme, puis
  // temperature, puis essorage). Ne demarre jamais : Depart reste sur la machine. Paysage : cadran a gauche, curseurs a droite, tout tient dans la fenetre
  // (mise a l'echelle) ; portrait : curseurs sous le cadran.
  var choixSel = null, regSel = { temperature: null, essorage: null };
  var echelle = { cle: "", s: 1, w: 0, h: 0, hFen: 0 }; // mise a l'echelle du selecteur, mesuree une fois par largeur de fenetre
  var ICONES = {
    "1C": '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l8-8"/>',
    "1B": '<path d="M7 15a3.5 3.5 0 1 1 1.2-6.8A4.5 4.5 0 0 1 16.8 8 3.5 3.5 0 1 1 17 15z"/><path d="M12 12v9M9.5 18.5 12 21l2.5-2.5"/>',
    "25": '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
    "20": '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    "08": '<path d="M3 9h18v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M3 5c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/><path d="M8 14c1.3 1 2.7 1 4 0s2.7-1 4 0"/>',
    "74": '<circle cx="11" cy="13" r="7.5"/><circle cx="11" cy="13" r="3.5"/><path d="M19 2v4M17 4h4"/>',
    "87": '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    "06": '<path d="M3 19V7M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-8v6"/><circle cx="6.5" cy="12" r="1.5"/>',
    "7F": '<circle cx="12" cy="12" r="8.5"/><path d="M6 6.5c4.5 2 8.5 6.5 10.5 12M9.5 4c3 3.2 6 8.3 7 14M4 10.5c3.5 1.2 6.5 4.5 7.5 9.5"/>',
    "65": '<path d="M8.5 3 3 6l2 4.5 3-1V21h8V9.5l3 1L21 6l-5.5-3a3.5 3.5 0 0 1-7 0z"/><circle cx="12" cy="14" r="2"/>',
    "8F": '<path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17"/><path d="M9.5 4 12 6l2.5-2M9.5 20l2.5-2 2.5 2"/>',
    "96": '<path d="M12 3c4 5 6.5 8.2 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 11.2 8 8 12 3z"/><circle cx="10" cy="15" r="1"/><circle cx="13.5" cy="12.5" r="1"/><circle cx="13.5" cy="17" r="1"/>',
    "34": '<path d="M8.5 3 3 6l2 4.5 3-1V21h8V9.5l3 1L21 6l-5.5-3a3.5 3.5 0 0 1-7 0z"/><path d="M10 15h4M12 13v4"/>',
    "A0": '<circle cx="12" cy="14" r="7.5"/><path d="M12 14v-4M10 2.5h4M12 2.5v4M18.5 7.5l1.5-1.5"/>'
  };
  function iconeProg(code, taille) {
    var s = el("span", "e-cad-ic");
    s.innerHTML = '<svg width="' + taille + '" height="' + taille + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (ICONES[code] || '<circle cx="12" cy="12" r="5"/>') + '</svg>';
    return s;
  }
  function codeActuel(w) { var m = /Course_([A-Za-z0-9]+)$/.exec(w.programme || ""); return m ? m[1].toUpperCase() : null; }
  function svgDe(d, t) { return '<svg width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  var I_THERMO = '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 11v6"/><path d="M17 6h2M17 9h2M17 12h2"/>';
  var I_SPIRALE = '<path d="M12 12.5a1.2 1.2 0 1 1 1.2-1.2c0 2-1.6 3.4-3.4 3.4a3.6 3.6 0 0 1-3.6-3.6A5.2 5.2 0 0 1 11.4 6a6.6 6.6 0 0 1 6.6 6.6 8 8 0 0 1-8 8"/>';
  // Graduations : libelles courts ; valeur affichee : nombre + unite.
  function grad(type, v) {
    if (type === "temperature") return v === "cold" || v === "tapCold" ? "Froid" : (/^\d+$/.test(v) ? v + " °C" : (TEMP[v] || v));
    return v === "noSpin" ? "0" : v === "rinseHold" ? "Cuve pleine" : v;
  }
  // Geometrie du cadran (taille de reference ; l'ensemble est ensuite mis a l'echelle pour tenir dans la fenetre).
  function geometrie() { return { W: 680, H: 500, CX: 340, CY: 250, R: 190, K: 220, T1: 158, T2: 172, A: 150, ic: 24, ech: 250 }; }
  // Curseur vertical : icone, titre, echelle (graduations a gauche, rail a droite, bouton), sous-texte, - / +.
  function curseur(type, titre, icone, hEch, surValeur, surPas) {
    var b = el("div", "e-sl"), ic = el("div", "e-sl-ic"), ech = el("div", "e-sl-echelle"), rail = el("div", "e-sl-rail"), plein = el("div", "e-sl-plein"), bout = el("div", "e-sl-bouton");
    var sous = el("div", "e-sl-sous"), pasBox = el("div", "e-sl-pas"), moins = el("button", "e-cad-pas", "−"), plus = el("button", "e-cad-pas", "+");
    ic.innerHTML = svgDe(icone, 30);
    ech.style.height = hEch + "px";
    rail.appendChild(plein); rail.appendChild(bout); ech.appendChild(rail);
    b.appendChild(ic); b.appendChild(el("div", "e-sl-titre", titre)); b.appendChild(ech); b.appendChild(sous);
    pasBox.appendChild(moins); pasBox.appendChild(plus); b.appendChild(pasBox);
    moins.setAttribute("aria-label", titre + " : moins"); plus.setAttribute("aria-label", titre + " : plus");
    moins.onclick = function () { surPas(-1); }; plus.onclick = function () { surPas(1); };
    // Glisser ou toucher l'echelle : valeur la plus proche (graduations regulieres, de bas en haut dans l'ordre declare par la machine).
    function depuis(e) {
      var r = ech.getBoundingClientRect(), f = 1 - (e.clientY - r.top) / r.height;
      surValeur(Math.max(0, Math.min(1, f)));
    }
    ech.onpointerdown = function (e) {
      if (envoi !== null || b.className.indexOf("inactif") >= 0) return;
      try { ech.setPointerCapture(e.pointerId); } catch (x) { /* sans capture */ }
      geste = true;
      depuis(e);
      ech.onpointermove = depuis;
      ech.onpointerup = ech.onpointercancel = ech.onlostpointercapture = function () { ech.onpointermove = null; finGeste(); };
      if (e.preventDefault) e.preventDefault();
    };
    return { type: type, b: b, ech: ech, plein: plein, bout: bout, sous: sous, moins: moins, plus: plus, h: hEch };
  }
  // Choix en cours (choixSel, regSel : variables du module) : programme, valeurs permises, envoi (ce qui a change seulement), message sous le bouton.
  // Commun au cadran (tablette, telephone quand il tient) et a la liste du telephone (V1.6) ; rafraichir() met l'affichage a jour sans reconstruire.
  function selection(w, rafraichir) {
    var progs = w.programmes || [], actuel = codeActuel(w), LISTES = { temperature: "temperatures", essorage: "essorages" };
    function trouver(code) { for (var j = 0; j < progs.length; j++) if (progs[j].code === code) return progs[j]; return null; }
    // Reglage : valeur de base (defaut du nouveau programme, sinon reglage actuel), liste permise, valeur affichee.
    function base(type) { var p = choixSel ? trouver(choixSel) : null; return p ? p[type] : w[type]; }
    function liste(type) { var p = trouver(choixSel || actuel); return (p && p[LISTES[type]]) || []; }
    function valeur(type) { return regSel[type] !== null ? regSel[type] : base(type); }
    function fixer(type, v) { regSel[type] = v === base(type) ? null : v; rafraichir(); }
    function marquer(code) {
      var avant = choixSel;
      choixSel = code && code !== actuel ? code : null;
      if (choixSel !== avant) regSel = { temperature: null, essorage: null }; // autre programme : reglages par defaut
      rafraichir();
    }
    function change() { return choixSel !== null || regSel.temperature !== null || regSel.essorage !== null; }
    function envoyer() {
      var corps = {}, p = trouver(choixSel || actuel), mots = [];
      if (choixSel) { corps.programme = choixSel; mots.push(p.nom); }
      if (regSel.temperature !== null) { corps.temperature = regSel.temperature; mots.push(temperature(regSel.temperature)); }
      if (regSel.essorage !== null) { corps.essorage = regSel.essorage; mots.push(essorage(regSel.essorage)); }
      if (mots.length) envoyerReglages(w, corps, mots.join(" · "));
    }
    function note(invite) {
      if (envoi === w.id) return "Envoi en cours, relecture de l’état…";
      if (w.perime) return "Envoi indisponible : données périmées (cloud injoignable).";
      if (w.telecommande !== true) return "Commande à distance OFF : appui court sur Smart Control de la machine.";
      if (w.droits === false) return "Autorisation en lecture seule : icône compte, Reconnecter avec les commandes.";
      return change() ? "Le cycle ne démarre pas : appuyez ensuite sur Départ sur la machine." : invite;
    }
    if (choixSel && !(trouver(choixSel) && trouver(choixSel).choix)) { choixSel = null; regSel = { temperature: null, essorage: null }; }
    return { actuel: actuel, trouver: trouver, base: base, liste: liste, valeur: valeur, fixer: fixer, marquer: marquer, change: change, envoyer: envoyer, note: note };
  }
  // V1.6 : selecteur du telephone quand le cadran ne tient pas : choix en tete, programmes en liste (ordre declare par la machine, point vert = actuel),
  // temperature et essorage en rangees de valeurs permises (valeur par defaut en vert), « Envoyer a la machine » colle en bas.
  function selecteurListe(w) {
    var c = w.commandes || {}, box = el("div", "e-li-box"), S = selection(w, maj), progs = w.programmes, j;
    var choix = el("div", "e-li-choix"), cIc = el("div", "e-li-cic"), cTxt = el("div", "e-li-ctxt"), cNom = el("div", "e-li-cnom"), cSous = el("div", "e-li-csous");
    cTxt.appendChild(cNom); cTxt.appendChild(cSous); choix.appendChild(cIc); choix.appendChild(cTxt);
    box.appendChild(choix);
    var lp = el("div", "e-li-progs"), boutons = [];
    progs.forEach(function (p) {
      var b = el("button", "e-li-prog" + (p.choix ? "" : " off") + (p.code === S.actuel ? " actuel" : ""));
      b.appendChild(iconeProg(p.code, 22));
      b.appendChild(el("span", "e-li-pnom", p.nom));
      if (!p.choix) b.title = p.nom + " (choix sur la machine seulement)";
      b.setAttribute("aria-pressed", "false");
      b.onclick = function () { if (p.choix && envoi === null) S.marquer(p.code); };
      lp.appendChild(b); boutons.push(b);
    });
    box.appendChild(el("div", "e-li-titre", "Programme"));
    box.appendChild(lp);
    function rangee(type, titre) {
      var r = el("div", "e-li-reg"), t = el("div", "e-li-titre", titre), sous = el("span", "e-li-sous"), vals = el("div", "e-li-vals");
      t.appendChild(sous); r.appendChild(t); r.appendChild(vals); box.appendChild(r);
      return { type: type, vals: vals, sous: sous };
    }
    var rT = rangee("temperature", "Température"), rE = rangee("essorage", "Essorage");
    var infos = el("div", "e-cad-infos");
    ligne(infos, "Commande à distance", onoff(w.telecommande, " (Smart Control)"));
    ligne(infos, "Sécurité enfant", onoff(w.verrouEnfant));
    ligne(infos, "Dernière lecture", (heure(w.maj) || "–") + (w.perime ? " (périmée)" : ""));
    box.appendChild(infos);
    var pied = el("div", "e-li-pied"), envoyer = el("button", "b-main e-li-envoyer", "Envoyer à la machine"), note = el("div", "e-li-note");
    envoyer.onclick = S.envoyer;
    pied.appendChild(note); pied.appendChild(envoyer); box.appendChild(pied);
    function majRangee(r) {
      var l = S.liste(r.type), v = S.valeur(r.type), p = S.trouver(choixSel || S.actuel), def = p ? p[r.type] : null;
      r.vals.innerHTML = "";
      l.forEach(function (x) {
        var b = el("button", "e-li-val" + (x === def ? " defaut" : "") + (x === v ? " sel" : ""), grad(r.type, x));
        b.setAttribute("aria-pressed", x === v ? "true" : "false");
        b.disabled = envoi !== null;
        b.onclick = function () { if (envoi === null && x !== S.valeur(r.type)) S.fixer(r.type, x); };
        r.vals.appendChild(b);
      });
      if (!l.length) r.vals.appendChild(el("span", "e-li-sous", r.type === "temperature" ? temperature(v) : essorage(v)));
      r.sous.textContent = l.length < 2 ? " · non réglable" : (v === def ? " · valeur par défaut" : (regSel[r.type] !== null ? " · modifié" : " · réglage actuel"));
    }
    function maj() {
      var sel = choixSel || S.actuel, p = S.trouver(sel);
      for (j = 0; j < boutons.length; j++) { var on = progs[j].code === sel; boutons[j].classList.toggle("sel", on); boutons[j].setAttribute("aria-pressed", on ? "true" : "false"); }
      cIc.innerHTML = ""; cIc.appendChild(iconeProg(p ? p.code : "", 34));
      cNom.textContent = p ? p.nom : programme(w);
      cSous.textContent = choixSel !== null ? "Nouveau choix" : "Programme actuel";
      majRangee(rT); majRangee(rE);
      envoyer.disabled = !S.change() || !c.programme || envoi !== null;
      note.textContent = S.note("Touchez un programme, ou réglez température et essorage.");
    }
    maj();
    return box;
  }
  function cadran(w) {
    var paysage = (window.innerWidth || 1280) > (window.innerHeight || 800);
    var cle = (paysage ? "p" : "v") + (window.innerWidth || 0);
    // V1.6 : smartphone (APP.tel) seulement, quand le cadran ne tient pas à 90 % de sa taille (mesuré ci-dessous) : programmes en liste et valeurs en rangées ;
    // même état (choixSel, regSel), mêmes valeurs permises, même envoi. La tablette garde toujours le cadran.
    var enListe = !!(APP.tel && echelle.liste && echelle.cle === cle);
    if (enListe) return selecteurListe(w);
    var G = geometrie(), box = el("div", "e-cad " + (paysage ? "paysage" : "portrait")), gauche = el("div", "e-cad-gauche"), roue = el("div", "e-cad-roue"), cote = el("div", "e-cad-cote"), c = w.commandes || {};
    var progs = w.programmes, n = progs.length, actuel = codeActuel(w), W = G.W, H = G.H, CX = G.CX, CY = G.CY, R = G.R, i;
    var pos = [], ticks = [], svg = '<svg class="e-cad-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><circle class="e-cad-anneau" cx="' + CX + '" cy="' + CY + '" r="' + G.A + '"/>';
    var angle = function (k) { return k / n * 2 * Math.PI - Math.PI / 2; };
    roue.style.width = W + "px"; roue.style.height = H + "px";
    for (i = 0; i < n; i++) {
      var a = angle(i);
      svg += '<line class="e-cad-tick" data-i="' + i + '" x1="' + (CX + G.T1 * Math.cos(a)).toFixed(1) + '" y1="' + (CY + G.T1 * Math.sin(a)).toFixed(1) + '" x2="' + (CX + G.T2 * Math.cos(a)).toFixed(1) + '" y2="' + (CY + G.T2 * Math.sin(a)).toFixed(1) + '"/>';
    }
    roue.innerHTML = svg + '</svg>';
    for (i = 0; i < n; i++) ticks.push(roue.querySelector('line[data-i="' + i + '"]'));
    // bouton central : aiguille tournante, icone et nom du programme
    var bouton = el("div", "e-cad-bouton"), aiguille = el("div", "e-cad-aiguille"), cIc = el("div", "e-cad-cic"), cNom = el("div", "e-cad-cnom"), cSous = el("div", "e-cad-csous");
    bouton.style.left = (CX - G.K / 2) + "px"; bouton.style.top = (CY - G.K / 2) + "px"; bouton.style.width = G.K + "px"; bouton.style.height = G.K + "px";
    bouton.appendChild(aiguille); bouton.appendChild(cIc); bouton.appendChild(cNom); bouton.appendChild(cSous);
    roue.appendChild(bouton);
    roue.appendChild(el("div", "e-etat pret", "Prêt"));
    for (i = 0; i < n; i++) (function (k, p) {
      var a = angle(k), cs = Math.cos(a), sn = Math.sin(a), haut = Math.abs(cs) < 0.3, r = haut ? R + 16 : R;
      var b = el("button", "e-cad-pos " + (haut ? "h" : (cs > 0 ? "d" : "g")) + (p.choix ? "" : " off") + (p.code === actuel ? " actuel" : ""));
      b.style.left = (CX + r * cs).toFixed(1) + "px"; b.style.top = (CY + r * sn).toFixed(1) + "px";
      b.appendChild(iconeProg(p.code, G.ic));
      b.appendChild(el("span", "e-cad-nom", p.nom));
      b.title = p.nom + (p.choix ? "" : " (choix sur la machine seulement)");
      b.onclick = function () { if (p.choix && envoi === null) marquer(p.code); };
      roue.appendChild(b);
      pos.push(b);
    })(i, progs[i]);
    // a gauche sous le cadran : informations ; a droite : curseurs, envoi
    var infos = el("div", "e-cad-infos"), rang = el("div", "e-sl-rang"), envoyer = el("button", "b-main e-cad-envoyer", "Envoyer à la machine"), note = el("div", "e-cad-note");
    var slT = curseur("temperature", "Température", I_THERMO, G.ech, function (f) { auNiveau("temperature", f); }, function (d) { pas("temperature", d); });
    var slE = curseur("essorage", "Essorage", I_SPIRALE, G.ech, function (f) { auNiveau("essorage", f); }, function (d) { pas("essorage", d); });
    ligne(infos, "Commande à distance", onoff(w.telecommande, " (Smart Control)"));
    ligne(infos, "Sécurité enfant", onoff(w.verrouEnfant));
    ligne(infos, "Dernière lecture", (heure(w.maj) || "–") + (w.perime ? " (périmée)" : ""));
    gauche.appendChild(roue); gauche.appendChild(infos);
    rang.appendChild(slT.b); rang.appendChild(slE.b);
    cote.appendChild(rang); cote.appendChild(envoyer); cote.appendChild(note);
    // Choix du programme et des reglages, envoi, message : communs au cadran et a la liste du telephone (selection)
    var S = selection(w, function () { maj(); });
    var trouver = S.trouver, base = S.base, liste = S.liste, valeur = S.valeur, fixer = S.fixer, marquer = S.marquer;
    envoyer.onclick = S.envoyer;
    function pas(type, d) {
      var l = liste(type), i2 = l.indexOf(valeur(type)), k;
      if (envoi !== null || l.length < 2) return;
      k = i2 < 0 ? (d > 0 ? 0 : l.length - 1) : Math.max(0, Math.min(l.length - 1, i2 + d));
      fixer(type, l[k]);
    }
    function auNiveau(type, f) {
      var l = liste(type);
      if (envoi !== null || l.length < 2) return;
      var v = l[Math.round(f * (l.length - 1))];
      if (v !== valeur(type)) fixer(type, v);
    }
    // Curseur : graduations (reconstruites : la liste depend du programme ; valeur par defaut du programme en vert), bouton et remplissage,
    // sous-texte (« valeur par defaut » quand elle est choisie, sinon « modifie » ou « reglage actuel »), - / +.
    function majCurseur(s) {
      var l = liste(s.type), v = valeur(s.type), i2 = l.indexOf(v), m = l.length, y, p = trouver(choixSel || actuel), def = p ? p[s.type] : null;
      var anciens = s.ech.querySelectorAll(".e-sl-grad"), j;
      for (j = 0; j < anciens.length; j++) s.ech.removeChild(anciens[j]);
      for (j = 0; j < m; j++) {
        var g = el("div", "e-sl-grad" + (l[j] === def ? " defaut" : "") + (j === i2 ? " sel" : ""));
        if (s.type === "temperature" && (l[j] === "cold" || l[j] === "tapCold")) { var fl = el("span", "e-sl-flocon"); fl.innerHTML = svgDe(ICONES["8F"], 14); g.appendChild(fl); }
        g.appendChild(el("span", "e-sl-gtxt", grad(s.type, l[j])));
        g.appendChild(el("span", "e-sl-trait"));
        g.style.top = (m > 1 ? (1 - j / (m - 1)) * s.h : s.h / 2) + "px";
        s.ech.appendChild(g);
      }
      y = i2 < 0 ? null : (m > 1 ? (1 - i2 / (m - 1)) * s.h : s.h / 2);
      s.bout.style.display = y === null ? "none" : "";
      if (y !== null) s.bout.style.top = (y + 10) + "px";
      s.plein.style.height = y === null ? "0" : (s.h - y + 10) + "px";
      s.ech.title = s.type === "temperature" ? temperature(v) : essorage(v);
      s.sous.textContent = m < 2 ? "non réglable" : (v === def ? "valeur par défaut" : (regSel[s.type] !== null ? "modifié" : "réglage actuel"));
      s.sous.className = "e-sl-sous" + (m >= 2 && v === def ? " defaut" : "");
      s.b.className = "e-sl" + (regSel[s.type] !== null ? " modifie" : "") + (m < 2 ? " inactif" : "");
      s.moins.disabled = m < 2 || envoi !== null || i2 === 0;
      s.plus.disabled = m < 2 || envoi !== null || (i2 >= 0 && i2 === m - 1);
    }
    // Etat visuel : illumination, aiguille, centre, curseurs, bouton d'envoi (sans reconstruire la fenetre : l'aiguille et les curseurs bougent)
    function maj() {
      var sel = choixSel || actuel, k = -1, j, p, nouveau = choixSel !== null, change;
      for (j = 0; j < n; j++) {
        var on = progs[j].code === sel;
        pos[j].className = pos[j].className.replace(/ sel/g, "") + (on ? " sel" : "");
        if (ticks[j]) ticks[j].setAttribute("class", "e-cad-tick" + (on ? " sel" : ""));
        if (on) k = j;
      }
      if (k >= 0) aiguille.style.transform = "rotate(" + (k / n * 360) + "deg)";
      aiguille.style.visibility = k >= 0 ? "visible" : "hidden";
      p = trouver(sel);
      cIc.innerHTML = ""; cIc.appendChild(iconeProg(p ? p.code : "", 38));
      cNom.textContent = p ? p.nom : programme(w);
      cSous.textContent = nouveau ? "Nouveau choix" : "Programme actuel";
      majCurseur(slT); majCurseur(slE);
      change = S.change();
      envoyer.disabled = !change || !c.programme || envoi !== null;
      note.textContent = S.note("Touchez un programme du sélecteur, ou réglez température et essorage.");
    }
    maj();
    box.appendChild(gauche); box.appendChild(cote);
    // Mise a l'echelle. Paysage : cadran a gauche, curseurs a droite, l'ensemble reduit pour tenir sans defilement (largeur et hauteur) ;
    // portrait : curseurs sous le cadran, cadran reduit a la largeur seulement. Echelle mesuree une seule fois (contenu masque le temps de la
    // mesure), puis reappliquee tout de suite a chaque reconstruction (toutes les 15 s) : aucun saut. Nouveau calcul : autre largeur (rotation)
    // ou fenetre plus basse (barre d'adresse), jamais d'agrandissement sur un simple changement de hauteur.
    function appliquer(e) {
      if (!(e.s < 1)) return;
      if (paysage) {
        box.style.transform = "scale(" + e.s.toFixed(3) + ")";
        box.style.marginRight = Math.floor(e.w * (e.s - 1)) + "px";
        box.style.marginBottom = Math.floor(e.h * (e.s - 1)) + "px";
      } else { roue.style.transform = "scale(" + e.s.toFixed(3) + ")"; gauche.style.width = Math.floor(W * e.s) + "px"; roue.style.marginBottom = Math.floor(H * (e.s - 1)) + "px"; }
    }
    function mesurer() {
      var corps = box.parentNode, panneau = corps && corps.parentNode, tete = panneau && panneau.firstChild, cs, dispoW, dispoH, s;
      if (!corps || !tete) return;
      cs = window.getComputedStyle(corps);
      dispoW = corps.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      dispoH = window.innerHeight * 0.92 - tete.offsetHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4;
      s = paysage ? Math.min(1, dispoW / box.offsetWidth, dispoH / box.offsetHeight) : Math.min(1, dispoW / W);
      echelle = { cle: cle, s: s > 0 ? s : 1, w: box.offsetWidth, h: box.offsetHeight, hFen: window.innerHeight, liste: !!APP.tel && s < 0.9 };
      if (echelle.liste) { majDetail(); return; } // V1.6 : contenu encore masqué, reconstruit en liste
      appliquer(echelle);
      box.style.visibility = "";
    }
    if (echelle.cle === cle) appliquer(echelle);
    else { box.style.visibility = "hidden"; setTimeout(mesurer, 0); }
    return box;
  }
  function envoyerReglages(w, corps, resume) {
    if (APP.busy) return;
    rev++; // une lecture deja partie ne doit pas ecraser la reponse
    APP.setBusy(true);
    APP.api("POST", "/api/washers/" + encodeURIComponent(w.id) + "/reglages", corps, function (err, d) {
      APP.setBusy(false); envoi = null;
      if (d && d.washers) { washers = d.washers; panne = d.panne || null; if (APP.stCompte) APP.stCompte.majCloud(d.cloud); }
      choixSel = null; regSel = { temperature: null, essorage: null }; // etat relu : affichage depuis la machine
      if (err) APP.banner(err, "err"); else APP.banner(w.name + " : " + resume + " envoyé. Appuyez sur Départ sur la machine.", "ok");
      afficher();
      if (APP.stCompte) APP.stCompte.majTous();
    });
  }
  // Pas de mise a jour devinee : la regle APP.prevoir (en bas) marque seulement « commande envoyée » ; l'etat affiche vient de la relecture du serveur.
  function envoyer(w, action) {
    if (APP.busy) return;
    rev++; // une lecture deja partie ne doit pas ecraser la reponse
    APP.setBusy(true);
    APP.api("POST", "/api/washers/" + encodeURIComponent(w.id) + "/commande", { action: action }, function (err, d) {
      APP.setBusy(false); envoi = null;
      if (d && d.washers) { washers = d.washers; panne = d.panne || null; if (APP.stCompte) APP.stCompte.majCloud(d.cloud); }
      if (err) APP.banner(err, "err"); else APP.banner(w.name + " : commande « " + LIBS[action] + " » envoyée.", "ok");
      afficher();
    });
  }
  function rendre() {
    var box = $("electroList"), i;
    box.innerHTML = "";
    var g = APP.stCompte ? APP.stCompte.groupe(null) : null;
    if (g) { box.appendChild(g.carte); box = g.corps; } // appareils SmartThings : dans la carte du compte
    if (panne) box.appendChild(el("div", "e-panne", "Électroménager indisponible : " + panne));
    var nAj = APP.stCompte ? APP.stCompte.nbDans(VUE) : 0; // autres appareils a cycle (st-familles.js)
    if (!washers.length && !nAj) box.appendChild(el("div", "e-vide", APP.stCompte && APP.stCompte.horsLigne() ? APP.stCompte.masques : panne ? "Aucun état connu." : (APP.stCompte && APP.stCompte.etat() && !APP.stCompte.etat().connecte ? "Compte SmartThings déconnecté : appuyez sur l'icône compte ci-dessus." : "Aucun lave-linge trouvé.")));
    for (i = 0; i < washers.length; i++) box.appendChild(tuileDe(washers[i]));
    if (nAj) APP.stCompte.dans(VUE, box);
    majDetail();
  }
  // Tuile compacte (meme format que « Tous les appareils ») ; appui -> fenetre de detail (toutes les informations et les commandes).
  function tuileDe(w) { return APP.stCompte.tuile(resume(w), function () { ouvrirDetail(w.id); }); }
  var detailId = null, fen = null;
  function ouvrirDetail(id) {
    if (!APP.stCompte) return;
    detailId = id;
    if (!fen) { choixSel = null; fen = APP.stCompte.fenetre("", function () { fen = null; detailId = null; arme = null; choixSel = null; geste = false; aRefaire = false; clearTimeout(armeT); if (!ouverte) arreterLecture(); }, true); }
    majDetail();
    if (fen) { demarrerLecture(); charger(); }
  }
  function majDetail() {
    var w = null, i;
    if (!fen) return;
    if (geste) { aRefaire = true; return; } // curseur tenu : reconstruction au lever du doigt (finGeste)
    for (i = 0; i < washers.length; i++) if (washers[i].id === detailId) w = washers[i];
    if (!w) { fen.fermer(); return; }
    fen.titre(w.name);
    if (fen.tete && APP.piecesChoix) fen.tete(APP.piecesChoix.pastille(w.id, w.name));
    fen.corps.innerHTML = "";
    fen.corps.appendChild(w.etat === "pret" && w.programmes && w.programmes.length ? cadran(w) : carte(w)); // pret : selecteur rond
  }
  function afficher() { if (ouverte) rendre(); else majDetail(); }
  // Rotation (autre largeur) : nouveau calcul ; fenetre plus basse (barre d'adresse qui apparait) : reduction une fois ; plus haute : rien (aucun saut).
  window.addEventListener("resize", function () {
    if (!fen) return;
    var cle = ((window.innerWidth || 0) > (window.innerHeight || 0) ? "p" : "v") + (window.innerWidth || 0);
    if (cle !== echelle.cle || window.innerHeight < echelle.hFen - 2) { echelle.cle = ""; majDetail(); }
  });

  // Lecture : a l'ouverture puis toutes les 15 s ; au demarrage, une seule fois pour savoir si la categorie existe (route absente : jamais affichee).
  function charger() {
    if (APP.busy) return;
    var r = ++rev;
    APP.api("GET", "/api/washers", null, function (err, d) {
      var avant = existe + ":" + washers.length;
      if (r !== rev) return;
      if (err || !d || !d.washers) {
        if (ouverte) { panne = err || "réponse inattendue du serveur"; rendre(); }
        else if (!existe && err !== "Route inconnue.") setTimeout(function () { if (!existe && !ouverte) charger(); }, 60000);
        return;
      }
      washers = d.washers; panne = d.panne || null; if (APP.stCompte) APP.stCompte.majCloud(d.cloud); existe = true;
      if (APP.stCompte) APP.stCompte.majTous();
      afficher();
      if (avant !== existe + ":" + washers.length) APP.render(); // menu et accueil
    });
  }
  function ouvrir() {
    if (APP.stCompte) APP.stCompte.charger();
    if (!ouverte) { ouverte = true; rendre(); }
    charger();
    demarrerLecture();
  }
  // Lecture toutes les 15 s tant que la vue ou une fenetre de detail est ouverte.
  function demarrerLecture() { if (!timer) timer = setInterval(function () { if (!document.hidden) charger(); }, 15000); }
  function arreterLecture() { if (timer) { clearInterval(timer); timer = null; } }
  function fermer() { ouverte = false; if (!fen) arreterLecture(); }
  document.addEventListener("visibilitychange", function () { if ((ouverte || fen) && !document.hidden) charger(); });

  APP.surVue(function (name) {
    $("viewElectro").className = "view" + (name === VUE ? "" : " hidden");
    if (name === VUE) ouvrir(); else fermer();
  }, 30);
  APP.nav.categorie({ key: VUE, label: "Électroménager", count: function () { var n = washers.length + (APP.stCompte ? APP.stCompte.nbDans(VUE) : 0); if (!n && APP.stCompte && APP.stCompte.horsLigne()) return undefined; return existe || n ? (n || null) : undefined; } }); // V1.7 : cloud injoignable, aucun appareil : catégorie masquée
  APP.prevoir(/^\/api\/washers\/([A-Za-z0-9_-]+)\/commande$/, function (m) { envoi = m[1]; afficher(); return null; });
  APP.prevoir(/^\/api\/washers\/([A-Za-z0-9_-]+)\/reglages$/, function (m) { envoi = m[1]; afficher(); return null; });
  // Resume d'un lave-linge (tuile ici et dans « Tous les appareils ») : nom, etat ; en cycle (en cours ou en pause) :
  // ligne « programme - temperature - essorage - temps restant hh:mm » et progression (barre bleue).
  var TONS = { pret: "neutre", en_cours: "actif", pause: "pause", hors_ligne: "off" };
  function hhmm(min) { var m = Math.max(0, Math.round(min)); return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function resume(w) {
    var actif = w.etat === "en_cours" || w.etat === "pause", p = [], t;
    if (actif) {
      p.push(programme(w));
      t = w.temperature === null || w.temperature === undefined ? null : temperature(w.temperature); if (t && t !== "–") p.push(t);
      t = w.essorage === null || w.essorage === undefined ? null : essorage(w.essorage); if (t && t !== "–") p.push(t);
      if (w.restantMin !== null && w.restantMin !== undefined) p.push(hhmm(w.restantMin));
    }
    return { id: w.id, nom: w.name, etat: ETATS[w.etat] || "Autre état", ton: TONS[w.etat] || "neutre", detail: p.length ? p.join(" - ") : null,
      progression: actif && typeof w.progression === "number" ? w.progression : null, perime: w.perime };
  }
  // Actualisation manuelle (icone de la carte SmartThings) : lecture fraiche du cloud, sans attendre la cadence.
  function actualiser(cb) {
    rev++; // une lecture deja partie ne doit pas ecraser la reponse
    APP.api("POST", "/api/washers/actualiser", {}, function (err, d) {
      var avant = existe + ":" + washers.length;
      if (d && d.washers) { washers = d.washers; panne = d.panne || null; if (APP.stCompte) APP.stCompte.majCloud(d.cloud); existe = true; }
      afficher();
      if (APP.stCompte) APP.stCompte.majTous();
      if (avant !== existe + ":" + washers.length) APP.render();
      cb(err);
    });
  }
  if (APP.stCompte) APP.stCompte.famille({ cle: VUE, libelle: "Électroménager", existe: function () { return existe; }, panne: function () { return panne; },
    charger: charger, actualiser: actualiser, appareils: function () { return washers.map(resume); }, ouvrir: function () { APP.nav.vue(VUE); }, detail: ouvrirDetail });
  if (APP.stCompte) APP.stCompte.hote(VUE, function () { if (ouverte) rendre(); }); // appareils a cycle (st-familles.js) relus : nouvel affichage
  // Compte connecte, deconnecte ou change : nouvel affichage, et relecture apres une operation.
  if (APP.stCompte) APP.stCompte.surChangement(function (operation) { if (ouverte) { rendre(); if (operation) charger(); } });
  charger();
})();
// FIN
