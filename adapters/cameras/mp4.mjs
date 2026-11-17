// @zone cameras | Lecture du MP4 fragmenté produit par ffmpeg (V1.9, flux partagé) : découpage de la sortie en boîtes de premier niveau (ftyp, moov, moof, mdat...), piste vidéo et drapeaux par défaut lus dans moov (tkhd, hdlr « vide », trex), image clé en tête d'un fragment lue dans moof (tfhd, trun : drapeau sample_is_non_sync_sample, ISO/IEC 14496-12 8.8). Calculs purs, aucune entrée ni sortie ; essais : banc/unitaires/mp4.test.mjs.
// Options de sortie de ffmpeg dont dépend ce découpage (cameras.mjs, lancer) : image copiée telle quelle, son en AAC, MP4 fragmenté sans index, un fragment à chaque image clé et toutes les 0,5 s.
export const SORTIE = ['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '48k', '-ar', '16000', '-ac', '1',
  '-max_muxing_queue_size', '1024', '-avoid_negative_ts', 'make_zero',
  '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '500000', '-flush_packets', '1', '-f', 'mp4', 'pipe:1'];
export const BOITE_MAX = 8 * 1024 * 1024; // une boîte de plus de 8 Mo : flux illisible (un fragment HD de 0,5 s pèse quelques centaines de Ko)
const NON_SYNC = 0x00010000;

// Découpeur : pousser(morceau) -> boîtes complètes [{type, buf}] (buf = boîte entière, en-tête compris) ; erreur (texte) dès qu'une boîte est mal formée, puis plus rien.
export function creerDecoupeur(max = BOITE_MAX) {
  let reste = Buffer.alloc(0), erreur = null;
  return {
    get erreur() { return erreur; },
    pousser(morceau) {
      if (erreur) return [];
      reste = reste.length ? Buffer.concat([reste, morceau]) : morceau;
      const sortie = [];
      while (reste.length >= 8) {
        let taille = reste.readUInt32BE(0), entete = 8;
        const type = reste.toString('latin1', 4, 8);
        if (!/^[\x20-\x7e]{4}$/.test(type)) { erreur = 'type de boîte invalide'; break; }
        if (taille === 1) {
          if (reste.length < 16) break;
          const grande = reste.readBigUInt64BE(8);
          if (grande > BigInt(max)) { erreur = 'boîte trop grande'; break; }
          taille = Number(grande); entete = 16;
        } else if (taille === 0) { erreur = 'boîte sans taille'; break; }
        if (taille < entete) { erreur = 'taille de boîte invalide'; break; }
        if (taille > max) { erreur = 'boîte trop grande'; break; }
        if (reste.length < taille) break;
        sortie.push({ type, buf: reste.subarray(0, taille) });
        reste = reste.subarray(taille);
      }
      if (erreur) reste = Buffer.alloc(0);
      return sortie;
    },
  };
}

// Enfants d'une boîte conteneur (contenu de buf à partir de debut) ; une boîte mal formée arrête la lecture.
function enfants(buf, debut = 8) {
  const l = [];
  let i = debut;
  while (i + 8 <= buf.length) {
    let taille = buf.readUInt32BE(i), entete = 8;
    if (taille === 1) { if (i + 16 > buf.length) break; taille = Number(buf.readBigUInt64BE(i + 8)); entete = 16; }
    if (taille < entete || i + taille > buf.length) break;
    l.push({ type: buf.toString('latin1', i + 4, i + 8), buf: buf.subarray(i, i + taille), contenu: entete });
    i += taille;
  }
  return l;
}
const fils = (b, type) => enfants(b.buf, b.contenu).filter((e) => e.type === type);
const premier = (b, type) => fils(b, type)[0] || null;

// Piste vidéo d'un moov : {id, defaut (drapeaux par défaut de trex, ou null)} ; null sans piste vidéo lisible.
export function pisteVideo(moov) {
  try {
    const m = { buf: moov, contenu: 8 };
    let id = null;
    for (const trak of fils(m, 'trak')) {
      const tkhd = premier(trak, 'tkhd'), mdia = premier(trak, 'mdia'), hdlr = mdia && premier(mdia, 'hdlr');
      if (!tkhd || !hdlr || hdlr.buf.toString('latin1', hdlr.contenu + 8, hdlr.contenu + 12) !== 'vide') continue;
      const c = tkhd.contenu, v = tkhd.buf[c];
      id = tkhd.buf.readUInt32BE(c + (v === 1 ? 20 : 12));
      break;
    }
    if (id === null) return null;
    let defaut = null;
    const mvex = premier(m, 'mvex');
    for (const trex of mvex ? fils(mvex, 'trex') : []) {
      if (trex.buf.readUInt32BE(trex.contenu + 4) === id) defaut = trex.buf.readUInt32BE(trex.contenu + 20);
    }
    return { id, defaut };
  } catch (e) { return null; }
}

// Le fragment (moof) commence-t-il par une image clé de la piste vidéo ? true, false, ou null (illisible : piste absente, aucun échantillon).
export function imageCle(moof, piste) {
  if (!piste) return null;
  try {
    for (const traf of fils({ buf: moof, contenu: 8 }, 'traf')) {
      const tfhd = premier(traf, 'tfhd');
      if (!tfhd) continue;
      const c = tfhd.contenu, fl = tfhd.buf.readUInt32BE(c) & 0xffffff;
      if (tfhd.buf.readUInt32BE(c + 4) !== piste.id) continue;
      let o = c + 8, defaut = piste.defaut;
      if (fl & 0x01) o += 8;
      if (fl & 0x02) o += 4;
      if (fl & 0x08) o += 4;
      if (fl & 0x10) o += 4;
      if (fl & 0x20) defaut = tfhd.buf.readUInt32BE(o);
      for (const trun of fils(traf, 'trun')) {
        const t = trun.contenu, tf = trun.buf.readUInt32BE(t) & 0xffffff;
        if (trun.buf.readUInt32BE(t + 4) === 0) continue;
        let p = t + 8, drapeaux = defaut;
        if (tf & 0x01) p += 4;
        if (tf & 0x04) drapeaux = trun.buf.readUInt32BE(p);
        else if (tf & 0x400) {
          if (tf & 0x100) p += 4;
          if (tf & 0x200) p += 4;
          drapeaux = trun.buf.readUInt32BE(p);
        }
        if (drapeaux === null || drapeaux === undefined) return null;
        return (drapeaux & NON_SYNC) === 0;
      }
      return null;
    }
    return null;
  } catch (e) { return null; }
}
// FIN
