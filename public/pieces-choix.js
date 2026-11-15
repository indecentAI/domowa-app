// @zone pieces | Pièce d'un appareil (V1.4) : pastille (icône et nom de sa pièce, « Autres » par défaut) et fenêtre « Ranger » (une pièce à toucher, puis un envoi) ;
// type d'appareil dessiné (lumière, prise, lave-linge, traceur...). Aucune route nouvelle : GET /api/pieces, POST /api/pieces/:id/modifier (ajouter : appareils du hub ; locaux : indépendants).
// Un appareil du hub déjà dans une pièce ne peut pas aller dans « Autres » (le hub n'a pas de « sans pièce ») ; pièce locale + appareil du hub : créée dans le hub (confirmation).
(function () {
  const el = APP.el, AUTRES = "Autres";
  const S = (p) => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>";
  // Types d'appareils connus (clé -> dessin, libellé) ; « appareil » : tout autre type
  const TYPES = {
    lumiere: [S('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>'), "Lumière"],
    prise: [S('<circle cx="12" cy="12" r="8.5"/><circle cx="8.8" cy="12" r="1.3"/><circle cx="15.2" cy="12" r="1.3"/>'), "Prise"],
    lave: [S('<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="13" r="4.5"/><path d="M7.5 6.5h2"/><path d="M10 13.5c1-.8 2-.8 4 0"/>'), "Lave-linge"],
    traceur: [S('<rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="2.2"/><path d="M8.5 3.5 7.5 5M15.5 3.5l1 1.5"/>'), "Traceur"],
    camera: [S('<rect x="3" y="7" width="13" height="10" rx="2.5"/><path d="m16 11 5-3v8l-5-3"/>'), "Caméra"],
    capteur: [S('<path d="M12 4v10"/><circle cx="12" cy="17" r="3"/><path d="M12 4a2 2 0 0 1 2 2v8.3"/><path d="M10 14.3V6a2 2 0 0 1 2-2"/>'), "Capteur"],
    appareil: [S('<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9h6M9 13h6"/>'), "Appareil"]
  };
  const AUTRES_SVG = S('<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M3 4h18v4H3z"/><path d="M10 12h4"/>');
  const CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>';
  const typeDe = (genre) => TYPES[genre] || TYPES.appareil;
  const s = (n) => (n > 1 ? "s" : "");
  const dessin = (k, t) => (k && APP.pieces && APP.pieces.dessinees([k]).length ? APP.pieces.svg(k, t) : AUTRES_SVG);

  // Pièce d'un appareil d'après les données déjà lues (appareils ON/OFF, GET /api/pieces/liste) : {id, nom, icone} ; null id : « Autres »
  function pieceDe(id) {
    const liste = APP.piecesListe || [];
    const d = APP.find ? APP.find(APP.devices || [], id) : null;
    if (d) {
      if (!d.room) return { id: null, nom: AUTRES, icone: null };
      const p = liste.find((x) => x.id === d.room.id);
      return { id: d.room.id, nom: d.room.name, icone: p ? p.icone : null };
    }
    for (const p of liste) if (p.independants.some((a) => a.id === id)) return { id: p.id, nom: p.nom, icone: p.icone };
    return { id: null, nom: AUTRES, icone: null };
  }
  // Type d'un appareil : lumière ou prise (appareils ON/OFF), sinon genre déclaré par son adaptateur (GET /api/pieces/liste)
  function genreDe(id) {
    const d = APP.find ? APP.find(APP.devices || [], id) : null;
    if (d) return d.kind === "light" ? "lumiere" : d.kind === "outlet" ? "prise" : "appareil";
    const tous = (APP.piecesAutres || []).concat(...(APP.piecesListe || []).map((p) => p.independants));
    const a = tous.find((x) => x.id === id);
    return a ? cleGenre(a.genre) : "appareil";
  }
  // Étiquette discrète « [icône] Salon » (tuiles)
  function etiquette(id) {
    const p = pieceDe(id), e = el("span", "pc-etiq" + (p.id === null ? " autres" : ""), "");
    e.innerHTML = '<span class="pc-etiqic">' + dessin(p.icone, 14) + "</span>";
    e.appendChild(el("span", "", p.nom));
    return e;
  }
  // Pastille « [icône] Salon › » : appui -> fenêtre « Ranger » pour ces appareils
  function pastille(ids, nom) {
    const l = [].concat(ids), ps = l.map(pieceDe), meme = ps.every((p) => p.id === ps[0].id);
    const b = el("button", "pc-pas" + (meme && ps[0].id === null ? " autres" : ""), "");
    b.innerHTML = '<span class="pc-pasic">' + (meme ? dessin(ps[0].icone, 18) : AUTRES_SVG) + '</span><span class="pc-pasnom"></span><span class="pc-chev">' + CHEVRON + "</span>";
    b.querySelector(".pc-pasnom").textContent = meme ? ps[0].nom : "Pièces différentes";
    b.title = "Ranger dans une pièce"; b.setAttribute("aria-label", "Pièce : " + (meme ? ps[0].nom : "différentes") + ". Ranger dans une pièce");
    b.onclick = (e) => { if (e && e.stopPropagation) e.stopPropagation(); ouvrir(l, nom); };
    return b;
  }

  // ---------- fenêtre « Ranger » ----------
  let root = null, body = null, etat = null, ids = [], titreNom = "", choix = undefined, envoi = false, erreur = "", arme = false, armeT = null;
  const cible = () => (etat && etat.cibles && etat.cibles[0]) || null;
  function pieces() {
    const c = cible(), l = [];
    if (c && !c.panne) c.pieces.forEach((p) => l.push({ id: p.id, nom: p.nom, icone: p.icone, locale: false, ind: p.independants || 0 }));
    ((etat && etat.locales) || []).forEach((p) => l.push({ id: p.id, nom: p.nom, icone: p.icone, locale: true, ind: p.independants || 0 }));
    return l.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }
  // Appareils demandés, avec leur nature et leur pièce actuelle (lecture fraîche)
  function appareils() {
    const c = cible(), hub = c ? c.appareils : [], ind = (etat && etat.independants) || [];
    return ids.map((id) => {
      const h = hub.find((a) => a.id === id);
      if (h) return { id, nom: h.nom, hub: true, piece: h.piece ? h.piece.id : null, genre: h.type === "light" ? "lumiere" : h.type === "outlet" ? "prise" : "appareil", origine: c.nom + (c.hub ? " (" + c.hub + ")" : "") };
      const a = ind.find((x) => x.id === id);
      if (a) return { id, nom: a.nom, hub: false, piece: a.piece ? a.piece.id : null, genre: cleGenre(a.genre), origine: a.origine };
      return null;
    }).filter(Boolean);
  }
  function cleGenre(g) {
    const k = String(g || "").toLowerCase();
    return k.indexOf("lave") === 0 ? "lave" : k.indexOf("cam") === 0 ? "camera" : /traceur/.test(k) ? "traceur" : /capteur/.test(k) ? "capteur" : "appareil";
  }
  function desarmer() { arme = false; clearTimeout(armeT); }
  function fermer() {
    if (!root || envoi) return;
    desarmer(); document.body.removeChild(root); root = null; body = null; etat = null; choix = undefined; erreur = "";
  }
  function ouvrir(l, nom) {
    if (root) return;
    ids = [].concat(l); titreNom = nom || ""; choix = undefined; erreur = ""; envoi = false; desarmer();
    root = el("div", "hb-scrim"); root.id = "pcFenetre";
    root.onclick = (e) => { if (e.target === root) fermer(); };
    const panel = el("div", "hb-panel pc-panel"), head = el("div", "hb-head"), ics = el("div", "hb-ics"), x = el("button", "hb-ic", "×");
    head.appendChild(el("div", "hb-titre", "Ranger"));
    x.title = "Fermer"; x.setAttribute("aria-label", "Fermer"); x.onclick = fermer; ics.appendChild(x); head.appendChild(ics);
    body = el("div", "hb-body pc-body");
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    body.appendChild(el("div", "hb-note", "Lecture des pièces…"));
    charger();
  }
  function charger() {
    APP.api("GET", "/api/pieces", null, (err, d) => {
      if (!root) return;
      if (err || !d) { erreur = err || "Réponse illisible."; etat = etat || { cibles: [], locales: [], independants: [] }; }
      else etat = d;
      rendre();
    });
  }
  function rendre() {
    if (!root) return;
    body.innerHTML = "";
    const aps = appareils(), ps = pieces(), c = cible();
    root.querySelector(".hb-titre").textContent = aps.length === 1 ? "Ranger « " + aps[0].nom + " »" : "Ranger " + aps.length + " appareils";
    // En-tête : type, origine, pièce actuelle
    const tete = el("div", "pc-tete");
    if (aps.length === 1) {
      const a = aps[0], t = typeDe(a.genre), ic = el("span", "pc-type", "");
      ic.innerHTML = t[0]; tete.appendChild(ic);
      tete.appendChild(el("span", "pc-desc", t[1] + " · " + a.origine));
    } else tete.appendChild(el("span", "pc-desc", aps.filter((a) => a.hub).length + " du hub, " + aps.filter((a) => !a.hub).length + " indépendant" + s(aps.filter((a) => !a.hub).length)));
    body.appendChild(tete);
    if (!aps.length) { body.appendChild(el("div", "hb-err", "Appareil introuvable : la liste a changé.")); return; }
    if (c && c.panne) body.appendChild(el("div", "hb-note", "Hub injoignable : ses pièces ne sont pas proposées."));
    const actuelle = aps.every((a) => a.piece === aps[0].piece) ? aps[0].piece : undefined;
    if (choix === undefined) choix = actuelle === undefined ? null : actuelle;
    const hubDansPiece = aps.some((a) => a.hub && a.piece);
    const grille = el("div", "pc-grille");
    const tuile = (id, nom, icone, sous, interdit) => {
      const b = el("button", "pc-p" + (choix === id ? " sel" : "") + (id === null ? " autres" : ""), "");
      b.innerHTML = '<span class="pc-pic">' + (id === null ? AUTRES_SVG : dessin(icone, 26)) + '</span><span class="pc-pnom"></span><span class="pc-psous"></span>';
      b.querySelector(".pc-pnom").textContent = nom;
      b.querySelector(".pc-psous").textContent = actuelle === id ? "actuelle" : sous;
      b.disabled = envoi || !!interdit;
      if (interdit) b.title = interdit;
      b.onclick = () => { choix = id; desarmer(); erreur = ""; rendre(); };
      grille.appendChild(b);
    };
    ps.forEach((p) => tuile(p.id, p.nom, p.icone, p.locale ? "locale" : ""));
    tuile(null, AUTRES, null, "par défaut", hubDansPiece ? "Le hub ne permet pas de retirer un appareil de sa pièce." : "");
    const nv = el("button", "pc-p pc-nouv", "");
    nv.innerHTML = '<span class="pc-pic">+</span><span class="pc-pnom">Nouvelle pièce</span><span class="pc-psous"></span>';
    nv.disabled = envoi;
    nv.onclick = () => { fermer(); if (APP.pieces) APP.pieces.ouvrir(); };
    grille.appendChild(nv);
    body.appendChild(grille);
    if (hubDansPiece) body.appendChild(el("div", "hb-note", "« Autres » : pièce par défaut des appareils sans pièce. Un appareil du hub déjà rangé se range seulement dans une autre pièce."));
    if (erreur) body.appendChild(el("div", "hb-err", erreur));
    const p = ps.find((x) => x.id === choix), promo = p && p.locale && aps.some((a) => a.hub);
    const b = el("button", "b-main hb-large pc-ok" + (arme ? " arme" : ""), "");
    const nomC = choix === null ? AUTRES : p ? p.nom : "";
    b.textContent = envoi ? "Envoi…" : choix === actuelle ? "Déjà dans « " + nomC + " »" : arme ? "Confirmer : « " + nomC + " » sera créée dans le hub" : "Ranger dans « " + nomC + " »";
    b.disabled = envoi || choix === actuelle || (choix !== null && !p);
    b.onclick = () => {
      if (promo && !arme) { arme = true; clearTimeout(armeT); armeT = setTimeout(() => { arme = false; rendre(); }, 8000); rendre(); return; }
      envoyer(p, aps);
    };
    body.appendChild(b);
  }
  const post = (id, corps) => new Promise((ok) => APP.api("POST", "/api/pieces/" + encodeURIComponent(id) + "/modifier", corps, (err, d) => ok({ err, d })));
  async function envoyer(p, aps) {
    if (envoi) return;
    desarmer(); envoi = true; erreur = ""; rendre();
    const c = cible(), adapter = c ? c.adapter : undefined, ind = (etat.independants || []);
    const hubIds = aps.filter((a) => a.hub && a.piece !== choix).map((a) => a.id), indIds = aps.filter((a) => !a.hub && a.piece !== choix).map((a) => a.id);
    const echecs = [];
    if (choix === null) {
      // « Autres » : chaque pièce d'origine relâche ses appareils indépendants (une demande par pièce)
      const parPiece = {};
      indIds.forEach((id) => { const a = ind.find((x) => x.id === id); (parPiece[a.piece.id] = parPiece[a.piece.id] || []).push(id); });
      for (const pid of Object.keys(parPiece)) {
        const q = pieces().find((x) => x.id === pid);
        if (!q) { echecs.push("pièce d'origine introuvable"); continue; }
        const r = await post(pid, { adapter, nom: q.nom, locaux: ind.filter((a) => a.piece && a.piece.id === pid && parPiece[pid].indexOf(a.id) < 0).map((a) => a.id) });
        if (r.err) echecs.push(r.err);
      }
    } else {
      const corps = { adapter, nom: p.nom, ajouter: hubIds };
      if (indIds.length) corps.locaux = ind.filter((a) => a.piece && a.piece.id === p.id).map((a) => a.id).concat(indIds);
      const r = await post(p.id, corps);
      if (r.err) echecs.push(r.err);
      else if (r.d && r.d.echecs && r.d.echecs.length) echecs.push("non rangé : " + r.d.echecs.map((a) => a.nom).join(", ") + ". Rien n'a été annulé ni renvoyé.");
    }
    envoi = false;
    APP.refresh();
    if (echecs.length) { erreur = echecs.join(" "); choix = undefined; charger(); return; }
    const nomC = choix === null ? AUTRES : p.nom;
    fermer();
    APP.banner((aps.length === 1 ? aps[0].nom + " rangé" : aps.length + " appareils rangés") + " dans « " + nomC + " ».", "ok");
  }

  APP.piecesChoix = { pieceDe: pieceDe, genreDe: genreDe, etiquette: etiquette, pastille: pastille, ouvrir: ouvrir, type: (g) => typeDe(g)[0], libelle: (g) => typeDe(g)[1], AUTRES: AUTRES };

  // Panneau des commandes (lumières, prises) : type et nom si un seul appareil, pièce à toucher (ranger)
  function panneau() {
    const c1 = document.querySelector(".q-c1");
    if (!c1) return;
    let box = document.getElementById("pcSel");
    if (!box) { box = el("div", "pc-sel"); box.id = "pcSel"; const h = c1.querySelector(".q-hint"); c1.insertBefore(box, h ? h.nextSibling : null); }
    const sel = APP.selIds ? APP.selIds() : [], ps = sel.map(pieceDe);
    const sig = sel.join(",") + "|" + ps.map((p) => p.id + ":" + p.nom + ":" + p.icone).join(",");
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig; box.innerHTML = "";
    if (!sel.length) return;
    // Une ligne : type dessiné et nom (ou nombre d'appareils), pastille de la pièce à droite
    const l = el("div", "pc-un"), d = sel.length === 1 ? APP.find(APP.devices, sel[0]) : null;
    if (d) {
      const g = d.kind === "light" ? "lumiere" : "prise", ic = el("span", "pc-type", "");
      ic.innerHTML = typeDe(g)[0]; ic.title = typeDe(g)[1]; ic.setAttribute("aria-label", typeDe(g)[1]);
      l.appendChild(ic); l.appendChild(el("span", "pc-unnom", d.name));
    } else l.appendChild(el("span", "pc-unnom pc-nb", sel.length + " appareils"));
    l.appendChild(pastille(sel, d ? d.name : ""));
    box.appendChild(l);
  }
  APP.onRender(panneau, 45);
})();
// FIN
