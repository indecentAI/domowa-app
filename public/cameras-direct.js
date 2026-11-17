// @zone cameras | Lecture d'un flux de caméra par MediaSource (étape cam-mse) : le client reçoit lui-même le MP4 fragmenté du serveur (fetch en continu), donne l'en-tête puis chaque fragment entier (moof, mdat) au décodeur et reste près du direct.
// Rattrapage : un peu plus vite (REGLES.vite, puis tresVite au-delà de palier) tant que le retard dépasse haut, retour à 1 sous bas (son à la même hauteur) ; saut seulement au démarrage, après un trou du flux ou au-delà de REGLES.saut, sur la dernière image clé reçue.
// Mémoire bornée : ce qui est lu depuis plus de garde secondes est retiré du tampon. Repli sur la lecture directe de l'adresse (cameras.js) : MediaSource absent, codec non reconnu dans l'en-tête (H.265 par exemple) ou refusé par le navigateur.
// Lecture des boîtes : même règles que adapters/cameras/mp4.mjs (serveur), recopiées ici (script classique, pas de module) ; essais : banc/unitaires/cameras-direct.test.mjs, banc/ui-cam-direct.mjs.
(function () {
  var BOITE_MAX = 8 * 1024 * 1024, INIT_MAX = 1024 * 1024, NON_SYNC = 0x00010000;
  // Secondes de média (temps de la vidéo, jamais l'horloge de la page).
  var REGLES = { haut: 1.5, bas: 0.9, palier: 2.5, vite: 1.07, tresVite: 1.15, saut: 4.0, marge: 0.05, reste: 0.8, garde: 20, conserve: 8, file: 60, pas: 250 };
  var TYPE_BASE = 'video/mp4; codecs="avc1.42E01E"';

  function u32(b, o) { return b[o] * 16777216 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
  function typ(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }
  function coller(l) {
    var n = 0, i, r, o = 0;
    for (i = 0; i < l.length; i++) n += l[i].length;
    r = new Uint8Array(n);
    for (i = 0; i < l.length; i++) { r.set(l[i], o); o += l[i].length; }
    return r;
  }

  // Découpeur : pousser(Uint8Array) -> boîtes complètes [{type, octets}] ; erreur (texte) dès qu'une boîte est mal formée, puis plus rien.
  function decoupeur(max) {
    var buf = new Uint8Array(0), n = 0, d = { erreur: null };
    max = max || BOITE_MAX;
    d.pousser = function (m) {
      var sortie = [], i = 0, t, e, ty, nb;
      if (d.erreur) return sortie;
      if (n + m.length > buf.length) { nb = new Uint8Array(Math.max(buf.length * 2, n + m.length, 65536)); nb.set(buf.subarray(0, n)); buf = nb; }
      buf.set(m, n); n += m.length;
      while (n - i >= 8) {
        t = u32(buf, i); e = 8; ty = typ(buf, i + 4);
        if (!/^[\x20-\x7e]{4}$/.test(ty)) { d.erreur = "type de boîte invalide"; break; }
        if (t === 1) {
          if (n - i < 16) break;
          if (u32(buf, i + 8) !== 0) { d.erreur = "boîte trop grande"; break; }
          t = u32(buf, i + 12); e = 16;
        } else if (t === 0) { d.erreur = "boîte sans taille"; break; }
        if (t < e) { d.erreur = "taille de boîte invalide"; break; }
        if (t > max) { d.erreur = "boîte trop grande"; break; }
        if (n - i < t) break;
        sortie.push({ type: ty, octets: buf.slice(i, i + t) });
        i += t;
      }
      if (d.erreur) { n = 0; buf = new Uint8Array(0); return sortie; }
      if (i) { buf.copyWithin(0, i, n); n -= i; }
      return sortie;
    };
    return d;
  }

  // Enfants d'une boîte conteneur ; une boîte mal formée arrête la lecture.
  function enfants(b, debut) {
    var l = [], i = debut, t, e;
    while (i + 8 <= b.length) {
      t = u32(b, i); e = 8;
      if (t === 1) { if (i + 16 > b.length) break; t = u32(b, i + 8) * 4294967296 + u32(b, i + 12); e = 16; }
      if (t < e || i + t > b.length) break;
      l.push({ type: typ(b, i + 4), b: b.subarray(i, i + t), c: e });
      i += t;
    }
    return l;
  }
  function fils(x, ty) { return enfants(x.b, x.c).filter(function (e) { return e.type === ty; }); }
  function premier(x, ty) { return fils(x, ty)[0] || null; }

  // Piste vidéo d'un moov : {id, defaut (drapeaux par défaut de trex, ou null)} ; null sans piste vidéo lisible (comme pisteVideo de mp4.mjs).
  function pisteVideo(moov) {
    try {
      var m = { b: moov, c: 8 }, id = null, i, l, trak, tkhd, mdia, hdlr, c, mvex, trex;
      l = fils(m, "trak");
      for (i = 0; i < l.length; i++) {
        trak = l[i]; tkhd = premier(trak, "tkhd"); mdia = premier(trak, "mdia"); hdlr = mdia && premier(mdia, "hdlr");
        if (!tkhd || !hdlr || typ(hdlr.b, hdlr.c + 8) !== "vide") continue;
        c = tkhd.c; id = u32(tkhd.b, c + (tkhd.b[c] === 1 ? 20 : 12));
        break;
      }
      if (id === null) return null;
      var defaut = null;
      mvex = premier(m, "mvex");
      l = mvex ? fils(mvex, "trex") : [];
      for (i = 0; i < l.length; i++) { trex = l[i]; if (u32(trex.b, trex.c + 4) === id) defaut = u32(trex.b, trex.c + 20); }
      return { id: id, defaut: defaut };
    } catch (e) { return null; }
  }

  // Le fragment (moof) commence-t-il par une image clé de la piste vidéo ? true, false, ou null (illisible) ; comme imageCle de mp4.mjs.
  function imageCle(moof, piste) {
    if (!piste) return null;
    try {
      var trafs = fils({ b: moof, c: 8 }, "traf"), i, j, tfhd, c, fl, o, defaut, truns, trun, t, tf, p, dr;
      for (i = 0; i < trafs.length; i++) {
        tfhd = premier(trafs[i], "tfhd");
        if (!tfhd) continue;
        c = tfhd.c; fl = u32(tfhd.b, c) & 0xffffff;
        if (u32(tfhd.b, c + 4) !== piste.id) continue;
        o = c + 8; defaut = piste.defaut;
        if (fl & 0x01) o += 8;
        if (fl & 0x02) o += 4;
        if (fl & 0x08) o += 4;
        if (fl & 0x10) o += 4;
        if (fl & 0x20) defaut = u32(tfhd.b, o);
        truns = fils(trafs[i], "trun");
        for (j = 0; j < truns.length; j++) {
          trun = truns[j]; t = trun.c; tf = u32(trun.b, t) & 0xffffff;
          if (u32(trun.b, t + 4) === 0) continue;
          p = t + 8; dr = defaut;
          if (tf & 0x01) p += 4;
          if (tf & 0x04) dr = u32(trun.b, p);
          else if (tf & 0x400) {
            if (tf & 0x100) p += 4;
            if (tf & 0x200) p += 4;
            dr = u32(trun.b, p);
          }
          if (dr === null || dr === undefined) return null;
          return (dr & NON_SYNC) === 0;
        }
        return null;
      }
      return null;
    } catch (e) { return null; }
  }

  // Codecs annoncés à MediaSource d'après l'en-tête : « avc1.PPCCLL » (boîte avcC) et « mp4a.40.2 » si une piste son AAC existe (le serveur réencode le son en AAC) ; null sinon (repli).
  function chercher(b, mot) {
    var a = mot.charCodeAt(0), i;
    for (i = 4; i + 4 <= b.length; i++) if (b[i] === a && typ(b, i) === mot) return i;
    return -1;
  }
  function hex2(n) { return (n < 16 ? "0" : "") + n.toString(16).toUpperCase(); }
  function codecs(moov) {
    var i = chercher(moov, "avcC"), entree, v;
    if (i < 0 || i + 8 > moov.length || moov[i + 4] !== 1) return null;
    entree = chercher(moov, "avc3") >= 0 ? "avc3." : "avc1.";
    v = entree + hex2(moov[i + 5]) + hex2(moov[i + 6]) + hex2(moov[i + 7]);
    if (chercher(moov, "mp4a") >= 0) v += ",mp4a.40.2";
    return v;
  }

  // Décision, une fois par pas : e = {debut, fin (plage du tampon où arrive le direct), temps (lecture), cles (débuts des fragments à image clé, croissants), vitesse}
  // -> {vitesse, saut (temps où se placer, ou null)}. Calcul pur, sans effet.
  function decision(e) {
    var r = { vitesse: e.vitesse || 1, saut: null }, retard, i, k = null, dehors;
    if (!(e.fin > e.debut)) return r;
    retard = e.fin - e.temps;
    dehors = e.temps < e.debut - REGLES.marge || e.temps > e.fin + REGLES.marge;
    for (i = e.cles.length - 1; i >= 0; i--) if (e.cles[i] >= e.debut - REGLES.marge && e.fin - e.cles[i] >= REGLES.reste) { k = e.cles[i]; break; }
    if (dehors) r.saut = Math.min((k !== null ? k : e.debut) + REGLES.marge, e.fin);
    else if (retard > REGLES.saut && k !== null && k - e.temps > REGLES.bas) r.saut = k + REGLES.marge;
    if (r.saut !== null) { r.vitesse = 1; return r; }
    if (retard > REGLES.haut) r.vitesse = retard > REGLES.palier ? REGLES.tresVite : REGLES.vite;
    else if (retard < REGLES.bas) r.vitesse = 1;
    else if (r.vitesse > REGLES.vite) r.vitesse = REGLES.vite;
    return r;
  }

  function dispo() {
    try { return !!(window.MediaSource && MediaSource.isTypeSupported(TYPE_BASE) && window.fetch && window.AbortController && window.ReadableStream && window.URL && URL.createObjectURL); } catch (e) { return false; }
  }

  // Lecteur d'un flux dans la balise v : rp = {panne() (flux coupé, refusé ou illisible : cameras.js reconnecte), repli() (format non lisible ici : lecture directe de l'adresse)}.
  // -> {arreter()} ; après arreter, aucun rappel. La balise reçoit l'adresse d'une MediaSource (cameras.js la retire à l'arrêt).
  function lecteur(v, url, rp) {
    var ms = new MediaSource(), adr = URL.createObjectURL(ms), ctl = new AbortController(), fini = false, ouvert = false, sb = null;
    var dec = decoupeur(), avant = [], tailleAvant = 0, init = null, piste = null, frag = [], file = [], enCours = null, cles = [], minuteur = null;
    function finir(raison) {
      if (fini) return;
      fini = true;
      try { ctl.abort(); } catch (e) {}
      if (minuteur) { clearInterval(minuteur); minuteur = null; }
      file = []; frag = [];
      if (raison === "repli") rp.repli(); else if (raison) rp.panne();
    }
    function plage() { var b = sb.buffered, n = b.length; return n ? { debut: b.start(n - 1), fin: b.end(n - 1), premier: b.start(0) } : null; }
    function liberer(force) {
      var p, t, jusque;
      if (!sb || sb.updating || enCours) return false;
      p = plage(); if (!p) return false;
      t = v.currentTime;
      if (!force && t - p.premier <= REGLES.garde) return false;
      jusque = Math.min(t - (force ? 2 : REGLES.conserve), p.fin - 1);
      if (jusque <= p.premier + 0.5) return false;
      enCours = { retrait: true };
      try { sb.remove(p.premier, jusque); } catch (e) { enCours = null; return false; }
      cles = cles.filter(function (k) { return k >= jusque; });
      return true;
    }
    function pomper() {
      var f, p;
      if (fini || !sb || sb.updating || enCours || !file.length) return;
      f = file.shift(); p = plage();
      enCours = { cle: f.cle === true, avant: p ? p.fin : null };
      try { sb.appendBuffer(f.octets); }
      catch (e) {
        enCours = null;
        if (e && e.name === "QuotaExceededError") { file.unshift(f); if (!liberer(true)) finir("erreur"); return; }
        finir("erreur");
      }
    }
    function apres() {
      var e = enCours, t, p;
      enCours = null;
      if (fini) return;
      if (e && e.cle) {
        t = e.avant;
        if (t === null) { p = plage(); t = p ? p.debut : null; }
        if (t !== null) { cles.push(t); if (cles.length > 200) cles.shift(); }
      }
      if (!liberer(false)) pomper();
    }
    function regler() {
      var b, n, d;
      if (fini || !sb) return;
      b = v.buffered; n = b.length;
      if (!n) return;
      d = decision({ debut: b.start(n - 1), fin: b.end(n - 1), temps: v.currentTime, cles: cles, vitesse: v.playbackRate });
      if (d.saut !== null) { try { v.currentTime = d.saut; } catch (e) {} }
      if (v.playbackRate !== d.vitesse) v.playbackRate = d.vitesse;
    }
    function pret() {
      if (fini || !ouvert || !init || sb) return;
      try { sb = ms.addSourceBuffer(init.type); }
      catch (e) { finir("repli"); return; }
      sb.addEventListener("updateend", apres);
      sb.addEventListener("error", function () { finir("erreur"); });
      enCours = { init: true };
      try { sb.appendBuffer(init.octets); } catch (e) { finir("erreur"); return; }
      minuteur = setInterval(regler, REGLES.pas);
    }
    function recevoir(m) {
      var bx = dec.pousser(m), i, x, moov, type;
      for (i = 0; i < bx.length && !fini; i++) {
        x = bx[i];
        if (!init) {
          if (x.type !== "moof") {
            avant.push(x); tailleAvant += x.octets.length;
            if (tailleAvant > INIT_MAX) { finir("erreur"); return; }
            continue;
          }
          moov = avant.filter(function (y) { return y.type === "moov"; })[0];
          if (!moov) { finir("erreur"); return; }
          type = codecs(moov.octets);
          type = type && 'video/mp4; codecs="' + type + '"';
          if (!type || !MediaSource.isTypeSupported(type)) { finir("repli"); return; }
          init = { type: type, octets: coller(avant.map(function (y) { return y.octets; })) };
          piste = pisteVideo(moov.octets); avant = [];
          pret();
        }
        if (x.type === "moof") frag = [x];
        else if (frag.length) {
          frag.push(x);
          if (x.type === "mdat") {
            file.push({ octets: coller(frag.map(function (y) { return y.octets; })), cle: imageCle(frag[0].octets, piste) });
            frag = [];
          }
        }
      }
      if (dec.erreur) { finir("erreur"); return; }
      if (file.length > REGLES.file) { finir("erreur"); return; } // le décodeur ne suit plus : reconnexion
      pomper();
    }
    ms.addEventListener("sourceopen", function () { ouvert = true; try { URL.revokeObjectURL(adr); } catch (e) {} pret(); });
    v.src = adr;
    fetch(url, { signal: ctl.signal, credentials: "same-origin", cache: "no-store" }).then(function (r) {
      var lec;
      if (fini) return;
      if (!r.ok || !r.body) { finir("erreur"); return; }
      lec = r.body.getReader();
      function lire() {
        lec.read().then(function (x) {
          if (fini) return;
          if (x.done) { finir("erreur"); return; }
          recevoir(x.value);
          if (!fini) lire();
        }, function () { finir("erreur"); });
      }
      lire();
    }, function () { finir("erreur"); });
    return { arreter: function () { finir(null); } };
  }

  APP.camDirect = { dispo: dispo, lecteur: lecteur, REGLES: REGLES, _: { decoupeur: decoupeur, pisteVideo: pisteVideo, imageCle: imageCle, codecs: codecs, decision: decision } };
})();
// FIN
