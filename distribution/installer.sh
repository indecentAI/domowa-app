#!/bin/bash
# @zone distribution | Installation en une commande (Termux ou Linux) depuis le depot public : paquets manquants, Node 20 au moins, clone a la derniere version signee, controle, raccourcis, demarrage. V1.9 : sous-commandes etat et etape <nom> pour l'APK (lignes DOMOWA).
# Usage : curl -fsSL https://raw.githubusercontent.com/indecentAI/domowa-app/main/distribution/installer.sh | bash
# Relancable : ne refait que ce qui manque ; ne touche jamais une installation existante (mise a jour : ./maj.sh).
# Signature : verifiee avec la cle publique que porte la version installee (distribution/cle-publique.pem) : a la premiere installation, cette cle est
# adoptee telle quelle (elle protege les mises a jour suivantes, pas ce premier telechargement, fait en HTTPS depuis GitHub).
# Mode (V1.8) : question « local ou distant » posee au terminal (/dev/tty : le script arrive par un tube) ; sans terminal : local. Reponse fournie d'avance :
# DOMOWA_MODE=local|distant, DOMOWA_ADRESSE (adresse privee de cette machine), DOMOWA_PORT (defaut 8443). Changer plus tard : node scripts/serveur.mjs.
# V1.9, pour l'APK (chemin « installer ici », sans terminal) :
#   installer.sh etat : lignes « DOMOWA INFO cle=valeur » (termux, node, installe, version, mode, adresse, port, boot, serveur), sans rien changer.
#   installer.sh etape <nom> [args] : une etape, idempotente ; sortie « DOMOWA ETAPE <nom> debut », « DOMOWA INFO ... », puis « DOMOWA ETAPE <nom> ok »,
#   ou « DOMOWA ERREUR <code> <texte> » et un code de sortie non nul. Noms (liste fermee) : paquets, node, telecharger, signature, controle,
#   mode local | mode distant <adresse> <port>, raccourcis, demarrer, demarrage-auto on|off. Sorties des outils (pkg, git...) dans ~/domowa-installation.log.
#   controle sur une installation existante (V1.9, etape 5c) : controle en lecture seule (controle_installe), rien n'est change.
#   Codes d'erreur : argument, paquets, node_absent, node_ancien, dossier_occupe, depot_injoignable, aucune_version, signature, controle, mise_en_place,
#   non_installe, mode, demarrage.
# Banc (banc/essais-distribution.sh) : DEPOT_PUBLIC (depot local), DOMOWA_DOSSIER, INSTALLER_SANS_PAQUETS=1, INSTALLER_SANS_DEMARRAGE=1.
set -u
DEPOT=${DEPOT_PUBLIC:-https://github.com/indecentAI/domowa-app.git}
DEST=${DOMOWA_DOSSIER:-$HOME/dirigera-tablette}
N=$DEST.installation
NODE_MIN=20
BOOT=$HOME/.termux/boot/domowa.sh
export GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat
termux() { [ -n "${TERMUX_VERSION:-}" ] || [ -d /data/data/com.termux/files ]; }
a() { command -v "$1" > /dev/null 2>&1; }
# Sorties : en mode etape, lignes DOMOWA et bruit des outils dans le journal ; sinon, messages pour un humain (comme en V1.8).
ETAPE=; LOGI=/dev/stdout
dire() { [ -n "$ETAPE" ] || echo "$*"; }
info() { [ -z "$ETAPE" ] || echo "DOMOWA INFO $1=$2"; }
echec() { if [ -n "$ETAPE" ]; then echo "DOMOWA ERREUR $1 $2"; else echo "ECHEC : $2"; fi; exit 1; }
installe() { [ -d "$DEST/.git" ] && [ -f "$DEST/server.mjs" ]; }

f_paquets() {
  if [ -n "${INSTALLER_SANS_PAQUETS:-}" ]; then :
  elif termux; then
    local P="" NV; a git || P="$P git"; a node || P="$P nodejs-lts"; a curl || P="$P curl"; a openssl || P="$P openssl-tool"; a ffmpeg || P="$P ffmpeg"
    # Node present mais trop ancien (V1.9, revision v1.8-2 ; vu sur le smartphone le 16/11/2026 : node_ancien, corrige a la main par
    # pkg upgrade nodejs-lts) : son paquet (nodejs-lts ou nodejs) est remis ici, pkg install le met a jour ; f_node revérifie ensuite.
    if a node; then
      NV=$(node -p 'process.versions.node.split(".")[0]' 2> /dev/null | tail -1)
      if [ "${NV:-0}" -lt "$NODE_MIN" ] 2> /dev/null; then
        if dpkg -s nodejs-lts > /dev/null 2>&1; then P="$P nodejs-lts"; elif dpkg -s nodejs > /dev/null 2>&1; then P="$P nodejs"; fi
      fi
    fi
    if [ -n "$P" ]; then
      dire "Paquets Termux :$P"; info paquets "${P# }"
      # Sans terminal (APK) : aucune question de dpkg (fichiers de configuration gardes)
      DEBIAN_FRONTEND=noninteractive pkg install -y -o Dpkg::Options::=--force-confold $P >> "$LOGI" 2>&1 || echec paquets "installation des paquets (pkg install$P)"
    fi
  elif a apt-get; then
    local P=""; a git || P="$P git"; a node || P="$P nodejs"; a curl || P="$P curl"; a openssl || P="$P openssl"; a ffmpeg || P="$P ffmpeg"
    if [ -n "$P" ]; then
      dire "Paquets :$P"; info paquets "${P# }"
      if [ "$(id -u)" = 0 ]; then DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::=--force-confold $P >> "$LOGI" 2>&1 || echec paquets "installation des paquets (apt-get install$P)"
      elif a sudo; then sudo apt-get install -y $P >> "$LOGI" 2>&1 || echec paquets "installation des paquets (sudo apt-get install$P)"
      else echec paquets "paquets manquants :$P (a installer avec les droits d'administrateur, puis relancer)"; fi
    fi
  fi
  for c in git node openssl; do a $c || echec paquets "$c absent : l'installer, puis relancer cette commande"; done
  a ffmpeg || { dire "Attention : ffmpeg absent, les cameras ne s'afficheront pas (a installer plus tard)."; info ffmpeg absent; }
}
# Node 20 au moins (sous Node 18 la bibliotheque du hub ne se charge pas)
f_node() {
  a node || echec node_absent "Node absent : l'installer, puis relancer"
  local NV; NV=$(node -p 'process.versions.node.split(".")[0]' 2> /dev/null)
  [ "${NV:-0}" -ge "$NODE_MIN" ] 2> /dev/null || echec node_ancien "Node $(node -v 2> /dev/null) est trop ancien : Node $NODE_MIN ou plus est necessaire$(termux && echo ' (pkg upgrade nodejs-lts)' || echo ' (voir nodejs.org ou nodesource.com)')"
  info node "$(node -v 2> /dev/null)"
}
# Jamais par-dessus une installation ; clone sans extraction dans <dossier>.installation (refait s'il reste d'un essai precedent)
f_telecharger() {
  if [ -e "$DEST" ]; then
    if installe && [ -n "$ETAPE" ]; then info deja_installe oui; return 0; fi
    [ -d "$DEST/.git" ] && echec dossier_occupe "deja installe dans $DEST : mise a jour par ./maj.sh (ou la fenetre « Mise a jour »)"
    echec dossier_occupe "$DEST existe deja et n'est pas une installation : le renommer, puis relancer"
  fi
  rm -rf "$N"
  dire "Telechargement..."
  git clone -q -o public --no-checkout "$DEPOT" "$N" >> "$LOGI" 2>&1 || { rm -rf "$N"; echec depot_injoignable "depot injoignable ($DEPOT) : Internet ?"; }
  local T; T=$(git -C "$N" tag -l 'v[0-9]*' | grep -E '^v[0-9]+\.[0-9]+-[0-9]+$' | sort -V | tail -1)
  [ -n "$T" ] || { rm -rf "$N"; echec aucune_version "aucune version publiee dans le depot"; }
  info etiquette "$T"
}
# Derniere etiquette du clone en cours ; signature verifiee avec la cle que porte cette version, puis extraction
f_signature() {
  if [ ! -d "$N/.git" ] && installe && [ -n "$ETAPE" ]; then info deja_installe oui; return 0; fi
  [ -d "$N/.git" ] || echec argument "aucun telechargement en cours : etape telecharger d'abord"
  local T C D; T=$(git -C "$N" tag -l 'v[0-9]*' | grep -E '^v[0-9]+\.[0-9]+-[0-9]+$' | sort -V | tail -1)
  [ -n "$T" ] || { rm -rf "$N"; echec aucune_version "aucune version publiee dans le depot"; }
  C=$(git -C "$N" rev-parse "$T^{commit}")
  D=$(mktemp -d) || echec signature "dossier temporaire"
  git -C "$N" show "$T:distribution/cle-publique.pem" > "$D/cle.pem" 2> /dev/null
  git -C "$N" tag -l --format='%(contents)' "$T" | sed -n 's/^signature: //p' | head -1 | openssl base64 -d -A > "$D/sig" 2> /dev/null
  printf '%s %s\n' "$T" "$C" > "$D/msg"
  if [ -s "$D/cle.pem" ] && [ -s "$D/sig" ] && openssl dgst -sha256 -verify "$D/cle.pem" -signature "$D/sig" "$D/msg" > /dev/null 2>&1; then rm -rf "$D"
  else rm -rf "$D" "$N"; echec signature "signature de la version $T invalide : rien n'a ete installe"; fi
  git -C "$N" checkout -q -B main "$C" >> "$LOGI" 2>&1 || { rm -rf "$N"; echec signature "extraction de la version $T"; }
  info etiquette "$T"
}
# V1.9 (etape 5c, « Reparer » de l'APK) : controle EN LECTURE SEULE d'une installation existante ; rien n'est change, ni code ni donnees.
# Fichiers suivis modifies, signature de l'etiquette installee (canal public : cle de la version INSTALLEE, comme maj.sh) ou ia.mjs check en echec : controle.
controle_installe() {
  [ -z "$(git -C "$DEST" status --porcelain --untracked-files=no 2> /dev/null)" ] || echec controle "fichiers de la version installee modifies a la main : rien n'a ete change"
  local T C D; T=$(git -C "$DEST" describe --tags --exact-match 2> /dev/null)
  if git -C "$DEST" remote get-url public > /dev/null 2>&1 && echo "$T" | grep -qE '^v[0-9]+\.[0-9]+-[0-9]+$'; then
    C=$(git -C "$DEST" rev-parse "$T^{commit}"); D=$(mktemp -d) || echec controle "dossier temporaire"
    git -C "$DEST" tag -l --format='%(contents)' "$T" | sed -n 's/^signature: //p' | head -1 | openssl base64 -d -A > "$D/sig" 2> /dev/null
    printf '%s %s\n' "$T" "$C" > "$D/msg"
    if [ -s "$DEST/distribution/cle-publique.pem" ] && [ -s "$D/sig" ] && openssl dgst -sha256 -verify "$DEST/distribution/cle-publique.pem" -signature "$D/sig" "$D/msg" > /dev/null 2>&1; then rm -rf "$D"
    else rm -rf "$D"; echec controle "signature de la version installee $T invalide : rien n'a ete change"; fi
    info signature ok
  fi
  (cd "$DEST" && node outils/ia.mjs check) >> "$LOGI" 2>&1 || echec controle "controle de la version installee en echec : rien n'a ete change"
  info controle ok
}
# Controle (ia.mjs check) du clone extrait ; reussi : mis en place dans le dossier final ; sinon retire
f_controle() {
  if [ ! -d "$N/.git" ] && installe && [ -n "$ETAPE" ]; then info deja_installe oui; controle_installe; return 0; fi
  [ -f "$N/server.mjs" ] || echec argument "aucune version extraite : etapes telecharger et signature d'abord"
  mkdir -p "$N/sauvegardes" && chmod 700 "$N/sauvegardes"
  if ! (cd "$N" && node outils/ia.mjs check > sauvegardes/installation-check.txt 2>&1); then
    [ -n "$ETAPE" ] || tail -5 "$N/sauvegardes/installation-check.txt"
    rm -rf "$N"; echec controle "controle de la version en echec : rien n'a ete installe"
  fi
  [ -e "$DEST" ] && echec dossier_occupe "$DEST existe deja : rien n'a ete remplace"
  mv "$N" "$DEST" || echec mise_en_place "mise en place dans $DEST"
  local T V R; T=$(git -C "$DEST" describe --tags --exact-match 2> /dev/null)
  V=${T#v}; R=${V##*-}; V=${V%-*}
  dire "Installe : V$V$([ "$R" != 1 ] && echo " revision $R")"; info version "$V-$R"
}
# Raccourcis (Termux:Widget) : jamais ecrases
f_raccourcis() {
  if ! termux; then info raccourcis sans_objet; return 0; fi
  installe || echec non_installe "Domowa n'est pas installe dans $DEST"
  local S=$HOME/.shortcuts/tasks; mkdir -p "$S" && chmod 700 "$HOME/.shortcuts" "$S"
  [ -e "$S/Maison.sh" ] || { printf '#!/data/data/com.termux/files/usr/bin/bash\nbash "%s/start.sh"\n' "$DEST" > "$S/Maison.sh"; chmod 700 "$S/Maison.sh"; }
  [ -e "$S/Maison-stop.sh" ] || { printf '#!/data/data/com.termux/files/usr/bin/bash\nbash "%s/stop.sh"\n' "$DEST" > "$S/Maison-stop.sh"; chmod 700 "$S/Maison-stop.sh"; }
  dire "Raccourcis : Maison et Maison-stop (widget « Termux shortcut » de Termux:Widget)."; info raccourcis oui
}
# Mode (etape) : local, ou distant <adresse IPv4 privee> <port> ; serveur arrete (scripts/serveur.mjs refuse sinon et verifie l'adresse)
f_mode() {
  installe || echec non_installe "Domowa n'est pas installe dans $DEST"
  case "${1:-}" in
    local) (cd "$DEST" && node scripts/serveur.mjs local >> "$LOGI" 2>&1) || echec mode "mode local non regle (serveur en marche ?)" ;;
    distant)
      echo "${2:-}" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || echec argument "adresse attendue (exemple 192.168.1.20)"
      echo "${3:-}" | grep -Eq '^[0-9]{4,5}$' || echec argument "port attendu (1024 a 65535)"
      (cd "$DEST" && node scripts/serveur.mjs distant "$2" "$3" >> "$LOGI" 2>&1) || echec mode "mode distant non regle (adresse privee de cette machine ? serveur en marche ?)" ;;
    *) echec argument "mode local ou mode distant <adresse> <port>" ;;
  esac
  info mode "$1"
}
# Demarrage sans navigateur (l'APK affiche l'application) ; attend l'ecoute locale
f_demarrer() {
  installe || echec non_installe "Domowa n'est pas installe dans $DEST"
  DOMOWA_SANS_NAVIGATEUR=1 bash "$DEST/start.sh" >> "$LOGI" 2>&1
  curl -s -o /dev/null --max-time 2 http://127.0.0.1:8080/ || echec demarrage "le serveur n'a pas demarre (voir server.log)"
  info serveur marche
}
# Demarrage automatique (Termux:Boot) : on ecrit ~/.termux/boot/domowa.sh, off le retire (lui seul)
f_demarrage_auto() {
  case "${1:-}" in
    on)
      installe || echec non_installe "Domowa n'est pas installe dans $DEST"
      mkdir -p "$(dirname "$BOOT")" && chmod 700 "$HOME/.termux" "$(dirname "$BOOT")"
      printf '#!/data/data/com.termux/files/usr/bin/bash\n# Domowa : demarrage du serveur au demarrage de l appareil (Termux:Boot), sans navigateur\nDOMOWA_SANS_NAVIGATEUR=1 bash "%s/start.sh"\n' "$DEST" > "$BOOT" && chmod 700 "$BOOT" || echec argument "ecriture de $BOOT"
      info boot actif ;;
    off) rm -f "$BOOT"; info boot inactif ;;
    *) echec argument "demarrage-auto on ou off" ;;
  esac
}
# Etat (sans rien changer)
f_etat() {
  termux && echo "DOMOWA INFO termux=oui" || echo "DOMOWA INFO termux=non"
  echo "DOMOWA INFO node=$(a node && node -v 2> /dev/null || echo absent)"
  if installe; then
    echo "DOMOWA INFO installe=oui"
    local T V R; T=$(git -C "$DEST" describe --tags --exact-match 2> /dev/null)
    if [ -n "$T" ]; then V=${T#v}; R=${V##*-}; V=${V%-*}; echo "DOMOWA INFO version=$V-$R"; else echo "DOMOWA INFO version=$(cat "$DEST/VERSION" 2> /dev/null)"; fi
    # mode, adresse et port : donnees/serveur.json lu par le code installe (meme regle que le serveur, DOMOWA_DONNEES compris)
    (cd "$DEST" && node --input-type=module -e "const m = await import('./core/serveur.mjs'); const c = m.lireConfig(); console.log('DOMOWA INFO mode=' + c.mode); console.log('DOMOWA INFO adresse=' + (c.mode === 'distant' ? c.adresse : '')); console.log('DOMOWA INFO port=' + (c.mode === 'distant' ? c.port : ''));" 2> /dev/null) || echo "DOMOWA INFO mode=inconnu"
  else echo "DOMOWA INFO installe=non"; [ -d "$N" ] && echo "DOMOWA INFO installation=en_cours"; fi
  [ -f "$BOOT" ] && echo "DOMOWA INFO boot=actif" || echo "DOMOWA INFO boot=inactif"
  a curl && curl -s -o /dev/null --max-time 2 http://127.0.0.1:8080/ && echo "DOMOWA INFO serveur=marche" || echo "DOMOWA INFO serveur=arret"
}

# --- sous-commandes (V1.9)
case "${1:-}" in
  etat) f_etat; exit 0 ;;
  etape)
    ETAPE=${2:-}; shift 2 2> /dev/null || shift $#
    LOGI=$HOME/domowa-installation.log; : >> "$LOGI" 2> /dev/null || LOGI=/dev/null
    case "$ETAPE" in paquets|node|telecharger|signature|controle|mode|raccourcis|demarrer|demarrage-auto) ;; *) ETAPE=x; echec argument "etape inconnue" ;; esac
    echo "DOMOWA ETAPE $ETAPE debut"
    echo "--- $(date '+%Y-%m-%d %H:%M:%S') etape $ETAPE" >> "$LOGI"
    case "$ETAPE" in
      paquets) f_paquets ;; node) f_node ;; telecharger) f_telecharger ;; signature) f_signature ;; controle) f_controle ;;
      mode) f_mode "$@" ;; raccourcis) f_raccourcis ;; demarrer) f_demarrer ;; demarrage-auto) f_demarrage_auto "${1:-}" ;;
    esac
    echo "DOMOWA ETAPE $ETAPE ok"; exit 0 ;;
  "") ;;
  *) echo "Usage : installer.sh [etat | etape <nom> [args]]"; exit 1 ;;
esac

# --- installation en une commande (terminal, inchangee depuis la V1.8)
echo "Installation de Domowa dans $DEST"
f_paquets
f_node
f_telecharger
f_signature
f_controle
cd "$DEST" || echec mise_en_place "$DEST"
f_raccourcis
# Mode : local (cette machine seulement) ou distant (appareils du reseau local, HTTPS, appairage par code)
MODE=${DOMOWA_MODE:-}
if [ -z "$MODE" ] && [ -r /dev/tty ] && [ -w /dev/tty ] && (exec < /dev/tty) 2> /dev/null; then
  echo "Qui ouvrira l'application ?"
  echo "  1. Cette machine seulement (mode local, par defaut)"
  echo "  2. Aussi les autres appareils de la maison : smartphone, tablette (mode distant, connexion chiffree, appareils autorises par un code)"
  printf "Choix [1] : "; read -r REP < /dev/tty || REP=
  [ "$REP" = 2 ] && MODE=distant || MODE=local
fi
if [ "$MODE" = distant ]; then
  if [ -n "${DOMOWA_ADRESSE:-}" ] || ! [ -r /dev/tty ] || ! (exec < /dev/tty) 2> /dev/null; then node scripts/serveur.mjs distant ${DOMOWA_ADRESSE:-} ${DOMOWA_ADRESSE:+${DOMOWA_PORT:-}} || MODE=echec
  else node scripts/serveur.mjs distant < /dev/tty || MODE=echec; fi
  [ "$MODE" = echec ] && echo "Mode distant non regle : l'installation reste en mode local. Plus tard, serveur arrete : node scripts/serveur.mjs distant <adresse>"
else echo "Mode local. Pour ouvrir l'application aux autres appareils plus tard, serveur arrete : node scripts/serveur.mjs distant"; fi
# Demarrage (mode distant : adresse a ouvrir, empreinte du certificat et premier code d'appairage)
if [ -z "${INSTALLER_SANS_DEMARRAGE:-}" ]; then
  bash "$DEST/start.sh"
  [ "$MODE" = distant ] && node scripts/appairage.mjs
fi
echo "Termine. Demarrer : bash $DEST/start.sh ; arreter : bash $DEST/stop.sh ; mettre a jour : bash $DEST/maj.sh ou la fenetre « Mise a jour »."
echo "Premiere utilisation : ouvrir l'application, toucher l'etat en haut de l'ecran et connecter le hub."
# FIN
