// Crea o actualiza el cliente de servicio `truco-api`, con el que la API completa las bajas vencidas en Keycloak.
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

const permisos = ["manage-users", "view-users"];

async function configurar() {
  const base = baseAdministrativa();
  const realm = requerida("KEYCLOAK_REALM");
  if (realm === "." || realm === ".." || /[\\/]/.test(realm)) throw new ErrorDeConfiguracion("KEYCLOAK_REALM debe ser el nombre del realm.");
  const secreto = requerida("KEYCLOAK_API_CLIENT_SECRET");
  if (secreto.length < 32) throw new ErrorDeConfiguracion("KEYCLOAK_API_CLIENT_SECRET debe tener al menos 32 caracteres.");
  const headers = { Authorization: "Bearer " + await tokenAdministrativo(base), "Content-Type": "application/json" };
  const admin = `${base}/admin/realms/${encodeURIComponent(realm)}`;
  const buscar = async clientId => {
    const respuesta = await solicitar(`${admin}/clients?clientId=${encodeURIComponent(clientId)}`, { headers });
    comprobar(respuesta, 200, "La consulta de clientes");
    return (await respuesta.json()).find(c => c.clientId === clientId);
  };
  const representacion = actual => JSON.stringify({
    ...actual, clientId: "truco-api", name: "API de El Truco", enabled: true, protocol: "openid-connect",
    publicClient: false, clientAuthenticatorType: "client-secret", secret: secreto,
    serviceAccountsEnabled: true, standardFlowEnabled: false, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
  });
  let cliente = await buscar("truco-api");
  if (!cliente) {
    const alta = await solicitar(`${admin}/clients`, { method: "POST", headers, body: representacion(null) });
    if (alta.status !== 409) comprobar(alta, 201, "El alta del cliente");
    cliente = await buscar("truco-api");
    if (!cliente) throw new ErrorDeConfiguracion("El cliente no quedó registrado. Volvé a ejecutar el comando.");
  } else {
    comprobar(await solicitar(`${admin}/clients/${cliente.id}`, { method: "PUT", headers, body: representacion(cliente) }), 204,
      "La actualización del cliente");
  }
  // Keycloak 26.8 exige el alcance kc-admin-api, que agrega la audiencia de la API de administración.
  const alcances = await solicitar(`${admin}/client-scopes`, { headers });
  comprobar(alcances, 200, "La consulta de alcances");
  const alcance = (await alcances.json()).find(a => a.name === "kc-admin-api");
  if (alcance) {
    comprobar(await solicitar(`${admin}/clients/${cliente.id}/default-client-scopes/${alcance.id}`, { method: "PUT", headers }), 204,
      "La asignación del alcance de administración");
  }
  const usuario = await solicitar(`${admin}/clients/${cliente.id}/service-account-user`, { headers });
  comprobar(usuario, 200, "La consulta de la cuenta de servicio");
  const { id: cuenta } = await usuario.json();
  const gestion = await buscar("realm-management");
  const roles = await solicitar(`${admin}/clients/${gestion.id}/roles`, { headers });
  comprobar(roles, 200, "La consulta de permisos");
  const elegidos = (await roles.json()).filter(rol => permisos.includes(rol.name));
  if (elegidos.length !== permisos.length) throw new ErrorDeConfiguracion("Faltan permisos de administración de usuarios en el realm.");
  comprobar(await solicitar(`${admin}/users/${cuenta}/role-mappings/clients/${gestion.id}`, {
    method: "POST", headers, body: JSON.stringify(elegidos),
  }), 204, "La asignación de permisos");
}

try {
  await configurar();
  console.log("Cliente de servicio truco-api configurado.");
} catch (error) {
  // Las respuestas del servidor y los errores de red pueden contener credenciales.
  console.error(error instanceof ErrorDeConfiguracion ? error.message : "No se pudo comunicar con Keycloak o leer su respuesta.");
  process.exitCode = 1;
}
