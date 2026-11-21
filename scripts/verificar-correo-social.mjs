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
const enApi = ["compose", "--project-name", proyecto, "exec", "-T", "api"];

function solicitarInterno(ruta, opciones) {
  const salida = spawnSync("docker", [...enApi, "node", "--input-type=module", "-e", `
    import { readFileSync } from "node:fs";
    const { ruta, opciones } = JSON.parse(readFileSync(0, "utf8"));
    const r = await fetch("http://identidad:8080" + ruta, { ...opciones, redirect: "manual" });
    console.log(JSON.stringify({ status: r.status, location: r.headers.get("location"), body: await r.text() }));
  `], { input: JSON.stringify({ ruta, opciones }), encoding: "utf8", timeout: 15_000 });
  assert.equal(salida.status, 0, salida.stderr);
  return JSON.parse(salida.stdout);
}

const token = solicitarInterno("/realms/master/protocol/openid-connect/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: process.env.KC_BOOTSTRAP_ADMIN_USERNAME,
    password: process.env.KC_BOOTSTRAP_ADMIN_PASSWORD,
  }).toString(),
});
assert.equal(token.status, 200, "Inicio de sesión del administrador de pruebas");
const headers = { Authorization: "Bearer " + JSON.parse(token.body).access_token, "Content-Type": "application/json" };
function admin(ruta, status = 200, method = "GET", datos) {
  const respuesta = solicitarInterno("/admin/realms/" + ruta, { method, headers, body: JSON.stringify(datos) });
  assert.equal(respuesta.status, status, method + " " + ruta);
  if (status === 201) return new URL(respuesta.location, identidad).pathname.split("/").at(-1);
  if (status === 200) return JSON.parse(respuesta.body);
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

const buzon = spawn("docker", [...enApi, "node", "--input-type=module"], {
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
  const buscar = () => mensajes.find(mensaje => mensaje.includes("To: " + correo) && mensaje.includes("Subject: " + asunto));
  await expect.poll(buscar, { timeout: 15_000 }).toBeTruthy();
  const mensaje = buscar();
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
  page.setDefaultTimeout(15_000);
  try {
    await probar(page);
  } finally {
    await page.close();
  }
}

try {
  await expect.poll(() => buzonListo).toBe(true);
  admin(local, 204, "PUT", {
    verifyEmail: true,
    resetPasswordAllowed: true,
    smtpServer: { host: "api", port: "1025", from: "cuentas@example.test" },
  });
  admin(upstream + "/clients", 201, "POST", {
    clientId: "truco-broker-prueba",
    enabled: true,
    secret: clave,
    redirectUris: [identidad + "/realms/" + local + "/broker/*"],
  });
  const oidc = "/realms/" + upstream + "/protocol/openid-connect";
  for (const [alias, nombre, acciones] of [["google", "Gloria", ["VERIFY_EMAIL"]], ["facebook", "Fabian", []], ["discord", "Diana", []]]) {
    const rutaProveedor = local + "/identity-provider/instances";
    admin(rutaProveedor + "/" + alias, 204, "DELETE");
    admin(rutaProveedor, 201, "POST", {
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
    const remoto = alta(upstream, nombre, correo);
    const id = alta(local, nombre, correo, acciones);
    const ruta = local + "/users/" + id;
    admin(ruta + "/federated-identity/" + alias, 204, "POST", {
      identityProvider: alias,
      userId: remoto,
      userName: nombre.toLowerCase(),
    });
    await conPagina(async page => {
      await ingresoSocial(page, alias, nombre);
      await expect.poll(async () => (await page.request.get(usuarioLocal)).status()).toBe(200);
      const { jugador } = await (await page.request.get(usuarioLocal)).json();
      assert.equal(jugador.nombre, nombre);
    });
    const cuenta = admin(ruta);
    assert.equal(cuenta.emailVerified, false);
    assert.deepEqual(cuenta.requiredActions, acciones);
    assert.equal(mensajes.length, 0);
  }

  await conPagina(async page => {
    await ingresoSocial(page, "google", "Gloria", "VERIFY_EMAIL");
    await comprobarVerificacion(page);
  });

  alta(upstream, "Primera", "primera@example.test");
  await conPagina(async page => {
    await ingresoSocial(page, "google", "Primera");
    await comprobarVerificacion(page);
    await enlaceDeCorreo("primera@example.test", "Verify email");
  });

  alta(upstream, "PrimeraDiscord", "primeradiscord@example.test");
  await conPagina(async page => {
    await ingresoSocial(page, "discord", "PrimeraDiscord");
    await comprobarVerificacion(page);
    await enlaceDeCorreo("primeradiscord@example.test", "Verify email");
  });

  const colisionDiscord = "colisiondiscord@example.test";
  alta(upstream, "ColisionDiscord", colisionDiscord);
  const sinVinculoDiscord = alta(local, "ColisionDiscord", colisionDiscord);
  await conPagina(async page => {
    await ingresoSocial(page, "discord", "ColisionDiscord");
    await page.locator("#linkAccount").click();
    await enlaceDeCorreo(colisionDiscord, "Link");
    assert.equal((await page.request.get(usuarioLocal)).status(), 401);
    assert.deepEqual(admin(local + "/users/" + sinVinculoDiscord + "/federated-identity"), []);
  });

  const colision = "colision@example.test";
  alta(upstream, "Colision", colision);
  const sinVinculo = alta(local, "Colision", colision);
  await conPagina(async page => {
    await ingresoSocial(page, "facebook", "Colision");
    await page.locator("#linkAccount").click();
    await enlaceDeCorreo(colision, "Link");
    assert.equal((await page.request.get(usuarioLocal)).status(), 401);
    assert.deepEqual(admin(local + "/users/" + sinVinculo + "/federated-identity"), []);
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
