#!/data/data/com.termux/files/usr/bin/bash
# @zone socle | Arrete le serveur (server.pid) et libere le verrou de veille. V1.8 : se place dans son propre dossier (lien suivi) ; hors de Termux (Linux) : bash stop.sh.
D=$(cd "$(dirname "$(readlink -f "$0")")" && pwd) && cd "$D" || exit 1
if [ -f server.pid ]; then kill "$(cat server.pid)" 2>/dev/null; rm -f server.pid; fi
command -v termux-wake-unlock > /dev/null 2>&1 && termux-wake-unlock
echo "Serveur arrêté."
