import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/configurar-ingreso-social.mjs", import.meta.url));
const instancias = "/admin/realms/mesa-prueba/identity-provider/instances";
const token = "token-de-prueba";
const secreto = "secreto-de-prueba";

interface Peticion {
  metodo: string;
  ruta: string;
  autorizacion?: string;
  cuerpo: string;
}

async function administrador(t: TestContext, ...respuestas: [number, unknown?][]) {
  const peticiones: Peticion[] = [];
  const servidor = createServer(async (req, res) => {
    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(parte);
    peticiones.push({
      metodo: req.method!, ruta: req.url!, autorizacion: req.headers.authorization,
      cuerpo: Buffer.concat(partes).toString(),
    });
    const [estado, cuerpo] = respuestas.shift() ?? [500, "Petición inesperada"];
    res.writeHead(estado, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cuerpo));
  });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(() => new Promise<void>((resolve, reject) =>
    servidor.close(error => error ? reject(error) : resolve())));
  const direccion = servidor.address();
  assert.ok(direccion && typeof direccion === "object");
  return { url: `http://127.0.0.1:${direccion.port}`, peticiones };
}

function ejecutar(proveedor: string, url: string, variables: Record<string, string>) {
  return new Promise<{ codigo: number; salida: string }>((resolve, reject) => {
    execFile(process.execPath, [script, proveedor], {
      env: { KEYCLOAK_REALM: "mesa-prueba", KEYCLOAK_ADMIN_URL: url, ...variables },
      encoding: "utf8", timeout: 10_000,
    }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== "number")) return reject(error);
      resolve({ codigo: Number(error?.code ?? 0), salida: stdout + stderr });
    });
  });
}

for (const [proveedor, campoId, campoSecreto] of [
  ["google", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["facebook", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
  ["discord", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
]) {
  test(`crea solo el proveedor ${proveedor} con las credenciales indicadas`, async t => {
    const admin = await administrador(t, [404], [201]);
    const resultado = await ejecutar(proveedor, admin.url, {
      KEYCLOAK_ADMIN_TOKEN: token, [campoId]: "aplicacion", [campoSecreto]: secreto,
    });
    assert.equal(resultado.codigo, 0, resultado.salida);
    assert.deepEqual(admin.peticiones.map(p => [p.metodo, p.ruta, p.autorizacion]), [
      ["GET", `${instancias}/${proveedor}`, `Bearer ${token}`],
      ["POST", instancias, `Bearer ${token}`],
    ]);
    const creado = JSON.parse(admin.peticiones[1].cuerpo);
    assert.equal(creado.alias, proveedor);
    assert.equal(creado.providerId, proveedor === "discord" ? "oauth2" : proveedor);
    assert.equal(creado.enabled, true);
    assert.equal(creado.hideOnLogin, false);
    assert.equal(creado.linkOnly, false);
    assert.equal(creado.trustEmail, false);
    assert.equal(creado.storeToken, false);
    assert.equal(creado.firstBrokerLoginFlowAlias, "first broker login");
    assert.equal(creado.config.clientId, "aplicacion");
    assert.equal(creado.config.clientSecret, secreto);
    assert.equal(creado.config.prompt, proveedor === "google" ? "select_account" : proveedor === "discord" ? "consent" : undefined);
    assert.equal(creado.config.guiOrder, undefined);
    if (proveedor === "discord") {
      assert.equal(creado.config.userIDClaim, "id");
      assert.equal(creado.config.userNameClaim, "username");
      assert.equal(creado.config.userInfoUrl, "https://discord.com/api/users/@me");
      assert.equal(creado.config.defaultScope, "identify email");
    }
    assert.ok(!resultado.salida.includes(token) && !resultado.salida.includes(secreto));
  });
}

for (const concurrente of [false, true]) {
  const caso = concurrente ? "si otra operación acaba de crear el alias" : "en un proveedor existente";
  test(`rota el secreto y conserva el flujo y la configuración ${caso}`, async t => {
    const existente = {
      alias: "google", providerId: "google", displayName: "Mi Google",
      firstBrokerLoginFlowAlias: "vincular-con-verificacion",
      config: { clientId: "anterior", clientSecret: "**********", defaultScope: "openid profile" },
    };
    const admin = concurrente
      ? await administrador(t, [404], [409], [200, existente], [204])
      : await administrador(t, [200, existente], [204]);
    const resultado = await ejecutar("google", admin.url, {
      KEYCLOAK_ADMIN_TOKEN: token, GOOGLE_CLIENT_ID: "nueva", GOOGLE_CLIENT_SECRET: secreto,
    });
    assert.equal(resultado.codigo, 0, resultado.salida);
    const actualizacion = [
      ["GET", `${instancias}/google`], ["PUT", `${instancias}/google`],
    ];
    const esperadas = concurrente
      ? [["GET", `${instancias}/google`], ["POST", instancias], ...actualizacion]
      : actualizacion;
    assert.deepEqual(admin.peticiones.map(p => [p.metodo, p.ruta]), esperadas);
    const actualizado = JSON.parse(admin.peticiones.at(-1)!.cuerpo);
    assert.equal(actualizado.displayName, existente.displayName);
    assert.equal(actualizado.firstBrokerLoginFlowAlias, existente.firstBrokerLoginFlowAlias);
    assert.equal(actualizado.config.defaultScope, existente.config.defaultScope);
    assert.equal(actualizado.config.clientId, "nueva");
    assert.equal(actualizado.config.clientSecret, secreto);
    assert.equal(actualizado.config.prompt, "select_account");
  });
}

const credencialesApple = {
  KEYCLOAK_ADMIN_TOKEN: token, APPLE_CLIENT_ID: "co.eltru.prueba", APPLE_PRIVATE_KEY: secreto,
  APPLE_TEAM_ID: "EQUIPO1234", APPLE_KEY_ID: "CLAVE12345",
};

test("crea Apple primero en la lista, con el equipo, la clave y los tokens guardados", async t => {
  const admin = await administrador(t, [404], [201]);
  const resultado = await ejecutar("apple", admin.url, credencialesApple);
  assert.equal(resultado.codigo, 0, resultado.salida);
  const creado = JSON.parse(admin.peticiones[1].cuerpo);
  assert.equal(creado.alias, "apple");
  assert.equal(creado.displayName, "Apple");
  assert.equal(creado.storeToken, true);
  assert.equal(creado.config.teamId, "EQUIPO1234");
  assert.equal(creado.config.keyId, "CLAVE12345");
  assert.equal(creado.config.guiOrder, "0");
  assert.ok(!resultado.salida.includes(token) && !resultado.salida.includes(secreto));
});

test("la rotación de Apple lo devuelve al primer lugar", async t => {
  const existente = { alias: "apple", providerId: "apple", config: { clientId: "anterior", guiOrder: "5" } };
  const admin = await administrador(t, [200, existente], [204]);
  const resultado = await ejecutar("apple", admin.url, credencialesApple);
  assert.equal(resultado.codigo, 0, resultado.salida);
  assert.equal(JSON.parse(admin.peticiones[1].cuerpo).config.guiOrder, "0");
});

test("las credenciales del otro proveedor no habilitan un alta incompleta", async t => {
  const admin = await administrador(t);
  const resultado = await ejecutar("facebook", admin.url, {
    KEYCLOAK_ADMIN_TOKEN: token, FACEBOOK_APP_ID: "facebook",
    GOOGLE_CLIENT_ID: "google", GOOGLE_CLIENT_SECRET: secreto,
  });
  assert.notEqual(resultado.codigo, 0);
  assert.deepEqual(admin.peticiones, []);
});

test("un error administrativo no divulga credenciales ni el cuerpo de la respuesta", async t => {
  const admin = await administrador(t, [404], [403, { error: `privado ${secreto} ${token}` }]);
  const resultado = await ejecutar("google", admin.url, {
    KEYCLOAK_ADMIN_TOKEN: token, GOOGLE_CLIENT_ID: "aplicacion", GOOGLE_CLIENT_SECRET: secreto,
  });
  assert.notEqual(resultado.codigo, 0);
  assert.equal(admin.peticiones.length, 2);
  assert.ok(!resultado.salida.includes(token) && !resultado.salida.includes(secreto));
});

test("rechaza una URL administrativa con parámetros sin enviar credenciales", async t => {
  const admin = await administrador(t);
  const resultado = await ejecutar("google", admin.url + "?clave=valor-privado", {
    KEYCLOAK_ADMIN_TOKEN: token, GOOGLE_CLIENT_ID: "aplicacion", GOOGLE_CLIENT_SECRET: secreto,
  });
  assert.notEqual(resultado.codigo, 0);
  assert.deepEqual(admin.peticiones, []);
  assert.ok(!resultado.salida.includes("valor-privado"));
});

test("el operador local puede obtener un token de administración antes del alta", async t => {
  const admin = await administrador(t, [200, { access_token: token }], [404], [201]);
  const resultado = await ejecutar("facebook", admin.url, {
    KC_BOOTSTRAP_ADMIN_USERNAME: "operador", KC_BOOTSTRAP_ADMIN_PASSWORD: "clave-de-prueba",
    FACEBOOK_APP_ID: "aplicacion", FACEBOOK_APP_SECRET: secreto,
  });
  assert.equal(resultado.codigo, 0, resultado.salida);
  const [ingreso, consulta, alta] = admin.peticiones;
  assert.deepEqual([ingreso.metodo, ingreso.ruta], ["POST", "/realms/master/protocol/openid-connect/token"]);
  const formulario = new URLSearchParams(ingreso.cuerpo);
  assert.equal(formulario.get("grant_type"), "password");
  assert.equal(formulario.get("client_id"), "admin-cli");
  assert.equal(formulario.get("username"), "operador");
  assert.equal(formulario.get("password"), "clave-de-prueba");
  assert.equal(consulta.autorizacion, `Bearer ${token}`);
  assert.equal(alta.autorizacion, `Bearer ${token}`);
  assert.ok(!resultado.salida.includes("clave-de-prueba"));
});

test("la rotación de Discord conserva su configuración y rechaza otro tipo de proveedor", async t => {
  const existente = {
    alias: "discord", providerId: "oauth2", firstBrokerLoginFlowAlias: "verificar-cuenta",
    config: { userIDClaim: "id", defaultScope: "identify email", clientId: "anterior" },
  };
  const admin = await administrador(t, [200, existente], [204]);
  const variables = { KEYCLOAK_ADMIN_TOKEN: token, DISCORD_CLIENT_ID: "nueva", DISCORD_CLIENT_SECRET: secreto };
  const resultado = await ejecutar("discord", admin.url, variables);
  assert.equal(resultado.codigo, 0, resultado.salida);
  const actualizado = JSON.parse(admin.peticiones[1].cuerpo);
  assert.equal(actualizado.firstBrokerLoginFlowAlias, "verificar-cuenta");
  assert.equal(actualizado.config.userIDClaim, "id");
  assert.equal(actualizado.config.clientSecret, secreto);
  const incompatible = await administrador(t, [200, { alias: "discord", providerId: "google" }]);
  assert.notEqual((await ejecutar("discord", incompatible.url, variables)).codigo, 0);
  assert.equal(incompatible.peticiones.length, 1);
});
