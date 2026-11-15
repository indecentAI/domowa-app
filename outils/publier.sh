#!/bin/bash
# @zone distribution outils | Publie un arbre public (node outils/ia.mjs publier <arbre>) dans le depot de distribution : un commit par publication, etiquette v<VERSION>-<revision> signee, envoi.
# Usage : PUBLIER_CLE=/chemin/cle-signature.pem bash outils/publier.sh <arbre> <depot public (URL ou chemin)>
#   - lance par .github/workflows/publier.yml (declenche a la main) et par le banc (banc/essais-maj.sh, depot nu local, cle de test) ;
#   - la cle privee de signature (ECDSA P-256, PEM : openssl ecparam -name prime256v1 -genkey -noout) n'est jamais dans le depot, le journal ni l'arbre ;
#     sa cle publique est ecrite dans l'arbre (distribution/cle-publique.pem) : c'est elle que maj.sh et installer.sh emploient ;
#   - signature : ligne « signature: <base64> » du message de l'etiquette = signature (openssl dgst -sha256) du texte « <etiquette> <commit> » ;
#   - jamais de --force : une etiquette publiee ne change plus ; arbre identique a la derniere publication : rien n'est publie ;
#   - V1.9 (APK) : PUBLIER_PREVOIR=1 n'ecrit rien et affiche une ligne « ETIQUETTE <etiquette> » (prochaine publication) ou « RIEN <derniere etiquette | -> »
#     (arbre identique) : le flux construit l'APK avec ce versionCode avant toute ecriture ; PUBLIER_ETIQUETTE=<etiquette> : refus si la publication
#     n'aurait pas cette etiquette (une autre publication est passee entre-temps : l'APK construit ne correspondrait plus).
set -u
A=${1:?arbre public}; D=${2:?depot public}
stop() { echo "ECHEC : $*"; exit 1; }
[ -f "$A/VERSION" ] && [ -f "$A/server.mjs" ] && [ -d "$A/node_modules" ] || stop "$A n'est pas un arbre public (node outils/ia.mjs publier)"
[ -f "${PUBLIER_CLE:-}" ] || stop "cle de signature absente (PUBLIER_CLE)"
command -v openssl > /dev/null || stop "openssl absent"
V=$(cat "$A/VERSION"); echo "$V" | grep -qE '^[0-9]+\.[0-9]+$' || stop "VERSION invalide : $V"
T=$(mktemp -d) || stop "dossier temporaire"; trap 'rm -rf "$T"' EXIT
openssl ec -in "$PUBLIER_CLE" -pubout -out "$T/pub.pem" 2> /dev/null || stop "cle de signature illisible (ECDSA, PEM)"
# la cle publique livree est toujours celle de la cle qui signe ; une cle deja presente et differente = changement de cle, refuse ici (a faire expres)
if [ -s "$A/distribution/cle-publique.pem" ] && ! cmp -s "$A/distribution/cle-publique.pem" "$T/pub.pem"; then
  [ -n "${PUBLIER_NOUVELLE_CLE:-}" ] || stop "la cle publique de l'arbre n'est pas celle de la cle de signature (changement de cle : PUBLIER_NOUVELLE_CLE=1)"
fi
export GIT_TERMINAL_PROMPT=0
git clone -q "$D" "$T/depot" 2> "$T/clone.txt" || stop "depot public injoignable : $(tail -1 "$T/clone.txt")"
cd "$T/depot" || stop "clone"
git checkout -q -B main 2> /dev/null
# une cle deja publiee et differente : meme garde-fou
if [ -s distribution/cle-publique.pem ] && ! cmp -s distribution/cle-publique.pem "$T/pub.pem" && [ -z "${PUBLIER_NOUVELLE_CLE:-}" ]; then stop "la cle de signature n'est pas celle des versions deja publiees (PUBLIER_NOUVELLE_CLE=1 pour en changer)"; fi
# contenu remplace en entier par l'arbre
git rm -rq --ignore-unmatch . > /dev/null 2>&1; git clean -fdxq
cp -a "$A/." . || stop "copie de l'arbre"
mkdir -p distribution && cp "$T/pub.pem" distribution/cle-publique.pem
git add -A -f . || stop "git add"
DERNIERE=$(git tag --points-at HEAD 2> /dev/null | grep -E '^v[0-9]+\.[0-9]+-[0-9]+$' | sort -V | tail -1) # etiquette du dernier commit publie
if git rev-parse -q --verify HEAD > /dev/null && git diff --cached --quiet; then
  [ -n "${PUBLIER_PREVOIR:-}" ] && { echo "RIEN ${DERNIERE:--}"; exit 0; }
  echo "Rien a publier : l'arbre est identique a la derniere publication."; exit 0
fi
N=$(git tag -l "v$V-*" | sed -n "s/^v$V-\([0-9][0-9]*\)$/\1/p" | sort -n | tail -1); N=$(( ${N:-0} + 1 ))
E="v$V-$N"
[ -n "${PUBLIER_PREVOIR:-}" ] && { echo "ETIQUETTE $E"; exit 0; }
[ -z "${PUBLIER_ETIQUETTE:-}" ] || [ "$PUBLIER_ETIQUETTE" = "$E" ] || stop "la publication aurait l'etiquette $E et non $PUBLIER_ETIQUETTE (rien n'est publie)"
NOM="V$V"; [ "$N" -gt 1 ] && NOM="V$V révision $N"
git -c user.name="${PUBLIER_AUTEUR:-Domowa}" -c user.email="${PUBLIER_COURRIEL:-domowa@users.noreply.github.com}" commit -q -m "$NOM" || stop "commit"
C=$(git rev-parse HEAD)
printf '%s %s\n' "$E" "$C" > "$T/msg"
openssl dgst -sha256 -sign "$PUBLIER_CLE" -out "$T/sig" "$T/msg" || stop "signature"
openssl dgst -sha256 -verify "$T/pub.pem" -signature "$T/sig" "$T/msg" > /dev/null || stop "signature : verification"
S=$(openssl base64 -A -in "$T/sig")
git -c user.name="${PUBLIER_AUTEUR:-Domowa}" -c user.email="${PUBLIER_COURRIEL:-domowa@users.noreply.github.com}" tag -a "$E" -m "$NOM" -m "signature: $S" "$C" || stop "etiquette"
git push -q origin main "refs/tags/$E" 2> "$T/push.txt" || stop "envoi refuse : $(tail -1 "$T/push.txt")"
echo "Publie : $NOM ($E, $(git rev-parse --short HEAD))"
