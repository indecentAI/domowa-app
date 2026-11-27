# INDEX.md - genere par "node outils/ia.mjs" (ne pas modifier a la main)
Tailles en tokens estimes (octets / 3,3). R = routes (sans le prefixe /api), E = expose, I = importe, L = reperes nom@ligne (fichiers de plus de 20 Ko : Read avec offset et limit).
Un paquet = CLAUDE.md + regles de zone + INDEX.md + fichiers de la ou des zones demandees.

## socle (~42.8k tok)
- config.mjs 84 : Constantes LOCAL_HOST, LOCAL_PORT. L'adresse du hub DIRIGERA (ancienne constante HUB_IP) est dans donnees/d... E: LOCAL_HOST LOCAL_PORT
- core/file.mjs 1.0k : File d'ecritures commune (qualite 2026-11-12, socle de la proposition P2) : plafond d'ecritures par seconde... E: creerFile
- core/http.mjs 982 : Outils HTTP : HOSTS/ORIGINS autorises, HttpError, send (JSON no-store), readBody (JSON, 4 Ko max par defaut... E: ORIGINS reglerReseau hoteValide HttpError send CORPS_MAX readBody checkWrite ajouterTraducteur describe I: ../config.mjs
- core/ipv4.mjs 283 : Adresses IPv4, fonctions pures sans dependance (qualite 2026-11-12 : une seule definition, partagee par cor... E: estIPv4 vers depuis privee
- core/outils.mjs 1.1k : Utilitaires communs : DIR (racine du projet), DONNEES (donnees/, 700 ; V1.8 : dossier choisi par DOMOWA_DON... E: DIR choisirDonnees DONNEES log sleep versionInstallee withTimeout borne lireJson ecrireJson ecrireSecret nouvelId
- core/portier.mjs 1.6k : Controle d'entree de chaque requete (V1.8 ; extrait de server.mjs en qualite 2026-11-12, dependances inject... E: statique libre portier diagnosticReseau I: http.mjs
- core/reseau.mjs 1.1k : Adresses IPv4 du reseau local : estIPv4, privee (10/8, 172.16/12, 192.168/16 ; definies dans core/ipv4.mjs)... E: reseaux adresseLocale ADRESSE_REFUSEE rechercherMdns estIPv4 vers depuis privee I: appareils.mjs http.mjs ipv4.mjs
- core/routeur.mjs 1.3k : Registre de routes : charge modules/*.mjs puis les routes apportees par les adaptateurs. Un module exporte ... E: tailleCorps defaut enregistrer preparer inventaire repondre api I: outils.mjs http.mjs appareils.mjs
- maj.sh 3.9k : Mise a jour depuis le depot : etapes ou version affichees puis confirmees, avance seule (jamais de fusion),...
- public/app.js 3.1k : Objet global APP : $, el, api (XHR), bandeau, statut, setBusy, distant et lieu (V1.8 : page servie par l'ec... E: APP.el APP.lieu APP.api APP.banner APP.setBusy APP.colorOf APP.find APP.lights APP.selIds APP.roomKey APP.refresh APP.render APP.showTab
- public/base.css 1.7k : variables, polices, page figée, boutons génériques, bandeau, vues. Charger en premier.
- public/commandes.js 824 : Verification apres commande et compte rendu : APP.verify(devices, items) -> noms en ecart, APP.report(repon... E: APP.verify APP.report APP.applyLights
- public/entete.css 1.3k : en-tête, boutons ronds, statut, menu latéral (tiroir) et voile.
- public/index.html 2.2k : Structure de la page (header, menu « ⋯ » #plusMenu (dont #accOrgBtn : V1.9 révision 3, #majBtn, #clientsBtn...
- public/menu.js 2.3k : Menu lateral et navigation : navModel (pieces, dont celles sans appareil ON/OFF, categories, categories ext... E: APP.nav
- public/navigation.js 2.5k : Navigation commune aux deux versions (V1.6) : menu « ⋯ » de l'en-tête (#plusBtn, #plusMenu : Actualiser, Pl... E: APP.affichage APP.theme APP.fermerDessus
- public/prevision.js 1.2k : Mise a jour immediate : un POST connu est applique a l'affichage avant la reponse, annule si echec total, r... E: APP.prevoir APP.api
- public/themes.css 11.8k : themes.css (V2.2 étape 6, thème clair) : toutes les variables de l'interface. Chargée juste après base.css ...
- public/version.js 2.5k : Choix de la version (V1.6) : classe « tel » (smartphone) ou « tab » (tablette) posée sur <html> avant le pr...
- sauvegarde.sh 321 : Sauvegarde des fichiers .json de donnees/ sans secret (liste fermee : jamais dirigera-token.txt, camera-sec...
- server.mjs 1.1k : Point d'entree : ecoute locale HTTP 127.0.0.1:8080 (controle Host, sans appairage) et, en mode distant (V1.... I: config.mjs core/http.mjs core/outils.mjs core/routeur.mjs core/serveur.mjs core/acces.mjs core/portier.mjs core/annonce.mjs
- start.sh 368 : Demarre le serveur (sauvegarde des donnees, nohup, attente) et ouvre Chrome. V1.8 : se place dans son propr...
- stop.sh 141 : Arrete le serveur (server.pid) et libere le verrou de veille. V1.8 : se place dans son propre dossier (lien...

## appareils (~27.2k tok)
- adapters/dirigera/connexion.mjs 2.8k : Connexion au hub DIRIGERA : adresse (donnees/dirigera.json, migree de config.mjs), jeton (donnees/dirigera-... E: ID lire jetonPresent etatLocal client sansRenvoi enregistrer deconnecter erreur auHub sansRenvoyer I: ../../core/outils.mjs ../../core/reseau.mjs evenements.mjs
- adapters/dirigera/ecriture.mjs 2.1k : Ecriture generique DIRIGERA (V2.1 etape ecriture-generique ; cartes du 21/11, section 18) : ecrire(element,... E: ecrire I: ../../core/http.mjs ../../core/outils.mjs connexion.mjs modele.mjs
- adapters/dirigera/evenements.mjs 1.5k : Evenements du hub DIRIGERA (V2.1 etape evenements ; cartes du 21/11, section 1) : abonnement par la bibliot... E: recevoir constater heures suivre arreter _essai I: ../../core/outils.mjs
- adapters/dirigera/index.mjs 1.9k : Adaptateur DIRIGERA : lister, relire (versModele de modele.mjs : capacites, V2.1), equipements (V2.1 : tout... E: scenesHub lister equipements relire pieces piece animer appliquer erreur hub gestionPieces ecrire I: connexion.mjs pieces.mjs modele.mjs evenements.mjs hub.mjs ecriture.mjs
- adapters/dirigera/manifest.json 78 : Manifeste : Hub IKEA DIRIGERA : lumieres et prises (HTTPS local, TLS strict, adresse donnees/dirigera.json, jeton donnees/dirigera-token.txt, npm dirigera 2.0.2 ; contrat hub)
- adapters/dirigera/modele.mjs 6.8k : Adaptateur DIRIGERA : description en capacites de tout appareil et du hub de la bibliotheque dirigera 2.0.2... E: decrire versModele versEquipements planLier horaire I: ../../core/modele.mjs ../../core/capacites.mjs ../../core/http.mjs L: opts@11 cond@15 decrire@93 a_@96 versModele@122 versEquipements@139 crDe@182 nomDe@183 lies@184 planLier@220 horaire@231
- adapters/homeassistant/manifest.json 119 : Manifeste : Home Assistant (HTTP local, adresse IPv4 privee, adresse donnees/homeassistant.json, jeton donnees/homeassistant-token.txt ; contrat hub) : lumieres et prises (V2.0), toutes les entites en capacites (V2.1, vue Equipements), ecriture generique en liste fermee (V2.2)
- core/appareils.mjs 7.3k : Registre des adaptateurs (adapters/<id>/manifest.json + module) : liste commune des appareils (cache 1 s, i... E: charger actifs extensions hubs adressesHubs enRetrait hubBloque invalider pannes uniques lister trouver appliquer relire peutAnimer animer piece gestionsPieces rangeables pieces CACHE_EQUIP equipements codeAppairage scenesHub actionScene optionsCommande ecrireCapacite I: outils.mjs http.mjs modele.mjs capacites.mjs L: charger@21 actifs@45 extensions@47 hubs@49 adressesHubs@50 avecUtilise@59 sur@60 utilise@61 retrait@62 enRetrait@69 hubBloque@70 objet@82 normaliser@83 invalider@86 listerUn@87 enVol@99 fin@101 motif@105 panne@111 noter@112 pannes@119 signaler@124 uniques@125 lister@136 trouver@152 de@154 appliquer@159 relire@160 peutAnimer@167 animer@168 piece@177 gestionsPieces@184 rangeables@188 pieces@191 proprietaire@213 equipUn@214 presenter@227 composerEquipement@236 equipements@244 codeAppairage@260 scenesHub@270 actionScene@287 optionsCommande@306 ecrireCapacite@319
- core/confirmation.mjs 499 : Confirmation d'une commande groupee (Tout OFF, piece, lot de lumieres) : attendre 1 s, relire, reprendre un... E: DELAI_CONFIRMATION confirmer I: outils.mjs appareils.mjs modele.mjs
- core/modele.mjs 1.9k : Modele commun d'un appareil (ID_RE, estOnOff), validation d'un reglage (reglage) et conversion vers le form... E: KELVIN_MIN ID_RE estOnOff reglage manque pourClient projeter ancien I: http.mjs
- modules/appareils.mjs 779 : Routes appareils : etat (V1.8 : mode local | distant du serveur, distant = demande arrivee par l'ecoute res... R: GET /status /devices /rooms ; POST /devices/:id/power|brightness|cmd E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs animations-moteur.mjs ../core/serveur.mjs
- modules/pieces.mjs 665 : Route ON/OFF d'une piece {on, kind: light|outlet} : commande de piece native, relue apres 1 s, reprise appa... R: POST /rooms/:id/power E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs ../core/confirmation.mjs animations-moteur.mjs
- modules/tout-off.mjs 803 : Route Tout OFF {confirm: true} : une commande de piece par piece pour les lumieres, puis appareil par appar... R: POST /actions/all-off E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs ../core/confirmation.mjs animations-moteur.mjs

## equipements (~49.6k tok)
- adapters/dirigera/ecriture.mjs (voir appareils)
- adapters/dirigera/evenements.mjs (voir appareils)
- adapters/dirigera/modele.mjs (voir appareils)
- adapters/homeassistant/ecriture.mjs 5.1k : Ecriture generique Home Assistant (V2.2 etape ha-ecriture ; contrat « Capacités ») : ecrire(element, cap, v... E: COMMANDES ecrivable actionDe ecrire masquer I: ../../core/http.mjs ../../core/capacites.mjs connexion.mjs modele.mjs
- adapters/homeassistant/modele.mjs 12.6k : Home Assistant, fonctions pures (sans reseau ni fichier) : identifiant d'appareil <-> entite (domaines inte... E: DOMAINES MAX_APPAREILS idDe idLecture entiteDe retenue decrire versModele actionLumiere depuisEtats versEquipements I: ../../core/modele.mjs ../../core/capacites.mjs L: idDe@25 idLecture@31 entiteDe@37 objet@39 liste@40 a_@41 domaineDe@42 nomDe@43 retenue@47 options@62 parDrapeaux@64 bit@65 horodatage@86 nombre@87 clavierCode@89 connu@90 coordonnees@91 niveau@314 choix@322 texte@324 traceur@331 inconnu@341 decrire@350 versModele@373 actionLumiere@386 depuisEtats@406 versEquipements@422 rangDom@447
- core/appareils.mjs (voir appareils)
- core/capacites.mjs 4.8k : Referentiel des capacites (V2.1) : rang, famille, widget attendu, type de valeur, bornes par defaut ; valid... E: FAMILLES REFERENTIEL ROLES ENVELOPPES definition connue secrete privee sensible sansSecret famille groupe bornes valider trier absorber composer nb tx bo MAX_INCONNUE copieInconnue texteCoordonnees I: http.mjs
- modules/equipements.mjs 6.2k : Vue Equipements (V2.1 etape equipements-vue) : GET /api/equipements (equipements composes de tous les hubs,... R: GET /equipements /equipements/alarmes /equipements/presence /equipements/icones /equipements/positions ; POST /equipements/icone /equipements/vus /equipements/oublier /equipements/positions /equipements/positions/supprimer /equipements/:id/capacite /equipements/code E: MAX_CONNUS analyser suivre MAX_POSITIONS analyserPositions ajouterPosition retirerPosition ICONES_EQUIPEMENTS analyserIcones poserIcone pieceDe alarmes presence routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs pieces-registre.mjs L: date@22 nom@23 analyser@27 suivre@46 position@76 ranger@77 analyserPositions@78 ajouterPosition@85 retirerPosition@91 lireDonnee@96 lirePositions@101 changerPositions@103 analyserIcones@121 poserIcone@131 lireIcones@138 lire@140 avecPieces@142 ecrire@147 pieceDe@151 pour@162 alarmes@166 presence@176
- public/icones.js 2.7k : Icônes des équipements (V2.1 étape icones ; cartes du 21/11, section 4) : pack Équipements (32 icônes en tr... E: APP.icones
- scripts/equipements-diagnostic.mjs 622 : Diagnostic des équipements (V2.1, 21/11) : node scripts/equipements-diagnostic.mjs, serveur démarré. Lit GE...

## equipements-vue (~49.2k tok)
- public/alarmes.js 1.0k : Bandeau d'alarme (V2.1 étape alarmes ; cartes du 21/11, section 3) : tant qu'une alarme dure (fuite, fumée,... E: APP.alarmes
- public/equipements-cartes.js 24.2k : Cartes de la vue Équipements (V2.1 étape cartes-lecture ; décisions : claude/cartes-v2.1.md du projet) : te... E: APP.cartes L: nb@13 mille@15 unite@16 option@28 qualite@34 pire@40 texte@53 deux@70 date@71 heure@72 pluriel@73 depuis@75 quand@84 dernier@90 vu@92 caps@99 de@100 num@101 raisonAir@103 logiciel@105 peut@117 expose@120 ecrire@121 surEquipement@139 inactif@143 lier@145 deuxAppuis@148 carte@160 ligne@161 grand@162 piste@164 pisteCap@174 onoff@176 onoffCap@185 rangee@186 action@188 rond@189 pas@191 curseur@198 pastille@204 barre@205 identifier@209 options@232 infos@245 consommation@255 purificateur@275 joue@320 codeLecture@323 lecturePause@324 enceinte@329 air@359 etat@380 versTexte@388 decaler@389 condition@390 mouvement@403 lies@429 ajouter@450 telecommande@491 effacerCode@519 lienGeo@521 boutonPosition@528 presence@554 boutonCode@561 hub@589 tuileHub@630 regle@644 bloc@645 reglage@646 reglageNombre@669 valeurChamp@692 reglageTexte@698 oublierSaisie@719 champCode@720 deuxEtats@732 avecCode@745 serrure@753 centrale@765 vanne@790 sirene@807
- public/equipements.css 6.4k : vue Équipements (#viewEquip, préfixe eq-, V2.1) : filtres, grille de tuiles de taille fixe (200 x 124 ; tél...
- public/equipements.js 16.8k : Vue Équipements (#viewEquip, préfixe eq-, V2.1 étape equipements-vue) : tuiles de taille fixe par famille (... E: APP.composer APP.equipements L: appareil@21 famille@23 raisons@55 alarme@65 joue@66 mouvement@68 S@77 apres@106 commander@107 bascule@108 rond@115 inactif@117 rapide@121 precision@122 tuile@123 pastille@275 dessin@279 entete@280 ligne@301 mesures@302 configLumiere@356 configStore@384 inclinaison@462 modeSupprimer@470 lirePositions@471 ajouterPosition@474 retirerPosition@477 configSimple@482 oublier@493 ouvrir@500 ouvrirElement@505 vu@507 toutVu@512 rendreAide@535 filtres@547 visibles@561 squelette@566 lever@574 rendreGrille@577 rendreDetail@592 rendre@610 montrer@620 charger@625 demarrer@641 arreter@642
- public/presence.js 771 : Carte « Présence » de l'accueil (V2.2 ha-localisation, décision du 24/11) : dans la ligne Actions (APP.home... E: APP.presence

## hubs (~19.8k tok)
- adapters/dirigera/appairage.mjs 845 : DIRIGERA : recherche du hub sur le reseau local (mDNS _ihsp._tcp via bonjour-service, adresses IPv4 privees... E: rechercher identifier champs verifier appairer I: ../../core/http.mjs ../../core/outils.mjs ../../core/reseau.mjs connexion.mjs
- adapters/dirigera/connexion.mjs (voir appareils)
- adapters/dirigera/hub.mjs 1.2k : Contrat hub de l'adaptateur DIRIGERA (contrat « Hubs » de .claude/rules/hubs.md) : un seul hub (id dirigera... E: hub I: ../../core/http.mjs ../../core/outils.mjs connexion.mjs appairage.mjs
- adapters/homeassistant/hub.mjs 2.0k : Contrat hub de l'adaptateur Home Assistant (contrat « Hubs » de .claude/rules/hubs.md) : un hub (id homeass... E: hub I: ../../core/http.mjs ../../core/reseau.mjs connexion.mjs
- modules/hubs.mjs 3.4k : Routes generiques des hubs (contrat « Hubs » de .claude/rules/hubs.md ; aucun nom de marque) : GET /api/hub... R: POST /hubs/recherche /hubs/identifier /hubs/appairage /hubs/appairage/annuler /hubs/[a-z0-9][a-z0-9-]{0,39}/deconnexion ; GET /hubs/appairage /hubs E: appairageEnCours routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/reseau.mjs
- public/hubs.js 5.7k : Fenêtre « Hubs » (préfixe hb-), ouverte en touchant l'état de l'en-tête (#status) : hubs déclarés par les a... E: APP.hubs
- scripts/groupes-essai.mjs 3.9k : Essai guidé des groupes du hub DIRIGERA (V2.1, 21/11 ; cartes, section 15 : vérifications demandées avant d... I: ../adapters/dirigera/connexion.mjs

## fenetres (~1.4k tok)
- public/hubs.css 1.4k : cadre commun des fenêtres hb- (zone fenetres depuis la V2.3 : Hubs, pièces, animations, appareils autorisés...

## homeassistant (~25.7k tok)
- adapters/homeassistant/connexion.mjs 3.7k : Connexion a Home Assistant : adresse et port (donnees/homeassistant.json, sans secret), jeton d'acces longu... E: PORT_DEFAUT portValide jetonValide erreurCode lire jetonPresent etatLocal cible ACTIONS obtenir envoyer enregistrer deconnecter erreur I: ../../core/outils.mjs ../../core/reseau.mjs
- adapters/homeassistant/ecriture.mjs (voir equipements)
- adapters/homeassistant/hub.mjs (voir hubs)
- adapters/homeassistant/index.mjs 1.0k : Adaptateur Home Assistant (V2.0) : lister (GET /api/states : lumieres et prises, modele.mjs, capacites proj... E: lister equipements relire appliquer erreur ecrire hub I: ../../core/http.mjs ../../core/outils.mjs connexion.mjs modele.mjs registre.mjs ecriture.mjs hub.mjs
- adapters/homeassistant/modele.mjs (voir equipements)
- adapters/homeassistant/registre.mjs 1.4k : Registre de Home Assistant par l'API WebSocket (V2.1), lecture seule : entites (config/entity_registry/list... E: dialoguer lireRegistre I: connexion.mjs ../../core/reseau.mjs

## pieces (~35.2k tok)
- adapters/dirigera/pieces.mjs 1.5k : DIRIGERA, pieces (contrat gestionPieces, contrat « Pièces » de .claude/rules/pieces.md) : icones generiques... E: iconeGenerique gestionPieces I: ../../core/http.mjs connexion.mjs
- modules/pieces-creation.mjs 5.3k : Creation de pieces (contrat gestionPieces, contrat « Pièces » de .claude/rules/pieces.md ; aucun nom de mar... R: GET /pieces /pieces/liste ; POST /pieces E: MAX_NOM MAX_APP CORPS_PIECES texte cle nomValide iconesDe piecesValides lire peut contenu majNotes noter raison verrou avecVerrou relirePieces deplacer appareilsOnOff listeIds doublon verifierIndependants creerAuService routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs pieces-registre.mjs
- modules/pieces-gestion.mjs 4.9k : Modification et suppression des pieces (contrat gestionPieces : modifier, supprimer, contenu ; registre loc... R: POST /pieces/:id/modifier /pieces/:id/supprimer E: rangementComplet routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs pieces-creation.mjs pieces-registre.mjs ../core/modele.mjs
- modules/pieces-registre.mjs 1.3k : Registre local des pieces (V1.4, contrat « Pièces » de .claude/rules/pieces.md ; aucun nom de marque) : don... E: MAX_LOCALES MAX_RANGES estLocale nouvelleLocale lireRegistre majRegistre independants I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs
- public/pieces-choix.js 4.3k : Pièce d'un appareil (V1.4) : pastille (icône et nom de sa pièce, « Autres » par défaut) et fenêtre « Ranger... E: APP.piecesChoix
- public/pieces-gestion.js 7.2k : Fenêtre « Pièces » (V1.4, préfixe pg-, cadre et classes hb- et np- des fenêtres Hubs et Nouvelle pièce) : l... E: APP.piecesGestion L: s@7 cible@11 independants@12 pieces@14 piece@20 bouton@21 desarmer@22 initForm@24 charger@29 choisir@41 hubDans@44 indDans@45 locauxVoulus@46 changements@47 verdict@56 rendreListe@67 ligne@86 rendreAppareils@97 rendreForm@133 majNom@192 majPied@199 armer@200 destinations@203 rendreSuppression@207 remplirSuppression@225 remplirPied@233 compteRendu@263 enregistrer@269 supprimer@286 rendreAide@331 rendre@332 fermer@339 ouvrir@345
- public/pieces-liste.js 875 : Pièces dans l'accueil, le menu et la vue d'une pièce (V1.4) : GET /api/pieces/liste relu avec chaque actual...
- public/pieces.css 2.9k : fenêtres de pièces (cadre commun APP.pieces.cadre de pieces.js ; classes hb- de hubs.css) : « Nouvelle pièc...
- public/pieces.js 7.0k : Fenêtre « Nouvelle pièce » (préfixe np-, allure et classes hb- de la fenêtre Hubs) : carte « + » au bout de... E: APP.pieces L: svg@25 cle@27 propre@28 charger@33 iconesDe@53 independants@54 locales@55 bouton@56 desarmer@57 verdict@60 choisis@72 choisisL@73 quittent@74 locale@75 rendreForm@77 majNom@158 majPied@165 remplirPied@166 envoyer@195 rendreResultat@213 aide@248 rendreAide@259 cadre@262 rendre@276 fermer@283 ouvrir@289

## lumieres (~13.7k tok)
- modules/couleurs.mjs 468 : Couleurs personnalisees (colors.json [{id, hue 0-359, sat 0-100}], 7 max) : GET et POST /api/colors, POST /... R: GET /colors ; POST /colors /colors/:id/delete E: routes I: ../core/http.mjs ../core/outils.mjs
- modules/lots.mjs 1.3k : Commande groupee POST /api/lights/apply {ids, settings} et executer(items) : 10 envois en parallele, ecart ... R: POST /lights/apply E: verifierIds executer repondre routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs ../core/confirmation.mjs plan.mjs animations-moteur.mjs
- public/panel.js 1.4k : Panneau de reglage (colonne droite, prefixe q-) : selection, envoi aux lampes, affichage de l'etat, section... E: APP.panneauCaps
- public/panneau.css 3.2k : colonne droite (panneau de réglage, préfixe q-). Construit par panel.js.
- public/reglages.js 7.3k : Reglages d'une lumiere (prefixe q-, panneau.css), composant partage (V1.5) : APP.reglages(opts) -> {root, c... E: APP.reglages APP.reglagesRetirer L: clamp@25 svgEl@26 stepBtn@31 renderAll@40 exitDel@41 addCustom@42 delCustom@48 loadCustom@56

## plan (~6.4k tok)
- modules/plan.mjs 523 : Plan des pieces (layout.json {piece: {appareil: {x, y}}}, positions 0-100 %) : GET et POST /api/layout ; ex... R: GET /layout ; POST /layout E: lireLayout routes I: ../core/http.mjs ../core/outils.mjs ../core/modele.mjs
- public/plan.css 1.9k : colonne gauche, barre de sélection, plan des pièces, bulles, mode Organiser.
- public/plan.js 4.0k : Vue Lumieres, colonne gauche : puces de pieces, bulles (tile), plan par piece (layout, glisser en mode Orga...

## scenarios (~8.8k tok)
- modules/scenarios.mjs 1.2k : Scenarios (scenarios.json, 30 max) : GET et POST /api/scenarios (capture l'etat des lumieres choisies), POS... R: GET /scenarios ; POST /scenarios /scenarios/:id/apply|rename|delete|icon|fav E: SCENE_ICONS routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs lots.mjs
- modules/scenes-hub.mjs 336 : Scenes du hub (V2.1 etape scenes-hub ; cartes §17, contrat « Scènes du hub » de .claude/rules/hubs.md) : GE... R: GET /scenes-hub ; POST /scenes-hub/lancer /scenes-hub/annuler E: routes I: ../core/http.mjs ../core/appareils.mjs
- public/scenarios.css 1.5k : onglet Scénarios (cartes, pastilles, boutons).
- public/scenes.js 5.8k : Onglet Scenarios : liste, appliquer, renommer, supprimer, icone (ICONS = SCENE_ICONS de modules/scenarios.m... E: APP.renderScenes APP.loadScenes APP.sceneIcon APP.pictos APP.applyScene APP.choisirIcone

## animations (~28.4k tok)
- modules/animations-donnees.mjs 743 : Fichier donnees/animations-v2.json {v: 2, animations: [...], migre_de?, migre_le?} (V1.5, sans secret) : ab... E: lireAnimations ecrireAnimations I: ../core/outils.mjs ../core/http.mjs animations-plan.mjs
- modules/animations-moteur.mjs 3.7k : Moteur des animations (V1.5, serveur, en memoire seulement : rien ne reprend apres un redemarrage) : lancer... E: animable lancer arreter enMarche appareilsEnMarche liberer toutArreter etat I: ../core/outils.mjs ../core/http.mjs ../core/appareils.mjs ../core/modele.mjs ../core/file.mjs animations-plan.mjs
- modules/animations-plan.mjs 5.1k : Animations (V1.5, fonctions pures, sans hub ni fichier) : valider (format d'une animation ; migrer : ancien... E: LIMITES CORPS_ANIMATION migrer valider segments courbe horaire verifier compiler decouper retour I: ../core/http.mjs ../core/modele.mjs
- modules/animations.mjs 1.5k : Routes des animations (V1.5) : GET /api/animations (liste, en cours, limites, lampes animables), POST /api/... R: GET /animations ; POST /animations/verifier /animations /animations/essai /animations/:id/modifier|supprimer|dupliquer|lancer|arreter|favori E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs animations-plan.mjs animations-moteur.mjs animations-donnees.mjs scenarios.mjs
- public/animations.css 3.2k : onglet Animations (#viewAnim, préfixe an-, construit par animations.js) : liste (cartes .scard de scenarios...
- public/animations.js 14.2k : Onglet Animations (V1.5, #viewAnim, prefixe an-) : liste (lancer, arreter, modifier, dupliquer, supprimer ;... L: virgule@13 duree@14 plur@19 lim@21 dixieme@22 horaire@24 nomLampe@33 couleurCible@34 resumeEtape@41 enCoursDe@57 majEtat@60 charger@68 planifier@71 poster@77 fenetre@90 bouton@101 aide@138 choisirLampes@150 choisirIcone@185 et@188 coul@189 assistants@235 genererModele@246 rendre@259 icBouton@300 carteAnim@301 nouvelleEtape@331 ouvrirEditeur@332 quitterEditeur@339 change@343 majPartielle@345 construireEditeur@348 montrerVolet@395 bascule@402 majBoutonsEditeur@408 verifier@415 enregistrer@431 dessinerFrise@442 listeEtapes@467 pas@492 regle@493 segments@507 formEtape@517 favorites@581 sigFav@582 basculer@583 majCarte@587

## accueil (~18.5k tok)
- modules/accueil.mjs 2.0k : Accueil personnalisable (V1.9 révision 3) : ordre des cartes de chaque rubrique, ordre des rubriques, carte... R: GET /accueil ; POST /accueil /accueil/defaut E: RUBRIQUES MAX_CLES CORPS_ACCUEIL vide analyser valider routes I: ../core/http.mjs ../core/outils.mjs ../core/modele.mjs
- public/accueil-org.js 6.6k : Accueil personnalisable (V1.9 révision 3) : ordre des cartes de chaque rubrique, ordre des rubriques, carte... E: APP.accueilOrg L: videM@5 SV@10 trier@18 rubriques@30 sansPanne@33 fusion@34 planifier@48 changer@54 masquer@58 deplacerRubrique@74 envoyer@80 adopter@99 lire@112 poser@120 vide@126 pas@129 bouton@138 decorer@144 mobiles@166 defileur@167 placer@174 boucle@185 tenir@194 bouge@206 lache@207 barre@221 focus@250 bascule@254 ligneF@263 remplir@271 affichage@293 aide@307 ouvrir@316 quitter@324
- public/accueil.css 3.8k : page d'accueil (V1.5) : rubriques Pièces / Actions / Catégories (4 au plus), une ligne de cartes chacune, d...
- public/home.js 5.3k : Accueil : rubriques Pieces / Actions / Categories (4 au plus), une ligne de cartes chacune a defilement hor... E: APP.homeFavoris APP.homePieces APP.homeRafraichir APP.homeActions APP.renderHome
- public/presence.js (voir equipements-vue)

## cameras (~29.0k tok)
- adapters/cameras/cameras.mjs 3.4k : flux des caméras RTSP (Tapo) converti par ffmpeg en MP4 fragmenté H.264 + AAC, lu par une balise <video>. R: GET /cameras /cameras/:id/stream ; POST /cameras/:id/move E: cameras cheminHd routes nomDe I: ../../core/http.mjs ../../core/modele.mjs ../../core/outils.mjs cameras-gestion.mjs sonde.mjs diffusion.mjs mp4.mjs onvif.mjs
- adapters/cameras/diffusion.mjs 3.1k : Flux partagé d'une caméra (V1.9) : un seul ffmpeg (une seule session RTSP) par caméra, sa sortie MP4 fragme... E: MAX_FLUX MAX_APPAREILS DEMARRAGE_MS SILENCE_MS RETARD_MAX RETARD_FIN_MS creerDiffusions I: ../../core/http.mjs mp4.mjs
- adapters/cameras/index.mjs 346 : Adaptateur cameras IP : chaque camera de donnees/cameras.json devient un appareil de type camera (caps stre... E: lister rangement appliquer routes I: cameras.mjs sonde.mjs
- adapters/cameras/manifest.json 70 : Manifeste : Cameras IP : flux RTSP via ffmpeg, PTZ ONVIF, recherche ONVIF/mDNS/SSDP/scan ; donnees/cameras.json et donnees/camera-secrets/
- adapters/cameras/mp4.mjs 1.7k : Lecture du MP4 fragmenté produit par ffmpeg (V1.9, flux partagé) : découpage de la sortie en boîtes de prem... E: SORTIE BOITE_MAX creerDecoupeur pisteVideo imageCle
- adapters/cameras/onvif.mjs 3.5k : Appels ONVIF vers une caméra (SOAP 1.2, en-tête WS-Security UsernameToken à condensé ; adressage WS-Address... E: ONVIF_PORT NS ACTIONS enveloppe soap xaddr capacites CORPS lireSujets lireAbonnement lireMessages lireCentre lireErreur
- adapters/cameras/sonde.mjs 1.2k : Joignabilite des cameras (V1.7) : connexion TCP seule au port RTSP (2 s au plus ; aucune requete RTSP, aucu... E: DELAI MOTIFS connecter creerSonde sonde I: ../../core/reseau.mjs ../../core/outils.mjs
- public/cameras-direct.js 4.2k : Lecture d'un flux de caméra par MediaSource (étape cam-mse) : le client reçoit lui-même le MP4 fragmenté du... E: APP.camDirect
- public/cameras.css 2.3k : panneau des caméras de l'accueil (colonne de droite, une carte par caméra). Masqué (.hidden) s'il n'y a auc...
- public/cameras.js 9.3k : Cartes camera de l'accueil (#homeCams) : lecteur, EN DIRECT, reconnexion 3 essais, son, volume, plein ecran... E: APP.camPip APP.camerasReload L: now@34 lecteur@35 setState@37 enDirect@45 annoncer@50 fsEl@65 fsExit@66 fsIcons@67 toggleFs@77 show@84 loadQ@95 saveQ@96 servie@97 qLabel@98 sendMove@108 finMouvement@109 arreterApres@114 pressArrow@119 releaseArrow@128 centrer@133 arrow@139 boutonCentre@150 ptzLabel@158 soundLabel@163 conteneur@173 borne@179 lirePos@180 libre@183 poser@184 placer@185 dansColonne@196 cible@202 glisser@208 flotter@248 rentrer@257 couper@265 stop@269 repos@280 majEtat@288 stopAll@295 adresse@297 jouer@298 open@306 reconnect@325 start@342 build@348 entete@411 load@421 cle@438 relire@439

## cameras-ajout (~13.8k tok)
- adapters/cameras/cameras-gestion.mjs 4.5k : gestion des cameras (recherche, ajout, renommage, suppression) et secrets par camera. R: POST /cameras/discover /cameras/discover/cancel /cameras/add /cameras/:id/rename|delete ; GET /cameras/discover /cameras/list E: PATH_RE secretDe nomDe routesGestion I: ../../core/http.mjs ../../core/modele.mjs ../../core/outils.mjs decouverte.mjs sonde.mjs
- adapters/cameras/cameras-marques.json 528 : Base des marques de cameras : motif, chemins RTSP sd/hd, aide.
- adapters/cameras/decouverte.mjs 3.7k : recherche des cameras IP du reseau local (ONVIF WS-Discovery, mDNS, SSDP, puis scan de ports). E: liste ajoute lireOnvif lireMdns lireSsdp lancer estIPv4 reseaux adresseLocale I: ../../core/reseau.mjs
- public/cameras-ajout.css 1.2k : bouton + du panneau des cameras (accueil) et fenetre d'ajout et de gestion des cameras. Charge apres camera...
- public/cameras-ajout.js 3.8k : fenetre "Cameras" (bouton + du panneau des cameras de l'accueil) : recherche, ajout avec test, ajout manuel... E: APP.camerasOpen

## electromenager (~50.5k tok)
- adapters/smartthings/api.mjs 6.5k : Client du cloud SmartThings : HTTPS vers api.smartthings.com seul (TLS strict, aucune redirection suivie, 1... E: ErreurST RETOUR SCOPES creerClient client I: ../../core/outils.mjs L: rempli@40 objet@41 creerClient@43 cloudInjoignable@53 etatCloud@54 surRetourCloud@55 noterCloud@56 poignee@66 armerSonde@76 envoyer@87 envoyerBrut@93 lireSecrets@119 ecrireSecrets@126 versionSecrets@135 lireBrut@136 exclusif@145 frais@152 echeance@153 posterJeton@156 jeton@167 renouveler@172 appel@193 get@205 envoyerCommande@210 commande@219 choisirProgramme@225 reglerOption@231 droitCommande@237 appareils@242 statut@256 sante@258 etatCompte@262 adresseAutorisation@274 echangerCode@280 effacerJetons@302 enregistrerApplication@314
- adapters/smartthings/compte.mjs 1.5k : Compte SmartThings depuis l'application : etat sans secret, application OAuth (saisie de secours), connexio... R: GET /smartthings/compte ; POST /smartthings/application /smartthings/connexion /smartthings/code /smartthings/deconnexion E: routes I: ../../core/http.mjs api.mjs
- adapters/smartthings/familles.mjs 3.8k : Familles SmartThings generiques, LECTURE SEULE : capteurs, interrupteurs, audio, appareils a cycle (seche-l... R: GET /smartthings/appareils ; POST /smartthings/appareils/actualiser E: FAMILLES famille valeurs connus routes I: ../../core/outils.mjs api.mjs
- adapters/smartthings/index.mjs 6.0k : Adaptateur SmartThings (cloud) : lave-linge -> type generique washer (voir core/modele.mjs) ; routes GET /a... R: GET /washers ; POST /washers/actualiser /washers/st-[A-Za-z0-9-]{1,72}/reglages /washers/st-[A-Za-z0-9-]{1,72}/commande E: lister appliquer erreur rangement routes I: ../../core/outils.mjs ../../core/http.mjs compte.mjs familles.mjs api.mjs
- adapters/smartthings/manifest.json 103 : Manifeste : Samsung SmartThings (cloud, exception : api.smartthings.com seul, TLS strict, OAuth donnees/smartthings.json) : lave-linge (type washer) et familles generiques en lecture seule (familles.mjs)
- public/electromenager.css 3.2k : vue Électroménager (#viewElectro, préfixe e-) : état complet d'un lave-linge et commandes, affichés dans la...
- public/electromenager.js 11.6k : Vue Electromenager (#viewElectro, prefixe e-) : tuile compacte par lave-linge dans la carte SmartThings ; f... L: finGeste@10 pad@14 heure@15 duree@16 programme@17 temperature@19 essorage@20 phase@21 onoff@22 ligne@23 carte@30 bouton@67 boutons@82 iconeProg@118 codeActuel@123 svgDe@124 grad@128 geometrie@133 curseur@135 selection@163 selecteurListe@197 cadran@254 envoyerReglages@390 envoyer@404 rendre@415 tuileDe@428 ouvrirDetail@430 majDetail@437 afficher@448 charger@457 ouvrir@474 demarrerLecture@481 arreterLecture@482 fermer@483 hhmm@496 resume@497 actualiser@509
- public/st-compte.css 2.5k : fenêtre Compte SmartThings et fenêtre de détail (préfixe sc-), carte de groupe SmartThings et tuiles compac...
- public/st-compte.js 7.7k : Compte SmartThings (fenetre, prefixe sc-) et carte de groupe SmartThings (en-tete : etat du compte + icone ... E: APP.stCompte L: prevenir@10 charger@11 poster@20 texteEtat@31 horsLigne@40 heureCourte@41 majCloud@57 date@64 ligne@70 bouton@76 champ@77 sectionApplication@87 sectionConnexion@104 sectionDeconnexion@137 rendreMain@152 rendreAide@222 rendre@234 fermer@240 icone@245 ouvrir@246 remplirEntete@268 majEntetes@279 actualiser@283 groupe@300 tuile@327 fenetre@347 visibleTous@356 majTous@357 rendreTous@380 hote@392 majDans@393 dans@394 nbDans@395
- public/st-familles.js 3.5k : Familles SmartThings generiques, LECTURE SEULE : capteurs, interrupteurs, audio, autres appareils (vue #vie...
- scripts/smartthings.mjs 4.2k : configuration (config, autoriser) et diagnostic (liste, machine, lecture seule) du cloud SmartThings, sans ...

## telephone (~4.2k tok)
- public/tel.css 1.6k : version smartphone (V1.6, classe « tel » sur <html>, posée par version.js ; sans effet sur la tablette) : e...
- public/tel.js 2.6k : Version smartphone (V1.6, classe « tel » posée par version.js ; inactif sur tablette) : barre d'onglets #on... E: APP.telFeuille

## distant (~24.7k tok)
- core/acces.mjs 2.5k : Appareils autorises a joindre l'ecoute reseau (V1.8, mode distant) : code d'appairage (8 chiffres, usage un... E: COOKIE MAX_CLIENTS nomValide jetonDe cookie cookieEfface creerAcces acces I: outils.mjs http.mjs
- core/annonce.mjs 1.3k : V1.9 : annonce mDNS du serveur en mode distant (pour la recherche de l'APK) : _domowa._tcp sur l'adresse ch... E: SERVICE INSTANCE HOTE SERVICES NOMS reponse annonce demarrer I: outils.mjs
- core/portier.mjs (voir socle)
- core/serveur.mjs 5.0k : Mode du serveur (V1.8) : donnees/serveur.json {v: 1, mode: local | distant, adresse (IPv4 privee), port} (a... E: PORT_DEFAUT FICHIER portValide valider lireConfig ecrireConfig adressesMachine certificat installerCertificat empreinteDe REESSAI_RESEAU motifEcoute ouvrirEcouteReseau motifChangement changerEcoute etat declarer privee I: outils.mjs ipv4.mjs
- modules/appairage.mjs 1.6k : Routes du mode distant (V1.8) : POST /api/appairage {code, nom} (ecoute reseau, sans jeton : pose le cookie... R: POST /appairage /appairage/code /serveur/mode /clients/:id/revoquer ; GET /clients E: routes I: ../core/http.mjs ../core/acces.mjs ../core/serveur.mjs ../core/outils.mjs
- public/appairage.css 819 : page d'appairage (V1.8, préfixe ap-, autonome : seules themes.css et version.js (V2.2 étape 8 : variables e...
- public/appairage.html 578 : Page d'appairage (V1.8, autonome : seule page servie par l'écoute réseau à un appareil sans jeton, avec app...
- public/appairage.js 1.3k : Page d'appairage (V1.8, autonome, sans APP) : saisie du code à 8 chiffres (espace toléré) et du nom de l'ap...
- public/clients.css 947 : fenêtre « Appareils autorisés » (V1.8, préfixe ca-, construite par clients.js ; cadre et éléments communs :...
- public/clients.js 7.0k : Fenêtre « Appareils autorisés » (V1.8, préfixe ca-, cadre hb- de hubs.css) : mode du serveur (local ou dist... E: APP.clients L: date@25 empreinte@26 stop@27 desarmer@28 fermer@29 lire@30 ouvrir@33 rubrique@57 echec@58 ligne@64 bouton@65 demander@68 finCode@85 majCompte@86 revoquer@91 versMode@100 changerMode@101 vueMode@113 serveur@167 vueCode@191 liste@201 rendre@221
- scripts/appairage.mjs 695 : Code d'appairage en terminal (V1.8, machine sans ecran), serveur demarre en mode distant : node scripts/app... I: ../config.mjs
- scripts/serveur.mjs 1.3k : Mode du serveur (V1.8), serveur arrete : node scripts/serveur.mjs (etat) | distant [adresse] [port] (ouvre ... I: ../config.mjs ../core/serveur.mjs

## distribution (~19.0k tok)
- distribution/installer.sh 5.2k : Installation en une commande (Termux ou Linux) depuis le depot public : paquets manquants, Node 20 au moins...
- maj.sh (voir socle)
- modules/maj.mjs 3.7k : Mise a jour depuis l'application (V1.8) : GET /api/maj (version installee, version disponible, dernier resu... R: GET /maj ; POST /maj/verifier /maj/appliquer /maj/retour E: gerePar lireEtiquette lireInfo lireNotes creerMaj routes I: ../core/http.mjs ../core/outils.mjs animations-moteur.mjs pieces-creation.mjs hubs.mjs
- outils/publier.sh 1.5k : Publie un arbre public (node outils/ia.mjs publier <arbre>) dans le depot de distribution : un commit par p...
- public/maj.css 591 : fenêtre « Mise à jour » (V1.8, préfixe mj-, construite par maj.js ; cadre et éléments communs : classes hb-...
- public/maj.js 4.1k : Fenêtre « Mise à jour » (V1.8, préfixe mj-, cadre hb- de hubs.css) : version installée, version disponible ... E: APP.maj

## apk (~1.3k tok)
- public/apk.js 1.3k : Lien avec l'application Android (V1.9) : sans effet hors de l'APK (APP.apk.present faux, aucun écouteur). D... E: APP.apk

## themes (~7.4k tok)
- modules/themes.mjs 2.0k : Thèmes personnalisés (V2.2 étape 10) : donnees/themes.json {v: 1, themes: [{id, base, nom?, couleurs: {cle:... R: GET /themes ; POST /themes /themes/supprimer E: CLES MAX VERROUILLE vide analyser valider routes I: ../core/http.mjs ../core/outils.mjs
- public/themes-edition.css 863 : Fenêtre « Thèmes » (V2.2 étape 10, themes-edition.js) : cadre hb- de hubs.css (smartphone : plein écran, rè...
- public/themes-edition.js 4.5k : Fenêtre « Thèmes » (V2.2 étape 10, préfixe th-, cadre hb- de hubs.css) : choix du thème de cet appareil (Au... E: APP.themes

## diagnostic (~3.4k tok)
scripts/camera-evenements.mjs 2.0k, scripts/camera-test.mjs 1.1k, scripts/decouverte-test.mjs 391

## outils (~11.6k tok)
- outils/ia.mjs 10.2k : Outil IA : INDEX.md genere, paquet minimal par zone pour un nouveau chat, controle avant/apres patch. L: extra@25 decoupe@32 tok@33 k@34 fin@35 arbre@37 lire@47 reperes@91 zonesDe@102 blocZone@110 texteIndex@127 fichiersIndex@136 secrets@149 essai@151 pwd@154 fuite@158 ecrireIndex@160 motifsRegle@171 globVersRegex@176 taille@177 fichiersRegles@178 reglesPour@183 choisisPour@192 couts@194 pack@205 syntaxeModules@232 check@240 ko@242 droits@265 avertissements@297 arbreRelatif@311 arbreTout@320 nomsVersion@334 fuitesPubliques@348 vu@350 arbreEntier@358 prealablePublier@369 publier@377 copier@398 release@411
- outils/publier.sh (voir distribution)
