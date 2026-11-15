// @zone pieces | Fenêtre « Pièces » (V1.4, préfixe pg-, cadre et classes hb- et np- des fenêtres Hubs et Nouvelle pièce) : liste de toutes les pièces (du hub et locales) à gauche,
// modification à droite (nom, icône, appareils du hub et indépendants), suppression en deux appuis avec pièce de destination ; GET /api/pieces, POST /api/pieces/:id/modifier et /supprimer.
// Ouverte par APP.homeEdite(id) (crayon ou appui long sur une carte de pièce de l'accueil) et par le crayon du volet Pièces du menu (pieces.js). Aucune marque.
// Appareil du hub déjà dans la pièce : cadenas (le hub n'a pas de « sans pièce » : le ranger dans une autre pièce pour le retirer). Rien n'est renvoyé ni défait.
(function () {
  const el = APP.el, P = APP.pieces;
  const s = (k) => (k > 1 ? "s" : "");
  let root = null, body = null, vue = "form", etat = null, chargeErr = "", sel = null;
  let nom = "", icone = null, ajout = {}, locaux = null, arme = null, armeT = null, dest = null, envoi = false, erreur = "", info = "";

  const cible = () => (etat && etat.cibles ? etat.cibles.find((c) => !c.panne) || etat.cibles[0] || null : null);
  const independants = () => (etat && Array.isArray(etat.independants) ? etat.independants : []);
  // Toutes les pièces : {id, nom, icone, locale, total (appareils du hub), ind (indépendants), creeeIci}
  function pieces() {
    const c = cible(), l = [];
    if (c && !c.panne) c.pieces.forEach((p) => l.push({ id: p.id, nom: p.nom, icone: p.icone, locale: false, total: p.total || 0, onoff: p.appareils || 0, ind: p.independants || 0, creeeIci: p.creeeIci }));
    ((etat && etat.locales) || []).forEach((p) => l.push({ id: p.id, nom: p.nom, icone: p.icone, locale: true, total: 0, onoff: 0, ind: p.independants || 0 }));
    return l.sort((a, b) => a.nom.localeCompare(b.nom));
  }
  const piece = () => pieces().find((p) => p.id === sel) || null;
  function bouton(cls, texte, fn) { const b = el("button", cls, texte); b.onclick = fn; return b; }
  function desarmer() { arme = null; dest = null; clearTimeout(armeT); }
  // Formulaire remis à l'état de la pièce choisie
  function initForm() {
    const p = piece();
    nom = p ? p.nom : ""; icone = null; ajout = {}; locaux = null; desarmer();
  }
  // garder : saisie gardée (erreur) ; reinit : formulaire remis à l'état relu (après un envoi réussi)
  function charger(garder, reinit) {
    if (!garder) { etat = null; chargeErr = ""; rendre(); }
    APP.api("GET", "/api/pieces", null, (err, d) => {
      if (!root) return;
      if (err || !d || !Array.isArray(d.cibles)) { chargeErr = err || "Lecture impossible."; rendre(); return; }
      etat = d; chargeErr = "";
      const l = pieces();
      if (!l.some((p) => p.id === sel)) { sel = l.length ? l[0].id : null; initForm(); }
      else if (!garder || reinit) initForm();
      rendre();
    });
  }
  function choisir(id) { if (envoi) return; sel = id; info = ""; erreur = ""; initForm(); rendre(); }

  // ---------- état du formulaire ----------
  const hubDans = () => { const c = cible(); return c && sel ? c.appareils.filter((a) => a.piece && a.piece.id === sel) : []; };
  const indDans = () => independants().filter((a) => a.piece && a.piece.id === sel);
  const locauxVoulus = () => (locaux ? independants().filter((a) => locaux[a.id]) : indDans());
  function changements() {
    const p = piece();
    if (!p) return { n: 0 };
    const n2 = P.propre(nom), avant = new Set(indDans().map((a) => a.id)), apres = new Set(locauxVoulus().map((a) => a.id));
    const ind = locaux ? [...apres].filter((i) => !avant.has(i)).length + [...avant].filter((i) => !apres.has(i)).length : 0;
    const hub = Object.keys(ajout).length;
    const nomIc = (n2 !== p.nom ? 1 : 0) + (icone !== null && icone !== p.icone ? 1 : 0);
    return { n: nomIc + hub + ind, nomIc, hub, ind, promue: p.locale && hub > 0 };
  }
  function verdict() {
    const c = cible(), p = piece(), n2 = P.propre(nom);
    if (!n2) return { ok: false, err: "Le nom ne peut pas être vide." };
    if ([...n2].length > c.max) return { ok: false, err: "Nom trop long : " + c.max + " caractères au plus." };
    const meme = pieces().find((q) => q.id !== p.id && P.cle(q.nom) === P.cle(n2));
    if (meme) return { ok: false, err: "Une pièce « " + meme.nom + " » existe déjà." };
    if (P.cle(n2) === P.cle("Autres") && P.cle(p.nom) !== P.cle("Autres")) return { ok: false, err: "« Autres » est réservé à la pièce par défaut." };
    return { ok: true, nom: n2 };
  }

  // ---------- rendu ----------
  function rendreListe() {
    const lp = el("div", "pg-lp");
    pieces().forEach((p) => {
      const b = el("button", "pg-lpi" + (p.id === sel ? " sel" : ""));
      const ic = el("span", "pg-lic");
      if (p.icone && P.dessinees([p.icone]).length) ic.innerHTML = P.svg(p.icone, 20);
      b.appendChild(ic);
      b.appendChild(el("span", "pg-lnom", p.nom));
      const n = p.total + p.ind;
      b.appendChild(el("span", "pg-n" + (n ? "" : " vide"), p.locale ? (n ? n + " · locale" : "locale") : (n ? String(n) : "vide")));
      b.disabled = envoi;
      b.onclick = () => choisir(p.id);
      lp.appendChild(b);
    });
    const nv = bouton("pg-lpi pg-nouv", "+ Nouvelle pièce", () => { if (envoi) return; fermer(); P.ouvrir(); });
    nv.disabled = envoi;
    lp.appendChild(nv);
    return lp;
  }
  function ligne(liste, a, opt) {
    const b = el("button", "np-app" + (opt.on ? " sel" : "") + (opt.ind ? " np-ind" : "") + (opt.verrou ? " pg-verrou" : ""));
    if (opt.verrou) { const v = el("span", "pg-lock"); v.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'; b.appendChild(v); }
    else b.appendChild(el("span", "np-case", opt.on ? "✓" : ""));
    b.appendChild(el("span", "np-anom", a.nom));
    if (opt.dep) b.appendChild(el("span", "np-dep" + (opt.ko ? " ko" : ""), opt.dep));
    if (opt.ind) b.appendChild(el("span", "pg-orig", a.genre ? a.genre + " · " + a.origine : a.origine));
    b.disabled = !!envoi;
    if (opt.verrou) { b.tabIndex = -1; b.setAttribute("aria-disabled", "true"); } else b.onclick = opt.fn;
    liste.appendChild(b);
  }
  function rendreAppareils(d) {
    const c = cible(), p = piece();
    d.appendChild(el("label", "hb-lab", "Appareils de la pièce"));
    const liste = el("div", "np-liste");
    const sec = (t) => liste.appendChild(el("div", "hb-sec np-sec", t));
    const basculeInd = (a) => () => {
      if (!locaux) { locaux = {}; indDans().forEach((x) => { locaux[x.id] = true; }); }
      if (locaux[a.id]) delete locaux[a.id]; else locaux[a.id] = true;
      desarmer(); erreur = ""; rendre();
    };
    const basculeHub = (a) => () => { if (ajout[a.id]) delete ajout[a.id]; else ajout[a.id] = true; desarmer(); erreur = ""; rendre(); };
    const indOn = (a) => (locaux ? !!locaux[a.id] : !!(a.piece && a.piece.id === sel));
    // Dans cette pièce
    const hd = hubDans(), id0 = independants().filter((a) => a.piece && a.piece.id === sel);
    if (hd.length || id0.length) {
      sec("Dans cette pièce");
      hd.forEach((a) => ligne(liste, a, { on: true, verrou: true, dep: a.joignable ? "" : "injoignable", ko: !a.joignable }));
      id0.forEach((a) => ligne(liste, a, { on: indOn(a), ind: true, fn: basculeInd(a) }));
    }
    // Autres (sans pièce), puis dans une autre pièce
    const hSans = c.appareils.filter((a) => !a.piece), iSans = independants().filter((a) => !a.piece);
    if (hSans.length || iSans.length) {
      sec("Autres (sans pièce)");
      hSans.forEach((a) => ligne(liste, a, { on: !!ajout[a.id], dep: a.joignable ? "" : "injoignable", ko: !a.joignable, fn: basculeHub(a) }));
      iSans.forEach((a) => ligne(liste, a, { on: indOn(a), ind: true, fn: basculeInd(a) }));
    }
    const hAut = c.appareils.filter((a) => a.piece && a.piece.id !== sel), iAut = independants().filter((a) => a.piece && a.piece.id !== sel);
    if (hAut.length || iAut.length) {
      sec("Dans une autre pièce");
      hAut.forEach((a) => ligne(liste, a, { on: !!ajout[a.id], dep: ajout[a.id] ? "quittera " + a.piece.nom : a.piece.nom, fn: basculeHub(a) }));
      iAut.forEach((a) => ligne(liste, a, { on: indOn(a), ind: true, dep: indOn(a) ? "quittera " + (a.piece.nom || "sa pièce") : a.piece.nom || "pièce du hub", fn: basculeInd(a) }));
    }
    if (!liste.firstChild) liste.appendChild(el("div", "hb-note", "Aucun appareil."));
    d.appendChild(liste);
    if (p.total > p.onoff) d.appendChild(el("div", "np-aide", "+ " + (p.total - p.onoff) + " autre" + s(p.total - p.onoff) + " appareil" + s(p.total - p.onoff) + " du hub (télécommande…)."))
  }
  function rendreForm() {
    const box = el("div", ""), c = cible();
    if (chargeErr) { box.appendChild(el("div", "hb-err", chargeErr)); box.appendChild(bouton("b-small hb-large", "Réessayer", () => charger())); return box; }
    if (!etat) { box.appendChild(el("div", "hb-note", "Lecture des pièces…")); return box; }
    if (!c) { box.appendChild(el("div", "hb-err", "Aucun hub connecté ne permet de gérer les pièces. Connectez un hub (fenêtre Hubs, en touchant l'état en haut de l'écran).")); return box; }
    if (c.panne) {
      box.appendChild(el("div", "hb-err", (c.hub || c.nom) + " : " + c.panne + " Les pièces ne peuvent pas être modifiées pour l'instant."));
      box.appendChild(bouton("b-small hb-large", "Réessayer", () => charger()));
      return box;
    }
    if (etat.rangement && etat.rangement.illisible) box.appendChild(el("div", "hb-err", "Le fichier des pièces locales (donnees/pieces.json) est illisible : les appareils indépendants ne peuvent pas être rangés."));
    const gl = el("div", "pg-gl");
    gl.appendChild(rendreListe());
    const p = piece();
    if (!p) {
      const vide = el("div", "pg-vide");
      vide.appendChild(el("div", "hb-note", "Aucune pièce. Touchez « + Nouvelle pièce » pour en créer une."));
      gl.appendChild(vide); box.appendChild(gl);
      if (info) box.appendChild(el("div", "hb-ok", info));
      return box;
    }
    const v = verdict(), grille = el("div", "np-grille pg-grille"), g = el("div", "np-col"), d = el("div", "np-col");
    // Nom
    g.appendChild(el("label", "hb-lab", "Nom"));
    const inp = el("input", "hb-in");
    inp.id = "pgNom"; inp.value = nom; inp.maxLength = c.max; inp.disabled = envoi; inp.autocomplete = "off";
    inp.oninput = () => { nom = inp.value; desarmer(); erreur = ""; info = ""; majNom(); majPied(); };
    g.appendChild(inp);
    const aide = el("div", "np-aide" + (v.err ? " err" : ""), v.err || (p.locale ? APP.lieu("Pièce locale : sur cet appareil seulement.") : "Visible aussi dans l'application du hub."));
    aide.id = "pgAideNom";
    g.appendChild(aide);
    // Icône (icône du hub hors des propositions : gardée tant qu'aucune n'est choisie)
    const actuelle = icone !== null ? icone : p.icone;
    g.appendChild(el("label", "hb-lab", "Icône" + (actuelle ? " : " + P.nomIcone(actuelle) : ""))); // V1.6 : nom de l'icône choisie
    const ics = el("div", "np-ics");
    P.dessinees(c.icones).forEach((k) => {
      const b = el("button", "np-ic" + (k === actuelle ? " sel" : ""));
      b.innerHTML = P.svg(k, 26); b.title = P.nomIcone(k); b.setAttribute("aria-label", P.nomIcone(k)); b.disabled = envoi;
      b.onclick = () => { icone = k; desarmer(); info = ""; rendre(); };
      ics.appendChild(b);
    });
    g.appendChild(ics);
    if (!actuelle && !p.locale) g.appendChild(el("div", "np-aide", "Icône actuelle du hub gardée (elle n'est pas parmi celles proposées)."));
    const ou = el("div", "hb-bloc np-ou"), l = el("div", "hb-ligne");
    l.appendChild(el("span", "hb-lib", p.locale ? "Pièce locale" : "Pièce du hub"));
    l.appendChild(el("span", "hb-val", p.locale ? APP.lieu("sur cet appareil") : (c.hub || c.nom) + (p.creeeIci ? " · créée ici" : "")));
    ou.appendChild(l); g.appendChild(ou);
    const droite = el("div", "pg-droite");
    if (arme === "suppr") droite.appendChild(rendreSuppression());
    else { rendreAppareils(d); grille.appendChild(g); grille.appendChild(d); droite.appendChild(grille); }
    gl.appendChild(droite);
    box.appendChild(gl);
    const pied = el("div", "np-pied");
    pied.id = "pgPied";
    box.appendChild(pied);
    remplirPied(pied);
    if (info) box.appendChild(el("div", "hb-ok", info));
    return box;
  }
  function majNom() {
    const a = document.getElementById("pgAideNom"), p = piece();
    if (!a || !p) return;
    const v = verdict();
    a.className = "np-aide" + (v.err ? " err" : "");
    a.textContent = v.err || (p.locale ? APP.lieu("Pièce locale : sur cet appareil seulement.") : "Visible aussi dans l'application du hub.");
  }
  function majPied() { const p = document.getElementById("pgPied"); if (p) { p.innerHTML = ""; remplirPied(p); } }
  function armer(quoi) { arme = quoi; clearTimeout(armeT); armeT = setTimeout(() => { arme = null; dest = null; if (root && vue === "form") rendre(); }, 8000); }

  // Suppression : résumé, pièce de destination (exigée et du hub s'il reste des appareils du hub ; sinon facultative), confirmation
  function destinations() {
    const p = piece(), autres = pieces().filter((q) => q.id !== p.id);
    return p.total > 0 ? autres.filter((q) => !q.locale) : autres;
  }
  function rendreSuppression() {
    const p = piece(), nh = p.total, ni = p.ind, r = el("div", "pg-resume");
    r.id = "pgSuppression";
    r.appendChild(el("div", "pg-stitre", "Supprimer « " + p.nom + " »" + (p.locale ? " ?" : " du hub (et de son application) ?")));
    if (nh || ni) {
      const quoi = [nh ? nh + " appareil" + s(nh) + " du hub" : "", ni ? ni + " appareil" + s(ni) + " indépendant" + s(ni) : ""].filter(Boolean).join(" et ");
      r.appendChild(el("div", "pg-l", quoi + " iront dans :"));
      const ch = el("div", "pg-dest"), l = destinations();
      if (!nh) ch.appendChild(bouton(dest === null ? "sel" : "", "Autres", () => { dest = null; armer("suppr"); rendre(); }));
      l.forEach((q) => ch.appendChild(bouton(dest === q.id ? "sel" : "", q.nom, () => { dest = q.id; armer("suppr"); rendre(); })));
      r.appendChild(ch);
      if (nh && !l.length) r.appendChild(el("div", "np-aide err", "Aucune autre pièce du hub : créez-en une d'abord."));
      else if (nh && !dest) r.appendChild(el("div", "np-aide", "Choisissez une pièce du hub : les appareils du hub n'ont pas de « sans pièce »."));
    } else r.appendChild(el("div", "pg-l", "La pièce est vide."));
    if (nh) r.appendChild(el("div", "pg-l", "Ses appareils du hub y seront rangés d'abord ; la pièce n'est supprimée que vide."));
    r.appendChild(el("div", "pg-l", p.locale ? "Pièce locale : rien n'est envoyé au hub." : "Plan de la pièce oublié. Rien d'autre n'est supprimé."));
    return r;
  }
  function remplirSuppression(pied) {
    const nh = piece().total;
    pied.appendChild(el("div", "hb-note", "8 secondes pour confirmer."));
    pied.appendChild(bouton("b-light np-annuler", "Annuler", () => { desarmer(); rendre(); }));
    const go = bouton("b-main np-go pg-confirme", "Confirmer la suppression", supprimer);
    go.disabled = nh > 0 && !dest;
    pied.appendChild(go);
  }
  function remplirPied(pied) {
    const p = piece(), ch = changements(), v = verdict();
    if (envoi) {
      pied.appendChild(el("div", "hb-note", envoi));
      const b = el("button", "b-main np-go", "Envoi…"); b.disabled = true; pied.appendChild(b);
      return;
    }
    if (arme === "suppr") { remplirSuppression(pied); return; }
    const sup = bouton("pg-suppr", "Supprimer…", () => { if (envoi) return; dest = null; erreur = ""; info = ""; armer("suppr"); rendre(); });
    pied.appendChild(sup);
    if (arme === "promo" && v.ok) {
      pied.appendChild(el("div", "hb-note", "« " + v.nom + " » sera créée dans le hub (et son application), avec " + ch.hub + " appareil" + s(ch.hub) + " du hub. Confirmer ?"));
      pied.appendChild(bouton("b-light np-annuler", "Annuler", () => { desarmer(); rendre(); }));
      pied.appendChild(bouton("b-main np-go np-arme", "Confirmer", enregistrer));
      return;
    }
    const q = Object.keys(ajout).length;
    let note = p.locale ? APP.lieu("Appareils indépendants rangés sur cet appareil. Un appareil du hub coché crée la pièce dans le hub.") : "Cadenas : appareil du hub, à ranger dans une autre pièce pour le retirer.";
    if (q && !p.locale) note = "Les appareils du hub cochés rejoignent cette pièce (ils quittent la leur).";
    pied.appendChild(el("div", "hb-note", note));
    const b = bouton("b-main np-go", ch.n ? "Enregistrer (" + ch.n + " changement" + s(ch.n) + ")" : "Enregistrer", () => {
      if (!verdict().ok || !changements().n) return;
      if (changements().promue) { armer("promo"); rendre(); return; }
      enregistrer();
    });
    b.disabled = !v.ok || !ch.n;
    pied.appendChild(b);
  }

  // ---------- envois (une seule demande ; jamais renvoyée ni défaite) ----------
  function compteRendu(d, debut) {
    let t = debut;
    if (d.deplaces && d.deplaces.length) t += " " + d.deplaces.length + " appareil" + s(d.deplaces.length) + " du hub rangé" + s(d.deplaces.length) + ".";
    if (d.ranges && d.ranges.length) t += " Appareils indépendants rangés.";
    return t;
  }
  function enregistrer() {
    const p = piece(), v = verdict(), ch = changements();
    if (!v.ok || envoi || !ch.n) return;
    desarmer(); envoi = ch.promue ? "Création de la pièce dans le hub…" : p.locale ? "Enregistrement…" : "Envoi au hub…"; erreur = ""; info = ""; rendre();
    const corps = { adapter: cible().adapter, nom: v.nom, icone: icone, ajouter: Object.keys(ajout) };
    if (locaux) corps.locaux = locauxVoulus().map((a) => a.id);
    APP.api("POST", "/api/pieces/" + encodeURIComponent(p.id) + "/modifier", corps, (err, d) => {
      envoi = false;
      if (!root) { APP.refresh(); return; }
      if (err || !d || !d.piece) { erreur = err || "Réponse illisible."; charger(true); APP.refresh(); return; }
      sel = d.piece.id;
      let t = compteRendu(d, d.promue ? "« " + d.piece.nom + " » est maintenant une pièce du hub." : "Pièce « " + d.piece.nom + " » enregistrée" + (d.confirmee ? "." : " (confirmée après vérification)."));
      if (d.echecs && d.echecs.length) erreur = "Non rangé" + s(d.echecs.length) + " : " + d.echecs.map((a) => a.nom + " (" + String(a.motif).replace(/\.$/, "") + ")").join(", ") + ". Rien n'a été annulé ni renvoyé.";
      info = t;
      charger(true, true); APP.refresh();
    });
  }
  function supprimer() {
    const p = piece(), nh = p.total;
    if (envoi || (nh > 0 && !dest)) return;
    const d0 = dest;
    desarmer(); envoi = p.locale ? "Suppression…" : nh ? "Rangement des appareils, puis suppression dans le hub…" : "Suppression dans le hub…"; erreur = ""; info = ""; rendre();
    APP.api("POST", "/api/pieces/" + encodeURIComponent(p.id) + "/supprimer", { adapter: cible().adapter, confirm: true, destination: d0 }, (err, d) => {
      envoi = false;
      if (!root) { APP.refresh(); return; }
      if (d && d.supprimee === true) {
        info = "Pièce « " + d.piece.nom + " » supprimée" + (d.confirmee ? "" : " (confirmée après vérification)") + "." + (d.destination ? " Ses appareils sont dans « " + d.destination.nom + " »." : "");
        sel = d.destination ? d.destination.id : null;
      } else if (d && d.supprimee === false) {
        erreur = d.message + (d.echecs && d.echecs.length ? " Non rangé" + s(d.echecs.length) + " : " + d.echecs.map((a) => a.nom).join(", ") + "." : "") + " Rien n'a été renvoyé.";
      } else erreur = err || "Réponse illisible.";
      charger(true, d && d.supprimee === true); APP.refresh();
    });
  }

  const AIDE = [
    { titre: "Ranger un appareil", lignes: [
      "Chaque appareil montre sa pièce : pastille dans le panneau de commande (bulle sélectionnée), à côté du titre de sa fenêtre (lave-linge, SmartThings), sous son nom dans « Tous » et les catégories.",
      "Touchez la pastille : choisissez une pièce, puis « Ranger dans … ». Plusieurs bulles sélectionnées se rangent ensemble.",
      "« Autres » : pièce par défaut des appareils sans pièce (nom réservé). Un appareil du hub déjà rangé ne peut aller que dans une autre pièce.",
      "Le dessin de chaque appareil indique son type (lumière, prise, lave-linge, traceur…) ; la fenêtre « Ranger » indique aussi son origine (hub ou SmartThings).",
    ] },
    { titre: "Modifier une pièce", lignes: [
      "1. Sur l'accueil, touchez le crayon d'une carte de pièce (ou faites un appui long sur la carte) ; ou, dans le menu, le crayon en bas de la section Pièces.",
      APP.lieu("2. À gauche, la liste de toutes les pièces : touchez-en une. « locale » : pièce gardée sur cet appareil seulement."),
      "3. Changez le nom ou l'icône, cochez les appareils à y ranger, puis touchez « Enregistrer ».",
      "Un appareil du hub déjà dans la pièce porte un cadenas : pour le retirer, rangez-le dans une autre pièce (le hub ne permet pas de retirer un appareil de sa pièce).",
      APP.lieu("Les appareils indépendants (lave-linge, appareils SmartThings, caméras) se rangent sur cet appareil seulement : rien n'est envoyé au hub. Décochez-les pour les retirer."),
      "Cocher un appareil du hub dans une pièce locale crée la pièce dans le hub (confirmation demandée).",
    ] },
    { titre: "Supprimer une pièce", lignes: [
      "Touchez « Supprimer… », relisez le résumé et choisissez où vont ses appareils, puis « Confirmer la suppression » (8 secondes pour confirmer).",
      "Les appareils du hub ne peuvent aller que dans une autre pièce du hub : ils y sont rangés d'abord ; la pièce n'est supprimée que vide. S'il en reste, rien n'est supprimé et la fenêtre le dit.",
      "Les appareils indépendants suivent la pièce choisie, ou vont dans « Autres ».",
      "Une pièce du hub supprimée disparaît aussi de l'application du hub ; son plan est oublié.",
    ] },
    { titre: "Si quelque chose ne va pas", lignes: [
      "Hub injoignable : rien n'est modifié ni supprimé, un message l'indique.",
      "Chaque demande part une seule fois : si le hub ne répond pas, la fenêtre relit les pièces pour savoir ce qui a été fait, sans jamais renvoyer.",
      "« Résultat inconnu » : rouvrez la fenêtre et vérifiez la pièce avant de recommencer.",
    ] },
  ];
  function rendreAide() {
    const box = el("div", "");
    box.appendChild(bouton("b-small hb-retour", "← Retour", () => { vue = "form"; rendre(); }));
    AIDE.forEach((x) => {
      box.appendChild(el("div", "hb-sec", x.titre));
      const b = el("div", "hb-bloc");
      x.lignes.forEach((l) => b.appendChild(el("p", "hb-p", l)));
      box.appendChild(b);
    });
    return box;
  }
  function rendre() {
    if (!root) return;
    body.innerHTML = "";
    body.appendChild(vue === "aide" ? rendreAide() : rendreForm());
    if (erreur && vue === "form") body.appendChild(el("div", "hb-err", erreur));
    const f = root.querySelector(".pg-fermer");
    if (f) f.disabled = !!envoi;
  }
  function fermer() {
    if (!root || envoi) return;
    desarmer();
    document.body.removeChild(root); root = null; body = null;
    etat = null; sel = null; erreur = ""; info = ""; vue = "form";
  }
  function ouvrir(id) {
    if (root) { if (id) choisir(id); return; }
    root = el("div", "hb-scrim");
    root.id = "piecesGestion";
    root.onclick = (e) => { if (e.target === root) fermer(); };
    const panel = el("div", "hb-panel pg-panel"), head = el("div", "hb-head"), ics = el("div", "hb-ics");
    head.appendChild(el("div", "hb-titre", "Pièces"));
    const ic = (t, titre, fn, cls) => { const b = el("button", "hb-ic" + (cls ? " " + cls : ""), t); b.title = titre; b.setAttribute("aria-label", titre); b.onclick = fn; ics.appendChild(b); };
    ic("?", "Aide", () => { if (envoi) return; vue = vue === "aide" ? "form" : "aide"; rendre(); });
    ic("×", "Fermer", fermer, "pg-fermer");
    head.appendChild(ics);
    body = el("div", "hb-body");
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    vue = "form"; sel = id || null; info = ""; charger();
  }
  APP.piecesGestion = { ouvrir: ouvrir };
  // Accueil : crayon et appui long sur une carte de pièce (home.js) ; accueil reconstruit pour afficher les crayons
  APP.homeEdite = (id) => ouvrir(id);
  APP.homeRafraichir();
})();
// FIN
