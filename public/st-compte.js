// @zone electromenager | Compte SmartThings (fenetre, prefixe sc-) et carte de groupe SmartThings (en-tete : etat du compte + icone compte), aussi dans « Tous les appareils » (#stTous). APP.stCompte {ouvrir, etat, charger, groupe, tuile, fenetre, famille, majTous, surChangement, hote, majDans, dans, nbDans}.
// Exception de saisie (CLAUDE.md) : client_secret et code en champs masques, envoyes une fois par POST, vides aussitot, jamais gardes ni affiches. Routes : /api/smartthings/* (adapters/smartthings/compte.mjs).
(function () {
  const el = APP.el;
  let etat = null, root = null, body = null, vue = "main", lien = null, erreur = "", armeDeco = false, armeT = null, form = false, occupe = false, saisieId = "";
  const auditeurs = [], familles = [];
  let tousCharge = 0;
  const RETOUR = "https://httpbin.org/get";

  function prevenir(operation) { auditeurs.forEach((f) => { try { f(operation); } catch (e) { /* vue fermee */ } }); }
  function charger(cb) {
    APP.api("GET", "/api/smartthings/compte", null, (err, d) => {
      if (!err && d) etat = d;
      if (root) rendre();
      majEntetes();
      prevenir(false);
      if (cb) cb(err);
    });
  }
  function poster(url, corps, ok, ko) {
    if (occupe) return;
    occupe = true; erreur = ""; rendre();
    APP.api("POST", url, corps, (err, d) => {
      occupe = false;
      if (err) { erreur = err; if (ko) ko(err); rendre(); return; }
      ok(d);
      rendre();
      majEntetes();
    });
  }
  function texteEtat(e) {
    if (!e) return ["…", ""];
    if (!e.lisible) return ["Fichier illisible", "ko"];
    if (e.reautoriser) return ["Reconnexion nécessaire", "ko"];
    if (e.connecte && horsLigne(e)) return ["Hors ligne", "hors"]; // V1.7 : compte autorisé, cloud injoignable (Internet ?)
    if (e.connecte) return ["Connecté", "ok"];
    return ["Déconnecté", "ko"];
  }
  // V1.7 : joignabilité du cloud (champ cloud de /api/smartthings/compte, /api/washers, /api/smartthings/appareils), distincte du compte
  const horsLigne = (e) => !!(e && e.cloud && e.cloud.etat === "injoignable");
  function heureCourte(iso) { const d = new Date(iso || ""); if (!iso || isNaN(d.getTime())) return ""; const p = (n) => (n < 10 ? "0" + n : "" + n); return p(d.getHours()) + ":" + p(d.getMinutes()); }
  // V1.7 : à chaque actualisation (15 s), état du compte relu (fichier local, aucun accès au cloud) ; changement de joignabilité : familles relues
  // (appareils masqués ou de retour : listes, compteurs, catégories), en-têtes mis à jour.
  const MASQUES = "Appareils SmartThings masqués tant que le cloud ne répond pas (Internet ?).";
  APP.surActualisation(() => {
    APP.api("GET", "/api/smartthings/compte", null, (err, d) => {
      if (err || !d) return;
      const avant = horsLigne(etat);
      etat = d;
      majEntetes();
      if (horsLigne(etat) === avant) return;
      if (root && vue === "main") rendre();
      familles.forEach((f) => { try { f.charger(); } catch (e) { /* vue fermee */ } });
      majTous();
    });
  }, 30);
  function majCloud(c) {
    if (!c || !etat) return;
    if (etat.cloud && etat.cloud.etat === c.etat && etat.cloud.depuis === c.depuis) return;
    etat.cloud = c;
    majEntetes();
    if (root && vue === "main") rendre();
  }
  function date(iso) {
    const d = new Date(iso || "");
    if (!iso || isNaN(d.getTime())) return "–";
    const p = (n) => (n < 10 ? "0" + n : "" + n);
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " à " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function ligne(box, lib, val, cls) {
    const r = el("div", "sc-ligne");
    r.appendChild(el("span", "sc-lib", lib));
    r.appendChild(el("span", "sc-val" + (cls ? " " + cls : ""), val));
    box.appendChild(r);
  }
  function bouton(cls, texte, fn) { const b = el("button", cls, texte); b.onclick = fn; b.disabled = occupe; return b; }
  function champ(box, lib, type, id) {
    box.appendChild(el("label", "sc-lab", lib));
    const i = el("input", "sc-in");
    i.type = type; i.id = id;
    i.setAttribute("autocomplete", "off"); i.setAttribute("autocapitalize", "off"); i.setAttribute("autocorrect", "off"); i.spellcheck = false;
    box.appendChild(i);
    return i;
  }

  // ---------- fenetre principale ----------
  function sectionApplication(box) {
    box.appendChild(el("div", "sc-sec", "Application OAuth"));
    const f = el("div", "sc-bloc");
    if (etat && etat.application) f.appendChild(el("div", "sc-note", "Une autre application que l'actuelle efface la connexion : il faudra se reconnecter."));
    else f.appendChild(el("div", "sc-note", "À faire une seule fois. Pas encore d'application ? Appuyez sur « ? » en haut : la procédure y est décrite."));
    const id = champ(f, "client_id (OAuth Client Id)", "text", "scId");
    id.value = saisieId;
    id.oninput = () => { saisieId = id.value; };
    const sec = champ(f, "client_secret (OAuth Client Secret, masqué)", "password", "scSecret");
    f.appendChild(bouton("b-main sc-go", "Enregistrer l'application", () => {
      const corps = { client_id: id.value.trim(), client_secret: sec.value.trim() };
      sec.value = "";
      if (!corps.client_id || !corps.client_secret) { erreur = "Renseigner client_id et client_secret."; rendre(); return; }
      poster("/api/smartthings/application", corps, (d) => { etat = d; form = false; lien = null; saisieId = ""; APP.banner("Application OAuth enregistrée.", "ok"); prevenir(true); });
    }));
    box.appendChild(f);
  }
  function sectionConnexion(box) {
    const e = etat;
    box.appendChild(el("div", "sc-sec", e.connecte ? "Reconnecter" : "Se connecter"));
    const f = el("div", "sc-bloc");
    if (!lien) {
      const lab = el("label", "sc-case"), c = el("input", "");
      c.type = "checkbox"; c.id = "scCmd"; c.checked = e.commande !== false;
      lab.appendChild(c); lab.appendChild(el("span", "", "Autoriser aussi les commandes (Pause, Reprise, Arrêt)"));
      f.appendChild(lab);
      f.appendChild(bouton("b-main sc-go", e.connecte ? "Reconnecter" : "Connecter", () => {
        poster("/api/smartthings/connexion", { commande: c.checked }, (d) => { lien = { url: d.url, t: Date.now() }; });
      }));
    } else {
      f.appendChild(el("div", "sc-etape", "1. Ouvrez la page Samsung, connectez-vous et acceptez."));
      const a = el("a", "sc-lien", "Ouvrir la page de connexion Samsung");
      a.href = lien.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      f.appendChild(a);
      f.appendChild(el("div", "sc-etape", "2. La page httpbin.org s'affiche : copiez la valeur de « code » (ou toute la page), revenez ici."));
      f.appendChild(el("div", "sc-etape", "3. Collez-la ci-dessous (champ masqué), puis Valider."));
      const code = champ(f, "Code (ou page httpbin entière)", "password", "scCode");
      const row = el("div", "sc-rang");
      row.appendChild(bouton("b-main", "Valider", () => {
        const texte = code.value; code.value = "";
        if (!texte.trim()) { erreur = "Collez d'abord le code."; rendre(); return; }
        poster("/api/smartthings/code", { texte: texte }, (d) => { etat = d; lien = null; APP.banner("Compte SmartThings connecté.", "ok"); prevenir(true); },
          (err) => { if (!/introuvable/.test(err)) lien = null; }); // code consomme : recommencer par Connecter
      }));
      row.appendChild(bouton("b-small", "Annuler", () => { lien = null; erreur = ""; rendre(); }));
      f.appendChild(row);
      f.appendChild(el("div", "sc-note", "Valable 10 minutes. Le code ne sert qu'une fois."));
    }
    box.appendChild(f);
  }
  function sectionDeconnexion(box) {
    box.appendChild(el("div", "sc-sec", "Déconnecter"));
    const f = el("div", "sc-bloc");
    f.appendChild(el("div", "sc-note", APP.lieu("Efface les jetons de cet appareil. L'application OAuth est gardée : il suffira de se reconnecter.")));
    f.appendChild(bouton("sc-deco" + (armeDeco ? " arme" : ""), armeDeco ? "Confirmer la déconnexion" : "Déconnecter", () => {
      if (!armeDeco) {
        armeDeco = true; clearTimeout(armeT);
        armeT = setTimeout(() => { armeDeco = false; if (root) rendre(); }, 5000);
        rendre(); return;
      }
      armeDeco = false; clearTimeout(armeT);
      poster("/api/smartthings/deconnexion", { confirm: true }, (d) => { etat = d; lien = null; APP.banner("Compte SmartThings déconnecté.", "ok"); prevenir(true); });
    }));
    box.appendChild(f);
  }
  function rendreMain() {
    const e = etat, box = el("div", "");
    const s = el("div", "sc-bloc"), t = texteEtat(e);
    ligne(s, "Compte", t[0], t[1]);
    if (e && e.lisible) {
      ligne(s, "Application OAuth", e.application ? "Enregistrée" : "Absente", e.application ? "" : "attention");
      if (e.connecte || e.reautoriser) ligne(s, "Droits", e.commande ? "Lecture et commandes" : (e.commande === false ? "Lecture seule" : "inconnus"));
      if (e.connecte) ligne(s, "Connecté le", date(e.autorise_le));
      if (e.connecte && e.cloud) ligne(s, "Cloud SmartThings", horsLigne(e) ? "Injoignable depuis " + (heureCourte(e.cloud.depuis) || "–") : e.cloud.etat === "joignable" ? "Joignable" : "Pas encore contacté", horsLigne(e) ? "hors" : (e.cloud.etat === "joignable" ? "ok" : ""));
    }
    box.appendChild(s);
    if (e && e.connecte && horsLigne(e)) box.appendChild(el("div", "sc-note", "Le compte reste autorisé : rien à refaire. Sans Internet (ou cloud Samsung en panne), les appareils SmartThings sont masqués (pièces, catégories, compteurs) et aucune commande n'est envoyée ; leur pièce est gardée. L'état repasse « Connecté » et les appareils réapparaissent d'eux-mêmes dès que le cloud répond (vérification toutes les 30 s)."));
    if (e && !e.lisible) box.appendChild(el("div", "sc-err", "Le fichier donnees/smartthings.json est illisible. Voir l'aide « ? »."));
    if (e && e.reautoriser) box.appendChild(el("div", "sc-note", "L'autorisation a expiré ou a été retirée : appuyez sur Reconnecter."));
    if (e && e.lisible) {
      if (!e.application || form) sectionApplication(box);
      if (e.application && !form) sectionConnexion(box);
      if (e.connecte && !lien && !form) sectionDeconnexion(box);
      if (e.application && !lien) box.appendChild(bouton("sc-lienb", form ? "Annuler la modification" : "Modifier l'application OAuth", () => { form = !form; erreur = ""; rendre(); }));
    }
    return box;
  }

  // ---------- aide « ? » ----------
  const AIDE = [
    ["Ce qu'il faut", [
      "Un compte Samsung, et l'appareil déjà ajouté dans l'application SmartThings du téléphone.",
      "Cette fenêtre s'ouvre avec l'icône compte, en haut de chaque carte SmartThings (catégories et « Tous les appareils »).",
      APP.lieu("Une « application OAuth » SmartThings : c'est la clé qui autorise cet appareil. Elle se crée une seule fois."),
    ]],
    ["Créer l'application OAuth (une fois, sur un ordinateur)", [
      "1. Installez la SmartThings CLI (outil officiel de Samsung : github.com/SmartThingsCommunity/smartthings-cli, rubrique Releases).",
      "2. Dans un terminal, tapez : smartthings smartapps:create (anciennes versions de la CLI : smartthings apps:create). Une page de connexion Samsung s'ouvre : connectez-vous.",
      "3. Type d'application : OAuth-In App. Nom et description : au choix (ex. Tablette maison). Les champs facultatifs peuvent rester vides.",
      "4. Droits (scopes) : cochez r:devices:* (lire) et x:devices:* (commander).",
      "5. Adresse de retour (Redirect URI) : " + RETOUR,
      "6. La CLI affiche « OAuth Client Id » et « OAuth Client Secret ». Notez-les : le secret n'est affiché qu'une fois.",
      "7. Ici, dans « Application OAuth », saisissez-les puis Enregistrer.",
      "Attention (constaté le 08/11/2026) : Samsung exige désormais un abonnement payant pour créer ou modifier une application OAuth. Gardez client_id et client_secret en lieu sûr (gestionnaire de mots de passe) : une application existante continue de fonctionner, mais on ne peut plus lui ajouter de droit.",
    ]],
    ["Se connecter", [
      "1. Appuyez sur Connecter (laissez « commandes » coché pour pouvoir mettre en pause ou arrêter).",
      "2. Ouvrez la page Samsung, connectez-vous, choisissez le lieu et acceptez.",
      "3. La page httpbin.org affiche un texte : copiez la valeur de « code » (ou toute la page).",
      "4. Revenez sur cet onglet, collez, puis Valider. L'état passe à « Connecté ».",
    ]],
    ["Reconnecter", [
      "Quand l'état indique « Reconnexion nécessaire » (environ 30 jours sans utilisation, ou accès retiré), ou pour changer les droits.",
      "Même parcours que Se connecter. Rien d'autre à refaire.",
    ]],
    ["« Hors ligne » (pastille orange)", [
      APP.lieu("Le compte est toujours autorisé, mais le cloud SmartThings ne répond pas : Internet coupé sur cet appareil, box en panne, ou panne chez Samsung."),
      "Les appareils SmartThings sont masqués partout (pièces, catégories, compteurs) et aucune commande n'est envoyée ; leur rangement dans les pièces est gardé. Un bandeau le signale.",
      "Rien à faire : l'état repasse « Connecté » et les appareils réapparaissent d'eux-mêmes dès que le cloud répond (vérification toutes les 30 s, sans jeton). Une coupure n'efface pas la connexion.",
    ]],
    ["Déconnecter", [
      APP.lieu("Efface de cet appareil les jetons d'accès (confirmation demandée). L'application OAuth est gardée."),
      "Il n'existe pas de commande officielle pour révoquer l'accès chez Samsung : sans jeton, il expire de lui-même.",
    ]],
    ["Sécurité", [
      APP.lieu("Le secret et les jetons restent sur cet appareil (donnees/smartthings.json) : jamais affichés, jamais gardés par le navigateur."),
      "Le code passe par httpbin.org, mais il ne sert qu'une fois, expire vite et ne permet rien sans le secret.",
      "Seul api.smartthings.com est contacté, avec les seuls droits lire et commander les appareils.",
    ]],
    ["En cas de problème", [
      "« Code refusé ou expiré » : recommencez Connecter, le code ne sert qu'une fois.",
      "Page Samsung en erreur : vérifiez que l'adresse de retour de l'application est exactement " + RETOUR + ".",
      "« Fichier illisible » : dans Termux, ./stop.sh puis node scripts/smartthings.mjs config, puis ./start.sh.",
    ]],
  ];
  function rendreAide() {
    const box = el("div", "");
    box.appendChild(bouton("b-small sc-retour", "← Retour", () => { vue = "main"; rendre(); }));
    AIDE.forEach((s) => {
      box.appendChild(el("div", "sc-sec", s[0]));
      const b = el("div", "sc-bloc");
      s[1].forEach((p) => b.appendChild(el("p", "sc-p", p)));
      box.appendChild(b);
    });
    return box;
  }

  function rendre() {
    if (!root) return;
    body.innerHTML = "";
    body.appendChild(vue === "aide" ? rendreAide() : rendreMain());
    if (erreur && vue === "main") body.appendChild(el("div", "sc-err", erreur));
  }
  function fermer() {
    if (!root) return;
    clearTimeout(armeT); armeDeco = false; lien = null; erreur = ""; form = false; saisieId = "";
    document.body.removeChild(root); root = null; body = null;
  }
  function icone(texte, titre, fn) { const b = el("button", "sc-ic", texte); b.title = titre; b.setAttribute("aria-label", titre); b.onclick = fn; return b; }
  function ouvrir(aide) {
    if (!root) {
      root = el("div", "sc-scrim");
      root.onclick = (e) => { if (e.target === root) fermer(); };
      const panel = el("div", "sc-panel"), head = el("div", "sc-head");
      head.appendChild(el("div", "sc-titre", "Compte SmartThings"));
      const ics = el("div", "sc-ics");
      ics.appendChild(icone("?", "Aide", () => { vue = vue === "aide" ? "main" : "aide"; rendre(); }));
      ics.appendChild(icone("×", "Fermer", fermer));
      head.appendChild(ics);
      body = el("div", "sc-body");
      panel.appendChild(head); panel.appendChild(body); root.appendChild(panel); document.body.appendChild(root);
    }
    vue = aide ? "aide" : "main";
    rendre();
    charger();
  }
  // ---------- carte de groupe SmartThings (vues des categories et « Tous les appareils ») ----------
  const ICONE_ACTU = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9"/><path d="M3.5 12A8.5 8.5 0 0 1 18.1 6.1"/><path d="M18.4 2.4v3.9h-3.9"/><path d="M5.6 21.6v-3.9h3.9"/></svg>';
  const ICONE_USER = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
  const entetes = []; // en-tetes affiches, mis a jour sans reconstruire les vues
  let actualisation = false, actuDebut = 0;
  function remplirEntete(t) {
    const x = texteEtat(etat), on = !!(etat && etat.connecte), hl = on && horsLigne(etat);
    t.pastille.className = "sc-pastille " + (x[1] || "");
    t.texte.textContent = x[0];
    t.note.textContent = hl ? "Cloud injoignable depuis " + (heureCourte(etat.cloud.depuis) || "–") + " (Internet ?) : appareils masqués jusqu'à son retour." : "";
    t.note.className = hl ? "sc-note sc-gnote" : "hidden";
    t.bouton.className = "sc-user" + (on ? " on" : "");
    t.bouton.setAttribute("aria-label", "Compte SmartThings : " + x[0]);
    t.bouton.title = "Compte SmartThings";
    t.actu.className = "sc-actu" + (actualisation ? " tourne" : ""); t.actu.disabled = actualisation;
  }
  function majEntetes() {
    for (let i = entetes.length - 1; i >= 0; i--) { if (!document.body.contains(entetes[i].carte)) entetes.splice(i, 1); else remplirEntete(entetes[i]); }
  }
  // Actualisation manuelle : etat du compte + lecture fraiche de chaque famille presente (actualiser(cb), sinon charger()) ; icone qui tourne 0,6 s au moins.
  function actualiser() {
    if (actualisation) return;
    const fams = familles.filter((f) => f.existe()), erreurs = [];
    let reste = fams.length + 1;
    actualisation = true; actuDebut = Date.now(); majEntetes();
    const fini = (err) => {
      if (err) erreurs.push(err);
      if (--reste > 0) return;
      setTimeout(() => {
        actualisation = false; majEntetes(); majTous();
        if (erreurs.length) APP.banner("Actualisation SmartThings : " + erreurs[0], "err");
      }, Math.max(0, 600 - (Date.now() - actuDebut)));
    };
    charger(fini);
    fams.forEach((f) => { if (f.actualiser) f.actualiser(fini); else { f.charger(); fini(null); } });
  }
  // groupe(sousTitre?) -> { carte, corps } : en-tete « SmartThings », pastille + etat du compte, icone compte (halo blanc si connecte).
  function groupe(sousTitre) {
    const carte = el("div", "sc-groupe"), tete = el("div", "sc-gtete"), corps = el("div", "sc-gcorps");
    const nom = el("div", "sc-gnom");
    nom.appendChild(el("span", "sc-gtitre", "SmartThings"));
    if (sousTitre) nom.appendChild(el("span", "sc-gsous", sousTitre));
    const st = el("div", "sc-getat"), pastille = el("span", "sc-pastille"), texte = el("span", "sc-gtexte", "");
    st.appendChild(pastille); st.appendChild(texte);
    const b = el("button", "sc-user");
    b.innerHTML = ICONE_USER;
    b.onclick = () => ouvrir(false);
    const actu = el("button", "sc-actu");
    actu.innerHTML = ICONE_ACTU;
    actu.title = "Actualiser"; actu.setAttribute("aria-label", "Actualiser l'état des appareils SmartThings");
    actu.onclick = actualiser;
    tete.appendChild(nom); tete.appendChild(actu); tete.appendChild(st); tete.appendChild(b);
    const note = el("div", "hidden"); // V1.7 : cloud injoignable (remplirEntete)
    carte.appendChild(tete); carte.appendChild(note); carte.appendChild(corps);
    const t = { carte, pastille, texte, bouton: b, actu, note };
    remplirEntete(t);
    entetes.push(t);
    return { carte, corps };
  }

  // ---------- « Tous les appareils » : une carte SmartThings, resume de chaque appareil par famille ----------
  // famille({cle, libelle, existe(), panne(), charger(), actualiser?(cb), appareils() -> [{id, nom, etat, ton: neutre|actif|pause|off, detail?, progression?, perime?}], ouvrir(), detail?(id)}).
  // tuile(a, clic) : carte compacte d'un appareil (nom a gauche, etat en haut a droite), meme format dans les categories et « Tous les appareils » : nom, etat ;
  // a.detail : ligne petite et legere ; a.progression (0-100) : barre bleue discrete au pied de la tuile.
  function tuile(a, clic) {
    const b = el("button", "sc-app" + (a.perime ? " perime" : ""));
    const haut = el("span", "sc-apphaut"); // nom a gauche, etat en haut a droite
    const pc = APP.piecesChoix; // V1.4 : type dessiné devant le nom, pièce sous le nom (« Autres » par défaut)
    if (pc && a.id) { const ty = el("span", "sc-apptype", ""); ty.innerHTML = pc.type(pc.genreDe(a.id)); haut.appendChild(ty); }
    haut.appendChild(el("span", "sc-appnom", a.nom));
    haut.appendChild(el("span", "sc-appetat " + (a.ton || "neutre"), a.etat));
    b.appendChild(haut);
    if (pc && a.id) b.appendChild(pc.etiquette(a.id));
    if (a.detail) b.appendChild(el("span", "sc-appdet", a.detail));
    if (typeof a.progression === "number") {
      const barre = el("span", "sc-appbarre"), p = el("span", "sc-appprog");
      p.style.width = Math.max(0, Math.min(100, a.progression)) + "%";
      barre.appendChild(p); b.appendChild(barre);
    }
    b.title = a.nom + " : " + a.etat + (a.detail ? " (" + a.detail + ")" : "") + (a.perime ? " (données périmées)" : "");
    b.onclick = clic;
    return b;
  }
  // fenetre(titre, surFermeture?, large?) -> {corps, titre(t), fermer()} ; large : 1000 px (selecteur du lave-linge) : fenetre de detail d'un appareil (meme style que la fenetre Compte).
  function fenetre(titre, surFermeture, large) {
    const r = el("div", "sc-scrim"), p = el("div", "sc-panel" + (large ? " sc-large" : "")), h = el("div", "sc-head"), t = el("div", "sc-titre", titre), ics = el("div", "sc-ics"), c = el("div", "sc-body"), te = el("div", "sc-tete");
    const fin = () => { if (!r.parentNode) return; r.parentNode.removeChild(r); if (surFermeture) surFermeture(); };
    r.onclick = (e) => { if (e.target === r) fin(); };
    ics.appendChild(icone("×", "Fermer", fin));
    h.appendChild(t); h.appendChild(te); h.appendChild(ics); p.appendChild(h); p.appendChild(c); r.appendChild(p); document.body.appendChild(r);
    // tete(element) : à côté du titre (pastille de la pièce de l'appareil, V1.4)
    return { corps: c, titre: (x) => { t.textContent = x; }, tete: (x) => { te.innerHTML = ""; if (x) te.appendChild(x); }, fermer: fin };
  }
  const visibleTous = () => APP.view === "lights" && APP.room === "all" && !APP.cat && familles.some((f) => f.existe());
  function majTous() {
    const box = APP.$("stTous");
    if (!box) return;
    if (!visibleTous()) { box.className = "hidden"; box.innerHTML = ""; return; }
    box.className = "sc-tous";
    box.innerHTML = "";
    const g = groupe(null);
    let n = 0;
    familles.filter((f) => f.existe()).forEach((f) => {
      const l = f.appareils(), p = f.panne();
      if (!l.length && !p) return;
      const sec = el("div", "sc-fam");
      sec.appendChild(el("div", "sc-famnom", f.libelle));
      if (p) sec.appendChild(el("div", "sc-note", "Indisponible : " + p));
      const rang = el("div", "sc-apps");
      l.forEach((a) => { rang.appendChild(tuile(a, () => (f.detail ? f.detail(a.id) : f.ouvrir()))); n++; });
      sec.appendChild(rang);
      g.corps.appendChild(sec);
    });
    if (!n && !g.corps.firstChild) g.corps.appendChild(el("div", "sc-note", etat && !etat.connecte ? "Compte déconnecté : appuyez sur l'icône compte." : horsLigne(etat) ? MASQUES : "Aucun appareil SmartThings."));
    box.appendChild(g.carte);
  }
  // A chaque rendu (actualisation toutes les 15 s) : affichage, et lecture des familles au plus toutes les 14 s tant que la vue est visible.
  function rendreTous() {
    if (visibleTous() && Date.now() - tousCharge > 14000) {
      tousCharge = Date.now();
      if (!etat) charger();
      familles.forEach((f) => { if (f.existe()) f.charger(); });
    }
    majTous();
  }
  APP.onRender(rendreTous, 35);
  // Familles affichees dans la vue d'une autre (ex. appareils a cycle dans l'Electromenager : famille({dans: "electro", tuiles(box)})) :
  // hote(vue, fn) enregistre le rendu de la vue hote, majDans(vue) le relance ; dans(vue, box) ajoute leurs tuiles (rend leur nombre) ; nbDans(vue) : compteur de la categorie hote.
  const hotes = {};
  function hote(v, fn) { (hotes[v] = hotes[v] || []).push(fn); }
  function majDans(v) { (hotes[v] || []).forEach((f) => { try { f(); } catch (e) { /* vue fermee */ } }); }
  function dans(v, box) { let n = 0; familles.forEach((f) => { if (f.dans === v && f.existe() && f.tuiles) n += f.tuiles(box); }); return n; }
  function nbDans(v) { let n = 0; familles.forEach((f) => { if (f.dans === v && f.existe()) n += f.appareils().length; }); return n; }

  APP.stCompte = { ouvrir: ouvrir, etat: () => etat, charger: charger, groupe: groupe, tuile: tuile, fenetre: fenetre, famille: (f) => { familles.push(f); }, majTous: majTous, surChangement: (f) => { auditeurs.push(f); }, hote: hote, majDans: majDans, dans: dans, nbDans: nbDans, majCloud: majCloud, horsLigne: () => horsLigne(etat), masques: MASQUES };
})();
// FIN
