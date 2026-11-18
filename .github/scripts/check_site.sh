#!/usr/bin/env bash
set -euo pipefail

npm run cartas:verificar
npm run test:unit

for pages_url in https://example.org/ https://example.org/truco-uruguayo/; do
  echo "Verificando el sitio en $pages_url"
  PAGES_URL="$pages_url" npm run build
  python3 .github/scripts/check_links.py dist "$pages_url"
  python3 .github/scripts/check_cards.py dist
  PAGES_URL="$pages_url" npm exec -- playwright test
done
