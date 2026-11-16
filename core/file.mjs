// @zone socle | File d'ecritures commune (qualite 2026-11-12, socle de la proposition P2) : plafond d'ecritures par seconde (fenetre glissante d'1 s ; les ecritures d'un envoi sont reservees ensemble, chacune datee de son depart reel), un envoi a la fois par cible, ecart minimal entre deux envois a une meme cible, envoi en retard abandonne (jamais rattrape). Ne connait ni marque, ni type, ni animation : aujourd'hui utilisee par le seul moteur des animations.
// Entree de la file : objet libre portant due (instant prevu, ms) et limite (au-dela : abandon) ; cleDe(entree) donne sa cible (lampe), ecritures(entree) son nombre d'ecritures.
// envoyer(entree, marquer) part tout de suite (appel synchrone dans la pompe) et rend une promesse ; marquer(i) date le depart reel de l'ecriture n° i.
// La cible est liberee, et la pompe relancee, quand cette promesse se termine (reussite ou echec : l'erreur est a traiter par envoyer).
export function creerFile({ plafond, ecart, cleDe, ecritures, envoyer, abandon = () => {} }) {
  let fenetre = [], file = [], pompeT = null; // fenetre : [{t}] ecritures de la derniere seconde (t : instant reel d'envoi, reserve a l'avance)
  const vol = new Set(), dernier = new Map(), finEnvoi = new Map(); // cibles en cours d'envoi ; instant du dernier envoi et de sa reponse, par cible

  function pompe() {
    clearTimeout(pompeT); pompeT = null;
    const now = Date.now();
    fenetre = fenetre.filter((x) => now - x.t < 1000);
    file = file.filter((c) => { if (c.limite >= now) return true; abandon(c); return false; });
    file.sort((a, b) => a.due - b.due);
    let attente = Infinity;
    for (const c of file.slice()) {
      if (c.due > now) { attente = Math.min(attente, c.due - now); break; }
      const n = ecritures(c), k = cleDe(c);
      if (fenetre.length + n > plafond) { attente = Math.min(attente, Math.min(...fenetre.map((x) => x.t)) + 1000 - now); break; }
      if (vol.has(k)) continue; // la fin de l'envoi relance la pompe
      const d = dernier.get(k);
      if (d !== undefined && now - d < ecart) { attente = Math.min(attente, d + ecart - now); continue; }
      file.splice(file.indexOf(c), 1);
      partir(c, k, n, now);
    }
    if (file.length && attente < Infinity) pompeT = setTimeout(pompe, Math.max(10, attente + 1));
  }
  function partir(c, k, n, now) {
    const places = Array.from({ length: n }, () => ({ t: now }));
    vol.add(k); dernier.set(k, now); fenetre.push(...places);
    const marquer = (i) => { if (places[i]) places[i].t = Date.now(); };
    let p;
    try { p = Promise.resolve(envoyer(c, marquer)); } catch (e) { p = Promise.reject(e); }
    const fin = () => { vol.delete(k); finEnvoi.set(k, Date.now()); pompe(); };
    p.then(fin, fin);
  }

  return {
    // Ajoute une liste d'entrees, puis une seule passe de la pompe (meme appelee sans entree : elle recalcule son prochain reveil)
    ajouter(entrees) { for (const c of entrees) file.push(c); pompe(); },
    // Retire sans les envoyer (ni les compter abandonnees) les entrees choisies ; un envoi deja parti n'est pas touche
    retirer(pred) { file = file.filter((c) => !pred(c)); },
    contient: (pred) => file.some(pred),
    occupe: (k) => vol.has(k),
    // Instant de la derniere reponse d'un envoi a cette cible (0 : jamais)
    finDe: (k) => finEnvoi.get(k) || 0,
  };
}
// FIN
