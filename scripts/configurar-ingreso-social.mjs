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
  if (process.argv.length !== 3 || !["google", "facebook"].includes(proveedor)) {
    throw new ErrorDeConfiguracion("Uso: node scripts/configurar-ingreso-social.mjs google|facebook");
  }
  const base = baseAdministrativa();
  const realm = requerida("KEYCLOAK_REALM");
  if (realm === "." || realm === ".." || /[\\/]/.test(realm)) {
    throw new ErrorDeConfiguracion("KEYCLOAK_REALM debe ser el nombre del realm.");
  }
  const clientId = requerida(proveedor === "google" ? "GOOGLE_CLIENT_ID" : "FACEBOOK_APP_ID");
  const clientSecret = requerida(proveedor === "google" ? "GOOGLE_CLIENT_SECRET" : "FACEBOOK_APP_SECRET");
  const token = await tokenAdministrativo(base);
  const coleccion = `${base}/admin/realms/${encodeURIComponent(realm)}/identity-provider/instances`;
  const instancia = coleccion + "/" + proveedor;
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  async function leer() {
    const respuesta = await solicitar(instancia, { headers });
    if (respuesta.status === 404) return null;
    comprobar(respuesta, 200, "La consulta del proveedor");
    const actual = await respuesta.json();
    if (actual?.alias !== proveedor || actual.providerId !== proveedor) {
      throw new ErrorDeConfiguracion("El alias existente no corresponde al proveedor solicitado.");
    }
    return actual;
  }

  function representacion(actual) {
    return JSON.stringify({
      firstBrokerLoginFlowAlias: "first broker login",
      ...actual,
      displayName: actual?.displayName || (proveedor === "google" ? "Google" : "Facebook"),
      alias: proveedor,
      providerId: proveedor,
      enabled: true,
      linkOnly: false,
      hideOnLogin: false,
      trustEmail: false,
      storeToken: false,
      config: { ...actual?.config, clientId, clientSecret },
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
