// @zone lumieres | Panneau de reglage (colonne droite, prefixe q-) : ON/OFF, luminosite, Blanc/Couleur, cadran SVG, couleurs rapides et perso (appui long 0,7 s = supprimer) ; crochet de rendu APP.onRender (ordre 90 : apres tous les autres).
// V1.5 : les reglages eux-memes viennent du composant partage APP.reglages (reglages.js, aussi utilise par l'editeur d'animation) ; ici : selection, envoi aux lampes, affichage de l'etat.
// V2.1 : sections construites selon les capacites de la selection (union : luminosite si une lampe varie, blanc si une gere la temperature, couleur si une gere la couleur ; prises seules :
// ON/OFF ; aucune selection : panneau complet, inactif) ; reconstruit quand cette liste change (APP.panneauCaps(ids) la calcule), par le crochet de rendu 44 : avant la ligne
// de l'appareil (pieces-choix.js, 45, posee dans la carte du cadran) et l'etat (90) ; jamais pendant un geste ou un envoi differe.
(function () {
  if (APP.panelLoaded) return;
  APP.panelLoaded = true;
  var R = null, P = null, N = null, st = { n: 0, on: 0 };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function ids() { return APP.selIds(); }
  function applyLevel() { APP.applyLights(ids(), { on: true, level: P.level }, "Luminosité réglée."); }
  function applyWhite() { APP.applyLights(ids(), { on: true, mode: "temperature", kelvin: P.kelvin }, "Blanc appliqué."); }
  function applyColor() { APP.applyLights(ids(), { on: true, mode: "color", hue: P.hue, sat: P.sat / 100 }, "Couleur appliquée."); }

  // Capacites exposees par des appareils (format client de /api/devices) : null = aucun appareil connu (toutes les sections)
  APP.panneauCaps = function (liste) {
    var c = ["onoff"], i, d, lum = false, bl = false, co = false, n = 0;
    for (i = 0; i < liste.length; i++) {
      d = APP.find(APP.devices, liste[i]);
      if (!d) continue;
      n++;
      if (d.kind !== "light") continue;
      if (d.canDim !== false) lum = true;
      if (d.canTemp) bl = true;
      if (d.canColor) co = true;
    }
    if (!n) return null;
    if (lum) c.push("luminosite");
    if (bl) c.push("blanc");
    if (co) c.push("couleur");
    return c;
  };
  var cle = "-";
  function build(caps) {
    var right = document.querySelector(".right"), old, i;
    if (!right) return;
    old = right.querySelectorAll(".q-root");
    for (i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    if (R) APP.reglagesRetirer(R);
    cle = caps ? caps.join() : "";
    R = APP.reglages({
      caps: caps, onoff: true, differe: true, actif: function () { return ids().length > 0; },
      niveau: applyLevel, blanc: applyWhite, couleur: applyColor,
      on: function (v) { APP.applyLights(ids(), { on: v }, v ? "ON." : "OFF."); }
    });
    P = R.P; N = R.N;
    N.lit = function () { return st.on > 0; };
    right.appendChild(R.root);
  }

  function structure() {
    var caps = APP.panneauCaps(ids());
    if (R && (caps ? caps.join() : "") !== cle && !R.occupe()) build(caps);
  }
  function update() {
    if (!R) return;
    var sel = ids(), n = sel.length, lights = [], onCnt = 0, lOn = 0, i, d, mixed = false;
    for (i = 0; i < n; i++) {
      d = APP.find(APP.devices, sel[i]);
      if (!d) continue;
      if (d.isOn === true) onCnt++;
      if (d.kind === "light") { lights.push(d); if (d.isOn === true) lOn++; }
    }
    var hasL = lights.length > 0;
    st.n = n; st.on = lOn;
    N.root.className = "q-root" + (n ? "" : " q-off");
    N.title.textContent = n ? (n + " appareil" + (n > 1 ? "s" : "") + " sélectionné" + (n > 1 ? "s" : "")) : "Aucun appareil sélectionné";
    N.hint.textContent = n ? (hasL ? "" : "Prise : ON / OFF uniquement.") : "Touche des bulles pour les sélectionner.";
    if (N.bOn) {
      N.bOn.className = "q-seg" + (n && onCnt === n ? " sel on" : "");
      N.bOff.className = "q-seg" + (n && onCnt === 0 ? " sel off" : "");
    }
    if (hasL && !R.occupe()) {
      d = lights[0];
      if (d.level !== null) P.level = clamp(Math.round(d.level), 1, 100);
      if (d.colorMode === "color") {
        P.mode = "color";
        if (d.hue !== null) P.hue = Math.round(d.hue) % 360;
        if (d.sat !== null) P.sat = Math.min(100, Math.round(d.sat * 100));
      } else if (d.colorMode === "temperature") P.mode = "temperature";
      if (d.temp !== null) P.kelvin = clamp(Math.round(d.temp), 1801, 6535);
    }
    for (i = 1; i < lights.length; i++) {
      if (lights[i].colorMode !== lights[0].colorMode || Math.abs((lights[i].level || 0) - (lights[0].level || 0)) > 3) mixed = true;
    }
    if (N.mixed) N.mixed.textContent = mixed ? "Valeurs différentes : réglages de la première lumière affichés." : "";
    R.peindre();
  }

  build(null);
  APP.onRender(structure, 44);
  APP.onRender(update, 90);
  update();
})();
// FIN
