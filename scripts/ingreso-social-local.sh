#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  google) credenciales=(-e GOOGLE_CLIENT_ID -e GOOGLE_CLIENT_SECRET) ;;
  facebook) credenciales=(-e FACEBOOK_APP_ID -e FACEBOOK_APP_SECRET) ;;
  *) echo "Elegí google o facebook." >&2; exit 1 ;;
esac

# La administración solo es accesible dentro de la red de Compose.
exec docker compose exec -T \
  -e KEYCLOAK_ADMIN_URL=http://identidad:8080 -e KEYCLOAK_REALM=mesa-local \
  -e KEYCLOAK_ADMIN_TOKEN -e KC_BOOTSTRAP_ADMIN_USERNAME -e KC_BOOTSTRAP_ADMIN_PASSWORD \
  "${credenciales[@]}" api node --input-type=module - "$1" < scripts/configurar-ingreso-social.mjs
