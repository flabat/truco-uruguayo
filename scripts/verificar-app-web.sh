#!/usr/bin/env bash
# Comprueba que un servidor web (Nginx local o Caddy de producción) sirve la exportación de la app en /jugar/
# y que los enlaces viejos (/app/… y /volver/?mesa=) redirigen a la misma pantalla.
set -euo pipefail
web=${1:?Uso: verificar-app-web.sh <origen>}

html=$(curl -fsS "$web/jugar/")
grep -F '<title>El Truco</title>' <<<"$html" >/dev/null
entrada=$(grep -oE '/jugar/_expo/static/js/web/entry-[a-f0-9]+\.js' <<<"$html" | head -1)
[[ -n "$entrada" ]]
# La pantalla Astro ya no existe: /jugar/ es la app.
if grep -F '/_astro/' <<<"$html" >/dev/null; then echo "/jugar/ sirve la pantalla Astro" >&2; exit 1; fi
# Una ruta profunda recargada en el navegador recibe la app, no un 404.
[[ $(curl -fsS "$web/jugar/mesa") == "$html" ]]
[[ $(curl -fsS "$web/jugar/?invitacion=abc") == "$html" ]]
curl -fsS -D - -o /dev/null "$web$entrada" | grep -iE '^content-type: (text|application)/javascript' >/dev/null
curl -fsS -D - -o /dev/null "$web$entrada" | grep -iF 'cache-control: public, max-age=31536000, immutable' >/dev/null
curl -fsS -D - -o /dev/null "$web/jugar/canvaskit.wasm" | grep -iF 'content-type: application/wasm' >/dev/null

# Redirecciones permanentes, con la consulta intacta.
redirige() {
  local respuesta
  respuesta=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "$web$1")
  [[ $respuesta =~ ^30[178]\ "$web$2"$ ]] || { echo "$1 → $respuesta (se esperaba $2)" >&2; return 1; }
}
id=00000000-0000-4000-8000-000000000407
redirige /jugar /jugar/
redirige /app /jugar/
redirige /app/ /jugar/
redirige "/app/?invitacion=abc" "/jugar/?invitacion=abc"
redirige "/app/mesa?id=$id" "/jugar/mesa?id=$id"
redirige "/app/mirar/$id" "/jugar/mirar/$id"
redirige "/volver/?mesa=$id" "/jugar/?mesa=$id"
redirige "/volver?mesa=$id" "/jugar/?mesa=$id"
echo " · Exportación web de la app servida en $web/jugar/, con los enlaces viejos redirigidos."
