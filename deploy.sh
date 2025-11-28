#!/bin/bash

echo "Fent còpia de data_raw al sharepoint"... 

rsync -auP data_raw "../../../ICRA/H2OSEG - ICRA - General/Dades SAD/"

# 🔧 CONFIGURA aquí
REMOTE_USER="root"
REMOTE_HOST="icra.loading.net"
REMOTE_DIR="/var/www/vhosts/icradev.cat/h2oseg-ter.icradev.cat/"
VUE_PROD_CDN="https://unpkg.com/vue@3.5.16/dist/vue.global.prod.js"

# Fitxer base
SRC_INDEX="index.html"
TMP_INDEX="index.deploy.html"

echo "🔧 Preparant fitxer index.html amb Vue en producció..."

# 1. Crear versió modificada del index.html amb Vue prod
cp "$SRC_INDEX" "$TMP_INDEX"
sed -i.bak "s|https://unpkg.com/vue@[^\"']*|$VUE_PROD_CDN|g" "$TMP_INDEX"

# 2. Rsync de tot el projecte excepte fitxers no desitjats i index original
echo "🚀 Desplegant fitxers al servidor..."

rsync -avz --delete \
  --include "assets/" \
  --include "assets/**" \
  --include "js/" \
  --include "js/**" \
  --include "css/" \
  --include "css/**" \
  --exclude "*" \
  ./ "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"

# 3. Rsync del index modificat
rsync -avz "$TMP_INDEX" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/index.html"

# 4. Neteja local
rm "$TMP_INDEX" "$TMP_INDEX.bak"

echo "✅ Desplegament complet amb Vue en mode producció!"
