# INDEX.md - genere par "node outils/ia.mjs" (ne pas modifier a la main)
Tailles en tokens estimes (octets / 3,3). R = routes (sans le prefixe /api), E = expose, I = importe.
Un paquet = CLAUDE.md + INDEX.md + fichiers de la ou des zones demandees.

## socle (~27.9k tok)
- config.mjs 82 : Constantes LOCAL_HOST, LOCAL_PORT. L'adresse du hub DIRIGERA (ancienne constante HUB_IP) est dans donnees/d... E: LOCAL_HOST LOCAL_PORT
- core/file.mjs 1.0k : File d'ecritures commune (qualite 2026-11-12, socle de la proposition P2) : plafond d'ecritures par seconde... E: creerFile
- core/http.mjs 984 : Outils HTTP : HOSTS/ORIGINS autorises, HttpError, send (JSON no-store), readBody (JSON, 4 Ko max par defaut... E: ORIGINS HOSTS reglerReseau hoteValide HttpError send CORPS_MAX readBody checkWrite ajouterTraducteur describe I: ../config.mjs
- core/ipv4.mjs 283 : Adresses IPv4, fonctions pures sans dependance (qualite 2026-11-12 : une seule definition, partagee par cor... E: estIPv4 vers depuis privee
- core/outils.mjs 813 : Utilitaires communs : DIR (racine du projet), DONNEES (donnees/, 700 ; V1.8 : dossier choisi par DOMOWA_DON... E: DIR choisirDonnees DONNEES log sleep withTimeout borne lireJson ecrireJson nouvelId
- core/portier.mjs 1.5k : Controle d'entree de chaque requete (V1.8 ; extrait de server.mjs en qualite 2026-11-12, dependances inject... R: GET /appairage E: MIME statique LIBRES libre portier diagnosticReseau I: http.mjs
- core/reseau.mjs 525 : Adresses IPv4 du reseau local : estIPv4, privee (10/8, 172.16/12, 192.168/16 ; definies dans core/ipv4.mjs)... E: reseaux adresseLocale estIPv4 vers depuis privee I: appareils.mjs ipv4.mjs
- core/routeur.mjs 1.3k : Registre de routes : charge modules/*.mjs puis les routes apportees par les adaptateurs. Un module exporte ... E: tailleCorps defaut enregistrer preparer inventaire repondre api I: outils.mjs http.mjs appareils.mjs
- maj.sh 3.9k : Mise a jour depuis le depot : etapes ou version affichees puis confirmees, avance seule (jamais de fusion),...
- public/app.js 3.1k : Objet global APP : $, el, api (XHR), bandeau, statut, setBusy, distant et lieu (V1.8 : page servie par l'ec... E: APP.el APP.lieu APP.api APP.banner APP.setStatus APP.setBusy APP.colorOf APP.find APP.lights APP.selIds APP.roomKey APP.refresh APP.render APP.showTab
- public/base.css 2.3k : variables, polices, page figée, boutons génériques, bandeau, vues. Charger en premier.
- public/commandes.js 824 : Verification apres commande et compte rendu : APP.verify(devices, items) -> noms en ecart, APP.report(repon... E: APP.verify APP.report APP.applyLights
- public/entete.css 1.2k : en-tête, boutons ronds, statut, menu latéral (tiroir) et voile.
- public/index.html 2.0k : Structure de la page (header, menu « ⋯ » #plusMenu (dont #accOrgBtn : V1.9 révision 3, #majBtn, #clientsBtn...
- public/menu.js 2.3k : Menu lateral et navigation : navModel (pieces, dont celles sans appareil ON/OFF, categories, categories ext... E: APP.nav
- public/navigation.js 2.1k : Navigation commune aux deux versions (V1.6) : menu « ⋯ » de l'en-tête (#plusBtn, #plusMenu : Actualiser, Pl... E: APP.affichage APP.fermerDessus
- public/prevision.js 1.3k : Mise a jour immediate : un POST connu est applique a l'affichage avant la reponse, annule si echec total, r... E: APP.optimistic APP.rollback APP.prevoir APP.api
- public/version.js 363 : Choix de la version (V1.6) : classe « tel » (smartphone) ou « tab » (tablette) posée sur <html> avant le pr...
- sauvegarde.sh 302 : Sauvegarde des fichiers .json de donnees/ sans secret (liste fermee : jamais dirigera-token.txt, camera-sec...
- server.mjs 1.1k : Point d'entree : ecoute locale HTTP 127.0.0.1:8080 (controle Host, sans appairage) et, en mode distant (V1.... I: config.mjs core/http.mjs core/outils.mjs core/routeur.mjs core/serveur.mjs core/acces.mjs core/portier.mjs core/annonce.mjs
- start.sh 368 : Demarre le serveur (sauvegarde des donnees, nohup, attente) et ouvre Chrome. V1.8 : se place dans son propr...
- stop.sh 141 : Arrete le serveur (server.pid) et libere le verrou de veille. V1.8 : se place dans son propre dossier (lien...

## appareils (~11.6k tok)
- adapters/dirigera/connexion.mjs 2.6k : Connexion au hub DIRIGERA : adresse (donnees/dirigera.json, migree de config.mjs), jeton (donnees/dirigera-... E: JETON migrer lire jetonPresent etatLocal client sansRenvoi enregistrer deconnecter erreur I: ../../core/outils.mjs ../../core/reseau.mjs
- adapters/dirigera/index.mjs 1.6k : Adaptateur DIRIGERA : versModele, lister, appliquer (ON puis niveau puis couleur ou temperature), animer (V... E: lister relire pieces piece animer appliquer erreur hub gestionPieces I: ../../core/outils.mjs connexion.mjs pieces.mjs hub.mjs
- adapters/dirigera/manifest.json 78 : Manifeste : Hub IKEA DIRIGERA : lumieres et prises (HTTPS local, TLS strict, adresse donnees/dirigera.json, jeton donnees/dirigera-token.txt, npm dirigera 2.0.2 ; contrat hub)
- core/appareils.mjs 3.4k : Registre des adaptateurs (adapters/<id>/manifest.json + module) : liste commune des appareils (cache 1 s, i... E: charger actifs extensions hubs adressesHubs invalider pannes uniques lister trouver appliquer relire peutAnimer animer piece gestionsPieces rangeables pieces I: outils.mjs http.mjs modele.mjs
- core/confirmation.mjs 499 : Confirmation d'une commande groupee (Tout OFF, piece, lot de lumieres) : attendre 1 s, relire, reprendre un... E: DELAI_CONFIRMATION confirmer I: outils.mjs appareils.mjs modele.mjs
- core/modele.mjs 1.2k : Modele commun d'un appareil (ID_RE, estOnOff), validation d'un reglage (reglage) et conversion vers le form... E: KELVIN_MIN ID_RE estOnOff reglage manque pourClient ancien I: http.mjs
- modules/appareils.mjs 810 : Routes appareils : etat (V1.8 : mode local | distant du serveur, distant = demande arrivee par l'ecoute res... R: GET /status /devices /rooms ; POST /devices/:id/power|brightness|cmd E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs animations-moteur.mjs ../core/serveur.mjs
- modules/pieces.mjs 646 : Route ON/OFF d'une piece {on, kind: light|outlet} : commande de piece native, relue apres 1 s, reprise appa... R: POST /rooms/:id/power E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/confirmation.mjs animations-moteur.mjs
- modules/tout-off.mjs 769 : Route Tout OFF {confirm: true} : une commande de piece par piece pour les lumieres, puis appareil par appar... R: POST /actions/all-off E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/confirmation.mjs animations-moteur.mjs

## hubs (~12.4k tok)
- adapters/dirigera/appairage.mjs 1.0k : DIRIGERA : recherche du hub sur le reseau local (mDNS _ihsp._tcp via bonjour-service, adresses IPv4 privees... E: rechercher champs verifier appairer I: ../../core/http.mjs ../../core/outils.mjs ../../core/reseau.mjs connexion.mjs
- adapters/dirigera/connexion.mjs (voir appareils)
- adapters/dirigera/hub.mjs 1.1k : Contrat hub de l'adaptateur DIRIGERA (CLAUDE.md, « Hubs ») : un seul hub (id dirigera-1), etat (sonde GET /... E: hub I: ../../core/http.mjs ../../core/outils.mjs connexion.mjs appairage.mjs
- modules/hubs.mjs 2.4k : Routes generiques des hubs (contrat : CLAUDE.md, « Hubs » ; aucun nom de marque) : GET /api/hubs (types dec... R: POST /hubs/recherche /hubs/appairage /hubs/appairage/annuler /hubs/[a-z0-9][a-z0-9-]{0,39}/deconnexion ; GET /hubs/appairage /hubs E: etatHubs appairageEnCours routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/reseau.mjs
- public/hubs.css 1.3k : fenêtre « Hubs » (préfixe hb-, construite par hubs.js), même allure que la fenêtre Compte SmartThings ; éta...
- public/hubs.js 4.0k : Fenêtre « Hubs » (préfixe hb-), ouverte en touchant l'état de l'en-tête (#status) : hubs déclarés par les a... E: APP.hubs

## pieces (~35.3k tok)
- adapters/dirigera/pieces.mjs 1.5k : DIRIGERA, pieces (contrat gestionPieces, CLAUDE.md « Pièces ») : icones generiques <-> liste fermee du hub,... E: iconeGenerique gestionPieces I: ../../core/http.mjs ../../core/outils.mjs connexion.mjs
- modules/pieces-creation.mjs 4.9k : Creation de pieces (contrat gestionPieces, CLAUDE.md « Pièces » ; aucun nom de marque) : GET /api/pieces (p... R: GET /pieces /pieces/liste ; POST /pieces E: MAX_NOM MAX_APP CORPS_PIECES texte cle nomValide iconesDe piecesValides lire peut contenu notes majNotes verrou listeIds AUTRES doublon verifierIndependants rangerLocaux creerAuService routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs pieces-registre.mjs
- modules/pieces-gestion.mjs 5.3k : Modification et suppression des pieces (contrat gestionPieces : modifier, supprimer, contenu ; registre loc... R: POST /pieces/:id/modifier /pieces/:id/supprimer E: rangementComplet routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs pieces-creation.mjs pieces-registre.mjs ../core/modele.mjs
- modules/pieces-registre.mjs 1.3k : Registre local des pieces (V1.4, CLAUDE.md « Pièces » ; aucun nom de marque) : donnees/pieces.json {v: 1, l... E: MAX_LOCALES LOCAL_RE estLocale nouvelleLocale lireRegistre majRegistre independants I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs
- public/pieces-choix.js 4.5k : Pièce d'un appareil (V1.4) : pastille (icône et nom de sa pièce, « Autres » par défaut) et fenêtre « Ranger... E: APP.piecesChoix
- public/pieces-gestion.js 7.5k : Fenêtre « Pièces » (V1.4, préfixe pg-, cadre et classes hb- et np- des fenêtres Hubs et Nouvelle pièce) : l... E: APP.piecesGestion
- public/pieces-liste.js 875 : Pièces dans l'accueil, le menu et la vue d'une pièce (V1.4) : GET /api/pieces/liste relu avec chaque actual...
- public/pieces.css 2.7k : fenêtre « Nouvelle pièce » (préfixe np-, construite par pieces.js ; cadre et éléments communs : classes hb-...
- public/pieces.js 6.7k : Fenêtre « Nouvelle pièce » (préfixe np-, allure et classes hb- de la fenêtre Hubs) : carte « + » au bout de... E: APP.pieces

## lumieres (~12.8k tok)
- modules/couleurs.mjs 468 : Couleurs personnalisees (colors.json [{id, hue 0-359, sat 0-100}], 7 max) : GET et POST /api/colors, POST /... R: GET /colors ; POST /colors /colors/:id/delete E: routes I: ../core/http.mjs ../core/outils.mjs
- modules/lots.mjs 1.3k : Commande groupee POST /api/lights/apply {ids, settings} et executer(items) : 10 envois en parallele, ecart ... R: POST /lights/apply E: verifierIds executer repondre routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs ../core/confirmation.mjs plan.mjs animations-moteur.mjs
- public/panel.js 1.0k : Panneau de reglage (colonne droite, prefixe q-) : ON/OFF, luminosite, Blanc/Couleur, cadran SVG, couleurs r...
- public/panneau.css 3.1k : colonne droite (panneau de réglage, préfixe q-). Construit par panel.js.
- public/reglages.js 6.9k : Reglages d'une lumiere (prefixe q-, panneau.css), composant partage (V1.5) : APP.reglages(opts) -> {root, c... E: APP.reglages APP.reglagesRetirer

## plan (~6.3k tok)
- modules/plan.mjs 523 : Plan des pieces (layout.json {piece: {appareil: {x, y}}}, positions 0-100 %) : GET et POST /api/layout ; ex... R: GET /layout ; POST /layout E: lireLayout routes I: ../core/http.mjs ../core/outils.mjs ../core/modele.mjs
- public/plan.css 1.8k : colonne gauche, barre de sélection, plan des pièces, bulles, mode Organiser.
- public/plan.js 4.0k : Vue Lumieres, colonne gauche : puces de pieces, bulles (tile), plan par piece (layout, glisser en mode Orga...

## scenarios (~7.2k tok)
- modules/scenarios.mjs 1.2k : Scenarios (scenarios.json, 30 max) : GET et POST /api/scenarios (capture l'etat des lumieres choisies), POS... R: GET /scenarios ; POST /scenarios /scenarios/:id/apply|rename|delete|icon|fav E: SCENE_ICONS routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs ../core/modele.mjs lots.mjs
- public/scenarios.css 1.3k : onglet Scénarios (cartes, pastilles, boutons).
- public/scenes.js 4.6k : Onglet Scenarios : liste, appliquer, renommer, supprimer, icone (ICONS = SCENE_ICONS de modules/scenarios.m... E: APP.renderScenes APP.loadScenes APP.sceneIcon APP.applyScene

## animations (~28.3k tok)
- modules/animations-donnees.mjs 743 : Fichier donnees/animations-v2.json {v: 2, animations: [...], migre_de?, migre_le?} (V1.5, sans secret) : ab... E: lireAnimations ecrireAnimations I: ../core/outils.mjs ../core/http.mjs animations-plan.mjs
- modules/animations-moteur.mjs 3.6k : Moteur des animations (V1.5, serveur, en memoire seulement : rien ne reprend apres un redemarrage) : lancer... E: animable lancer arreter enMarche liberer toutArreter etat I: ../core/outils.mjs ../core/http.mjs ../core/appareils.mjs ../core/modele.mjs ../core/file.mjs animations-plan.mjs
- modules/animations-plan.mjs 5.0k : Animations (V1.5, fonctions pures, sans hub ni fichier) : valider (format d'une animation ; migrer : ancien... E: LIMITES COURBES CORPS_ANIMATION migrer valider segments courbe horaire verifier compiler decouper retour I: ../core/http.mjs ../core/modele.mjs
- modules/animations.mjs 1.4k : Routes des animations (V1.5) : GET /api/animations (liste, en cours, limites, lampes animables), POST /api/... R: GET /animations ; POST /animations/verifier /animations /animations/essai /animations/:id/modifier|supprimer|dupliquer|lancer|arreter|favori E: routes I: ../core/http.mjs ../core/outils.mjs ../core/appareils.mjs animations-plan.mjs animations-moteur.mjs animations-donnees.mjs scenarios.mjs
- public/animations.css 3.1k : onglet Animations (#viewAnim, préfixe an-, construit par animations.js) : liste (cartes .scard de scenarios...
- public/animations.js 14.4k : Onglet Animations (V1.5, #viewAnim, prefixe an-) : liste (lancer, arreter, modifier, dupliquer, supprimer ;... E: APP.animations

## accueil (~17.5k tok)
- modules/accueil.mjs 2.0k : Accueil personnalisable (V1.9 révision 3) : ordre des cartes de chaque rubrique, ordre des rubriques, carte... R: GET /accueil ; POST /accueil /accueil/defaut E: FICHIER RUBRIQUES MAX_CLES CORPS_ACCUEIL vide analyser valider routes I: ../core/http.mjs ../core/outils.mjs ../core/modele.mjs
- public/accueil-org.js 6.6k : Accueil personnalisable (V1.9 révision 3) : ordre des cartes de chaque rubrique, ordre des rubriques, carte... E: APP.accueilOrg
- public/accueil.css 3.6k : page d'accueil (V1.5) : rubriques Pièces / Actions / Catégories (4 au plus), une ligne de cartes chacune, d...
- public/home.js 5.4k : Accueil : rubriques Pieces / Actions / Categories (4 au plus), une ligne de cartes chacune a defilement hor... E: APP.homeFavoris APP.homePieces APP.homeRafraichir APP.homeActions APP.renderHome

## cameras (~18.6k tok)
- adapters/cameras/cameras.mjs 2.9k : flux des caméras RTSP (Tapo) converti par ffmpeg en MP4 fragmenté H.264 + AAC, lu par une balise <video>. R: GET /cameras /cameras/:id/stream ; POST /cameras/:id/move E: cameras cheminHd routes nomDe I: ../../core/http.mjs ../../core/modele.mjs ../../core/outils.mjs cameras-gestion.mjs sonde.mjs diffusion.mjs mp4.mjs onvif.mjs
- adapters/cameras/diffusion.mjs 3.1k : Flux partagé d'une caméra (V1.9) : un seul ffmpeg (une seule session RTSP) par caméra, sa sortie MP4 fragme... E: MAX_FLUX MAX_APPAREILS DEMARRAGE_MS SILENCE_MS RETARD_MAX RETARD_FIN_MS creerDiffusions I: ../../core/http.mjs mp4.mjs
- adapters/cameras/index.mjs 346 : Adaptateur cameras IP : chaque camera de donnees/cameras.json devient un appareil de type camera (caps stre... E: lister rangement appliquer routes I: cameras.mjs sonde.mjs
- adapters/cameras/manifest.json 70 : Manifeste : Cameras IP : flux RTSP via ffmpeg, PTZ ONVIF, recherche ONVIF/mDNS/SSDP/scan ; donnees/cameras.json et donnees/camera-secrets/
- adapters/cameras/mp4.mjs 1.7k : Lecture du MP4 fragmenté produit par ffmpeg (V1.9, flux partagé) : découpage de la sortie en boîtes de prem... E: SORTIE BOITE_MAX creerDecoupeur pisteVideo imageCle
- adapters/cameras/onvif.mjs 2.9k : Appels ONVIF vers une caméra (SOAP 1.2, en-tête WS-Security UsernameToken à condensé ; adressage WS-Address... E: ONVIF_PORT NS ACTIONS enveloppe soap xaddr capacites CORPS lireSujets lireAbonnement lireMessages lireErreur
- adapters/cameras/sonde.mjs 1.2k : Joignabilite des cameras (V1.7) : connexion TCP seule au port RTSP (2 s au plus ; aucune requete RTSP, aucu... E: DELAI MOTIFS connecter creerSonde sonde I: ../../core/reseau.mjs ../../core/outils.mjs
- public/cameras.css 1.3k : panneau des caméras de l'accueil (colonne de droite, une carte par caméra). Masqué (.hidden) s'il n'y a auc...
- public/cameras.js 5.1k : Cartes camera de l'accueil (#homeCams) : lecteur, EN DIRECT, reconnexion 3 essais, son, volume, plein ecran... E: APP.camerasReload

## cameras-ajout (~13.7k tok)
- adapters/cameras/cameras-gestion.mjs 4.5k : gestion des cameras (recherche, ajout, renommage, suppression) et secrets par camera. R: POST /cameras/discover /cameras/discover/cancel /cameras/add /cameras/:id/rename|delete ; GET /cameras/discover /cameras/list E: PATH_RE secretDe nomDe routesGestion I: ../../core/http.mjs ../../core/modele.mjs ../../core/outils.mjs decouverte.mjs sonde.mjs
- adapters/cameras/cameras-marques.json 528 : Base des marques de cameras : motif, chemins RTSP sd/hd, aide.
- adapters/cameras/decouverte.mjs 3.7k : recherche des cameras IP du reseau local (ONVIF WS-Discovery, mDNS, SSDP, puis scan de ports). E: liste ajoute lireOnvif lireMdns lireSsdp lancer estIPv4 reseaux adresseLocale I: ../../core/reseau.mjs
- public/cameras-ajout.css 1.2k : bouton + du panneau des cameras (accueil) et fenetre d'ajout et de gestion des cameras. Charge apres camera...
- public/cameras-ajout.js 3.8k : fenetre "Cameras" (bouton + du panneau des cameras de l'accueil) : recherche, ajout avec test, ajout manuel... E: APP.camerasOpen

## electromenager (~50.3k tok)
- adapters/smartthings/api.mjs 6.5k : Client du cloud SmartThings : HTTPS vers api.smartthings.com seul (TLS strict, aucune redirection suivie, 1... E: ErreurST RETOUR SCOPES creerClient client I: ../../core/outils.mjs
- adapters/smartthings/compte.mjs 1.5k : Compte SmartThings depuis l'application : etat sans secret, application OAuth (saisie de secours), connexio... R: GET /smartthings/compte ; POST /smartthings/application /smartthings/connexion /smartthings/code /smartthings/deconnexion E: routes I: ../../core/http.mjs api.mjs
- adapters/smartthings/familles.mjs 3.8k : Familles SmartThings generiques, LECTURE SEULE : capteurs, interrupteurs, audio, appareils a cycle (seche-l... R: GET /smartthings/appareils ; POST /smartthings/appareils/actualiser E: FAMILLES famille valeurs connus routes I: ../../core/outils.mjs api.mjs
- adapters/smartthings/index.mjs 6.0k : Adaptateur SmartThings (cloud) : lave-linge -> type generique washer (voir core/modele.mjs) ; routes GET /a... R: GET /washers ; POST /washers/actualiser /washers/st-[A-Za-z0-9-]{1,72}/reglages /washers/st-[A-Za-z0-9-]{1,72}/commande E: lister appliquer erreur rangement routes I: ../../core/outils.mjs ../../core/http.mjs compte.mjs familles.mjs api.mjs
- adapters/smartthings/manifest.json 103 : Manifeste : Samsung SmartThings (cloud, exception : api.smartthings.com seul, TLS strict, OAuth donnees/smartthings.json) : lave-linge (type washer) et familles generiques en lecture seule (familles.mjs)
- public/electromenager.css 3.0k : vue Électroménager (#viewElectro, préfixe e-) : état complet d'un lave-linge et commandes, affichés dans la...
- public/electromenager.js 11.6k : Vue Electromenager (#viewElectro, prefixe e-) : tuile compacte par lave-linge dans la carte SmartThings ; f...
- public/st-compte.css 2.4k : fenêtre Compte SmartThings et fenêtre de détail (préfixe sc-), carte de groupe SmartThings et tuiles compac...
- public/st-compte.js 7.7k : Compte SmartThings (fenetre, prefixe sc-) et carte de groupe SmartThings (en-tete : etat du compte + icone ... E: APP.stCompte
- public/st-familles.js 3.5k : Familles SmartThings generiques, LECTURE SEULE : capteurs, interrupteurs, audio, autres appareils (vue #vie...
- scripts/smartthings.mjs 4.2k : configuration (config, autoriser) et diagnostic (liste, machine, lecture seule) du cloud SmartThings, sans ...

## telephone (~4.0k tok)
- public/tel.css 1.5k : version smartphone (V1.6, classe « tel » sur <html>, posée par version.js ; sans effet sur la tablette) : e...
- public/tel.js 2.5k : Version smartphone (V1.6, classe « tel » posée par version.js ; inactif sur tablette) : barre d'onglets #on... E: APP.telFeuille

## distant (~24.5k tok)
- core/acces.mjs 2.5k : Appareils autorises a joindre l'ecoute reseau (V1.8, mode distant) : code d'appairage (8 chiffres, usage un... E: COOKIE MAX_CLIENTS nomValide jetonDe cookie cookieEfface creerAcces acces I: outils.mjs http.mjs
- core/annonce.mjs 1.3k : V1.9 : annonce mDNS du serveur en mode distant (pour la recherche de l'APK) : _domowa._tcp sur l'adresse ch... E: SERVICE INSTANCE HOTE SERVICES TTL NOMS reponse annonce demarrer I: outils.mjs
- core/portier.mjs (voir socle)
- core/serveur.mjs 5.0k : Mode du serveur (V1.8) : donnees/serveur.json {v: 1, mode: local | distant, adresse (IPv4 privee), port} (a... E: PORT_DEFAUT FICHIER portValide valider lireConfig ecrireConfig adressesMachine certificat installerCertificat empreinteDe REESSAI_RESEAU motifEcoute ouvrirEcouteReseau motifChangement changerEcoute etat declarer privee I: outils.mjs ipv4.mjs
- modules/appairage.mjs 1.7k : Routes du mode distant (V1.8) : POST /api/appairage {code, nom} (ecoute reseau, sans jeton : pose le cookie... R: POST /appairage /appairage/code /serveur/mode /clients/:id/revoquer ; GET /clients E: routes I: ../core/http.mjs ../core/acces.mjs ../core/serveur.mjs ../core/outils.mjs
- public/appairage.css 764 : page d'appairage (V1.8, préfixe ap-, autonome : aucune autre feuille ni police n'est servie à un appareil s...
- public/appairage.html 548 : Page d'appairage (V1.8, autonome : seule page servie par l'écoute réseau à un appareil sans jeton, avec app...
- public/appairage.js 1.3k : Page d'appairage (V1.8, autonome, sans APP) : saisie du code à 8 chiffres (espace toléré) et du nom de l'ap...
- public/clients.css 911 : fenêtre « Appareils autorisés » (V1.8, préfixe ca-, construite par clients.js ; cadre et éléments communs :...
- public/clients.js 7.0k : Fenêtre « Appareils autorisés » (V1.8, préfixe ca-, cadre hb- de hubs.css) : mode du serveur (local ou dist... E: APP.clients
- scripts/appairage.mjs 695 : Code d'appairage en terminal (V1.8, machine sans ecran), serveur demarre en mode distant : node scripts/app... I: ../config.mjs
- scripts/serveur.mjs 1.3k : Mode du serveur (V1.8), serveur arrete : node scripts/serveur.mjs (etat) | distant [adresse] [port] (ouvre ... I: ../config.mjs ../core/serveur.mjs

## distribution (~18.9k tok)
- distribution/installer.sh 5.2k : Installation en une commande (Termux ou Linux) depuis le depot public : paquets manquants, Node 20 au moins...
- maj.sh (voir socle)
- modules/maj.mjs 3.7k : Mise a jour depuis l'application (V1.8) : GET /api/maj (version installee, version disponible, dernier resu... R: GET /maj ; POST /maj/verifier /maj/appliquer /maj/retour E: gerePar lireEtiquette lireInfo lireNotes creerMaj routes I: ../core/http.mjs ../core/outils.mjs animations-moteur.mjs pieces-creation.mjs hubs.mjs
- outils/publier.sh 1.5k : Publie un arbre public (node outils/ia.mjs publier <arbre>) dans le depot de distribution : un commit par p...
- public/maj.css 551 : fenêtre « Mise à jour » (V1.8, préfixe mj-, construite par maj.js ; cadre et éléments communs : classes hb-...
- public/maj.js 4.1k : Fenêtre « Mise à jour » (V1.8, préfixe mj-, cadre hb- de hubs.css) : version installée, version disponible ... E: APP.maj

## apk (~902 tok)
- public/apk.js 902 : Lien avec l'application Android (V1.9) : sans effet hors de l'APK (APP.apk.present faux, aucun écouteur). D... E: APP.apk

## diagnostic (~3.6k tok)
scripts/camera-evenements.mjs 2.1k, scripts/camera-test.mjs 1.1k, scripts/decouverte-test.mjs 389

## outils (~9.1k tok)
- outils/ia.mjs 7.7k : Outil IA : INDEX.md genere, paquet minimal par zone pour un nouveau chat, controle avant/apres patch.
- outils/publier.sh (voir distribution)
