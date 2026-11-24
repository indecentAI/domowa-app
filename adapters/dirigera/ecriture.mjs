// @zone appareils equipements | Ecriture generique DIRIGERA (V2.1 etape ecriture-generique ; cartes du 21/11, section 18) : ecrire(element, cap, valeur, descripteur) traduit une capacite
// deja validee par le coeur (core/capacites.mjs valider : ecriture declaree, bornes, options) vers UNE fonction de la bibliotheque, liste fermee ci-dessous (node_modules/dirigera/dist/api/*.js lus :
// devices.setAttributes et startIdentifying / stopIdentifying, outlets.resetEnergyConsumption, blinds.setTargetLevel et setState, airPurifiers.setFanMode et setMotorState, speakers.setPlayback et
// setVolume, motionSensors.setOnDuration, setScheduleOn et setSchedule, controllers.setControlMode, deviceSets.setIsOn, hub.checkFirmwareUpdate et installFirmwareUpdate ; V2.1 etape
// telecommande-lampes : deviceSets.setAttributes (luminosite, blanc du groupe), create, updateConfiguration, delete (lier)).
// Formats : PATCH /devices/:id [{attributes}] (jamais renvoye par got) ; PUT (identifier, mise a jour du hub) : instance sans renvoi (connexion.mjs, sansRenvoi : got renvoie PUT apres un 5xx).
// Capacite sans traduction : 400 « Commande non prise en charge » (jamais de route generique vers le hub). Aucune valeur ni identifiant journalise.
import { HttpError } from '../../core/http.mjs';
import { withTimeout } from '../../core/outils.mjs';
import { client, sansRenvoi } from './connexion.mjs';
import { horaire, planLier } from './modele.mjs';

const auHub = async (fn) => withTimeout(fn(await client()));
const sansRenvoyer = async (fn) => withTimeout(fn(await sansRenvoi()));
const attr = (id, attributes) => auHub((c) => c.devices.setAttributes({ id, attributes }));

// Traductions (element = identifiant DIRIGERA de l'appareil, ou du hub, ou du groupe pour groupe_onoff : d.groupe)
const T = {
  onoff: (id, v) => attr(id, { isOn: v }),
  demarrage: (id, v) => attr(id, { startupOnOff: v }),
  verrou_enfant: (id, v) => attr(id, { childLock: v }),
  voyant: (id, v) => attr(id, { statusLight: v }),
  muet: (id, v) => attr(id, { isMuted: v }),
  identifier: (id) => sansRenvoyer((c) => c.devices.startIdentifying({ id })),
  identifier_arret: (id) => sansRenvoyer((c) => c.devices.stopIdentifying({ id })),
  remise_energie: (id) => auHub((c) => c.outlets.resetEnergyConsumption({ id })),
  position: (id, v) => auHub((c) => c.blinds.setTargetLevel({ id, blindsTargetLevel: v })),
  ouverture: (id, v) => auHub((c) => c.blinds.setState({ id, blindsState: v })),
  vitesse_predefinie: (id, v) => auHub((c) => c.airPurifiers.setFanMode({ id, fanMode: v })),
  niveau: (id, v) => auHub((c) => c.airPurifiers.setMotorState({ id, motorState: v })),
  lecture: (id, v) => auHub((c) => c.speakers.setPlayback({ id, playback: v })),
  volume: (id, v) => auHub((c) => c.speakers.setVolume({ id, volume: v })),
  // playbackModes : objet complet relu sur le hub, seul shuffle change (format partiel non documente)
  aleatoire: async (id, v) => {
    const d = await auHub((c) => c.devices.get({ id }));
    const m = d && d.attributes && d.attributes.playbackModes;
    if (!m || typeof m !== 'object') throw new HttpError(409, 'Modes de lecture inconnus : relisez l\'enceinte.');
    return attr(id, { playbackModes: { ...m, shuffle: v } });
  },
  duree_allumage: (id, v) => auHub((c) => c.motionSensors.setOnDuration({ id, onDuration: v })),
  programmation: (id, v) => auHub((c) => c.motionSensors.setScheduleOn({ id, scheduleOn: v })),
  horaire: (id, v) => auHub((c) => c.motionSensors.setSchedule({ id, schedule: horaire(v) })),
  mode_commande: (id, v) => auHub((c) => c.controllers.setControlMode({ id, controlMode: v })),
  groupe_onoff: (id, v, d) => auHub((c) => c.deviceSets.setIsOn({ id: groupe(d), isOn: v })),
  groupe_luminosite: (id, v, d) => auHub((c) => c.deviceSets.setAttributes({ id: groupe(d), attributes: { lightLevel: v } })),
  groupe_temperature: (id, v, d) => auHub((c) => c.deviceSets.setAttributes({ id: groupe(d), attributes: { colorTemperature: v } })),
  lier: (id, v) => lier(id, v),
  maj_rechercher: () => sansRenvoyer((c) => c.hub.checkFirmwareUpdate()),
  maj_installer: () => sansRenvoyer((c) => c.hub.installFirmwareUpdate()),
};

const groupe = (d) => { if (!d || typeof d.groupe !== 'string') throw new HttpError(409, 'Aucun groupe du hub.'); return d.groupe; };

// V2.1 etape telecommande-lampes : ajout de l'appareil v aux appareils commandes par l'element (mode) de telecommande id. Groupe temporaire « Domo-wa liens » (deviceSets.create), l'appareil
// seul dedans avec remoteLinkIds [element] (updateConfiguration), lien relu sur le hub (jusqu'a 3 s), puis TOUJOURS : groupe temporaire supprime et groupes d'origine de l'appareil remis avec
// leur liste complete (planLier). Requetes sans renvoi (sansRenvoi : un POST ou DELETE renvoye creerait ou supprimerait deux fois). Aucun nom ni identifiant journalise.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function lier(element, id) {
  const c = await sansRenvoi();
  const p = planLier(await withTimeout(c.devices.list()), element, id);
  if (p.erreur === 'telecommande') throw new HttpError(404, 'Télécommande introuvable sur le hub.');
  if (p.erreur === 'appareil') throw new HttpError(404, 'Appareil introuvable sur le hub.');
  if (p.erreur === 'deja') throw new HttpError(409, 'Déjà commandé par ce mode.');
  const g = await withTimeout(c.deviceSets.create({ name: 'Domo-wa liens', icon: 'lighting_table_lamp' }));
  if (!g || typeof g.id !== 'string') throw new HttpError(502, 'Le hub n\'a pas créé le groupe temporaire.');
  let lie = false, restes = 0;
  try {
    await withTimeout(c.deviceSets.updateConfiguration({ id: g.id, deviceIds: [id], remoteLinkIds: [element] }));
    for (let i = 0; i < 3 && !lie; i++) {
      await pause(1000);
      const d = (await withTimeout(c.devices.list())).find((x) => x && x.id === id);
      lie = !!(d && Array.isArray(d.remoteLinks) && d.remoteLinks.includes(element));
    }
  } finally {
    try { await withTimeout(c.deviceSets.delete({ id: g.id })); } catch (e) { restes++; }
    for (const x of p.groupes) { try { await withTimeout(c.deviceSets.updateConfiguration({ id: x.id, deviceIds: x.deviceIds })); } catch (e) { restes++; } }
  }
  if (restes) throw new HttpError(502, lie ? 'Lampe ajoutée, mais un groupe du hub est à vérifier dans l\'application IKEA (« Domo-wa liens » ou groupe d\'origine).' : 'Lampe non ajoutée ; un groupe du hub est à vérifier dans l\'application IKEA.');
  if (!lie) throw new HttpError(502, 'Le hub n\'a pas ajouté la lampe à ce mode.');
}

// Valeur deja validee par le coeur ; la duree du capteur est arrondie a la minute (pas de l'interface)
export async function ecrire(element, cap, valeur, descripteur) {
  const f = T[cap];
  if (!f) throw new HttpError(400, 'Commande non prise en charge pour cet appareil.');
  if (cap === 'duree_allumage' && (!Number.isInteger(valeur) || valeur < 60 || valeur % 60)) throw new HttpError(400, 'Durée en minutes entières attendue.');
  await f(element, valeur, descripteur);
}
// FIN
