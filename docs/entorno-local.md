# La mesa local en contenedores

Desde la raíz del repositorio, con Docker y Compose disponibles, levantá el sitio, la API, PostgreSQL y Keycloak con un solo comando. La primera ejecución descarga las imágenes, compila el sitio e importa el entorno de identidad de prueba. El comando termina cuando los cuatro servicios están disponibles.

```sh
docker compose up --build --wait
```

| Servicio | Cómo probarlo |
| --- | --- |
| Web Astro | Abrí [Truco Oriental](http://localhost:8081/). Desde la portada podés acceder a las mesas, leer la guía de reglas o practicar como invitado. Nginx sirve la interfaz y reenvía las peticiones de juego a la API. Volvé a ejecutar el comando de arranque después de editar la web o la API. |
| API Node/TypeScript | Abrí [el estado de la API](http://localhost:3001/health). Devuelve HTTP 200 con `api` y `postgres` en `ok`. Si la API responde y la base está caída, devuelve 503. |
| PostgreSQL | Ejecutá `docker compose exec db psql -U truco -d truco`. El puerto de la base queda dentro de la red de Compose. |
| Identidad de prueba | Abrí [la cuenta de Keycloak](http://localhost:8080/realms/truco-local/account/) con el usuario `prueba` y la contraseña `truco-local`. El [documento de descubrimiento OIDC](http://localhost:8080/realms/truco-local/.well-known/openid-configuration) publica el emisor y las URLs de autorización, tokens y claves. |

## Jugar una partida

Abrí [Jugar al truco](http://localhost:8081/jugar/) y elegí **Ingresar al juego**. También podés entrar desde la portada y seguir **Jugar al truco**. Usá uno de estos seis usuarios de desarrollo. Todos usan la contraseña `truco-local`.

| Jugador | Usuario |
| --- | --- |
| Ana | `ana` |
| Bruno | `bruno` |
| Clara | `clara` |
| Diego | `diego` |
| Eva | `eva` |
| Luis | `luis` |

1. Elegí **1 contra 1** para un duelo, **2 contra 2** para jugar en parejas o **3 contra 3** para dos tercetos. En parejas, con **Permitir señas entre compañeros**, solo vos y tu compañero ven las señas de su equipo. **Jugar con computadoras** completa todos los lugares y reparte. Para invitar amigos, elegí **Crear mesa** y **Copiar invitación**.
2. Cada persona abre el enlace compartido e ingresa con su cuenta. Los asientos se ocupan en orden y los equipos se alternan. En parejas, el primer y el tercer asiento forman un equipo. El anfitrión también puede agregar una computadora en cualquier lugar libre para armar equipos mixtos. La partida empieza al ocuparse el último asiento.
3. Al crear la mesa podés elegir a cuántos tantos se juega. En duelo y en parejas se proponen 40. En tercetos se proponen 50 (25 malas y 25 buenas). El tanteador divide la meta en dos mitades iguales. Cuando te toque, elegí una carta o un canto disponible. Las respuestas y las jugadas se actualizan para todos. Al terminar la mano, **Repartir otra mano** conserva el tanteador. El primer equipo que alcanza la meta gana el chico.
4. Si se corta la conexión, la mesa espera la reconexión antes de aceptar nuevas jugadas desde ese navegador. Podés recargar la página o abrir otra vez el enlace de invitación con tu misma cuenta. En ese perfil, **Volver a mi mesa** también retoma la mesa más reciente.

Usá dispositivos o perfiles independientes del navegador para probar diferentes jugadores. Las pestañas de un mismo perfil comparten sesión. Después del ingreso, la portada muestra el nombre y el ID de jugador. La sesión dura hasta siete días. **Cerrar sesión** la revoca en el servidor. El jugador recupera el mismo ID al volver a ingresar con su cuenta, incluso desde otro navegador.

El diseño del chat de voz opcional de la mesa se sigue en [#102](https://github.com/flabat/truco-uruguayo/issues/102).

Si ya usabas el entorno anterior, ejecutá el mismo comando de arranque. Keycloak importa el nuevo realm `mesa-local` junto al realm de prueba existente y la API aplica la migración a PostgreSQL. Nginx recibe el retorno del proveedor en `/api/auth/callback` y lo pasa a la API. El código se canjea dentro de Compose. El navegador recibe una cookie de sesión HTTP-only y las credenciales de desarrollo pertenecen a Keycloak.

### Tercetos y reconexión

En la primera redondilla juegan los seis. En el segundo reparto, si ambos equipos siguen en malas, juegan tres duelos con la misma muestra. Por ejemplo, si el mano ocupa el sexto lugar, se enfrentan sexto y tercero, primero y cuarto, y segundo y quinto. Cada jugador recibe sus cartas al comenzar su duelo. Si alguien cierra el navegador, puede volver con su cuenta y el enlace de la mesa. La partida espera si le toca actuar.

Si un equipo entra en buenas durante un duelo, se completan los duelos que quedan en ese reparto y desde el siguiente se juega en redondilla. Si un cobro alcanza la meta, el chico termina en ese instante. Por ejemplo, con una meta de 26, 13 ya son buenas y un cobro que lleva de 24 a 27 deja el tanteador en 26.

Compose habilita el alta de tercetos en desarrollo. Para desplegar por etapas, arrancá la API con `TERCETOS_HABILITADOS=0` y aplicá las migraciones con los lectores y el árbitro instalados. Cambiá a `1` y recreá la API para ofrecer la opción en la sala. Volver a `0` cierra la creación de mesas nuevas. Las invitaciones y las partidas de seis ya creadas siguen funcionando. Si conservás un volumen de Keycloak anterior, las cuentas nuevas del archivo de importación sólo se cargan al inicializar otro entorno. Las cuentas existentes pueden seguir jugando.

## Motor de contenedores

Para macOS proponemos Colima con Docker Engine. Colima ejecuta los contenedores Linux en una VM local. El proyecto usa Dockerfiles y Compose estándar y también se puede arrancar con Docker Desktop o con Docker Engine y el plugin Compose en Linux. En un despliegue futuro se puede publicar la misma imagen de la API, apuntar `DATABASE_URL` a PostgreSQL administrado y servir la compilación de Astro en la raíz del sitio con las rutas de la API y de WebSocket bajo `/api/`. La identidad de prueba y sus credenciales son para desarrollo. [Colima](https://github.com/abiosoft/colima) · [Docker Compose](https://docs.docker.com/compose/)

Para preparar un Mac con Homebrew:

```sh
brew install colima docker docker-compose docker-buildx
mkdir -p ~/.docker/cli-plugins
ln -s "$(brew --prefix)/opt/docker-compose/bin/docker-compose" ~/.docker/cli-plugins/docker-compose
ln -s "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx
colima start --profile truco --runtime docker --cpu 3 --memory 5 --disk 30
docker context show
docker compose version
```

Si Docker ya reconoce los plugins, omití los enlaces. Para retomar el perfil más adelante, usá `colima start --profile truco` y `docker context use colima-truco`.

## Reiniciar y comprobar los datos

- `docker compose ps` muestra el estado. `docker compose logs api identidad` muestra los registros.
- `docker compose down` detiene los servicios y conserva los volúmenes. Volvé a arrancar con `docker compose up --build --wait`. Al iniciar, la API aplica en una transacción los SQL pendientes de `api/migrations/` en orden de nombre. Podés consultar el registro con `docker compose exec db psql -U truco -c 'TABLE schema_migrations'`.
- **Empezar de cero borra los datos locales.** Usá `docker compose down --volumes` solo cuando quieras descartar la base y las cuentas de prueba. Al arrancar de nuevo se crean los volúmenes y se importa el realm.
- Con Node.js 24, las dependencias de `npm ci`, Chromium de Playwright y Docker en marcha, `npm run check:stack` crea un proyecto Compose desechable. Cuatro perfiles independientes de Chromium entran por invitación, juegan por vueltas, responden al truco a la vez y continúan después de reiniciar la API y PostgreSQL. También se prueban un duelo a 40, seis personas a 50 y una persona con cinco computadoras a 26. Se comprueban las vistas privadas al reconectar durante el pico y el cierre inmediato por canto. La verificación recrea los contenedores y comprueba los datos del volumen antes de eliminar su propio entorno. Podés cambiar sus puertos con `TEST_WEB_PORT` (18081) y `TEST_OIDC_PORT` (18080).

## Acceso desde otro dispositivo

El arranque normal publica los tres puertos en la interfaz local. En una red de confianza, elegí la IP LAN del anfitrión y usala como nombre público del emisor. Por ejemplo, si la IP de tu equipo es `192.168.1.20`, ejecutá:

```sh
TRUCO_BIND=0.0.0.0 TRUCO_HOST=192.168.1.20 docker compose up --build --wait
```

Desde todos los equipos, incluido el anfitrión, abrí `http://192.168.1.20:8081/jugar/` sustituyendo la IP por la de tu equipo. Creá la mesa desde esa dirección para que el enlace de invitación contenga el mismo anfitrión. El navegador de cada participante debe poder alcanzar los puertos de la web (8081) y de Keycloak (8080). Nginx reenvía las peticiones de juego y WebSocket a la API dentro de Compose. Los valores de `WEB_PORT`, `API_PORT` y `OIDC_PORT` permiten elegir otros puertos. Para un grupo recurrente elegí un nombre LAN estable, resoluble por todos los dispositivos. La identidad OIDC se vincula por emisor y sujeto, por lo que cambiar el nombre o puerto público del emisor crea un espacio de identidades distinto. Volver al emisor original recupera sus jugadores.
