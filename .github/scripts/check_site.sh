#!/usr/bin/env bash
set -euo pipefail

# Sin argumentos corre todo. El workflow reparte las secciones entre jobs paralelos.
seccion=${1:-todo}

unitarias() {
  npm run cartas:verificar
  npm run test:unit
  python3 -B -m unittest discover -s tests/despliegue
}

sitio() {
  npm run build
  python3 .github/scripts/check_links.py dist https://example.org/
  python3 .github/scripts/check_cards.py dist
  # PLAYWRIGHT_SHARD=1/3 corre un tercio de las pruebas de navegador.
  npm exec -- playwright test ${PLAYWRIGHT_SHARD:+--shard="$PLAYWRIGHT_SHARD"}
}

case "$seccion" in
  unitarias) unitarias ;;
  sitio) sitio ;;
  todo)
    unitarias
    sitio
    if [[ "${CHECK_STACK:-0}" == 1 ]]; then
      npm run check:stack
    fi
    ;;
  *) echo "Sección desconocida: $seccion (usá unitarias, sitio o todo)" >&2; exit 2 ;;
esac
