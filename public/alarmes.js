// @zone equipements-vue | Bandeau d'alarme (V2.1 étape alarmes ; cartes du 21/11, section 3) : tant qu'une alarme dure (fuite, fumée, CO, gaz d'un équipement), bandeau rouge en haut
// de toutes les vues, sous l'en-tête (« Fuite détectée : Fuite lave-linge, Cellier, depuis 07:32 » ; plusieurs : « + N autres »). Un appui ouvre la configuration de l'équipement
// (vue Équipements, APP.equipements.montrer) ; la croix (zone de 44 px) le ferme pour cette alarme ; il revient à l'alarme suivante (autre équipement, ou même alarme revenue après sa fin).
// Lecture : GET /api/equipements/alarmes après chaque actualisation (APP.surActualisation, ordre 50 ; cache court des équipements côté serveur). Aucune commande, rien de gardé sur disque.
(function () {
  const el = APP.el;
  const MOTS = { fuite: "Fuite détectée", fumee: "Fumée détectée", monoxyde: "CO détecté", gaz: "Gaz détecté" };
  let liste = [], fermees = {}, b = null, lecture = false;
  // Clé d'une alarme : équipement, capacité et début connu (une alarme revenue après sa fin a un autre début ; sans heure : même clé tant qu'elle dure)
  const cle = (a) => a.id + "|" + a.cap + "|" + (a.depuis || "");
  function texte(a) {
    const h = a.depuis && APP.cartes ? APP.cartes.depuis(a.depuis) : "";
    return (MOTS[a.cap] || "Alarme") + " : " + a.nom + (a.piece ? ", " + a.piece : "") + (h ? ", " + h : "");
  }
  // Position sous l'en-tête (hauteur variable : téléphone, encoche)
  function placer() {
    if (!b) return;
    const h = document.querySelector("header");
    b.style.top = Math.round((h ? h.getBoundingClientRect().bottom : 0) + 8) + "px";
  }
  function rendre() {
    const visibles = liste.filter((a) => !fermees[cle(a)]);
    if (!visibles.length) { if (b) b.classList.add("hidden"); return; }
    if (!b) {
      b = el("div", "al-bandeau hidden"); b.id = "alarme"; b.setAttribute("role", "alert");
      const t = el("button", "al-texte", ""), x = el("button", "al-fermer", "");
      x.setAttribute("aria-label", "Fermer l'alarme");
      t.onclick = () => { const a = b._a; if (a && APP.equipements && APP.equipements.montrer) { APP.nav.vue("equip"); APP.equipements.montrer(a.id); } };
      x.onclick = (e) => { e.stopPropagation(); const a = b._a; if (a) fermees[cle(a)] = true; rendre(); };
      b.appendChild(t); b.appendChild(x);
      document.body.appendChild(b);
      window.addEventListener("resize", placer);
    }
    const a = visibles[0];
    b._a = a;
    b.firstChild.textContent = texte(a) + (visibles.length > 1 ? " · + " + (visibles.length - 1) + (visibles.length > 2 ? " autres" : " autre") : "");
    b.setAttribute("data-id", a.id);
    b.classList.remove("hidden");
    placer();
  }
  function charger() {
    if (lecture) return;
    lecture = true;
    APP.api("GET", "/api/equipements/alarmes", null, (err, d) => {
      lecture = false;
      if (err || !d || !Array.isArray(d.alarmes)) return; // serveur ancien ou panne : bandeau inchangé
      liste = d.alarmes;
      // Fermetures oubliées pour les alarmes terminées (une alarme revenue s'affiche de nouveau)
      const actives = {};
      liste.forEach((a) => { actives[cle(a)] = true; });
      Object.keys(fermees).forEach((k) => { if (!actives[k]) delete fermees[k]; });
      rendre();
    });
  }
  APP.surActualisation(charger, 50);
  APP.alarmes = { charger: charger, liste: () => liste };
})();
// FIN
