// @zone pieces | Pièces dans l'accueil, le menu et la vue d'une pièce (V1.4) : GET /api/pieces/liste relu avec chaque actualisation (crochet APP.surActualisation, ordre 10) ;
// pièces sans lumière ni prise (locales ou du hub) ajoutées à l'accueil et au menu, appareils indépendants comptés (APP.nav.piecesEnPlus, menu.js) ;
// vue d'une pièce : ses appareils indépendants (#piecesInd, avant le plan), chacun ouvre sa vue habituelle (clé « vue » de l'adaptateur). APP.piecesListe.
(function () {
  const el = APP.el;
  let signature = "";
  APP.piecesListe = null;
  function lire() {
    APP.api("GET", "/api/pieces/liste", null, (err, d) => {
      if (err || !d || !Array.isArray(d.pieces)) return; // liste précédente gardée
      const autres = Array.isArray(d.autres) ? d.autres : [];
      const sig = JSON.stringify([d.pieces, autres]);
      if (sig === signature) return;
      signature = sig; APP.piecesListe = d.pieces; APP.piecesAutres = autres;
      APP.render();
    });
  }
  APP.surActualisation(lire, 10);
  APP.piecesAutres = [];
  APP.nav.piecesEnPlus(() => (APP.piecesListe || []).filter((p) => p.nom).map((p) => ({ key: p.id, label: p.nom, independants: p.independants.length }))
    .concat([{ key: "none", label: "Autres", independants: APP.piecesAutres.length }]));

  // Vue d'une pièce : appareils indépendants rangés dans la pièce (sans commande ici : chacun ouvre sa vue)
  function ouvrirVue(a) {
    if (a.vue === "home") APP.nav.home();
    else if (a.vue) APP.nav.vue(a.vue);
  }
  function rendreVue() {
    const tiles = document.getElementById("tiles");
    if (!tiles) return;
    let box = document.getElementById("piecesInd");
    if (!box) { box = el("div", "pl-ind"); box.id = "piecesInd"; tiles.parentNode.insertBefore(box, tiles); }
    const vueP = APP.view === "lights" && APP.room && APP.room !== "all" && !APP.cat;
    const p = vueP && APP.room !== "none" && (APP.piecesListe || []).find((x) => x.id === APP.room);
    const l = p ? p.independants : vueP && APP.room === "none" ? APP.piecesAutres : [];
    const sig = l.map((a) => a.id + ":" + a.nom).join("|");
    if (box.dataset.sig === sig && box.dataset.vis === String(!!l.length)) return;
    box.dataset.sig = sig; box.dataset.vis = String(!!l.length); box.innerHTML = "";
    box.className = "pl-ind" + (l.length ? "" : " hidden");
    if (!l.length) return;
    box.appendChild(el("div", "pl-titre", "Autres appareils de la pièce"));
    const r = el("div", "pl-ligne");
    l.forEach((a) => {
      const b = el("button", "pl-app", "");
      b.appendChild(el("span", "pl-nom", a.nom));
      b.appendChild(el("span", "pl-genre", a.genre ? a.genre + " · " + a.origine : a.origine));
      b.disabled = !a.vue;
      b.onclick = () => ouvrirVue(a);
      r.appendChild(b);
    });
    box.appendChild(r);
  }
  APP.onRender(rendreVue, 36);
})();
// FIN
