#!/usr/bin/env bash
set -euo pipefail
source scripts/trabajo-entorno.sh # Puertos de la ranura (#378).

etapa() {
  local nombre=$1
  shift
  if [[ -n ${TRUCO_MEDICIONES:-} ]]; then
    python3 infra/ci/medir.py "$nombre" "$@"
  else
    "$@"
  fi
}

etapa cartas npm run cartas:verificar
etapa unitarias npm run test:unit
etapa tipos npm run app:tipos
etapa pruebas-despliegue python3 -B -m unittest discover -s tests/despliegue

etapa compilacion npm run build
etapa enlaces python3 .github/scripts/check_links.py dist https://example.org/
etapa cartas-sitio python3 .github/scripts/check_cards.py dist
etapa playwright npm exec -- playwright test

if [[ "${CHECK_STACK:-0}" == 1 ]]; then
  # La verificación completa ya tiene el puesto de la cola.
  etapa pila bash scripts/verificar-stack.sh
fi
