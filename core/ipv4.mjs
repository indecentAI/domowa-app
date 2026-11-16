// @zone socle | Adresses IPv4, fonctions pures sans dependance (qualite 2026-11-12 : une seule definition, partagee par core/reseau.mjs et core/serveur.mjs ; ce dernier sert aussi aux scripts, sans charger le registre des adaptateurs) : estIPv4, privee (10/8, 172.16/12, 192.168/16), vers (nombre), depuis (texte).
export function estIPv4(s) { return typeof s === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every((x) => Number(x) <= 255); }
export const vers = (ip) => { const p = ip.split('.').map(Number); return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3]; };
export const depuis = (n) => [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
export function privee(ip) { if (!estIPv4(ip)) return false; const p = ip.split('.').map(Number); return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168); }
// FIN
