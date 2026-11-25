#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# La administración solo es accesible dentro de la red de Compose.
exec docker compose exec -T \
  -e KEYCLOAK_ADMIN_URL=http://identidad:8080 -e KEYCLOAK_REALM=mesa-local \
  -e KEYCLOAK_ADMIN_TOKEN -e KC_BOOTSTRAP_ADMIN_USERNAME -e KC_BOOTSTRAP_ADMIN_PASSWORD \
  -e KEYCLOAK_API_CLIENT_SECRET \
  api node --input-type=module - < scripts/configurar-cliente-api.mjs
