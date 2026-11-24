// Se puede ejecutar desde el checkout o pasar por stdin a Node dentro de Compose.
class ErrorDeConfiguracion extends Error {}

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor?.trim()) throw new ErrorDeConfiguracion(`Falta la variable ${nombre}.`);
  return valor;
}

function baseAdministrativa() {
  const valor = requerida("KEYCLOAK_ADMIN_URL");
  if (!URL.canParse(valor)) throw new ErrorDeConfiguracion("KEYCLOAK_ADMIN_URL debe ser una URL absoluta.");
  const url = new URL(valor);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname) || url.origin === "http://identidad:8080";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new ErrorDeConfiguracion("KEYCLOAK_ADMIN_URL requiere HTTPS fuera del entorno local.");
  }
  if (url.username || url.password || url.search || url.hash || /\/admin(?:\/|$)/.test(url.pathname)) {
    throw new ErrorDeConfiguracion("Usá la URL base de Keycloak, sin credenciales, /admin, consulta ni fragmento.");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function comprobar(respuesta, esperado, operacion) {
  if (respuesta.status !== esperado) {
    throw new ErrorDeConfiguracion(`${operacion} falló (HTTP ${respuesta.status}).`);
  }
}

function solicitar(url, opciones) {
  return fetch(url, { ...opciones, redirect: "manual", signal: AbortSignal.timeout(15000) });
}

async function tokenAdministrativo(base) {
  if (process.env.KEYCLOAK_ADMIN_TOKEN?.trim()) return process.env.KEYCLOAK_ADMIN_TOKEN;
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: requerida("KC_BOOTSTRAP_ADMIN_USERNAME"),
    password: requerida("KC_BOOTSTRAP_ADMIN_PASSWORD"),
  });
  const respuesta = await solicitar(base + "/realms/master/protocol/openid-connect/token", { method: "POST", body });
  comprobar(respuesta, 200, "El ingreso administrativo");
  const datos = await respuesta.json();
  if (typeof datos?.access_token !== "string" || !datos.access_token.trim()) {
    throw new ErrorDeConfiguracion("Keycloak no devolvió un token administrativo.");
  }
  return datos.access_token;
}

async function configurar() {
  const [, , proveedor] = process.argv;
  if (process.argv.length !== 3 || !["google", "facebook", "discord", "apple"].includes(proveedor)) {
    throw new ErrorDeConfiguracion("Uso: node scripts/configurar-ingreso-social.mjs google|facebook|discord|apple");
  }
  const base = baseAdministrativa();
  const realm = requerida("KEYCLOAK_REALM");
  if (realm === "." || realm === ".." || /[\\/]/.test(realm)) {
    throw new ErrorDeConfiguracion("KEYCLOAK_REALM debe ser el nombre del realm.");
  }
  const clientId = requerida({ google: "GOOGLE_CLIENT_ID", facebook: "FACEBOOK_APP_ID", discord: "DISCORD_CLIENT_ID", apple: "APPLE_CLIENT_ID" }[proveedor]);
  // La extensión de Apple firma su secreto con la clave .p8 en cada ingreso: el secreto configurado es la clave.
  const clientSecret = requerida({ google: "GOOGLE_CLIENT_SECRET", facebook: "FACEBOOK_APP_SECRET", discord: "DISCORD_CLIENT_SECRET", apple: "APPLE_PRIVATE_KEY" }[proveedor]);
  const apple = proveedor === "apple" && { teamId: requerida("APPLE_TEAM_ID"), keyId: requerida("APPLE_KEY_ID") };
  const providerId = proveedor === "discord" ? "oauth2" : proveedor;
  const token = await tokenAdministrativo(base);
  const coleccion = `${base}/admin/realms/${encodeURIComponent(realm)}/identity-provider/instances`;
  const instancia = coleccion + "/" + proveedor;
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  async function leer() {
    const respuesta = await solicitar(instancia, { headers });
    if (respuesta.status === 404) return null;
    comprobar(respuesta, 200, "La consulta del proveedor");
    const actual = await respuesta.json();
    if (actual?.alias !== proveedor || actual.providerId !== providerId) {
      throw new ErrorDeConfiguracion("El alias existente no corresponde al proveedor solicitado.");
    }
    return actual;
  }

  function representacion(actual) {
    const config = { ...actual?.config, clientId, clientSecret, ...apple };
    if (proveedor === "discord" && !actual) Object.assign(config, {
      authorizationUrl: "https://discord.com/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      userInfoUrl: "https://discord.com/api/users/@me",
      userIDClaim: "id", userNameClaim: "username", emailClaim: "email",
      fullNameClaim: "global_name", defaultScope: "identify email",
    });
    if (proveedor === "discord" && (!config.prompt || config.prompt === "login")) config.prompt = "consent";
    // Keycloak heredaría prompt=login del juego. Google admite select_account para elegir quién entra.
    if (proveedor === "google" && (!config.prompt || config.prompt === "login")) {
      config.prompt = "select_account";
    }
    return JSON.stringify({
      firstBrokerLoginFlowAlias: "first broker login",
      ...actual,
      displayName: actual?.displayName || ({ google: "Google", facebook: "Facebook", discord: "Discord", apple: "Apple" }[proveedor]),
      alias: proveedor,
      providerId,
      enabled: true,
      linkOnly: false,
      hideOnLogin: false,
      trustEmail: false,
      // Los tokens de Apple se guardan para revocarlos al eliminar la cuenta, como exige Apple.
      storeToken: proveedor === "apple",
      config,
    });
  }

  let actual = await leer();
  if (!actual) {
    const alta = await solicitar(coleccion, { method: "POST", headers, body: representacion(null) });
    if (alta.status !== 409) {
      comprobar(alta, 201, "El alta del proveedor");
      return;
    }
    // Otra invocación pudo haber creado el mismo alias entre la consulta y el alta.
    actual = await leer();
    if (!actual) throw new ErrorDeConfiguracion("El alta entró en conflicto. Volvé a ejecutar el comando.");
  }
  const cambio = await solicitar(instancia, { method: "PUT", headers, body: representacion(actual) });
  comprobar(cambio, 204, "La actualización del proveedor");
}

try {
  await configurar();
  console.log(`Ingreso con ${process.argv[2]} habilitado.`);
} catch (error) {
  // Las respuestas del servidor y los errores de red pueden contener credenciales.
  console.error(error instanceof ErrorDeConfiguracion ? error.message : "No se pudo comunicar con Keycloak o leer su respuesta.");
  process.exitCode = 1;
}
