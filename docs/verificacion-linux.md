# Medir la verificación de Linux y compararla con la Mac

Para #436 usamos un solo job del runner estándar Linux x64 de GitHub, con `ubuntu-24.04`, dos procesos de pruebas unitarias y dos workers de Playwright. Mantener las etapas en la misma máquina permite reutilizar la instalación y las imágenes de Docker durante la corrida. La referencia en la Mac usa su cola local, dos procesos de unitarias y un worker de Playwright. El resultado remoto, el presupuesto y las reglas para revisar e integrar se deciden en [#437](https://github.com/flabat/truco-uruguayo/issues/437) y [#438](https://github.com/flabat/truco-uruguayo/issues/438). Mientras tanto se aplica [CONTRIBUTING.md](../CONTRIBUTING.md).

## Preparar la comparación

1. Usá un checkout limpio. Anotá el SHA completo de la revisión del PR, el de su base, el commit probado (`git rev-parse HEAD`) y su árbol (`git rev-parse 'HEAD^{tree}'`). Un job de `pull_request` puede probar un commit de integración generado por GitHub. Para comparar tiempos, ambos entornos deben verificar ese mismo commit. En una corrida de `push` a `main`, registrá el SHA resultante del squash.
2. Usá Node 24, npm con el lockfile del checkout, Python 3.12, Docker Engine con Compose v2 y el Chromium de la versión local de Playwright. Registrá `uname -sm`, `node -v`, `npm -v`, `python3 --version`, `docker version`, `docker compose version` y, después de instalar las dependencias, `npm exec -- playwright --version` y `npm exec -- playwright install --list`. En una VM propia, el usuario de pruebas necesita acceso al checkout, al daemon de Docker y a los puertos de prueba. En Linux, la instalación de las dependencias del sistema de Chromium requiere permisos de administrador o una imagen que ya las incluya.
3. En la Mac, Node, Python y Chromium se ejecutan en macOS. Docker corre en la VM de Colima. Registrá la arquitectura y los recursos asignados a esa VM con `colima status` y `colima list`. Si corrés todos los comandos dentro de una VM Linux de Colima, registrala como otro entorno, con su arquitectura real. Para reproducir Linux x64 en Apple Silicon, registrá también cualquier emulación que uses.
4. Ubicá el checkout en una ruta legible por el usuario y por Docker. La pila monta archivos de Keycloak y Caddy desde el checkout. Si usás un worktree dentro de la VM, comprobá desde allí que Git pueda resolver `git rev-parse HEAD` y `git rev-parse --git-common-dir`. El directorio Git común también debe ser accesible. Un clon limpio independiente bajo una ruta compartida evita referencias a directorios privados del host.

## Correr la suite

Desde la raíz del checkout, usá un directorio nuevo por intento, fuera del repositorio. En la Mac, elegí una ruta que Colima comparta en lectura y escritura. El siguiente ejemplo supone que el directorio personal es compartido. `TMPDIR` sitúa los archivos transitorios del ensayo de producción en esa ruta.

```sh
intento=$(mktemp -d "$HOME/truco-medicion.XXXXXX")
mkdir -p "$intento/etapas" "$intento/temporales"
export TRUCO_MEDICIONES="$intento/etapas"
export TMPDIR="$intento/temporales"
```

En el runner Linux, fijá `TEST_CONCURRENCY=2` y `PLAYWRIGHT_WORKERS=2` en el entorno. En la Mac se usan los valores locales por defecto. Corré las etapas en orden. Ante una falla, conservá la salida y generá el resumen del intento.

```sh
(
  set -e
  python3 infra/ci/medir.py dependencias npm ci --prefer-offline --no-audit --no-fund
  if [ "$(uname -s)" = Linux ]; then
    python3 infra/ci/medir.py chromium npm exec -- playwright install --with-deps --only-shell chromium
  else
    python3 infra/ci/medir.py chromium npm exec -- playwright install --only-shell chromium
  fi
  CHECK_STACK=1 npm run check
  python3 infra/ci/medir.py produccion npm run check:production
  git diff --check
)
estado_verificacion=$?
python3 infra/ci/medir.py --resumen
test "$estado_verificacion" -eq 0
```

`TRUCO_MEDICIONES` activa la medición por etapa del check. Para medir otro paso, usá `python3 infra/ci/medir.py <etapa> <comando> [argumentos...]`. Cada etapa conserva un registro JSON en ese directorio. En GitHub, el workflow publica el resumen del job y guarda las mediciones durante siete días para las corridas que terminan, incluidas las fallidas. Registrá la espera del job por separado y obtené los minutos facturados de GitHub. El tiempo de etapas anidadas se superpone.

La memoria máxima se obtiene por muestreo del sistema cada tres segundos y al inicio y al final de la etapa. Puede incluir otros procesos. Linux usa memoria total menos disponible. En macOS se suman las páginas activas, cableadas y comprimidas. Consultá el espacio libre inicial con `df -h .` y el directorio de datos con `docker info --format '{{.DockerRootDir}}'`. Si el daemon usa otra ruta local, indicásela al medidor con `TRUCO_DISCO_DOCKER`. En la Mac, registrá además el espacio de la VM antes y después con `colima ssh -- df -h /var/lib/docker`. Usá el mínimo observado con las imágenes, volúmenes y cachés instalados para dimensionar el disco del siguiente ensayo.

## Repetir, cancelar y recuperar

Para el intento en frío, usá una VM descartable nueva y registrá qué cachés se restauraron o ya venían en la imagen (npm, Chromium y capas de Docker). Para el intento en caliente, volvé a correr `npm ci` y toda la suite sobre el mismo SHA, conservando las cachés del intento anterior y usando otro directorio de mediciones. En GitHub cada job estándar recibe una VM nueva. Indicá qué caché efectivamente se restauró entre jobs. Un acierto de caché de npm solo acredita esa caché. Las corridas compartidas de la Mac conservan las cachés de sus demás sesiones.

Para ensayar la cancelación, interrumpí una corrida descartable con Ctrl-C o cancelá su job de prueba. Esperá la salida del proceso y revisá los recursos del nombre exacto de proyecto que aparece en sus logs (`truco-check-…` o `truco-dr-…`). Los scripts limpian los contenedores y volúmenes de ese proyecto y los auxiliares que crearon. Si el proceso murió antes de limpiarlos, identificá los recursos por la etiqueta `com.docker.compose.project` y el nombre completo del ensayo antes de retirar cada resto. En el ensayo de producción, revisá también su contenedor `<proyecto>-almacen` y su red `<proyecto>-copias`. Reservá la limpieza para recursos cuya pertenencia confirmaste. Una VM dedicada al intento se puede descartar completa.

Repetí desde un checkout limpio del mismo SHA y con un directorio nuevo. Verificá que liberó el turno, que puede reutilizar los puertos y que el ensayo de producción restaura la partida en volúmenes nuevos. Publicá en el PR el SHA, la base, herramientas, estado de cachés, espera, duración, memoria, disco y resultado al primer intento. Incluí cada cancelación o reintento con su causa. Ese registro conserva la revisión medida para la muestra de diez PR y las cinco comparaciones previstas en [#435](https://github.com/flabat/truco-uruguayo/issues/435).
