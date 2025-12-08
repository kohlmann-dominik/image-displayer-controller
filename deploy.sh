#!/bin/bash
set -e

echo "--------------------------------------------------"
echo " ImageDisplayer – Deployment Script"
echo "--------------------------------------------------"

BASE_DIR="$HOME/projects/imagedisplayer"
FRONTEND_DIR="$BASE_DIR/frontend"
BACKEND_DIR="$BASE_DIR/backend"
WWW_DIR="/var/www/imagedisplayer-frontend"

echo "➡ Updating Git repository..."
cd "$BASE_DIR"
git pull origin main

echo "--------------------------------------------------"
echo "➡ Building backend..."
cd "$BACKEND_DIR"

if [ -f package.json ]; then
  echo "   Installing backend dependencies..."
  npm install
fi

echo "   Running TypeScript build..."
npm run build

echo "   Restarting backend service..."
sudo systemctl restart imagedisplayer
sudo systemctl status --no-pager imagedisplayer

echo "--------------------------------------------------"
echo "➡ Building frontend..."
cd "$FRONTEND_DIR"

if [ -f package.json ]; then
  echo "   Installing frontend dependencies..."
  npm install
fi

echo "   Running production build..."
npm run build

echo "--------------------------------------------------"
echo "➡ Deploying frontend to $WWW_DIR ..."
sudo rsync -av --delete dist/ "$WWW_DIR"

echo "Reloading nginx..."
sudo systemctl reload nginx

echo "--------------------------------------------------"
echo "✔ Deployment completed successfully!"
