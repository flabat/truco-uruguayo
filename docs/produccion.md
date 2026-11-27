# El Truco en un VPS de 4 GB

El despliegue usa una máquina Linux de dos CPU con Docker Engine y Compose v2. Caddy sirve el sitio estático, termina HTTPS y pasa las conexiones WebSocket a la API. Keycloak arranca en modo producción. PostgreSQL guarda las cuentas y las partidas en esquemas con propietarios distintos. Restic envía una copia cifrada a un destino independiente del VPS.

## Ensayo sin contratar servicios

Desde un checkout con Docker, Compose, Bash y OpenSSL, ejecutá:

```sh
bash scripts/verificar-produccion.sh
```

Se puede elegir un contexto Docker de dos CPU y 4 GiB con `DOCKER_CONTEXT`. El ensayo crea su propio proyecto con puertos aleatorios en loopback, cuentas descartables y un servidor REST de copias en una red aislada. Comprueba la redirección HTTP, el certificado local de Caddy, el ingreso por contraseña, la cookie segura y las jugadas por HTTPS con avisos WSS. La tarea programada guarda la copia. El ensayo reemplaza los volúmenes del proyecto, vuelve a ingresar con la cuenta recuperada, compara la vista completa de la partida y juega otro turno. La CA local se instala sólo en el cliente y la API del ensayo.

## Primera instalación

1. En OVHcloud elegí **Distribution only → Ubuntu → 26.04 LTS**. Instalá Docker Engine y el complemento Compose desde el [repositorio oficial de Docker para Ubuntu](https://docs.docker.com/engine/install/ubuntu/). En el VPS, prepará un checkout de la versión que vas a publicar. Apuntá el registro A del dominio a su IPv4. Si publicás un AAAA, comprobá también la ruta IPv6. Abrí TCP 80 y 443, y reservá SSH para la administración. Caddy obtiene y renueva el certificado automáticamente. La API, PostgreSQL, Keycloak y el servicio de copias quedan en la red de Docker. [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https)
2. Prepará un repositorio de copias dedicado en otro servidor o cuenta de almacenamiento. Para un servidor REST usá `rest:https://copias.ejemplo/mesa/` y las dos credenciales REST. Para almacenamiento compatible con S3, creá primero el bucket y usá `s3:https://endpoint/bucket/prefijo`, con credenciales de lectura, escritura, listado y borrado limitadas al destino. La restauración local ejercita el protocolo REST. [Destinos de restic](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
3. En un checkout nuevo, creá `.env` con el siguiente comando. Completá el dominio y el destino de las copias, y generá cinco secretos independientes con `openssl rand -hex 32`. Guardá una copia de la configuración, las credenciales del destino y la clave de restic en un gestor de secretos fuera del VPS. La clave de cifrado de restic es necesaria aun si conservás el bucket.

   ```sh
   (umask 077; set -C; cat infra/produccion/env.ejemplo > .env)
   ```

4. Usá el siguiente atajo desde la raíz para todos los comandos de esta guía. Inicializá el repositorio restic una sola vez. La inicialización no necesita la base. Para un repositorio ya inicializado usá `listar` para probar las credenciales.

   ```sh
   dc() { TRUCO_RELEASE=$(git rev-parse HEAD) docker compose -f compose.production.yaml "$@"; }
   dc build
   dc run --rm --no-deps backup iniciar
   dc up -d --wait
   dc ps
   dc run --rm --no-deps backup listar
   ```

Para preparar las imágenes antes de ocupar el VPS, también podés ejecutar `dc build` en un constructor Linux de la misma arquitectura, con el mismo checkout y el nombre de proyecto predeterminado. Transferí las imágenes `truco-produccion-web`, `truco-produccion-api` y `truco-produccion-backup` con `docker save` y `docker load`. En el destino usá `dc up -d --no-build --wait`. PostgreSQL y Keycloak se descargan de sus registros.

## Dar acceso a los jugadores

El realm `mesa` arranca vacío y admite cuentas creadas por el operador. El registro por correo se habilita después de configurar y probar el envío de correo. El cliente `truco-web` sólo acepta la dirección HTTPS exacta de retorno del sitio y usa PKCE. La URL del emisor forma parte de la identidad del jugador: conservá el nombre DNS al migrar o restaurar. El administrador y el realm maestro sólo se alcanzan desde el servidor.

Para dar el primer acceso, entrá por SSH, ejecutá `dc exec identidad bash` y abrí una sesión de administración desde el contenedor. El primer comando de autenticación pide la contraseña de `operador`. El archivo de sesión se elimina al salir de esa shell.

```bash
cfg=$(mktemp)
trap 'rm -f "$cfg"' EXIT
kc() { /opt/keycloak/bin/kcadm.sh "$@" --config "$cfg"; }
kc config credentials --server http://localhost:8080 --realm master --user operador
kc create users -r mesa -s username=jugador1 -s enabled=true \
  -s firstName=Jugador -s lastName=Uno -s email=jugador1@example.org
read -rsp 'Contraseña temporal: ' temporal
echo
kc set-password -r mesa --username jugador1 --new-password "$temporal" --temporary
unset temporal
exit
```

Sustituí los datos del ejemplo por los del jugador. Entregale la contraseña temporal por un canal privado. Al ingresar por primera vez deberá elegir la suya. Para operar de forma permanente, creá un administrador nominal en el realm maestro, asignale el rol de realm `admin`, verificá su ingreso por la consola local y retirale el acceso al administrador de arranque. Cambiar `KC_ADMIN_PASSWORD` en el archivo de entorno no cambia la contraseña de una cuenta existente.

### Registro con correo y contraseña

Configurá el remitente y el servidor SMTP del realm `mesa` desde **Realm settings → Email** de Keycloak. Probá el envío desde esa pantalla con un buzón al que tengas acceso. La configuración de correo queda en Keycloak. Usá la consola desde el acceso administrativo privado o configurá el campo `smtpServer` con `kcadm.sh` y un archivo protegido. [Configurar el correo de un realm](https://www.keycloak.org/docs/latest/server_admin/#_email)

Con la sesión administrativa del paso anterior, ejecutá este comando sobre el realm existente.

```bash
kc update realms/mesa \
  -s registrationAllowed=true -s registrationEmailAsUsername=true \
  -s loginWithEmailAllowed=true -s duplicateEmailsAllowed=false \
  -s verifyEmail=true -s resetPasswordAllowed=true
```

En una ventana privada, abrí el sitio, elegí **Ingresar al juego** y registrá una cuenta de prueba. Comprobá que llega el mensaje, confirmá el correo y elegí la contraseña. Volvé a entrar con ese correo y probá **Olvidé mi contraseña**. Las cuentas existentes con un correo pendiente de verificación pueden recibir el mismo pedido al ingresar, incluso si usan un proveedor social. Probá un reingreso por usuario y uno por cada proveedor habilitado.

En la portada o el salón, **Mi perfil** muestra el ID de jugador y los chicos empezados con esa cuenta. Incluye modalidad, tanteador, resultado y fecha cuando el registro la conserva. El correo y la contraseña quedan bajo la gestión de Keycloak.

### Eliminación de cuentas

Los jugadores piden la eliminación desde **Mi perfil**. Durante 30 días pueden arrepentirse volviendo a ingresar. Al vencer, una tarea de la API (cada hora) revoca su token de Apple si ingresó con Apple, borra su usuario de Keycloak y deja su fila de jugador como «Jugador» anónimo para el historial de los demás.

Para borrar usuarios, la API usa el cliente de servicio `truco-api`, que solo puede administrar usuarios del realm `mesa`:

1. Generá el secreto con `openssl rand -hex 32` y guardalo como `KEYCLOAK_API_CLIENT_SECRET` en el archivo de entorno. Si habilitaste Apple, completá también las variables `APPLE_*` y generá `APPLE_TOKENS_KEY` con `openssl rand -base64 32`.
2. Recreá la API para que tome las variables: `dc up -d api`.
3. Registrá el cliente desde el servidor, con la contraseña de `operador`:

   ```bash
   read -rsp 'Contraseña de operador: ' KC_BOOTSTRAP_ADMIN_PASSWORD; echo
   dc exec -T -e KEYCLOAK_ADMIN_URL=http://identidad:8080 -e KEYCLOAK_REALM=mesa \
     -e KC_BOOTSTRAP_ADMIN_USERNAME=operador -e KC_BOOTSTRAP_ADMIN_PASSWORD \
     api node --input-type=module - < scripts/configurar-cliente-api.mjs
   unset KC_BOOTSTRAP_ADMIN_PASSWORD
   ```

El comando es idempotente: volvé a ejecutarlo si cambiás el secreto. Keycloak 26.8 exige el alcance `kc-admin-api` para usar la API de administración, y el comando lo asigna. En producción `KEYCLOAK_API_CLIENT_SECRET` es obligatorio: sin esa variable, Compose no levanta la API, para que ninguna baja quede pendiente sin aviso. Si falta registrar el cliente, la API lo informa en cada pasada de la tarea. Localmente, `npm run auth:api` hace lo mismo sobre `mesa-local`.

### Panel personal de gestión

El panel está en `/gestion/`. Para habilitarlo, elegí una única cuenta personal del realm `mesa` con usuario y contraseña. Podés crearla con el procedimiento anterior. Antes de salir de la sesión de administración, consultá su identificador estable con `kc get users -r mesa -q username=NOMBRE -q exact=true --fields id,username`.

Comprobá el nombre y copiá el valor de `id` en `GESTION_SUJETO`. En el VPS con [publicación automática](#publicación-automática-desde-main), usá `/etc/truco-oriental/production.env`. El siguiente despliegue de la API aplica el valor. Para una instalación manual, usá el archivo `.env` del checkout y ejecutá `dc up -d --wait api`. Al abrir el panel, ingresá con la contraseña de esa cuenta del juego. El panel comprueba el emisor y el identificador en cada consulta. Para retirar el acceso, vaciá la variable y recreá el servicio `api` con la configuración de su instalación.

**En vivo** distingue las personas con sesión vigente de las conectadas a una mesa. Los navegadores con más de una pestaña cuentan una vez por persona. **Jugadores** incluye las cuentas que ingresaron al juego al menos una vez. **Historial** muestra cada chico desde el primer reparto, con los equipos y el último tanteador conocido. Un chico terminado suma una partida a cada participante y una victoria a cada integrante del equipo ganador. Se incluyen rivales de computadora. Los chicos sin terminar quedan en el historial con su tanteador parcial, incluso después de una desconexión. Las fechas anteriores a su registro pueden figurar como desconocidas.

**Funciones** administra el acceso a Tercetos y registra cada cambio. [Operación y reversión del piloto](gestion/funciones.md).

## Copias y recuperación

El servicio `backup` guarda una copia al arrancar y vuelve a hacerlo cada 24 horas. `pg_dump` obtiene una vista consistente de los dos esquemas mientras se juega. Restic cifra el archivo y publica una instantánea sólo si el volcado terminó bien. Se guardan siete copias diarias, cuatro semanales y seis mensuales. Ante un error se reintenta tras cinco minutos. Revisá `dc ps`, `dc logs --tail=40 backup` y la fecha de la última instantánea. El servicio pasa a estado no saludable después de 26 horas sin una copia exitosa. Una copia diaria permite perder hasta un día de jugadas si se pierde el disco y las copias están al día.

```sh
dc run --rm --no-deps backup guardar
dc run --rm --no-deps backup listar
```

**Recuperación en un VPS nuevo o un proyecto con volúmenes nuevos.** Prepará la misma versión del checkout, el mismo dominio y la configuración guardada. Conservá el servidor anterior y sus volúmenes mientras verificás el reemplazo. Las credenciales de los roles de PostgreSQL se crean desde el entorno al inicializar el volumen nuevo. El volcado conserva las cuentas de Keycloak, sus claves de firma y los datos del juego.

```sh
dc build
dc up -d --wait db
dc run --rm --no-deps backup listar
dc run --rm --no-deps backup restaurar ID_DE_LA_INSTANTANEA
dc up -d --wait
```

Elegí el ID de la copia verificada. La restauración requiere espacio temporal para descargar el volcado y descomprimir su SQL, además de espacio en PostgreSQL para reconstruirlo. Rechaza una base ocupada y aplica el volcado en una transacción. Para confirmar la recuperación, ingresá en una sesión nueva con una cuenta existente, volvé a su mesa y jugá otro turno. Caddy conserva los certificados entre reinicios en su volumen; en una máquina nueva los solicita de nuevo al resolver el DNS del sitio.

## Actualizar la aplicación

Antes de actualizar, ejecutá `dc run --rm --no-deps backup guardar`, anotá el ID y el commit desplegado, y prepará la versión siguiente. Con imágenes construidas en el VPS usá `dc build` y luego `dc up -d --wait`. La API aplica las migraciones al arrancar. Si una migración impide volver al binario anterior, recuperá la versión y su copia juntas en un proyecto nuevo. Un despliegue de una sola máquina puede pausar mesas durante un reinicio.

La imagen de identidad incluye el tema de El Truco y un proveedor de Keycloak que omite la confirmación de correo durante el ingreso con un Google, Facebook o Discord ya vinculado, sin modificar el estado del correo. Las pruebas del stack comprueban ese ingreso, el primer acceso social, la vinculación, el registro por correo y la recuperación. Ejecutalas al actualizar la versión de Keycloak. Para aplicar la marca a un realm existente, [actualizá el nombre y los temas de ingreso y cuenta](ingreso-social.md#activar-la-pantalla-de-el-truco).

La imagen web genera `/.well-known/apple-app-site-association` y `/.well-known/assetlinks.json` con `APPLE_TEAM_ID` y `ANDROID_CERT_SHA256`, para que los enlaces de invitación abran la app. Al cargarlas o cambiarlas, reconstruí `web`. Sin ellas los enlaces abren la web y `npm run check:production` avisa. Detalles en el [README de la app](../app/README.md#enlaces-que-abren-la-app).

## Salón y exhibiciones

La publicación de producción abre el salón a todas las cuentas autenticadas y busca seis mesas públicas entre humanas y exhibiciones. El visor ofrece la voz cuando Discord está configurado. En instalaciones existentes, los valores explícitos del archivo protegido siguen vigentes. Antes de publicar, revisá esos valores y prepará la verificación de la revisión y del conteo real de partidas. [Procedimiento de lanzamiento, capacidad, pausa y recuperación](multijugador/salon-en-vivo/operacion.md)

## Publicación automática desde main

El VPS consulta el repositorio privado cada tres minutos. Para el último commit de `main`, #399 reconoce la corrida exitosa de **Verificar el sitio** (`check.yml`) por el evento `push` a `main`. Después de un squash, abrí la corrida de ese push y comprobá que el SHA coincide con el commit integrado. La corrida de `pull_request` corresponde a un commit de integración previo. La decisión de aprobación del PR se documenta por separado. [Verificación remota del PR](../CONTRIBUTING.md#verificación-remota-del-pr)

Durante una caída de GitHub Actions, el mantenedor puede publicar el estado `verificado-local` en `success` después de cumplir el [respaldo completo](verificacion-linux.md#caída-de-github-actions) sobre el SHA exacto del squash. Reservá ese estado para la revisión que se comprobó localmente. Desde el checkout limpio de esa revisión, registrá en el PR los comandos y sus resultados y comprobá de nuevo la punta de `main` antes de publicar el estado.

```sh
(
  set -eu
  sha=$(git rev-parse HEAD)
  test -z "$(git status --porcelain)"
  test "$sha" = "$(gh api repos/flabat/truco-uruguayo/git/ref/heads/main --jq .object.sha)"
  gh api "repos/flabat/truco-uruguayo/statuses/$sha" \
    -f state=success -f context=verificado-local -f description="Pila y restauración verificadas localmente"
)
```

El ejecutor también admite `DESPLIEGUE_SIN_VERIFICAR=1` como excepción operativa del servidor de desarrollo. La adopción del runner de GitHub y los ensayos del verificador se hacen en el repositorio, con las credenciales, la configuración del VPS y la decisión sobre esa excepción bajo control del operador.

El VPS construye las imágenes con el SHA. Los secretos de producción permanecen en `/etc/truco-oriental/production.env`. El servicio usa un token de acceso personal de granularidad fina limitado a `flabat/truco-uruguayo`, con **Contents**, **Actions** y **Commit statuses** en **Read-only**. Git usa el primero para consultar y descargar `main`. La API usa los otros dos para comprobar la verificación. Sin **Commit statuses**, el registro muestra `HTTP 403` al leer el estado y sólo cuenta el workflow o la variable.

Antes de activar el temporizador, creá el token en GitHub y guardalo desde una shell Bash de administrador en el VPS. Para rotarlo, repetí estos pasos antes del vencimiento. systemd carga el archivo en cada ejecución. La credencial se usa sólo para las solicitudes a GitHub.

```bash
install -d -m 700 /etc/truco-oriental
(
  set -eu
  umask 077
  archivo=$(mktemp /etc/truco-oriental/github-read-token.XXXXXX)
  trap 'rm -f "$archivo"' EXIT
  read -rsp 'Token de lectura de GitHub: ' token
  echo
  test -n "$token"
  printf '%s\n' "$token" > "$archivo"
  mv "$archivo" /etc/truco-oriental/github-read-token
)
```

Para recuperar una instalación que aún consulta el repositorio de forma anónima, instalá el ejecutor y la unidad desde la revisión verificada siguiendo los comandos de instalación de abajo. Iniciá `truco-deploy.service` y comprobá que el SHA en `current` coincida con el push aprobado de `main`.

En el VPS de El Truco, `/opt/truco-oriental/staged` señala la revisión preparada. Si falta el dominio o el destino de copias, se detiene ahí. Para el primer lanzamiento, completá esos datos en el archivo protegido y asegurate de que el repositorio restic esté inicializado. Podés pausar el temporizador mientras configurás DNS y copias. En una shell de administrador:

```sh
systemctl stop truco-deploy.timer
cd /opt/truco-oriental/staged
export TRUCO_RELEASE=$(basename "$(pwd -P)")
dc() { docker compose -p truco-produccion --env-file /etc/truco-oriental/production.env -f compose.production.yaml -f infra/despliegue/imagenes.yaml "$@"; }
# Para un repositorio de copias nuevo, ejecutar una sola vez: dc run --rm --no-deps backup iniciar
dc run --rm --no-deps backup listar
systemctl start truco-deploy.timer
systemctl start truco-deploy.service
```

Antes de actualizar una base existente, la tarea guarda una copia. Comprueba otra vez el SHA de `main` antes del cambio. Compose espera la salud de los servicios y la API comprueba por HTTPS la web y el emisor de identidad. Sólo entonces se actualiza `/opt/truco-oriental/current`. `previous` conserva la versión anterior. Si falla el arranque después de una migración, el servicio reintenta el mismo commit conservando la copia previa. Durante la intervención, algunos contenedores pueden estar ya en la nueva versión. Para recuperar datos, seguí el procedimiento de restauración en volúmenes nuevos.

Consultá el próximo intento con `systemctl list-timers truco-deploy.timer` y su registro con `journalctl -u truco-deploy.service -n 80`. Para mantenimiento, pará el temporizador y esperá que termine cualquier ejecución en curso antes de actualizar manualmente. Para corregir una publicación, integrá la corrección o reversión mediante PR a `main`, o publicá una rama con [`npm run vps`](#publicar-una-rama-desde-la-mac).

En una máquina nueva, además de Docker con Compose, se usan Git, Python 3, GNU tar, flock y systemd. Partiendo del checkout verificado, instalá el ejecutor y activá el temporizador como administrador:

```sh
install -Dm755 infra/despliegue/desplegar.py /usr/local/lib/truco-oriental/desplegar.py
install -m644 infra/despliegue/truco-deploy.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now truco-deploy.timer
```

Repetí la instalación si cambia el ejecutor o sus unidades de systemd. El proyecto Compose mantiene el mismo nombre y conserva sus volúmenes entre versiones.

### Pausa temporal de las copias

Para publicar sin copias externas, creá el archivo de decisión del operador y ejecutá el servicio como administrador:

```sh
touch /etc/truco-oriental/copias-pausadas
systemctl start truco-deploy.service
```

Durante la pausa se publican la web, la API, PostgreSQL y Keycloak. Se omiten las copias diarias y las previas a migraciones. La pérdida del disco puede causar la pérdida de cuentas y partidas.

Para reactivar, configurá el destino real y la clave en `production.env`, inicializá el repositorio si es nuevo y verificá que `backup listar` tenga acceso según las instrucciones anteriores. Luego ejecutá como administrador:

```sh
rm /etc/truco-oriental/copias-pausadas
systemctl start truco-deploy.service
```

El siguiente despliegue guarda una copia de la base existente y arranca la programación diaria aunque el commit siga siendo el mismo.

## Publicar una rama desde la Mac

`npm run vps` publica en el VPS una rama sin integrar o el árbol del checkout, con los cambios sin commit. Construye las imágenes en la Mac, las envía por SSH y arranca Compose en el VPS. No hace falta Git ni un token en el servidor para esto.

```sh
npm run vps                      # el árbol actual
npm run vps -- codex/issue-381   # una rama: origin/<rama> recién traída o, si no existe, la local
npm run vps -- web               # sólo la imagen web del árbol actual
npm run vps -- web codex/issue-381
npm run vps -- --reiniciar-datos # borra los datos del juego en el VPS
```

Las imágenes llevan la etiqueta del commit, o `<commit>-sucio` si el árbol tiene cambios sin commit, y se publican con `TRUCO_RELEASE` igual a esa etiqueta. Con `web` sólo se reconstruye y reemplaza la web: la API, la identidad y las copias conservan su imagen, que recibe también la etiqueta nueva, y no se reinician. El comando usa el mismo candado que `truco-deploy.service`, así que espera a que termine una publicación automática en curso. Si `copias-pausadas` existe, arranca sin el servicio de copias, como el temporizador; si no, guarda una copia antes de reemplazar la API.

La construcción también graba la rama, la fecha y, si el commit tiene una etiqueta exacta y el árbol está limpio, esa etiqueta. Con ellas, `GET /api/version` y el pie de la web y de la app muestran qué corre: por ejemplo `codex/issue-381 · 01234567-sucio`.

### Reiniciar los datos

`npm run vps -- --reiniciar-datos` deja el juego como recién instalado y no publica nada. Pide escribir el host para confirmar. Sobre la versión que esté corriendo, manual o automática, toma el mismo candado que una publicación, guarda una copia (salvo con `copias-pausadas`), para la API y borra el esquema `juego` y `schema_migrations`. Al volver a arrancar, la API aplica todas las migraciones. Se pierden jugadores, mesas, partidas, replays y sesiones. Las cuentas de Keycloak (esquema `identidad`) se conservan, y cada persona vuelve a quedar registrada como jugador cuando ingresa. No se cargan datos de prueba: el realm de producción no tiene los usuarios de `mesa-local`, así que no podrían ingresar.

### Preparación

1. Docker en la Mac, con lugar para construir. La arquitectura del VPS se detecta con `uname -m` y se construye para ella. En una Mac con Apple Silicon y un VPS `x86_64` la construcción usa emulación y tarda más. Comprobá que Docker la tenga con `docker run --rm --platform linux/amd64 alpine uname -m`, que debe responder `x86_64` (en Colima, con `--vz-rosetta` o QEMU). Para forzar la plataforma, usá `TRUCO_VPS_PLATAFORMA=linux/amd64`.
2. Acceso SSH sin contraseña a una cuenta del VPS que pueda usar Docker y escribir en `/opt/truco-oriental` y `/var/lib/truco-deploy` (por ejemplo `root`). El host no está en el repositorio. Definilo en `~/.ssh/config`:

   ```
   Host truco-vps
     HostName <IP o nombre del VPS>
     User root
     IdentityFile ~/.ssh/<clave>
   ```

   o pasalo en cada ejecución con `TRUCO_VPS=root@<host>`. `TRUCO_VPS_SSH` agrega opciones de `ssh`, por ejemplo `-p 2222`.
3. El VPS ya tiene `/etc/truco-oriental/production.env` de la [publicación automática](#publicación-automática-desde-main).

### Qué queda en el VPS y cómo vuelve main

Los archivos que Compose monta (`compose.production.yaml`, `infra/despliegue/imagenes.yaml` e `infra/produccion/`) quedan en `/opt/truco-oriental/manuales/<etiqueta>`. Se conservan las dos versiones manuales más recientes y sus imágenes. `/var/lib/truco-deploy/manual` guarda el commit de `main` que había al publicar y la etiqueta manual. Mientras `main` siga en ese commit, el temporizador deja la versión manual. Después del siguiente merge publica `main`, borra la marca y vuelve a la operación normal.

Para volver a `main` sin esperar un merge, ejecutá `npm run vps -- main`, o en el VPS como administrador:

```sh
rm /var/lib/truco-deploy/manual
systemctl start truco-deploy.service
```

Si `main` ya estaba publicado antes de la versión manual, `current` sigue apuntando a ese commit y el servicio no lo reconstruye: en ese caso usá `npm run vps -- main`.

### Ensayo local

`bash scripts/vps-ensayo.sh` prueba el comando sin el VPS. Levanta un contenedor con sshd que usa el Docker local como si fuera el del servidor, publica el árbol completo con las copias pausadas y después sólo la web. Comprueba las etiquetas de las imágenes, que la API no se reinicie al publicar la web, la marca para el temporizador, la respuesta HTTPS de Caddy y la rama y el commit de `GET /api/version`. Al final reinicia los datos: sin el host exacto no borra nada, y con él deja la base vacía, con todas las migraciones y el esquema de identidad. Al terminar borra el proyecto, los volúmenes y las imágenes del ensayo. Las rutas del servidor se pueden cambiar con `TRUCO_VPS_RAIZ`, `TRUCO_VPS_ESTADO`, `TRUCO_VPS_ENV` y `TRUCO_VPS_PROYECTO`; en el VPS real no hace falta.
