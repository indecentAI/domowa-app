// @zone socle | Adresses IPv4 du reseau local : estIPv4, privee (10/8, 172.16/12, 192.168/16), reseaux() (sous-reseaux prives de la tablette ; repli sur le /24 des hubs declares si Android refuse la liste des interfaces), adresseLocale(ip). Ne connait aucune marque.
import os from 'node:os';
import { adressesHubs } from './appareils.mjs';

export function estIPv4(s) { return typeof s === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every((x) => Number(x) <= 255); }
export const vers = (ip) => { const p = ip.split('.').map(Number); return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3]; };
export const depuis = (n) => [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
export function privee(ip) { if (!estIPv4(ip)) return false; const p = ip.split('.').map(Number); return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168); }
// Sous-reseaux IPv4 prives de la tablette : { ip, base, masque, base24 }. Repli (Android peut refuser os.networkInterfaces) : le /24 de chaque hub
// declare (contrat hub.adresses(), adaptateurs deja charges) ; jusqu'en V1.2 etape 5 : le /24 de HUB_IP (config.mjs).
export function reseaux() {
  const r = [];
  try {
    const ifs = os.networkInterfaces();
    for (const nom of Object.keys(ifs)) for (const a of ifs[nom] || []) {
      if (a.family !== 'IPv4' || a.internal || !privee(a.address) || !estIPv4(a.netmask)) continue;
      const masque = vers(a.netmask);
      r.push({ ip: a.address, masque, base: (vers(a.address) & masque) >>> 0, base24: (vers(a.address) & 0xFFFFFF00) >>> 0 });
    }
  } catch (e) { /* liste refusee : repli ci-dessous */ }
  if (!r.length) for (const ip of adressesHubs()) {
    if (!privee(ip)) continue;
    const base = (vers(ip) & 0xFFFFFF00) >>> 0;
    if (!r.some((x) => x.base === base)) r.push({ ip, masque: 0xFFFFFF00, base, base24: base });
  }
  return r;
}
export function adresseLocale(ip) {
  if (!privee(ip)) return false;
  const n = vers(ip);
  return reseaux().some((r) => ((n & r.masque) >>> 0) === r.base);
}
// FIN
