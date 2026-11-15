// @zone appareils | Confirmation d'une commande groupee (Tout OFF, piece, lot de lumieres) : attendre 1 s, relire, reprendre une fois appareil par appareil ceux qui restent en ecart, relire. Une reprise n'est jamais renvoyee ; dependances injectables (essais unitaires).
import { sleep } from './outils.mjs';
import { lister } from './appareils.mjs';
import { pourClient } from './modele.mjs';

export const DELAI_CONFIRMATION = 1000;
const relireClient = async () => pourClient(await lister());

// cibles : appareils commandes ({id, ...}) ; enEcart(cible, relu | undefined) -> vrai si l'etat relu n'est pas celui voulu ;
// reprendre(cible) : UNE commande de reprise par cible en ecart (facultatif : sans, simple verification) ; son echec est signale par restants.
// relire() -> liste relue au format client (defaut : pourClient(lister())) ; attendre(ms) (defaut : sleep).
// -> {apres (derniere liste relue), restants (cibles toujours en ecart, dans l'ordre des cibles), relances (reprises envoyees)}
export async function confirmer({ cibles, enEcart, reprendre = null, relire = relireClient, attendre = sleep, delai = DELAI_CONFIRMATION }) {
  await attendre(delai);
  let apres = await relire();
  const ecarts = () => cibles.filter((t) => enEcart(t, apres.find((a) => a.id === t.id)));
  let restants = ecarts();
  let relances = 0;
  if (restants.length && reprendre) {
    relances = restants.length;
    for (const t of restants) { try { await reprendre(t); } catch (e) { /* signale par restants */ } }
    await attendre(delai);
    apres = await relire();
    restants = ecarts();
  }
  return { apres, restants, relances };
}
// FIN
