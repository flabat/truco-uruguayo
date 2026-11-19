# Habilitar el ingreso con Google y Facebook

Al elegir **Ingresar al juego**, el jugador llega a Keycloak. Allí puede usar su cuenta local o cualquiera de los proveedores que hayas habilitado. La API sigue recibiendo la identidad de Keycloak y emite su propia cookie de sesión. Podés habilitar un solo proveedor y agregar el otro más adelante.

![Pantalla de ingreso de Truco Oriental con las opciones Facebook y Google](ingreso-social.png)

## URLs que tenés que registrar

Google y Facebook devuelven el navegador a **Keycloak**. Copiá la URL de la fila correspondiente, incluido el puerto y sin agregar una barra al final.

| Proveedor | Compose local | Ejemplo para un entorno HTTPS |
| --- | --- | --- |
| Google | `http://localhost:8080/realms/mesa-local/broker/google/endpoint` | `https://identidad.example.org/realms/mesa/broker/google/endpoint` |
| Facebook | `http://localhost:8080/realms/mesa-local/broker/facebook/endpoint` | `https://identidad.example.org/realms/mesa/broker/facebook/endpoint` |

En pruebas compartidas y producción, sustituí el dominio y el realm del ejemplo por los públicos de tu instalación. Podés confirmar el valor en **Identity providers → Google o Facebook → Redirect URI** de Keycloak. Luego Keycloak devuelve el navegador al **juego** en `/api/auth/callback`. Esa segunda dirección se registra en el cliente `truco-web` de Keycloak.

## Registrar el proveedor

### Google

1. En el proyecto de Google Cloud, abrí **Google Auth Platform → Branding**. Si es nuevo, elegí **Get started**, cargá el nombre del juego, el correo de soporte y el de contacto. Elegí la audiencia **External** para que puedan ingresar jugadores con cuentas personales. Usá proyectos separados para pruebas y producción. [Configurar Google Auth Platform](https://developers.google.com/workspace/guides/configure-oauth-consent)
2. En **Data Access**, usá solo `openid`, `email` y `profile`. En **Clients → Create client → Web application**, añadí el retorno de Google de la tabla en **Authorized redirect URIs**. Keycloak realiza el canje en el servidor y el campo **Authorized JavaScript origins** puede quedar vacío. Google admite HTTP en localhost para desarrollo. [Crear el cliente web](https://developers.google.com/identity/protocols/oauth2/web-server)
3. Guardá **Client ID** y **Client secret** como `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en tu gestor de secretos. Para el lanzamiento, cambiá **Audience → Publishing status** a **In production** y completá los requisitos de marca que indique la consola. Con estos tres permisos Google permite probar sin cargar una lista de usuarios de prueba. [Audiencia y publicación](https://support.google.com/cloud/answer/15549945?hl=en)

### Facebook

1. En **Create App** de Meta, ingresá el nombre y el correo de contacto y elegí **Authenticate and request data from users with Facebook Login**. En **Use cases → Customize** habilitá `email` junto al `public_profile` incluido. El correo puede faltar si la persona no lo comparte o Facebook no tiene uno confirmado. [Crear la app en Meta](https://developers.facebook.com/documentation/development/create-an-app)
2. En los ajustes de **Facebook Login**, activá **Client OAuth Login** y **Web OAuth Login**. En **Valid OAuth Redirect URIs** cargá el retorno HTTPS de Facebook de la tabla con tu dominio y realm reales. Si Meta indica que ya admite `http://localhost` automáticamente en modo de desarrollo, probá el retorno local con una cuenta que tenga un rol en la app. Si lo rechaza, usá el entorno HTTPS de pruebas. [Ajustes del flujo web](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow)
3. Copiá **App ID** y **App Secret** de **App settings → Basic** a `FACEBOOK_APP_ID` y `FACEBOOK_APP_SECRET` en tu gestor de secretos. Para probar antes de publicar, agregá al jugador como tester de la app y pedile que acepte la invitación. Para abrir el ingreso al público, cargá los enlaces de privacidad y eliminación de datos, completá la revisión y la verificación que indique el panel y elegí **Publish → Go live**. [Publicar la app](https://developers.facebook.com/documentation/development/release)

Para rotar el secreto, conservá el **App ID**, guardá el **App Secret** nuevo y volvé a ejecutar el comando de Facebook. Facebook identifica a cada jugador con un ID específico de la aplicación. [Identificadores de Facebook](https://developers.facebook.com/docs/graph-api/overview)

## Activar en Keycloak

Exportá desde tu gestor de secretos las dos variables del proveedor elegido. Si preferís cargarlas a mano en Bash o Zsh, ejecutá solo la línea de ese proveedor. Pegá primero el ID, presioná Intro, pegá el secreto y presioná Intro otra vez. El secreto queda oculto al escribirlo y fuera del historial de comandos.

```sh
read -r GOOGLE_CLIENT_ID && read -rs GOOGLE_CLIENT_SECRET && export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
read -r FACEBOOK_APP_ID && read -rs FACEBOOK_APP_SECRET && export FACEBOOK_APP_ID FACEBOOK_APP_SECRET
```

**Compose local.** Para un volumen nuevo, creá un administrador temporal al primer arranque. Desde la raíz del proyecto, ejecutá en la misma terminal el arranque y el comando de cada proveedor que hayas registrado.

```sh
export KC_BOOTSTRAP_ADMIN_USERNAME=admin-social-local
export KC_BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -hex 24)"
docker compose up -d --wait
npm run auth:google
npm run auth:facebook
```

Si el realm ya existe, ejecutá directamente `npm run auth:google` o `npm run auth:facebook`. Exportá un token administrativo vigente en `KEYCLOAK_ADMIN_TOKEN`, o las credenciales de un administrador de `master` en las dos variables `KC_BOOTSTRAP_ADMIN_*`. Keycloak solo crea la cuenta de arranque cuando inicializa `master` por primera vez.

Si perdiste el acceso administrativo, estos comandos permiten crear un administrador temporal sobre el mismo volumen. Usá sus credenciales para ejecutar el comando del proveedor. Una vez establecido el acceso permanente, eliminá la cuenta temporal. [Recuperar el acceso administrativo](https://www.keycloak.org/server/bootstrap-admin-recovery)

```sh
docker compose stop identidad
docker compose run --rm --no-deps identidad bootstrap-admin user
docker compose up -d --wait
```

**Keycloak propio o de producción.** Desde un equipo con acceso a la API administrativa, cargá `KEYCLOAK_ADMIN_URL` con la URL base de Keycloak (por ejemplo, `https://admin-identidad.example.org`), `KEYCLOAK_REALM` con el nombre del realm del juego y `KEYCLOAK_ADMIN_TOKEN` con un token de acceso de corta duración con permiso para administrar sus proveedores de identidad. Cargá también las variables de Google o Facebook. El proxy público de Compose expone los retornos de ingreso y reserva la administración para la red interna. Mantené los secretos en el entorno del proceso que configura Keycloak y fuera del repositorio. Ejecutá el comando correspondiente.

```sh
node scripts/configurar-ingreso-social.mjs google
node scripts/configurar-ingreso-social.mjs facebook
```

## Comprobar el ingreso y la vinculación

Abrí **Ingresar al juego** desde una ventana privada. Elegí el proveedor, completá el ingreso y anotá el ID de jugador. Cerrá sesión y volvé a entrar con la misma cuenta en otra ventana privada. Deberías recuperar el mismo ID y poder volver a tu mesa. Probá también cancelar en la pantalla del proveedor y volver a iniciar el ingreso.

El comando conserva el flujo de primer ingreso y los permisos de un proveedor que ya existía. Revisá los permisos y quitá los adicionales si solo usás el ingreso. Si el correo coincide con una cuenta existente, comprobá que el flujo exige demostrar el control de esa cuenta antes de vincularla. Conservá **Trust email** desactivado. Si el correo de confirmación resulta insuficiente, configurá la verificación con el método de ingreso original. Si Facebook omite el correo y el realm lo exige, el jugador puede completarlo al revisar su perfil. La identidad del jugador se guarda por emisor y sujeto de Keycloak. [Vinculación de identidades en Keycloak](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker)
