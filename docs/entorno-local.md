# La mesa local en contenedores

Desde la raíz del repositorio, con Docker y Compose disponibles, levantá el sitio, la API, PostgreSQL y Keycloak con un solo comando. La primera ejecución descarga las imágenes, compila el sitio e importa el entorno de identidad de prueba. El comando termina cuando los cuatro servicios están disponibles.

```sh
docker compose up --build --wait
```

| Servicio | Cómo probarlo |
| --- | --- |
| Web Astro | Abrí [la guía](http://localhost:8081/). Nginx sirve los archivos estáticos compilados. Volvé a ejecutar el comando de arranque después de editar la web o la API. |
| API Node/TypeScript | Abrí [el estado de la API](http://localhost:3001/health). Devuelve HTTP 200 con `api` y `postgres` en `ok`. Si la API responde y la base está caída, devuelve 503. |
| PostgreSQL | Ejecutá `docker compose exec db psql -U truco -d truco`. El puerto de la base queda dentro de la red de Compose. |
| Identidad de prueba | Abrí [la cuenta de Keycloak](http://localhost:8080/realms/truco-local/account/) con el usuario `prueba` y la contraseña `truco-local`. El [documento de descubrimiento OIDC](http://localhost:8080/realms/truco-local/.well-known/openid-configuration) publica el emisor y las URLs de autorización, tokens y claves. |

## Entrar al juego con cuatro jugadores

Abrí [la portada del juego](http://localhost:8081/#jugador) y elegí **Ingresar al juego**. Usá uno de estos cuatro usuarios de desarrollo. Todos usan la contraseña `truco-local`.

| Jugador | Usuario |
| --- | --- |
| Ana | `ana` |
| Bruno | `bruno` |
| Clara | `clara` |
| Diego | `diego` |

Usá cuatro dispositivos o cuatro perfiles independientes del navegador. Las pestañas de un mismo perfil comparten sesión. Después del ingreso, la portada muestra el nombre y el ID de jugador. La sesión dura hasta siete días. **Cerrar sesión** la revoca en el servidor. El jugador recupera el mismo ID al volver a ingresar con su cuenta, incluso desde otro navegador. La creación de mesas por invitación se sigue en [#96](https://github.com/flabat/truco-uruguayo/issues/96).

Si ya usabas el entorno anterior, ejecutá el mismo comando de arranque. Keycloak importa el nuevo realm `mesa-local` junto al realm de prueba existente y la API aplica la migración a PostgreSQL. Nginx recibe el retorno del proveedor en `/api/auth/callback` y lo pasa a la API. El código se canjea dentro de Compose. El navegador recibe una cookie de sesión HTTP-only y las credenciales de desarrollo pertenecen a Keycloak. La compilación estática para GitHub Pages sigue ofreciendo la guía y la práctica individual.

## Motor de contenedores

Para macOS proponemos Colima con Docker Engine. Colima ejecuta los contenedores Linux en una VM local. El proyecto usa Dockerfiles y Compose estándar y también se puede arrancar con Docker Desktop o con Docker Engine y el plugin Compose en Linux. En un despliegue futuro se puede publicar la misma imagen de la API, apuntar `DATABASE_URL` a PostgreSQL administrado y servir la compilación de Astro desde un alojamiento estático. La identidad de prueba y sus credenciales son para desarrollo. [Colima](https://github.com/abiosoft/colima) · [Docker Compose](https://docs.docker.com/compose/)

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
- Con los requisitos habituales de desarrollo y Docker en marcha, `npm run check:stack` crea un proyecto Compose de prueba, verifica la portada, la API y el emisor OIDC, desconecta la base, recrea los contenedores y comprueba la fecha de migración y un dato persistido. Al terminar elimina sus propios volúmenes. Usá `TEST_OIDC_PORT` si su puerto 18080 está ocupado.

## Acceso desde otro dispositivo

El arranque normal publica los tres puertos en la interfaz local. En una red de confianza, elegí la IP LAN del anfitrión y usala como nombre público del emisor. Por ejemplo, si la IP de tu equipo es `192.168.1.20`, ejecutá:

```sh
TRUCO_BIND=0.0.0.0 TRUCO_HOST=192.168.1.20 docker compose up --build --wait
```

Desde el otro equipo usá `http://192.168.1.20:8081/#jugador`. El navegador tiene que poder alcanzar los puertos web y OIDC en el anfitrión. Los valores de `WEB_PORT`, `API_PORT` y `OIDC_PORT` permiten elegir otros puertos. Si un equipo también participa desde el propio anfitrión, puede abrir la misma URL. Para un grupo recurrente elegí un nombre LAN estable, resoluble por todos los dispositivos. La identidad OIDC se vincula por emisor y sujeto, por lo que cambiar el nombre o puerto público del emisor crea un espacio de identidades distinto. Volver al emisor original recupera sus jugadores.
