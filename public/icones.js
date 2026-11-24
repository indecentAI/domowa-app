// @zone equipements | Icônes des équipements (V2.1 étape icones ; cartes du 21/11, section 4) : pack Équipements (32 icônes en traits, rangées par thèmes : portes et fenêtres,
// éclairage, appareils, divers ; mêmes noms et même ordre que ICONES_EQUIPEMENTS de modules/equipements.mjs), icônes choisies (GET /api/equipements/icones : par équipement et par élément,
// une lampe a la même icône dans les vues Lumières et Équipements), feuille « Icône » (« Icône par défaut », puis la grille par thèmes ; toucher une icône l'applique aussitôt et
// ferme la feuille : POST /api/equipements/icone). Icônes des pièces et des scénarios : leurs propres packs (pieces.js, scenes.js), inchangés ici.
(function () {
  const el = APP.el;
  const PACK = [
    ["Portes et fenêtres", [
      ["porte", "Porte", '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16"/><circle cx="14.5" cy="12" r=".7"/>'],
      ["fenetre", "Fenêtre", '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>'],
      ["garage", "Porte de garage", '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-9h10v9M7 15h10M7 18h10"/>'],
      ["portail", "Portail", '<path d="M3 21V6M21 21V6M3 9h18M3 17h18M8 9v8M12 9v8M16 9v8"/>'],
      ["volet", "Volet", '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 7h16M4 11h16M4 15h16"/>'],
      ["store", "Store", '<path d="M4 4h16M6 4v11h12V4M6 8h12M6 12h12M12 15v4"/><circle cx="12" cy="20" r="1"/>'],
      ["baie", "Baie vitrée", '<rect x="2" y="4" width="20" height="16" rx="1.5"/><path d="M12 4v16M9 11v2M15 11v2"/>'],
      ["boite_lettres", "Boîte aux lettres", '<path d="M4 10a4 4 0 0 1 8 0v8H4z"/><path d="M8 6h8a4 4 0 0 1 4 4v8h-8M8 21v-3M16 6V3h3"/>'],
    ]],
    ["Éclairage", [
      ["ampoule", "Ampoule", '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'],
      ["plafonnier", "Plafonnier", '<path d="M12 3v4M5 14a7 7 0 0 1 14 0z"/><path d="M9 17l-.5 2M12 17.5V20M15 17l.5 2"/>'],
      ["lampadaire", "Lampadaire", '<path d="M8 3h8l2 6H6z"/><path d="M12 9v12M8 21h8"/>'],
      ["lampe_bureau", "Lampe de bureau", '<path d="M6 21h10M9 21l3-9 4-3"/><path d="M13 5l5 3-2.5 3.5-5-3z"/>'],
      ["applique", "Applique", '<path d="M5 6v12M5 12h4"/><path d="M9 8h8l2 8H9z"/>'],
      ["guirlande", "Guirlande", '<path d="M2 6c5 6 15 6 20 0"/><circle cx="6" cy="10" r="1.3"/><circle cx="12" cy="11.5" r="1.3"/><circle cx="18" cy="10" r="1.3"/><path d="M6 11.5v1.5M12 13v1.5M18 11.5v1.5"/>'],
      ["spot", "Spot", '<path d="M4 4h16"/><path d="M8 4v3l-2 7h12l-2-7V4"/><path d="M9 18l-1 2M12 18v3M15 18l1 2"/>'],
      ["ruban", "Ruban lumineux", '<rect x="2" y="9" width="20" height="6" rx="3"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/>'],
    ]],
    ["Appareils", [
      ["prise", "Prise", '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>'],
      ["tv", "Télévision", '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'],
      ["enceinte", "Enceinte", '<rect x="6" y="3" width="12" height="18" rx="2.5"/><circle cx="12" cy="14" r="3.2"/><path d="M12 7h.01"/>'],
      ["purificateur", "Purificateur", '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M9 8h6M9 11h6M9 14h6"/>'],
      ["ventilateur", "Ventilateur", '<circle cx="12" cy="10" r="1.5"/><path d="M12 8.5c0-4 4-5 4-2.5 0 2-2.5 3-4 4M13.3 10.8c3.5 2 2.5 6 .5 4.8-1.7-1-1.6-3.6-1.3-5.1M10.7 10.8c-3.5 2-6.4-.8-4.4-2 1.7-1 4.1.2 5.2 1.2M12 11.5V21M8 21h8"/>'],
      ["radiateur", "Radiateur", '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M7 5v13M11 5v13M15 5v13M5 18v2M19 18v2"/>'],
      ["lave_linge", "Lave-linge", '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="13" r="4.5"/><path d="M7.5 6.5h2"/>'],
      ["cafetiere", "Cafetière", '<path d="M6 3h12M7 3v4h10V3M8 7l1 4h6l1-4"/><path d="M5 21h14M8 21v-6h8v6M16 16h2v3h-2"/>'],
    ]],
    ["Divers", [
      ["capteur", "Capteur", '<rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="2.2"/>'],
      ["thermometre", "Thermomètre", '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>'],
      ["goutte", "Goutte", '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'],
      ["mouvement", "Mouvement", '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6 2.5 2v4M7 12l3-4h4l2 3 2 1M10.5 8 9 14"/>'],
      ["telecommande", "Télécommande", '<rect x="8" y="3" width="8" height="18" rx="3"/><path d="M12 7v3M12 14h.01M12 17h.01"/>'],
      ["bouton", "Bouton", '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="4"/>'],
      ["hub", "Hub", '<rect x="5" y="5" width="14" height="14" rx="7"/><path d="M12 9v6M9 12h6"/>'],
      ["cadenas", "Cadenas", '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2"/>'],
    ]],
  ];
  const PAR_NOM = {};
  PACK.forEach((t) => t[1].forEach((x) => { PAR_NOM[x[0]] = x; }));
  const svg = (nom, taille) => { const x = PAR_NOM[nom]; return x ? '<svg width="' + taille + '" height="' + taille + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + x[2] + "</svg>" : null; };
  let parEq = {}, parElement = {}, lu = false, lecture = false, encore = false;
  // Une lecture à la fois ; une demande pendant une lecture est refaite ensuite (icône posée pendant une actualisation)
  function charger(cb) {
    if (lecture) { encore = true; return; }
    lecture = true;
    APP.api("GET", "/api/equipements/icones", null, (err, d) => {
      lecture = false;
      if (encore) { encore = false; charger(cb); return; }
      if (!err && d && d.equipements) {
        const avant = JSON.stringify(parElement);
        parEq = d.equipements; parElement = d.elements || {}; lu = true;
        if (JSON.stringify(parElement) !== avant && APP.render) APP.render(); // vue Lumières : icône des lampes
      }
      if (cb) cb(err);
    });
  }
  // Feuille « Icône » : titre, icône par défaut (dessin), icône actuelle (nom | null) ; choisir(nom | null) appelé au toucher (la feuille se ferme aussitôt)
  let feuille = null;
  function fermer() { if (feuille) { document.body.removeChild(feuille); feuille = null; document.removeEventListener("keydown", echap); } }
  function echap(e) { if (e.key === "Escape") fermer(); }
  function ouvrir(o) {
    fermer();
    const fond = el("div", "ic-fond"), f = el("div", "ic-feuille");
    fond.setAttribute("role", "dialog"); fond.setAttribute("aria-modal", "true"); fond.setAttribute("aria-label", "Icône : " + o.titre);
    fond.onclick = (e) => { if (e.target === fond) fermer(); };
    const h = el("div", "ic-tete"); h.appendChild(el("span", "ic-titre", "Icône : " + o.titre));
    const x = el("button", "ic-fermer", ""); x.setAttribute("aria-label", "Fermer"); x.onclick = fermer; h.appendChild(x);
    f.appendChild(h);
    const corps = el("div", "ic-corps");
    const def = el("button", "ic-defaut" + (o.actuelle ? "" : " sel"), "");
    def.innerHTML = o.defaut || ""; def.appendChild(el("span", "", "Icône par défaut"));
    def.onclick = () => { fermer(); if (o.actuelle) o.choisir(null); };
    corps.appendChild(def);
    PACK.forEach((t) => {
      corps.appendChild(el("div", "ic-theme", t[0]));
      const g = el("div", "ic-grille");
      t[1].forEach((ic) => {
        const b = el("button", "ic-ic" + (ic[0] === o.actuelle ? " sel" : ""), "");
        b.innerHTML = svg(ic[0], 26); b.title = ic[1]; b.setAttribute("aria-label", ic[1]); b.setAttribute("data-icone", ic[0]);
        b.onclick = () => { fermer(); if (ic[0] !== o.actuelle) o.choisir(ic[0]); };
        g.appendChild(b);
      });
      corps.appendChild(g);
    });
    f.appendChild(corps); fond.appendChild(f);
    document.body.appendChild(fond); feuille = fond;
    document.addEventListener("keydown", echap);
  }
  // Pose (ou retire) l'icône d'un équipement ; cb(err) ; les deux vues sont relues
  function poser(id, nom, cb) {
    APP.api("POST", "/api/equipements/icone", { id: id, icone: nom }, (err, d) => {
      if (err) { APP.banner(err, "warn"); if (cb) cb(err); return; }
      parEq = d.equipements || {};
      charger(); if (cb) cb(null);
    });
  }
  APP.icones = {
    PACK: PACK, svg: svg, charger: charger, ouvrir: ouvrir, fermer: fermer, poser: poser,
    equipement: (id) => parEq[id] || null,
    // Dessin choisi d'un élément (lampe de la vue Lumières), ou null (icône du type)
    element: (id, taille) => (parElement[id] ? svg(parElement[id], taille || 20) : null),
    lu: () => lu,
  };
  APP.surActualisation(() => { if (!lu) charger(); }, 55);
})();
// FIN
