#!/usr/bin/env bash
# Comprueba que un servidor web (Nginx local o Caddy de producción) sirve la exportación de la app en /app/.
set -euo pipefail
web=${1:?Uso: verificar-app-web.sh <origen>}

html=$(curl -fsS "$web/app/")
grep -F '<title>El Truco</title>' <<<"$html" >/dev/null
entrada=$(grep -oE '/app/_expo/static/js/web/entry-[a-f0-9]+\.js' <<<"$html" | head -1)
[[ -n "$entrada" ]]
# Una ruta profunda recargada en el navegador recibe la app, no un 404.
[[ $(curl -fsS "$web/app/mesa") == "$html" ]]
[[ $(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "$web/app") =~ ^30[178]\ "$web/app/"$ ]]
curl -fsS -D - -o /dev/null "$web$entrada" | grep -iE '^content-type: (text|application)/javascript' >/dev/null
curl -fsS -D - -o /dev/null "$web$entrada" | grep -iF 'cache-control: public, max-age=31536000, immutable' >/dev/null
# La pantalla Astro sigue en /jugar/.
curl -fsS "$web/jugar/" | grep -F '/_astro/' >/dev/null
echo " · Exportación web de la app servida en $web/app/."
