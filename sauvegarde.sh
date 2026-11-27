#!/data/data/com.termux/files/usr/bin/bash
# @zone socle
# Sauvegarde des fichiers .json de donnees/ sans secret (liste fermee : jamais dirigera-token.txt, camera-secrets/, smartthings.json) dans sauvegardes/ ; garde les 10 dernieres. Restauration : tar xzf <archive> -C donnees
# V1.8 : se place dans son propre dossier (lien suivi) ; dossier des donnees : DOMOWA_DONNEES (chemin absolu) ou donnees/, meme regle que core/outils.mjs.
D=$(cd "$(dirname "$(readlink -f "$0")")" && pwd) && cd "$D" || exit 1
case "${DOMOWA_DONNEES:-}" in /*) DON=$DOMOWA_DONNEES ;; *) DON=donnees ;; esac
[ -d "$DON" ] || exit 0
mkdir -p sauvegardes && chmod 700 sauvegardes
f="sauvegardes/donnees-$(date +%Y%m%d-%H%M%S).tgz"
tar czf "$f" -C "$DON" $(cd "$DON" && ls scenarios.json layout.json colors.json cameras.json animations.json animations-v2.json pieces.json pieces-creees.json dirigera.json accueil.json equipements.json stores-positions.json icones.json themes.json 2>/dev/null) && echo "Sauvegarde : $f"
ls -1t sauvegardes/donnees-*.tgz | tail -n +11 | xargs -r rm -f
