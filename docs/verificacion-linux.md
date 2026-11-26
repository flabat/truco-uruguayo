# Verificación de Linux y mediciones

La suite corre en una VM nueva de GitHub sobre el runner estándar Linux x64 de dos núcleos, imagen `ubuntu-24.04`. Las unitarias y Playwright usan dos workers. Un único job conserva las dependencias y las capas de Docker entre la prueba de la pila y el ensayo de restauración. Durante el desarrollo se usan pruebas dirigidas en la Mac. [Verificación remota del PR](../CONTRIBUTING.md#verificación-remota-del-pr)

## Operación del runner

- Para revisar un PR, abrí la corrida **Verificar el sitio** aceptada por `python3 infra/ci/verificar_pr.py NUMERO`. En Actions, el resumen muestra la revisión, el entorno y los tiempos por etapa. El log del paso fallido incluye la salida del comando. Abrí también el intento correspondiente si hubo reintentos. La retención configurada del repositorio es de 90 días para los logs. El artefacto de mediciones se conserva siete días. Copiá al PR el enlace y los SHA mientras estén disponibles.
- Si la suite encuentra una regresión, reproducí la etapa afectada y verificá la corrección con otra corrida. Si el origen es una interrupción del runner, del registro o de la red, registrá el diagnóstico y reintentá el SHA vigente. Un intento cancelado, incompleto o fallido deja la integración pendiente.
- `flabat` controla el consumo de Actions, los créditos y el presupuesto, y atiende las interrupciones de facturación. Consultá en [#437](https://github.com/flabat/truco-uruguayo/issues/437) el registro automático de los diez primeros PR nuevos contra `main` posteriores a #453. Cuenta borradores y cierres sin merge, los intentos de cada PR y el `push` del squash cuando corresponda. Se redondean los minutos de cada job por separado. La facturación de la cuenta determina el importe efectivo después de créditos.
- Para contener el gasto, cada PR conserva una corrida vigente y cada push a `main` conserva su verificación. Solo el mantenedor cambia el presupuesto o el proveedor. El ensayo de la imagen de Chromium y su comparación con la instalación habitual están registrados en #437.

## Caída de GitHub Actions

Si GitHub Actions o su presupuesto impiden obtener la corrida, `flabat` puede autorizar el respaldo local para esa revisión. Registrá el motivo y la autorización en el PR. Una prueba fallida requiere investigación. Un job en cola o reemplazado sigue el procedimiento normal del PR.

1. Prepará un checkout aislado y limpio del commit de integración vigente del PR (`refs/pull/NUMERO/merge`). Comprobá que `git rev-parse HEAD^1` coincide con la punta actual de `main` y `git rev-parse HEAD^2` con la cabeza actual del PR. Para respaldar un squash ya integrado, usá un checkout del SHA exacto de `main`. Antes de empezar, `git status --porcelain` debe salir vacío.
2. Ejecutá el procedimiento completo de la sección **Correr la suite**, con Docker en marcha y en la cola de la Mac. Deben pasar instalación, Chromium, `CHECK_STACK=1 npm run check`, `npm run check:production` y `git diff --check`. Comprobá además `git diff --check HEAD^1 HEAD` para la revisión probada.
3. Anotá commit, árbol, revisión del PR, base, comandos, resultados y quién los verificó. Antes de integrar, volvé a comprobar los SHA contra GitHub. Si cambiaron o no se pueden confirmar, esperá a verificar la combinación vigente.
4. Para un PR, la evidencia se registra en el propio PR. Solo después de verificar localmente el SHA del squash que sigue en la punta de `main`, el mantenedor puede publicar `verificado-local` para ese SHA. [Estado de respaldo y publicación](produccion.md#publicación-automática-desde-main)

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

La memoria máxima se obtiene por muestreo del sistema cada tres segundos y al inicio y al final de la etapa. Puede incluir otros procesos. Linux usa memoria total menos disponible. En macOS se suman las páginas activas, cableadas y comprimidas. Consultá el espacio libre inicial con `df -h .` y el directorio de datos con `docker info --format '{{.DockerRootDir}}'`. Si el daemon usa otra ruta local, indicásela al medidor con `TRUCO_DISCO_DOCKER`. En la Mac, registrá el espacio de la VM antes y después con `colima ssh --profile truco -- df -h /var/lib/docker` (usá el perfil activo que muestra `colima list`). Usá el mínimo observado con las imágenes, volúmenes y cachés instalados para dimensionar el disco del siguiente ensayo.

## Repetir, cancelar y recuperar

Para el intento en frío, usá una VM descartable nueva y registrá qué cachés se restauraron o ya venían en la imagen (npm, Chromium y capas de Docker). Para el intento en caliente, volvé a correr `npm ci` y toda la suite sobre el mismo SHA, conservando las cachés del intento anterior y usando otro directorio de mediciones. En GitHub cada job estándar recibe una VM nueva. Indicá qué caché efectivamente se restauró entre jobs. Un acierto de caché de npm solo acredita esa caché. Las corridas compartidas de la Mac conservan las cachés de sus demás sesiones.

Para ensayar la cancelación, interrumpí una corrida descartable con Ctrl-C o cancelá su job de prueba. Esperá la salida del proceso y revisá los recursos del nombre exacto de proyecto que aparece en sus logs (`truco-check-…` o `truco-dr-…`). Los scripts limpian los contenedores y volúmenes de ese proyecto y los auxiliares que crearon. Si el proceso murió antes de limpiarlos, identificá los recursos por la etiqueta `com.docker.compose.project` y el nombre completo del ensayo antes de retirar cada resto. En el ensayo de producción, revisá también su contenedor `<proyecto>-almacen` y su red `<proyecto>-copias`. Reservá la limpieza para recursos cuya pertenencia confirmaste. Una VM dedicada al intento se puede descartar completa.

Repetí desde un checkout limpio del mismo SHA y con un directorio nuevo. Verificá que liberó el turno, que puede reutilizar los puertos y que el ensayo de producción restaura la partida en volúmenes nuevos. Publicá en el PR el SHA, la base, herramientas, estado de cachés, espera, duración, memoria, disco y resultado al primer intento. Incluí cada cancelación o reintento con su causa. Ese registro conserva la revisión medida para la muestra de diez PR y las cinco comparaciones previstas en [#435](https://github.com/flabat/truco-uruguayo/issues/435).
