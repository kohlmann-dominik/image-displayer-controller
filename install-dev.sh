#!/usr/bin/env bash
set -euo pipefail

echo "==============================================="
echo " Image Displayer Controller – DEV Setup"
echo "==============================================="
echo

# Prüfen, ob wir im richtigen Ordner sind
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
  echo "❌ Dieses Script muss im Projekt-Root ausgeführt werden (da, wo 'backend' und 'frontend' liegen)."
  exit 1
fi

# --- Tool-Checks ---
MISSING=0

for cmd in git node npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌  '$cmd' ist nicht installiert oder nicht im PATH."
    MISSING=1
  fi
done

if [ "$MISSING" -ne 0 ]; then
  echo
  echo "Bitte installiere die fehlenden Programme und starte das Script erneut."
  echo "  - git"
  echo "  - node (LTS)"
  echo "  - npm"
  exit 1
fi

echo "✅ Voraussetzungen ok (git, node, npm gefunden)."
echo

# --- Abhängigkeiten installieren ---

# Backend
if [ -f "backend/package.json" ]; then
  echo "📦 Installiere Backend-Abhängigkeiten..."
  (
    cd backend
    npm install
  )
else
  echo "⚠️  backend/package.json nicht gefunden – Backend-Install übersprungen."
fi

# Frontend
if [ -f "frontend/package.json" ]; then
  echo
  echo "📦 Installiere Frontend-Abhängigkeiten..."
  (
    cd frontend
    npm install
  )
else
  echo "⚠️  frontend/package.json nicht gefunden – Frontend-Install übersprungen."
fi

# --- Dev-Server starten ---

mkdir -p logs

echo
echo "🚀 Starte Dev-Server (laufen im Hintergrund)..."

BACKEND_PID=""
FRONTEND_PID=""

# Backend dev
if [ -f "backend/package.json" ]; then
  (
    cd backend
    # falls dein Script anders heißt, hier anpassen
    npm run dev >> ../logs/backend.log 2>&1
  ) &
  BACKEND_PID=$!
  echo "$BACKEND_PID" > logs/backend.pid
  echo "  ✅ Backend gestartet (PID: $BACKEND_PID) – Log: logs/backend.log"
fi

# Frontend dev
if [ -f "frontend/package.json" ]; then
  (
    cd frontend
    # --host 0.0.0.0 = von anderen Geräten im LAN erreichbar
    npm run dev -- --host 0.0.0.0 >> ../logs/frontend.log 2>&1
  ) &
  FRONTEND_PID=$!
  echo "$FRONTEND_PID" > logs/frontend.pid
  echo "  ✅ Frontend gestartet (PID: $FRONTEND_PID) – Log: logs/frontend.log"
fi

echo
echo "Fertig ✨"
echo "Frontend:  normalerweise http://localhost:5173"
echo "Backend:   Port laut deiner Backend-Konfiguration"
echo
echo "Zum Stoppen:"
echo "  kill \$(cat logs/backend.pid 2>/dev/null || echo '')"
echo "  kill \$(cat logs/frontend.pid 2>/dev/null || echo '')"
echo