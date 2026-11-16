// @zone distribution | Fenêtre « Mise à jour » (V1.8, préfixe mj-, cadre hb- de hubs.css) : version installée, version disponible et nouveautés (GET /api/maj), « Vérifier maintenant », « Mettre à jour » et « Revenir à … » en deux appuis ; attente du redémarrage du serveur puis rechargement de la page. Point sur le menu « ⋯ » quand une version est disponible. APP.maj {ouvrir, etat}.
(function () {
  "use strict";
  const el = APP.el, $ = APP.$;
  const AIDE = [
    ["À quoi sert cette fenêtre ?", "Elle montre la version installée et, s'il y en a une, la version plus récente publiée. Rien ne s'installe tout seul : c'est vous qui lancez la mise à jour."],
    ["D'où vient la nouvelle version ?", "Du dépôt public de l'application, sur GitHub. Seule cette lecture sort de la maison : aucune donnée, aucun mot de passe n'est envoyé. Chaque version publiée est signée ; une version dont la signature est fausse est refusée."],
    ["Que se passe-t-il pendant la mise à jour ?", "Les animations en cours sont arrêtées, les données sont sauvegardées, la nouvelle version est installée puis contrôlée, et le serveur redémarre (moins d'une minute). La page se recharge seule. Les réglages, pièces, scénarios et comptes ne sont pas touchés."],
    ["Et si la nouvelle version ne marche pas ?", "Si le contrôle échoue, la version précédente est remise automatiquement. Vous pouvez aussi revenir vous-même en arrière avec « Revenir à … »."],
    ["La vérification dit « Dépôt injoignable »", "Il faut Internet pour lire le dépôt. L'application continue de fonctionner sans mise à jour."],
    ["Signature refusée", "La version publiée n'a pas une signature valide pour la clé de la version installée : elle n'est peut-être pas authentique, elle est refusée et rien n'est changé. Attendez une nouvelle publication ; ne l'installez pas par un autre moyen."],
    ["Fichiers modifiés à la main", "Un fichier du serveur a été modifié sur cette machine (ancien correctif tapé à la main, par exemple) : la mise à jour depuis l'application est refusée pour ne rien écraser. En terminal, sur la machine du serveur : ./maj.sh (il montre les fichiers et propose de les remettre), ou ./maj.sh retour."],
    ["Version publiée qui ne suit pas", "La dernière version publiée ne prolonge pas la version installée (installation faite depuis un autre dépôt, ou version d'essai plus récente) : rien n'est proposé. En terminal : ./maj.sh etat donne le détail."],
    ["Installation mise à jour ailleurs", "Cette installation n'est pas un clone du dépôt (paquet copié à la main) ou elle est gérée par Home Assistant : elle se met à jour par ce moyen-là, pas depuis cette fenêtre."],
    ["Une opération est en cours", "Une mise à jour, un appairage de hub ou une opération sur les pièces est déjà en cours : attendez qu'elle se termine (une minute au plus), puis réessayez."],
    ["La version proposée a changé", "Une nouvelle version a été publiée pendant que la fenêtre était ouverte : « Vérifier maintenant », relisez les nouveautés, puis recommencez."],
    ["La mise à jour a échoué", "Rien n'a été changé. Le détail est dans sauvegardes/maj-dernier.txt sur la machine du serveur. Causes fréquentes : Internet coupé pendant le téléchargement, place insuffisante. Réessayez ; en terminal : ./maj.sh."],
    ["En terminal", "Les mêmes opérations existent en terminal : ./maj.sh, ./maj.sh etat, ./maj.sh retour."],
    ["Application Android Domowa", "Cette fenêtre met à jour le serveur. L'application Android se met à jour à part, depuis ses propres réglages."]
  ];
  let d = null, root = null, body = null, vue = "main", erreur = "", occupe = false, arme = "", armeT = null, attente = null, relectures = 0;

  const heure = (iso) => { const t = new Date(iso); return isNaN(t) ? "" : t.toLocaleDateString("fr-FR") + " " + t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  const dispo = () => !!(d && d.etat === "disponible" && d.disponible);
  function point() {
    const o = dispo();
    const b = $("plusBtn"), m = $("majBtn");
    if (b) b.classList.toggle("mj-point", o);
    if (m) m.classList.toggle("mj-dispo", o);
    document.documentElement.classList.toggle("mj-a-jour", !o);
  }
  function lire(cb) {
    APP.api("GET", "/api/maj", null, (err, r) => {
      if (!err && r) { d = r; point(); if (r.verification && relectures < 5) { relectures++; setTimeout(() => lire(), 6000); } }
      if (cb) cb(err);
      rendre();
    });
  }
  function desarmer() { arme = ""; clearTimeout(armeT); }
  function fermer() { if (!root) return; desarmer(); document.body.removeChild(root); root = null; body = null; vue = "main"; erreur = ""; }
  function ouvrir() {
    if (root) return;
    root = el("div", "hb-scrim"); root.id = "mjFenetre";
    root.onclick = (e) => { if (e.target === root) fermer(); };
    const panel = el("div", "hb-panel mj-panel"), head = el("div", "hb-head"), ics = el("div", "hb-ics");
    const q = el("button", "hb-ic", "?"), x = el("button", "hb-ic", "×");
    head.appendChild(el("div", "hb-titre", "Mise à jour"));
    q.title = "Aide"; q.setAttribute("aria-label", "Aide"); q.onclick = () => { vue = vue === "aide" ? "main" : "aide"; rendre(); };
    x.title = "Fermer"; x.setAttribute("aria-label", "Fermer"); x.onclick = fermer;
    ics.appendChild(q); ics.appendChild(x); head.appendChild(ics);
    body = el("div", "hb-body mj-body");
    panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    rendre(); relectures = 0; lire();
  }
  function ligne(lib, val, cls) { const l = el("div", "hb-ligne"); l.appendChild(el("span", "hb-lib", lib)); l.appendChild(el("span", "hb-val" + (cls ? " " + cls : ""), val)); return l; }
  function bouton(cls, texte, fn) { const b = el("button", cls, texte); b.onclick = fn; b.disabled = occupe; return b; }
  function deuxAppuis(cle, cls, texte, confirmer, fn) {
    return bouton(cls + (arme === cle ? " mj-arme" : ""), arme === cle ? confirmer : texte, () => {
      if (arme !== cle) { arme = cle; clearTimeout(armeT); armeT = setTimeout(() => { arme = ""; rendre(); }, 8000); rendre(); return; }
      desarmer(); fn();
    });
  }
  // V1.9 révision 2 : chaque échec affiché a sa rubrique d'aide (« Que faire ? ») ; messages du serveur : modules/maj.mjs (motifs, refus, dernier résultat)
  let cible = "";
  const RUBRIQUES = [
    [/Dépôt injoignable/, "La vérification dit « Dépôt injoignable »"],
    [/[Ss]ignature/, "Signature refusée"],
    [/modifiés à la main/, "Fichiers modifiés à la main"],
    [/ne prolonge pas/, "Version publiée qui ne suit pas"],
    [/Home Assistant|pas un clone|ne se met pas à jour depuis l'application/, "Installation mise à jour ailleurs"],
    [/déjà en cours|appairage de hub|opération sur les pièces/, "Une opération est en cours"],
    [/plus celle affichée|Aucune version disponible/, "La version proposée a changé"],
    [/n'a pas passé le contrôle|Aucune version précédente/, "Et si la nouvelle version ne marche pas ?"],
    [/a échoué|Lancement impossible|Confirmation requise/, "La mise à jour a échoué"]
  ];
  function rubrique(texte) { const r = RUBRIQUES.find((x) => x[0].test(texte || "")); return r ? r[1] : ""; }
  function echec(box, texte, cls) {
    const e = el("div", (cls || "hb-err") + " mj-echec"); e.appendChild(el("span", "mj-echtxt", texte));
    const r = rubrique(texte);
    if (r) { const b = el("button", "b-small mj-quefaire", "Que faire ?"); b.onclick = () => { cible = r; vue = "aide"; rendre(); }; e.appendChild(b); }
    box.appendChild(e);
  }
  function resultat(box) {
    const r = d && d.dernier;
    if (!r) return;
    if (r.resultat === "ok") box.appendChild(el("div", "hb-ok", "Dernière opération réussie" + (r.vers ? " : " + r.vers : "") + (r.le ? " (" + heure(r.le) + ")" : "") + "."));
    else if (r.resultat === "retour_auto") echec(box, "La version " + (r.vers || "proposée") + " n'a pas passé le contrôle : la version " + (r.de || "précédente") + " a été remise automatiquement. Rien n'est perdu.");
    else echec(box, r.message || "La dernière mise à jour a échoué. Rien n'a été changé.");
  }
  function rendre() {
    if (!root) return;
    body.innerHTML = "";
    if (vue === "aide") {
      body.appendChild(bouton("b-small hb-retour", "← Retour", () => { vue = "main"; rendre(); }));
      AIDE.forEach((a) => { body.appendChild(el("div", "hb-sec" + (a[0] === cible ? " mj-cible" : ""), a[0])); body.appendChild(el("div", "hb-p" + (a[0] === cible ? " mj-cible" : ""), a[1])); });
      const c = body.querySelector(".hb-sec.mj-cible"); if (c && c.scrollIntoView) c.scrollIntoView({ block: "start" });
      cible = "";
      return;
    }
    if (attente) {
      body.appendChild(el("div", "hb-sec", attente.quoi === "retour" ? "Retour à la version précédente" : "Mise à jour en cours"));
      body.appendChild(el("div", "hb-p mj-attente", attente.perdu ? (APP.distant ? "Le serveur ne répond pas. Le relancer sur sa machine, puis recharger la page." : "Le serveur ne répond pas. Le relancer (raccourci Maison, ou ./start.sh), puis recharger la page.") : "Le serveur redémarre… La page se rechargera seule (moins d'une minute)."));
      if (!attente.perdu) body.appendChild(el("div", "mj-barre"));
      return;
    }
    if (!d) { body.appendChild(el("div", "hb-note", erreur || "Lecture…")); return; }
    const c = el("div", "hb-bloc");
    c.appendChild(ligne("Version installée", d.installee ? d.installee.nom : "?"));
    if (d.gere_par === "application") {
      c.appendChild(ligne("Version disponible", dispo() ? d.disponible.nom : (d.etat === "a_jour" ? "Aucune : à jour" : (d.verification ? "Vérification…" : "Inconnue")), dispo() ? "ok" : ""));
      if (d.verifie_le) c.appendChild(ligne("Dernière vérification", heure(d.verifie_le)));
    }
    body.appendChild(c);
    if (d.motif) echec(body, d.motif, d.etat === "disponible" || d.gere_par !== "application" ? "hb-note" : "hb-note mj-motif");
    if (erreur) echec(body, erreur);
    resultat(body);
    if (d.gere_par !== "application") return;
    if (dispo() && d.disponible.notes && d.disponible.notes.length) {
      body.appendChild(el("div", "hb-sec", "Nouveautés"));
      const n = el("div", "mj-notes");
      d.disponible.notes.forEach((t, i) => n.appendChild(el("div", i === 0 ? "mj-note mj-tete" : "mj-note", t)));
      body.appendChild(n);
    }
    const pied = el("div", "mj-pied");
    if (dispo() && !d.motif) pied.appendChild(deuxAppuis("maj", "b-main hb-large", "Mettre à jour", "Confirmer la mise à jour vers " + d.disponible.nom, () => envoyer("appliquer", { confirm: true, cle: d.disponible.cle })));
    pied.appendChild(bouton("b-light hb-large", occupe ? "Vérification…" : "Vérifier maintenant", verifier));
    if (d.retour) pied.appendChild(deuxAppuis("retour", "b-small hb-large mj-retour", "Revenir à " + d.retour.nom, "Confirmer le retour à " + d.retour.nom, () => envoyer("retour", { confirm: true })));
    body.appendChild(pied);
  }
  function verifier() {
    occupe = true; erreur = ""; rendre();
    APP.api("POST", "/api/maj/verifier", {}, (err, r) => { occupe = false; if (err) erreur = err; else if (r) { d = r; point(); } rendre(); });
  }
  function envoyer(quoi, corps) {
    occupe = true; erreur = ""; rendre();
    const avant = d && d.dernier ? d.dernier.le : "";
    APP.api("POST", "/api/maj/" + quoi, corps, (err, r) => {
      occupe = false;
      if (err) { erreur = err; lire(); return; }
      if (r) d = r;
      attendre(quoi, avant);
    });
  }
  // Le serveur s'arrête puis revient : GET /api/maj toutes les 2 s, 150 s au plus ; opération finie : page rechargée (nouveau code du client)
  function attendre(quoi, avant) {
    attente = { quoi: quoi, debut: Date.now(), perdu: false };
    rendre();
    const tour = () => {
      if (!attente) return;
      if (Date.now() - attente.debut > 150000) { attente.perdu = true; rendre(); return; }
      APP.api("GET", "/api/maj", null, (err, r) => {
        if (!attente) return;
        if (!err && r && r.etat !== "en_cours") {
          d = r; point();
          const fini = r.dernier && r.dernier.le !== avant;
          if (fini && r.dernier.resultat === "ok") {
            try { sessionStorage.setItem("majFaite", r.dernier.vers || r.installee.nom); } catch (e) { /* sans stockage : pas de bandeau */ }
            location.reload(); return;
          }
          if (fini || Date.now() - attente.debut > 8000) { attente = null; rendre(); return; } // échec ou retour automatique : compte rendu dans la fenêtre
        }
        setTimeout(tour, 2000);
      });
    };
    setTimeout(tour, 2000);
  }

  APP.maj = { ouvrir: ouvrir, etat: () => d, rubrique: rubrique, rubriques: () => AIDE.map((a) => a[0]) }; // rubrique, rubriques : essais (chaque échec a sa rubrique)
  const m = $("majBtn"); if (m) m.onclick = ouvrir;
  try { const f = sessionStorage.getItem("majFaite"); if (f) { sessionStorage.removeItem("majFaite"); setTimeout(() => APP.banner("Mise à jour faite : " + f + ".", "ok"), 1500); } } catch (e) { /* rien */ }
  setTimeout(() => lire(), 4000);                // première lecture après le chargement de la page
  setInterval(() => { relectures = 0; lire(); }, 6 * 3600 * 1000);
})();
// FIN
