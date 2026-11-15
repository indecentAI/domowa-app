#!/data/data/com.termux/files/usr/bin/bash
# @zone socle distribution | Mise a jour depuis le depot : etapes ou version affichees puis confirmees, avance seule (jamais de fusion), controle ia.mjs check, retour automatique si echec, ./maj.sh retour.
# Ne touche jamais donnees/, sauvegardes/ ni server.log. Versions precedentes : sauvegardes/versions.txt ; dernier resultat : sauvegardes/maj-resultat.json.
# Deux canaux (V1.8) :
#   - prive (clone du depot de travail, cle de deploiement, branche main) : comme avant, etape par etape ; c'est le canal des essais ;
#   - public (depot de distribution, HTTPS sans cle) : etiquettes v<VERSION>-<revision>, signature verifiee avant toute application ; installe par
#     distribution/installer.sh, ou choisi par ./maj.sh public (bascule d'un clone prive, reversible par ./maj.sh retour).
# Le depot public porte ses dependances (node_modules suivi) : aucun npm. Bascule : les dependances du clone prive sont gardees dans
# sauvegardes/node_modules-prive et remises au retour.
# Commandes : ./maj.sh | etat | retour | public | info (lignes cle=valeur lues par modules/maj.mjs). Hors de Termux : bash maj.sh.
set -u
cd "$(dirname "$(readlink -f "$0")")" || exit 1 # V1.8 : lien suivi (raccourci)
# Jamais de pager (less) pour git : une longue liste d'etapes restait dans less, « (END) », et la question (o/N) n'arrivait qu'apres « q ».
export GIT_PAGER=cat PAGER=cat GIT_TERMINAL_PROMPT=0
J=sauvegardes/versions.txt
RES=sauvegardes/maj-resultat.json
DEPOT_PUBLIC=${DEPOT_PUBLIC:-https://github.com/indecentAI/domowa-app.git}
CLE=distribution/cle-publique.pem
stop() { echo "ECHEC : $*"; echo "RIEN N'A ETE CHANGE."; exit 1; }
[ -d .git ] || stop "ce dossier n'est pas un clone du depot (README : mise a jour par Git)"
command -v git > /dev/null || stop "git absent : pkg install git"

court() { git log -1 --format='%h %s' "$1"; }
propre() {
  [ -z "$(git status --porcelain --untracked-files=no)" ] && return 0
  git status --short --untracked-files=no
  stop "fichiers modifies a la main (ci-dessus) : les remettre avec git checkout -- <fichier>, ou me les signaler"
}
oui() { [ -n "${MAJ_OUI:-}" ] && return 0; printf '%s (o/N) ' "$1"; read -r r; [ "$r" = o ] || [ "$r" = O ]; }
public() { git remote get-url public > /dev/null 2>&1; }
canal() { if public; then echo public; else echo prive; fi; }
# Nom lisible d'un commit : son etiquette de version (« V1.8 », « V1.8 revision 2 »), sinon son abrege
etiquette() { git tag --points-at "$1" 2> /dev/null | grep -E '^v[0-9]+\.[0-9]+-[0-9]+$' | sort -V | tail -1; }
lisible() { # lisible <etiquette>
  local v=${1#v}; local n=${v##*-}; v=${v%-*}
  if [ "$n" = 1 ]; then echo "V$v"; else echo "V$v revision $n"; fi
}
nom() { local e; e=$(etiquette "$1"); if [ -n "$e" ]; then lisible "$e"; else court "$1"; fi; }
resultat() { # resultat <de> <vers> <ok|retour_auto|echec> : lu par l'application apres le redemarrage
  mkdir -p sauvegardes && chmod 700 sauvegardes
  printf '{"de":"%s","vers":"%s","resultat":"%s","le":"%s"}\n' "$(nom "$1" | tr -d '"\\')" "$(nom "$2" | tr -d '"\\')" "$3" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$RES.tmp" && mv "$RES.tmp" "$RES"
}
# Un arbre qui porte ses dependances (depot public) : node_modules suivi par Git
suivi() { [ -n "$(git ls-tree --name-only "$1" node_modules 2> /dev/null)" ]; }
npmci() { echo "Dependances modifiees : npm ci..."; mkdir -p sauvegardes; npm ci --omit=dev --no-audit --no-fund > sauvegardes/maj-npm.txt 2>&1; }
passer() { # passer <vers> <de> : place le code et ses dependances a <vers>
  if suivi "$1" && ! suivi "$2" && [ -d node_modules ]; then # node_modules non suivi : il bloquerait l'arrivee des fichiers suivis
    mkdir -p sauvegardes; rm -rf sauvegardes/node_modules-prive; mv node_modules sauvegardes/node_modules-prive || return 1
  fi
  git reset -q --hard "$1" || return 1
  suivi "$1" && return 0
  if suivi "$2"; then # retour d'une version publique a une version privee : dependances gardees a la bascule
    if [ -d sauvegardes/node_modules-prive ]; then rm -rf node_modules; mv sauvegardes/node_modules-prive node_modules; return $?; fi
    npmci; return $?
  fi
  git diff --quiet "$2" "$1" -- package.json package-lock.json && return 0
  npmci
}
aller() { # aller <cible> <actuelle> : retour automatique a <actuelle> si les dependances ou le controle echouent
  mkdir -p sauvegardes
  if passer "$1" "$2" && node outils/ia.mjs check > sauvegardes/maj-check.txt 2>&1; then return 0; fi
  echo "Controle KO (voir sauvegardes/maj-check.txt) : retour a $(court "$2")"
  passer "$2" "$1"
  resultat "$2" "$1" retour_auto
  return 1
}
redemarrer() {
  [ -n "${MAJ_SANS_REDEMARRAGE:-}" ] && return 0
  if [ -n "${DOMOWA_SERVICE:-}" ]; then # service (systemd, conteneur) : le serveur s'arrete, le service le relance ; aucun droit d'administrateur
    local p=${MAJ_PID:-}; [ -z "$p" ] && [ -f server.pid ] && p=$(cat server.pid)
    if [ -n "$p" ] && kill "$p" 2> /dev/null; then echo "Serveur relance par le service."; else echo "Redemarrer le service pour finir."; fi
    return 0
  fi
  if [ -f server.pid ] && kill -0 "$(cat server.pid)" 2> /dev/null; then
    bash ./stop.sh > /dev/null; bash ./start.sh > /dev/null 2>&1; echo "Serveur redemarre : recharger la page."
  else echo "Serveur arrete : ./start.sh pour le lancer."; fi
}
# Signature d'une etiquette du depot public : ligne « signature: <base64> » du message de l'etiquette = signature ECDSA (openssl, SHA-256) du texte
# « <etiquette> <commit> ». Cle publique : celle de la version INSTALLEE (distribution/cle-publique.pem) ; absente (bascule d'un clone prive) :
# celle que porte l'etiquette, adoptee a cette premiere fois seulement. Rend 0 si la signature est bonne.
signee() { # signee <etiquette>
  command -v openssl > /dev/null || { echo "openssl absent : pkg install openssl-tool"; return 1; }
  local t c d cle rc
  t=$1; c=$(git rev-parse "$t^{commit}" 2> /dev/null) || return 1
  d=$(mktemp -d) || return 1
  if [ -s "$CLE" ]; then cle=$CLE; else git show "$t:$CLE" > "$d/cle.pem" 2> /dev/null || { rm -rf "$d"; return 1; }; cle=$d/cle.pem; ADOPTEE=1; fi
  git tag -l --format='%(contents)' "$t" | sed -n 's/^signature: //p' | head -1 | openssl base64 -d -A > "$d/sig" 2> /dev/null
  printf '%s %s\n' "$t" "$c" > "$d/msg"
  [ -s "$d/sig" ] && openssl dgst -sha256 -verify "$cle" -signature "$d/sig" "$d/msg" > /dev/null 2>&1; rc=$?
  rm -rf "$d"; return $rc
}
# Derniere etiquette de version du depot public (lue apres git fetch) : la plus haute par version puis revision
derniere() { git tag -l 'v[0-9]*' | grep -E '^v[0-9]+\.[0-9]+-[0-9]+$' | sort -V | tail -1; }
recevoir() { # etiquettes du depot public ; une etiquette deja connue qui aurait change est un refus (jamais --force)
  git fetch -q public '+refs/heads/main:refs/remotes/public/main' 'refs/tags/v*:refs/tags/v*' 2> sauvegardes/maj-fetch.txt
}

case "${1:-}" in
etat)
  echo "Installee : $(nom HEAD) ($(court HEAD))"
  if public; then
    mkdir -p sauvegardes
    if recevoir; then T=$(derniere); [ -n "$T" ] && [ "$(git rev-parse "$T^{commit}")" != "$(git rev-parse HEAD)" ] && echo "Disponible : $(lisible "$T")" || echo "Disponible : rien (a jour)"; else echo "Depot injoignable."; fi
  else
    git fetch -q origin main 2> /dev/null && echo "Disponibles : $(git rev-list --count HEAD..origin/main) etape(s)" || echo "Depot injoignable."
  fi
  [ -s "$J" ] && echo "Retour possible vers : $(nom "$(tail -1 "$J" | cut -d' ' -f1)")"
  exit 0 ;;
info) # lignes cle=valeur (modules/maj.mjs) ; INFO_SANS_RESEAU=1 : sans lecture du depot
  mkdir -p sauvegardes
  echo "canal=$(canal)"; echo "commit=$(git rev-parse HEAD)"; echo "installee=$(etiquette HEAD)"
  echo "propre=$([ -z "$(git status --porcelain --untracked-files=no)" ] && echo oui || echo non)"
  [ -s "$J" ] && { P=$(tail -1 "$J" | cut -d' ' -f1); git cat-file -e "$P^{commit}" 2> /dev/null && { echo "retour=$P"; echo "retour_nom=$(nom "$P")"; }; }
  [ -n "${INFO_SANS_RESEAU:-}" ] && exit 0
  if public; then
    if recevoir; then
      T=$(derniere); echo "joignable=oui"
      if [ -n "$T" ] && [ "$(git rev-parse "$T^{commit}")" != "$(git rev-parse HEAD)" ]; then
        if ! git merge-base --is-ancestor HEAD "$T^{commit}"; then echo "disponible="; echo "motif=suite"
        else echo "disponible=$T"; echo "cible=$(git rev-parse "$T^{commit}")"; ADOPTEE=; if signee "$T"; then echo "signature=ok"; else echo "signature=ko"; fi; fi
      else echo "disponible="; fi
    else echo "joignable=non"; fi
  else
    if git fetch -q origin main 2> /dev/null; then
      echo "joignable=oui"; N=$(git rev-list --count HEAD..origin/main)
      if [ "$N" -gt 0 ] && git merge-base --is-ancestor HEAD origin/main; then echo "disponible=$N"; echo "cible=$(git rev-parse origin/main)"; echo "signature=sans"; else echo "disponible="; fi
    else echo "joignable=non"; fi
  fi
  exit 0 ;;
retour)
  propre
  [ -s "$J" ] || stop "aucune version precedente enregistree"
  P=$(tail -1 "$J" | cut -d' ' -f1); A=$(git rev-parse HEAD)
  git cat-file -e "$P^{commit}" 2> /dev/null || stop "version precedente introuvable : $P"
  echo "Retour de : $(court HEAD)"; echo "       a : $(court "$P")"
  oui "Confirmer ?" || { echo "Rien n'a ete change."; exit 0; }
  aller "$P" "$A" || exit 1
  sed -i '$d' "$J"
  # retour d'avant la bascule : le canal redevient prive (le depot public reste connu de Git, sans effet)
  if public && ! suivi HEAD; then git remote remove public; echo "Canal : depot prive (comme avant la bascule)."; fi
  resultat "$A" "$P" ok
  echo "OK : $(court HEAD) (./maj.sh proposera de nouveau les etapes suivantes)"; redemarrer; exit 0 ;;
public) # bascule d'un clone prive vers le depot public (une fois ; reversible par ./maj.sh retour)
  public && stop "ce clone suit deja le depot public (./maj.sh pour mettre a jour)"
  propre
  mkdir -p sauvegardes && chmod 700 sauvegardes
  git remote add public "$DEPOT_PUBLIC" || stop "ajout du depot public"
  recevoir || { git remote remove public; stop "depot public injoignable ($DEPOT_PUBLIC) : Internet ? depot cree ?"; }
  T=$(derniere); [ -n "$T" ] || { git remote remove public; stop "aucune version publiee dans le depot public"; }
  ADOPTEE=; signee "$T" || { git remote remove public; stop "signature de $(lisible "$T") invalide : version refusee"; }
  A=$(git rev-parse HEAD); N=$(git rev-parse "$T^{commit}")
  VI=$(cat VERSION 2> /dev/null); VP=$(git show "$T:VERSION" 2> /dev/null)
  [ "$(printf '%s\n%s\n' "$VI" "$VP" | sort -V | tail -1)" = "$VP" ] || { git remote remove public; stop "la version publique ($VP) est plus ancienne que la version installee ($VI)"; }
  echo "Bascule vers le depot public : $(lisible "$T")"; echo "Version installee : $(court HEAD)"
  [ -n "${ADOPTEE:-}" ] && echo "Cle de signature : adoptee a cette premiere installation (elle verifiera les versions suivantes)."
  oui "Basculer ?" || { git remote remove public; echo "Rien n'a ete change."; exit 0; }
  [ -f sauvegarde.sh ] && bash sauvegarde.sh > /dev/null 2>&1
  echo "$A $(date +%Y-%m-%dT%H:%M)" >> "$J"
  aller "$N" "$A" || { sed -i '$d' "$J"; git remote remove public; exit 1; }
  resultat "$A" "$N" ok
  echo "OK : $(nom HEAD). Mises a jour suivantes : ./maj.sh ou la fenetre « Mise a jour ». Retour au depot prive : ./maj.sh retour"; redemarrer; exit 0 ;;
"") ;;
*) echo "Usage : ./maj.sh [etat|retour|public]"; exit 1 ;;
esac

propre
mkdir -p sauvegardes && chmod 700 sauvegardes
A=$(git rev-parse HEAD)
if public; then
  recevoir || stop "depot public injoignable (Internet ?), ou etiquette de version modifiee (sauvegardes/maj-fetch.txt)"
  T=$(derniere); [ -n "$T" ] || stop "aucune version publiee"
  N=$(git rev-parse "$T^{commit}")
  [ "$A" = "$N" ] && { echo "Deja a jour : $(nom HEAD)"; exit 0; }
  git merge-base --is-ancestor "$A" "$N" || stop "la version du depot ne prolonge pas la version installee (./maj.sh etat)"
  [ -z "${MAJ_CIBLE:-}" ] || [ "$MAJ_CIBLE" = "$T" ] || stop "la version disponible ($T) n'est plus celle demandee ($MAJ_CIBLE)"
  ADOPTEE=; signee "$T" || stop "signature de $(lisible "$T") invalide : version refusee"
  echo "Version disponible : $(lisible "$T") (installee : $(nom HEAD))"
else
  git fetch -q origin main || stop "depot injoignable (Internet ? cle de deploiement ?)"
  N=$(git rev-parse origin/main)
  [ "$A" = "$N" ] && { echo "Deja a jour : $(court HEAD)"; exit 0; }
  git merge-base --is-ancestor "$A" "$N" || stop "la version du depot ne prolonge pas la version installee (./maj.sh etat)"
  [ -z "${MAJ_CIBLE:-}" ] || [ "$MAJ_CIBLE" = "$N" ] || stop "les etapes disponibles ne sont plus celles demandees"
  echo "Etape(s) a appliquer ($(git rev-list --count "$A..$N")) :"; git log --reverse --format='  %h %s' "$A..$N"
fi
oui "Appliquer ?" || { echo "Rien n'a ete change."; exit 0; }
[ -f sauvegarde.sh ] && bash sauvegarde.sh > /dev/null 2>&1 # donnees .json sans secret
echo "$A $(date +%Y-%m-%dT%H:%M)" >> "$J"
aller "$N" "$A" || { sed -i '$d' "$J"; exit 1; }
resultat "$A" "$N" ok
echo "OK : $(nom HEAD)"; redemarrer
