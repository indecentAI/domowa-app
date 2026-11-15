#!/data/data/com.termux/files/usr/bin/bash
# @zone socle | Demarre le serveur (sauvegarde des donnees, nohup, attente) et ouvre Chrome. V1.8 : se place dans son propre dossier (lien suivi), Termux detecte (verrou de veille, ouverture de Chrome) ; hors de Termux (Linux) : bash start.sh.
D=$(cd "$(dirname "$(readlink -f "$0")")" && pwd) && cd "$D" || exit 1
command -v termux-wake-lock > /dev/null 2>&1 && termux-wake-lock
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:8080/ ; then
  bash "$D/sauvegarde.sh" > /dev/null 2>&1
  nohup node server.mjs >> server.log 2>&1 < /dev/null &
  echo $! > server.pid
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    curl -s -o /dev/null --max-time 2 http://127.0.0.1:8080/ && break
  done
fi
# V1.8 : redemarrage par une mise a jour lancee depuis l'application (MAJ_DEPUIS_APPLICATION) : la page est deja ouverte, pas de nouvel onglet
# V1.9 : DOMOWA_SANS_NAVIGATEUR=1 (lance par l'APK ou par Termux:Boot) : pas d'onglet non plus
if [ -n "${MAJ_DEPUIS_APPLICATION:-}" ] || [ -n "${DOMOWA_SANS_NAVIGATEUR:-}" ]; then :; elif command -v termux-open-url > /dev/null 2>&1; then termux-open-url http://127.0.0.1:8080/; else echo "Serveur : http://127.0.0.1:8080/"; fi
