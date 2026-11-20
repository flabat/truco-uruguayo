import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { chromium, expect } from "@playwright/test";

const [web, identidad, proyecto] = process.argv.slice(2);
const ingreso = web + "/api/auth/login";
const usuarioLocal = web + "/api/perfil";
const clave = "Clave-descartable-407!";
const claveNueva = "Clave-descartable-409!";
const upstream = "truco-local";
const local = "mesa-local";
assert.match(proyecto, /^truco-check-[\d-]+$/);

const token = await fetch(identidad + "/realms/master/protocol/openid-connect/token", {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: process.env.KC_BOOTSTRAP_ADMIN_USERNAME,
    password: process.env.KC_BOOTSTRAP_ADMIN_PASSWORD,
  }),
});
assert.equal(token.status, 200, "Inicio de sesión del administrador de pruebas");
const headers = { Authorization: "Bearer " + (await token.json()).access_token, "Content-Type": "application/json" };
async function admin(ruta, status = 200, method = "GET", datos) {
  const respuesta = await fetch(identidad + "/admin/realms/" + ruta, { method, headers, body: JSON.stringify(datos) });
  assert.equal(respuesta.status, status, method + " " + ruta);
  if (status === 201) return new URL(respuesta.headers.get("location")).pathname.split("/").at(-1);
  if (status === 200) return respuesta.json();
}

function alta(realm, nombre, correo, acciones = []) {
  return admin(realm + "/users", 201, "POST", {
    username: realm === local ? correo : nombre.toLowerCase(),
    firstName: nombre,
    lastName: "Prueba",
    email: correo,
    enabled: true,
    emailVerified: false,
    requiredActions: acciones,
    credentials: [{ type: "password", value: clave, temporary: false }],
  });
}

const buzon = spawn("docker", ["compose", "--project-name", proyecto, "exec", "-T", "api", "node", "--input-type=module"], {
  stdio: ["pipe", "pipe", "inherit"],
});
buzon.stdin.end(readFileSync(new URL("./identidad/buzon-prueba.mjs", import.meta.url)));
const mensajes = [];
let buzonListo = false;
createInterface({ input: buzon.stdout }).on("line", linea => {
  if (linea === "listo") buzonListo = true;
  else mensajes.push(JSON.parse(linea));
});

async function enlaceDeCorreo(correo, asunto) {
  await expect.poll(() => mensajes.find(mensaje => mensaje.includes("To: " + correo) && mensaje.includes("Subject: " + asunto))).toBeTruthy();
  const mensaje = mensajes.find(mensaje => mensaje.includes("To: " + correo) && mensaje.includes("Subject: " + asunto));
  const extraer = spawnSync("python3", ["-c", [
    "from email import policy",
    "from email.parser import Parser",
    "import re, sys",
    "texto = Parser(policy=policy.default).parse(sys.stdin).get_body().get_content()",
    "print(re.search(r'http[^\"<>\\s]+/login-actions/action-token[^\"<>\\s]+', texto).group().replace('&amp;', '&'))",
  ].join("\n")], { input: mensaje, encoding: "utf8" });
  assert.equal(extraer.status, 0, extraer.stderr);
  const enlace = new URL(extraer.stdout.trim());
  assert.equal(enlace.origin, identidad);
  return enlace.href;
}

async function ingresoSocial(page, proveedor, nombre, accion) {
  if (accion) {
    const inicio = await page.request.get(ingreso, { maxRedirects: 0 });
    const url = new URL(inicio.headers().location);
    url.searchParams.set("kc_action", accion);
    await page.goto(url.href);
  } else {
    await page.goto(ingreso);
  }
  await page.locator("#social-" + proveedor).click();
  await expect(page).toHaveURL(url => url.pathname.startsWith("/realms/" + upstream + "/"));
  await page.locator("#username").fill(nombre.toLowerCase());
  await page.locator("#password").fill(clave);
  await page.locator("#kc-login").click();
}

async function comprobarVerificacion(page) {
  await expect(page).toHaveURL(url => url.searchParams.get("execution") === "VERIFY_EMAIL");
  await expect(page.locator("p.instruction")).not.toHaveCount(0);
  assert.equal((await page.request.get(usuarioLocal)).status(), 401);
}

const browser = await chromium.launch();
async function conPagina(probar) {
  const page = await browser.newPage({ locale: "en" });
  try {
    await probar(page);
  } finally {
    await page.close();
  }
}

try {
  await expect.poll(() => buzonListo).toBe(true);
  await admin(local, 204, "PUT", {
    verifyEmail: true,
    resetPasswordAllowed: true,
    smtpServer: { host: "api", port: "1025", from: "cuentas@example.test" },
  });
  await admin(upstream + "/clients", 201, "POST", {
    clientId: "truco-broker-prueba",
    enabled: true,
    secret: clave,
    redirectUris: [identidad + "/realms/" + local + "/broker/*"],
  });
  const oidc = "/realms/" + upstream + "/protocol/openid-connect";
  for (const [alias, nombre, acciones] of [["google", "Gloria", ["VERIFY_EMAIL"]], ["facebook", "Fabian", []]]) {
    const rutaProveedor = local + "/identity-provider/instances";
    await admin(rutaProveedor + "/" + alias, 204, "DELETE");
    await admin(rutaProveedor, 201, "POST", {
      alias,
      providerId: "oidc",
      enabled: true,
      trustEmail: false,
      config: {
        clientId: "truco-broker-prueba",
        clientSecret: clave,
        authorizationUrl: identidad + oidc + "/auth",
        tokenUrl: "http://identidad:8080" + oidc + "/token",
        jwksUrl: "http://identidad:8080" + oidc + "/certs",
        issuer: identidad + "/realms/" + upstream,
        validateSignature: "true",
        useJwksUrl: "true",
        disableUserInfo: "true",
      },
    });
    const correo = nombre.toLowerCase() + "@example.test";
    const remoto = await alta(upstream, nombre, correo);
    const id = await alta(local, nombre, correo, acciones);
    const ruta = local + "/users/" + id;
    await admin(ruta + "/federated-identity/" + alias, 204, "POST", { identityProvider: alias, userId: remoto, userName: nombre.toLowerCase() });
    await conPagina(async page => {
      await ingresoSocial(page, alias, nombre);
      await expect.poll(async () => (await page.request.get(usuarioLocal)).status()).toBe(200);
      const { jugador } = await (await page.request.get(usuarioLocal)).json();
      assert.equal(jugador.nombre, nombre);
    });
    const cuenta = await admin(ruta);
    assert.equal(cuenta.emailVerified, false);
    assert.deepEqual(cuenta.requiredActions, acciones);
    assert.equal(mensajes.length, 0);
  }

  await conPagina(async page => {
    await ingresoSocial(page, "google", "Gloria", "VERIFY_EMAIL");
    await comprobarVerificacion(page);
    await expect(page.locator("#kc-verify-email-form")).toBeVisible();
  });

  await alta(upstream, "Primera", "primera@example.test");
  await conPagina(async page => {
    await ingresoSocial(page, "google", "Primera");
    await comprobarVerificacion(page);
    await enlaceDeCorreo("primera@example.test", "Verify email");
  });

  const colision = "colision@example.test";
  await alta(upstream, "Colision", colision);
  const sinVinculo = await alta(local, "Colision", colision);
  await conPagina(async page => {
    await ingresoSocial(page, "facebook", "Colision");
    await page.locator("#linkAccount").click();
    await enlaceDeCorreo(colision, "Link");
    assert.equal((await page.request.get(usuarioLocal)).status(), 401);
    assert.deepEqual(await admin(local + "/users/" + sinVinculo + "/federated-identity"), []);
  });

  const correo = "alta-verificada@example.test";
  const enviar = (page, form) => page.locator(form).locator("input[type=submit], button[type=submit]").click();
  const elegirClave = async (page, valor) => {
    await page.locator("#password-new").fill(valor);
    await page.locator("#password-confirm").fill(valor);
    await enviar(page, "#kc-passwd-update-form");
  };
  await conPagina(async page => {
    await page.goto(ingreso);
    await page.locator("#truco-existing-account summary").click();
    await page.locator("#username").fill("gloria@example.test");
    await page.locator("#password").fill(clave);
    await page.locator("#kc-login").click();
    await comprobarVerificacion(page);
  });
  let jugador;
  await conPagina(async page => {
    await page.goto(ingreso);
    await page.locator("#kc-registration a").click();
    await page.locator("#firstName").fill("Alicia");
    await page.locator("#lastName").fill("Prueba");
    await page.locator("#email").fill(correo);
    await expect(page.locator("#password")).toHaveCount(0);
    await enviar(page, "#kc-register-form");
    await comprobarVerificacion(page);
    await page.goto(await enlaceDeCorreo(correo, "Verify email"));
    await elegirClave(page, clave);
    await expect.poll(async () => (await page.request.get(usuarioLocal)).status()).toBe(200);
    ({ jugador } = await (await page.request.get(usuarioLocal)).json());
  });
  await conPagina(async page => {
    await page.goto(ingreso);
    await page.locator("#truco-existing-account summary").click();
    await page.locator("a[href*='reset-credentials']").click();
    await page.locator("#username").fill(correo);
    await enviar(page, "#kc-reset-password-form");
    assert.equal((await page.request.get(usuarioLocal)).status(), 401);
    await page.goto(await enlaceDeCorreo(correo, "Reset password"));
    await elegirClave(page, claveNueva);
    await expect.poll(async () => (await page.request.get(usuarioLocal)).status()).toBe(200);
    assert.deepEqual((await (await page.request.get(usuarioLocal)).json()).jugador, jugador);
  });
  console.log("Correo comprobado en el regreso social, primer ingreso, vinculación, alta y recuperación.");
} finally {
  await browser.close();
  buzon.kill();
}
