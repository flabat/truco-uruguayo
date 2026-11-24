#!/usr/bin/env bash
set -euo pipefail

# Imprime codigo=true si el cambio entre BASE y HEAD toca algo más que documentación.
# docs/ y los .md de la raíz no forman parte del sitio, la API ni el entrenamiento.
# Ante cualquier duda (sin base, base inaccesible, diff vacío) responde true.
base=${1:-}
head=${2:-HEAD}
solo_docs='^(docs/|[^/]+\.md$)'

if [[ -z "$base" || "$base" =~ ^0+$ ]] || ! archivos=$(git diff --name-only "$base" "$head" 2>/dev/null) ||
  [[ -z "$archivos" ]] || grep -qvE "$solo_docs" <<<"$archivos"; then
  echo codigo=true
else
  echo codigo=false
fi
