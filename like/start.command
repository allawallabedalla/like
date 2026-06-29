#!/bin/bash
# macOS-Starter: like lokal mit voller Funktion (Server + Browser).
# Doppelklick im Finder. Einmalig vorher ausführbar machen:  chmod +x start.command
cd "$(dirname "$0")"

NODE="$(command -v node)"
if [ -z "$NODE" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$p" ] && NODE="$p" && break
  done
fi
if [ -z "$NODE" ]; then
  echo "Node.js nicht gefunden. Bitte installieren: https://nodejs.org"
  read -n 1 -s; exit 1
fi

echo "Starte like auf http://localhost:5173 ..."
"$NODE" server.mjs --open
