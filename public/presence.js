// @zone accueil equipements-vue | Carte « Présence » de l'accueil (V2.2 ha-localisation, décision du 24/11) : dans la ligne Actions (APP.homeActions, clé « presence » : rangée et masquable
// par « Organiser »), une icône par personne (initiale ; contour vert : à la maison), « N à la maison » ; toucher la carte : vue Équipements ; une icône : configuration de la personne
// (APP.equipements.montrer). Lecture : GET /api/equipements/presence après chaque actualisation (APP.surActualisation, ordre 57) ; zone seulement, jamais de coordonnées ; carte ajoutée
// à la première liste non vide (sans Home Assistant ni personne : aucune carte), accueil reconstruit quand la liste change. Rien de gardé, rien de journalisé.
(function () {
  let liste = [], sig = "", posee = false, lecture = false;
  // Initiale d'un nom venu du hub : une lettre ou un chiffre seulement (jamais de balisage dans l'icône)
  function initiale(n) { const m = /[\p{L}\p{N}]/u.exec(String(n || "")); return m ? m[0].toUpperCase() : "?"; }
  const icone = (n) => '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="16.5" text-anchor="middle" font-size="14" font-weight="600" fill="currentColor">' + initiale(n) + "</text></svg>";
  function ouvrir(id) { APP.nav.vue("equip"); if (id && APP.equipements && APP.equipements.montrer) APP.equipements.montrer(id); }
  function fabrique() {
    const n = liste.filter((p) => p.maison).length;
    const r = APP.homeFavoris({
      nom: "Présence", compte: liste.length ? (n ? n + " à la maison" : "Personne à la maison") : "", ouvrir: () => ouvrir(null),
      favoris: liste.map((p) => ({ icone: icone(p.nom), titre: p.nom + " : " + (p.zone || "inconnu"), clic: () => ouvrir(p.id) })),
    });
    r.boutons.forEach((b, i) => b.classList.toggle("maison", !!liste[i].maison));
    return r.w;
  }
  function charger() {
    if (lecture) return;
    lecture = true;
    APP.api("GET", "/api/equipements/presence", null, (err, d) => {
      lecture = false;
      if (err || !d || !Array.isArray(d.presence)) return; // serveur ancien ou panne : carte inchangée
      const s = JSON.stringify(d.presence);
      if (s === sig) return;
      sig = s; liste = d.presence;
      if (!posee) { if (!liste.length) return; posee = true; APP.homeActions(fabrique, "presence"); return; }
      if (APP.homeRafraichir) APP.homeRafraichir();
    });
  }
  APP.surActualisation(charger, 57);
  APP.presence = { charger, liste: () => liste, initiale };
  charger();
})();
// FIN
