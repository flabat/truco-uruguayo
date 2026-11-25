#!/usr/bin/env bash
set -euo pipefail

npm run cartas:verificar
npm run test:unit
npm run app:tipos
python3 -B -m unittest discover -s tests/despliegue

npm run build
python3 .github/scripts/check_links.py dist https://example.org/
python3 .github/scripts/check_cards.py dist
npm exec -- playwright test

if [[ "${CHECK_STACK:-0}" == 1 ]]; then
  npm run check:stack
fi
