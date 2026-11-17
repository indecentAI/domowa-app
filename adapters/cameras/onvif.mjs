// @zone cameras | Appels ONVIF vers une caméra (SOAP 1.2, en-tête WS-Security UsernameToken à condensé ; adressage WS-Addressing pour le service d'événements, exigé par l'ONVIF Core Specification) et lecture des réponses du service d'événements (V1.9 : sujets de GetEventProperties, adresse d'un abonnement CreatePullPointSubscription, messages de PullMessages) ; retour au centre d'après GetNodes du service PTZ (lireCentre). Appel vers la caméra seulement (adresse de service refusée si l'hôte n'est pas celui de la caméra). Lecture des réponses par une analyse simple des balises (aucune bibliothèque) ; calculs purs essayés par banc/unitaires/onvif.test.mjs.
import http from 'node:http';
import crypto from 'node:crypto';

export const ONVIF_PORT = 2020;
export const NS = { tds: 'http://www.onvif.org/ver10/device/wsdl', trt: 'http://www.onvif.org/ver10/media/wsdl', tptz: 'http://www.onvif.org/ver20/ptz/wsdl', tt: 'http://www.onvif.org/ver10/schema',
  tev: 'http://www.onvif.org/ver10/events/wsdl', wsnt: 'http://docs.oasis-open.org/wsn/b-2', wsa: 'http://www.w3.org/2005/08/addressing' };
// Actions du service d'événements (event.wsdl de l'ONVIF), portées par wsa:Action.
export const ACTIONS = {
  proprietes: NS.tev + '/EventPortType/GetEventPropertiesRequest',
  abonner: NS.tev + '/EventPortType/CreatePullPointSubscriptionRequest',
  tirer: NS.tev + '/PullPointSubscription/PullMessagesRequest',
  desabonner: NS.tev + '/SubscriptionManager/UnsubscribeRequest',
};
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Enveloppe SOAP 1.2 : WS-Security (condensé du mot de passe, jamais le mot de passe en clair) ; adressage {action, vers} : en-têtes wsa:Action et wsa:To.
export function enveloppe(sec, corps, adressage) {
  const nonce = crypto.randomBytes(16), created = new Date().toISOString();
  const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(sec.pwd)])).digest('base64');
  const wsa = adressage ? '<wsa:Action xmlns:wsa="' + NS.wsa + '">' + esc(adressage.action) + '</wsa:Action><wsa:To xmlns:wsa="' + NS.wsa + '">' + esc(adressage.vers) + '</wsa:To>' : '';
  return '<?xml version="1.0" encoding="utf-8"?><soap-env:Envelope xmlns:soap-env="http://www.w3.org/2003/05/soap-envelope"><soap-env:Header>' +
    '<Security xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><UsernameToken><Username>' + esc(sec.user) + '</Username>' +
    '<Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">' + digest + '</Password>' +
    '<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' + nonce.toString('base64') + '</Nonce>' +
    '<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">' + created + '</Created></UsernameToken></Security>' + wsa +
    '</soap-env:Header><soap-env:Body>' + corps + '</soap-env:Body></soap-env:Envelope>';
}
// Appel SOAP vers la caméra uniquement -> {status, body} ; o.action : adressage WS-Addressing (service d'événements) ; o.delai : 8 s par défaut.
export function soap(cam, sec, url, corps, o = {}) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(new Error('URL de service invalide')); }
    if (u.hostname !== cam.host) return reject(new Error('adresse de service refusée'));
    const data = Buffer.from(enveloppe(sec, corps, o.action ? { action: o.action, vers: url } : null));
    const r = http.request({ host: cam.host, port: Number(u.port) || Number(cam.onvif_port) || ONVIF_PORT, path: u.pathname + u.search, method: 'POST', timeout: o.delai || 8000,
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' + (o.action ? '; action="' + o.action + '"' : ''), 'Content-Length': data.length } }, (res) => {
      let b = ''; res.on('data', (d) => { if (b.length < 200000) b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('timeout', () => { r.destroy(new Error('délai dépassé')); });
    r.on('error', (e) => reject(new Error(e.code || e.message)));
    r.end(data);
  });
}
// Adresse d'un service dans la réponse de GetCapabilities (bloc Media, PTZ, Events…).
export const xaddr = (b, bloc) => { const m = new RegExp('<[^>]*' + bloc + '[^>]*>[\\s\\S]*?XAddr>([^<]+)<').exec(b); return m ? m[1].trim() : null; };
export const capacites = (cam) => 'http://' + cam.host + ':' + (Number(cam.onvif_port) || ONVIF_PORT) + '/onvif/device_service';
export const CORPS = {
  capacites: '<tds:GetCapabilities xmlns:tds="' + NS.tds + '"><tds:Category>All</tds:Category></tds:GetCapabilities>',
  proprietes: '<tev:GetEventProperties xmlns:tev="' + NS.tev + '"/>',
  abonner: (duree) => '<tev:CreatePullPointSubscription xmlns:tev="' + NS.tev + '"><tev:InitialTerminationTime>PT' + duree + 'S</tev:InitialTerminationTime></tev:CreatePullPointSubscription>',
  tirer: (attente, max) => '<tev:PullMessages xmlns:tev="' + NS.tev + '"><tev:Timeout>PT' + attente + 'S</tev:Timeout><tev:MessageLimit>' + max + '</tev:MessageLimit></tev:PullMessages>',
  desabonner: '<wsnt:Unsubscribe xmlns:wsnt="' + NS.wsnt + '"/>',
};

// Balises d'un texte XML, dans l'ordre : {fin, nom (sans préfixe), attrs: {nom local: valeur}, vide, debut, apres}. Commentaires, déclarations et CDATA ignorés.
function balises(xml) {
  const l = [], re = /<(\/?)([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = {};
    m[4].replace(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k, a, b) => { attrs[k.replace(/^[^:]*:/, '')] = a !== undefined ? a : b; return x; });
    l.push({ fin: m[1] === '/', nom: m[3], attrs, vide: m[5] === '/', debut: m.index, apres: re.lastIndex });
  }
  return l;
}
const texte = (t) => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Sujets annoncés par GetEventPropertiesResponse : [{sujet: « RuleEngine/CellMotionDetector/Motion », donnees: [noms des valeurs]}], dans l'ordre du document.
export function lireSujets(xml) {
  const i = String(xml).search(/<[\w-]*:?TopicSet[\s>]/);
  if (i < 0) return [];
  const l = balises(String(xml).slice(i)), sujets = [], chemin = [];
  let profondeur = 0, desc = 0, courant = null;
  for (const b of l) {
    if (profondeur === 0) { if (b.nom === 'TopicSet' && !b.fin) profondeur = 1; continue; }
    if (b.fin) {
      if (desc) { if (b.nom === 'MessageDescription') desc = 0; continue; }
      if (b.nom === 'TopicSet') break;
      const n = chemin.pop();
      if (courant && n === courant.nom && chemin.length === courant.niveau) courant = null;
      continue;
    }
    if (desc) {
      if (b.nom === 'Data') desc = 2; else if (b.nom === 'Source' || b.nom === 'Key') desc = 1;
      if (desc === 2 && b.nom === 'SimpleItemDescription' && b.attrs.Name && courant) courant.entree.donnees.push(b.attrs.Name);
      continue;
    }
    if (b.nom === 'MessageDescription') { if (!b.vide) desc = 1; continue; }
    if (b.vide) { if (b.attrs.topic === 'true') sujets.push({ sujet: chemin.concat(b.nom).join('/'), donnees: [] }); continue; }
    chemin.push(b.nom);
    if (b.attrs.topic === 'true') { const entree = { sujet: chemin.join('/'), donnees: [] }; sujets.push(entree); courant = { nom: b.nom, niveau: chemin.length - 1, entree }; }
  }
  return sujets;
}
// Adresse de l'abonnement (CreatePullPointSubscriptionResponse : SubscriptionReference/Address) ; null si absente.
export function lireAbonnement(xml) {
  const m = /SubscriptionReference[\s\S]*?<(?:[\w-]+:)?Address[^>]*>([^<]+)</.exec(String(xml));
  return m ? texte(m[1]).trim() : null;
}
// Messages de PullMessagesResponse : [{sujet (préfixe d'espace de noms retiré), heure (UtcTime), operation (Initialized|Changed|Deleted|null), source: {nom: valeur}, donnees: {nom: valeur}}].
export function lireMessages(xml) {
  const l = [], blocs = String(xml).split(/<(?:[\w-]+:)?NotificationMessage[\s>]/).slice(1);
  for (const bloc of blocs) {
    const t = /<(?:[\w-]+:)?Topic[^>]*>([^<]*)</.exec(bloc);
    const msg = { sujet: t ? texte(t[1]).trim().split('/').map((x) => x.replace(/^[^:]*:/, '')).join('/') : '', heure: null, operation: null, source: {}, donnees: {} };
    let partie = null;
    for (const b of balises(bloc)) {
      if (b.nom === 'Message' && !b.fin && b.attrs.UtcTime) { msg.heure = b.attrs.UtcTime; msg.operation = b.attrs.PropertyOperation || null; }
      if (b.nom === 'Source' || b.nom === 'Data' || b.nom === 'Key') partie = b.fin ? null : b.nom;
      if (b.nom === 'SimpleItem' && !b.fin && b.attrs.Name && partie) {
        if (partie === 'Data') msg.donnees[b.attrs.Name] = b.attrs.Value === undefined ? null : texte(b.attrs.Value);
        else if (partie === 'Source') msg.source[b.attrs.Name] = b.attrs.Value === undefined ? null : texte(b.attrs.Value);
      }
    }
    l.push(msg);
  }
  return l;
}
// Retour au centre d'après GetNodesResponse du service PTZ (ptz.wsdl, tt:PTZNode) : nœud de jeton noeud (celui du profil), sinon le premier ;
// espace de position absolue déclaré (AbsolutePanTiltPositionSpace : le générique d'abord) -> {absolu: {x, y, espace}} au milieu de XRange et YRange ;
// sinon HomeSupported vrai -> {maison: true} (GotoHomePosition) ; sinon null (la caméra ne sait pas revenir au centre).
export function lireCentre(xml, noeud) {
  const noeuds = [], re = /<(?:[\w-]+:)?PTZNode\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?PTZNode>/g;
  let m;
  while ((m = re.exec(String(xml)))) { const t = /\stoken\s*=\s*"([^"]*)"/.exec(m[1]); noeuds.push({ token: t ? texte(t[1]) : null, corps: m[2] }); }
  const n = noeuds.find((x) => noeud && x.token === noeud) || noeuds[0];
  if (!n) return null;
  const espaces = [], rs = /<(?:[\w-]+:)?AbsolutePanTiltPositionSpace>([\s\S]*?)<\/(?:[\w-]+:)?AbsolutePanTiltPositionSpace>/g;
  const nb = (b, axe, borne) => {
    const r = new RegExp('<(?:[\\w-]+:)?' + axe + 'Range>([\\s\\S]*?)</(?:[\\w-]+:)?' + axe + 'Range>').exec(b);
    const v = r && new RegExp('<(?:[\\w-]+:)?' + borne + '>\\s*([-+0-9.eE]+)\\s*<').exec(r[1]);
    return v ? Number(v[1]) : NaN;
  };
  while ((m = rs.exec(n.corps))) {
    const u = /<(?:[\w-]+:)?URI>\s*([^<\s]+)\s*</.exec(m[1]);
    const e = { espace: u ? texte(u[1]) : null, x: [nb(m[1], 'X', 'Min'), nb(m[1], 'X', 'Max')], y: [nb(m[1], 'Y', 'Min'), nb(m[1], 'Y', 'Max')] };
    if (e.espace && [...e.x, ...e.y].every(Number.isFinite) && e.x[0] <= e.x[1] && e.y[0] <= e.y[1]) espaces.push(e);
  }
  const e = espaces.find((x) => /PositionGenericSpace$/.test(x.espace)) || espaces[0];
  const milieu = (r) => Math.round((r[0] + r[1]) / 2 * 1000) / 1000;
  if (e) return { absolu: { x: milieu(e.x), y: milieu(e.y), espace: e.espace } };
  if (/<(?:[\w-]+:)?HomeSupported>\s*true\s*</.test(n.corps)) return { maison: true };
  return null;
}
// Message d'erreur SOAP (Fault) lisible : code et raison, sans adresse ; null s'il n'y en a pas.
export function lireErreur(xml) {
  if (!/<(?:[\w-]+:)?Fault[\s>]/.test(String(xml))) return null;
  const v = /<(?:[\w-]+:)?Subcode>[\s\S]*?<(?:[\w-]+:)?Value>([^<]+)</.exec(xml) || /<(?:[\w-]+:)?Value>([^<]+)</.exec(xml);
  const r = /<(?:[\w-]+:)?Text[^>]*>([^<]*)</.exec(xml);
  return [(v && v[1].trim()) || 'Fault', r && r[1].trim()].filter(Boolean).join(' : ');
}
// FIN
