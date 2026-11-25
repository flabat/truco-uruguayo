#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  google) credenciales=(-e GOOGLE_CLIENT_ID -e GOOGLE_CLIENT_SECRET) ;;
  facebook) credenciales=(-e FACEBOOK_APP_ID -e FACEBOOK_APP_SECRET) ;;
  discord) credenciales=(-e DISCORD_CLIENT_ID -e DISCORD_CLIENT_SECRET) ;;
  apple) credenciales=(-e APPLE_CLIENT_ID -e APPLE_TEAM_ID -e APPLE_KEY_ID -e APPLE_PRIVATE_KEY) ;;
  *) echo "Elegí google, facebook, discord o apple." >&2; exit 1 ;;
esac

# La administración solo es accesible dentro de la red de Compose.
exec docker compose exec -T \
  -e KEYCLOAK_ADMIN_URL=http://identidad:8080 -e KEYCLOAK_REALM=mesa-local \
  -e KEYCLOAK_ADMIN_TOKEN -e KC_BOOTSTRAP_ADMIN_USERNAME -e KC_BOOTSTRAP_ADMIN_PASSWORD \
  "${credenciales[@]}" api node --input-type=module - "$1" < scripts/configurar-ingreso-social.mjs
