// @zone electromenager | Familles SmartThings generiques, LECTURE SEULE : capteurs, interrupteurs, audio, autres appareils (vue #viewSt, une categorie par famille), appareils a cycle (dans la vue Electromenager, APP.stCompte.hote) ; tuiles APP.stCompte.tuile, fenetre de detail APP.stCompte.fenetre ; GET /api/smartthings/appareils toutes les 15 s tant qu'une vue ou une fenetre est ouverte ; crochet de vue APP.surVue (ordre 20).
// Aucune commande (une famille ne recoit ses commandes qu'apres validation sur un appareil reel). Famille « autre » : nom, connexion, batterie ; jamais de position.
(function () {
  const $ = APP.$, el = APP.el;
  const FAMILLES = [ // ordre : « Tous les appareils » (cycle juste apres l'Electromenager) puis menu
    { cle: "cycle", libelle: "Appareils à cycle", dans: "electro" },
    { cle: "capteurs", libelle: "Capteurs" },
    { cle: "interrupteurs", libelle: "Interrupteurs" },
    { cle: "audio", libelle: "Audio" },
    { cle: "autre", libelle: "Autres appareils" },
  ];
  const vueDe = (f) => f.dans || "st-" + f.cle;
  let appareils = [], panne = null, existe = false, rev = 0, dernierGet = 0, vue = null, timer = null, fen = null, detailId = null, attenteActu = null;

  // ---------- textes ----------
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  const heure = (iso) => { const d = new Date(iso || ""); return iso && !isNaN(d.getTime()) ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : null; };
  const hhmm = (min) => { const m = Math.max(0, Math.round(min)); return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
  const nb = (x) => String(x).replace(".", ",");
  const CONNEXION = { ONLINE: "En ligne", OFFLINE: "Hors ligne", UNHEALTHY: "Connexion instable" };
  const CYCLE = { pret: "Prêt", en_cours: "En cours", pause: "En pause" };
  const TYPE = { seche_linge: "Sèche-linge", lave_vaisselle: "Lave-vaisselle" };
  const LECTURE = { playing: "En lecture", paused: "En pause", stopped: "Arrêté", buffering: "Chargement", "fast forwarding": "Avance rapide", rewinding: "Retour rapide" };
  const horsLigne = (a) => a.connexion === "OFFLINE" || a.connexion === "UNHEALTHY";
  // Valeurs lisibles, dans l'ordre d'affichage : [libelle, texte court (tuile), texte complet (fenetre), ton]
  function lignes(a) {
    const v = a.valeurs || {}, o = [];
    const mettre = (lib, court, long, ton) => o.push([lib, court, long || court, ton || "neutre"]);
    if (v.cycle) {
      mettre("État du cycle", CYCLE[v.cycle.etat] || "Autre état", null, v.cycle.etat === "en_cours" ? "actif" : v.cycle.etat === "pause" ? "pause" : "neutre");
      if (typeof v.cycle.restantMin === "number") mettre("Temps restant", hhmm(v.cycle.restantMin));
      if (typeof v.cycle.progression === "number") mettre("Progression", Math.round(v.cycle.progression) + " %");
      if (heure(v.cycle.fin)) mettre("Fin prévue", heure(v.cycle.fin));
    }
    if (v.lecture) mettre("Lecture", LECTURE[v.lecture] || v.lecture, null, v.lecture === "playing" ? "actif" : v.lecture === "paused" ? "pause" : "neutre");
    if (v.interrupteur) mettre("État", v.interrupteur === "on" ? "ON" : "OFF", null, v.interrupteur === "on" ? "actif" : "neutre");
    if (v.contact) mettre("Contact", v.contact === "open" ? "Ouvert" : "Fermé", null, v.contact === "open" ? "pause" : "neutre");
    if (v.mouvement) mettre("Mouvement", v.mouvement === "active" ? "Mouvement" : "Calme", v.mouvement === "active" ? "Détecté" : "Aucun", v.mouvement === "active" ? "actif" : "neutre");
    if (v.presence) mettre("Présence", v.presence === "present" ? "Présent" : "Absent", null, v.presence === "present" ? "actif" : "neutre");
    if (v.temperature) mettre("Température", nb(v.temperature.v) + " °" + v.temperature.u);
    if (typeof v.humidite === "number") mettre("Humidité", nb(v.humidite) + " %");
    if (typeof v.niveau === "number") mettre("Niveau", "niveau " + nb(v.niveau) + " %", nb(v.niveau) + " %");
    if (typeof v.volume === "number") mettre("Volume", "volume " + nb(v.volume) + " %", nb(v.volume) + " %");
    if (v.muet) mettre("Son", v.muet === "muted" ? "muet" : "son actif", v.muet === "muted" ? "Muet" : "Actif");
    if (typeof v.puissance === "number") mettre("Puissance", nb(v.puissance) + " W");
    if (v.energie) mettre("Énergie", nb(v.energie.v) + " " + v.energie.u);
    if (typeof v.batterie === "number") mettre("Batterie", "batterie " + nb(v.batterie) + " %", nb(v.batterie) + " %");
    return o;
  }
  // Resume (tuile, ici et dans « Tous les appareils ») : etat = premiere valeur (connexion pour « autre »), detail = les suivantes.
  function resume(a) {
    const l = lignes(a), type = a.valeurs && a.valeurs.cycle ? TYPE[a.valeurs.cycle.type] : null;
    let etat, ton, reste;
    if (horsLigne(a)) { etat = CONNEXION[a.connexion]; ton = "off"; reste = l; }
    else if (a.famille === "autre" || !l.length) { etat = a.famille === "autre" ? (CONNEXION[a.connexion] || "Connexion inconnue") : (a.perime ? "Non lu" : "Aucune valeur"); ton = a.connexion === "ONLINE" && a.famille === "autre" ? "actif" : "neutre"; reste = l; }
    else { etat = l[0][1]; ton = l[0][3]; reste = l.slice(1); }
    const det = (type ? [type] : []).concat(reste.filter((x) => x[0] !== "Progression" && x[0] !== "Fin prévue" && !(type && x[0] === "État")).map((x) => x[1]));
    const c = a.valeurs && a.valeurs.cycle;
    return { id: a.id, nom: a.nom, etat: etat, ton: ton, detail: det.length ? det.join(" - ") : null,
      progression: c && (c.etat === "en_cours" || c.etat === "pause") && typeof c.progression === "number" ? c.progression : null, perime: a.perime };
  }
  const de = (cle) => appareils.filter((a) => a.famille === cle);
  const famDe = (cle) => FAMILLES.filter((f) => f.cle === cle)[0];

  // ---------- fenetre de detail ----------
  function ligne(box, lib, val, cls) {
    const r = el("div", "sc-ligne");
    r.appendChild(el("span", "sc-lib", lib));
    r.appendChild(el("span", "sc-val" + (cls ? " " + cls : ""), val));
    box.appendChild(r);
  }
  function majDetail() {
    if (!fen) return;
    const a = appareils.filter((x) => x.id === detailId)[0];
    if (!a) { fen.fermer(); return; }
    fen.titre(a.nom);
    if (fen.tete && APP.piecesChoix) fen.tete(APP.piecesChoix.pastille(a.id, a.nom));
    fen.corps.innerHTML = "";
    const b = el("div", "sc-bloc"), type = a.valeurs && a.valeurs.cycle ? TYPE[a.valeurs.cycle.type] : null;
    ligne(b, "Famille", (famDe(a.famille) || {}).libelle + (type ? " (" + type + ")" : ""));
    ligne(b, "Connexion", CONNEXION[a.connexion] || "inconnue", a.connexion === "ONLINE" ? "ok" : horsLigne(a) ? "ko" : "");
    lignes(a).forEach((x) => ligne(b, x[0], x[2]));
    ligne(b, "Dernière lecture", (heure(a.maj) || "–") + (a.perime ? " (données périmées)" : ""));
    fen.corps.appendChild(b);
    fen.corps.appendChild(el("div", "sc-note", a.famille === "autre"
      ? APP.lieu("Lecture seule. Aucune donnée de localisation n'est lue ni affichée (la pièce est celle choisie ici, rangée sur cet appareil).")
      : "Lecture seule : les commandes de cette famille seront activées après validation sur un appareil réel."));
    if (horsLigne(a)) fen.corps.appendChild(el("div", "sc-note", "Appareil hors ligne : dernières valeurs connues."));
  }
  function ouvrirDetail(id) {
    detailId = id;
    if (!fen) fen = APP.stCompte.fenetre("", () => { fen = null; detailId = null; if (!vue && APP.view !== "electro") arreter(); });
    majDetail();
    demarrer(); charger(true);
  }

  // ---------- vues ----------
  function tuiles(cle, box) { const l = de(cle); l.forEach((a) => box.appendChild(APP.stCompte.tuile(resume(a), () => ouvrirDetail(a.id)))); return l.length; }
  function rendreVue() {
    const box = $("stListe"), f = FAMILLES.filter((x) => "st-" + x.cle === vue)[0];
    if (!box || !f) return;
    box.innerHTML = "";
    const g = APP.stCompte.groupe(null);
    box.appendChild(g.carte);
    if (panne) g.corps.appendChild(el("div", "e-panne", f.libelle + " indisponible : " + panne));
    if (!tuiles(f.cle, g.corps)) g.corps.appendChild(el("div", "e-vide", APP.stCompte.etat() && !APP.stCompte.etat().connecte ? "Compte SmartThings déconnecté : appuyez sur l'icône compte ci-dessus." : APP.stCompte.horsLigne() ? APP.stCompte.masques : "Aucun appareil."));
  }
  function apresLecture(avant) {
    APP.stCompte.majTous();
    FAMILLES.forEach((f) => { if (f.dans) APP.stCompte.majDans(f.dans); });
    if (vue) rendreVue();
    majDetail();
    if (avant !== signature()) APP.render(); // menu, accueil, total « Tous les appareils »
  }
  const signature = () => FAMILLES.map((f) => de(f.cle).length).join(",");

  // ---------- lecture ----------
  // force : lecture meme si une autre vient de partir (ouverture d'une vue ou d'une fenetre) ; sinon au plus une toutes les 3 s (plusieurs familles demandent).
  function charger(force) {
    if (APP.busy || (!force && Date.now() - dernierGet < 3000)) return;
    dernierGet = Date.now();
    const r = ++rev;
    APP.api("GET", "/api/smartthings/appareils", null, (err, d) => {
      if (r !== rev) return;
      const avant = signature();
      if (err || !d || !Array.isArray(d.appareils)) {
        if (existe) { panne = err || "réponse inattendue du serveur"; apresLecture(avant); }
        else if (err !== "Route inconnue.") setTimeout(() => { if (!existe) charger(true); }, 60000);
        return;
      }
      appareils = d.appareils; panne = d.panne || null; if (APP.stCompte) APP.stCompte.majCloud(d.cloud); existe = true;
      apresLecture(avant);
    });
  }
  // Actualisation manuelle (icone de la carte SmartThings) : une seule requete pour toutes les familles.
  function actualiser(cb) {
    if (attenteActu) { attenteActu.push(cb); return; }
    attenteActu = [cb];
    rev++;
    APP.api("POST", "/api/smartthings/appareils/actualiser", {}, (err, d) => {
      const avant = signature(), l = attenteActu;
      attenteActu = null;
      if (d && Array.isArray(d.appareils)) { appareils = d.appareils; panne = d.panne || null; if (APP.stCompte) APP.stCompte.majCloud(d.cloud); existe = true; }
      apresLecture(avant);
      l.forEach((f, i) => f(i === 0 ? err : null)); // erreur signalee une fois
    });
  }
  function demarrer() { if (!timer) timer = setInterval(() => { if (!document.hidden) charger(true); }, 15000); }
  function arreter() { if (timer) { clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", () => { if ((vue || fen) && !document.hidden) charger(true); });

  APP.surVue((name) => {
    const propre = /^st-/.test(name) && FAMILLES.some((f) => "st-" + f.cle === name);
    $("viewSt").className = "view" + (propre ? "" : " hidden");
    vue = propre ? name : null;
    if (propre) { APP.stCompte.charger(); rendreVue(); }
    if (propre || name === "electro") { demarrer(); charger(true); } else if (!fen) arreter();
  }, 20);
  FAMILLES.forEach((f) => {
    if (!f.dans) APP.nav.categorie({ key: vueDe(f), label: f.libelle, count: () => (de(f.cle).length || undefined) });
    APP.stCompte.famille({ cle: f.cle, libelle: f.libelle, dans: f.dans, existe: () => de(f.cle).length > 0,
      panne: () => (FAMILLES.filter((x) => de(x.cle).length)[0] === f ? panne : null), // panne affichee une fois
      charger: () => charger(false), actualiser: actualiser, appareils: () => de(f.cle).map(resume), ouvrir: () => APP.nav.vue(vueDe(f)), detail: ouvrirDetail,
      tuiles: (box) => tuiles(f.cle, box) });
  });
  APP.stCompte.surChangement((operation) => { if (vue) rendreVue(); if (operation) charger(true); });
  charger(true);
})();
// FIN
