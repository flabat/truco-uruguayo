// Desde el host, contra la web del stack descartable: el ingreso de la app termina en un código de canje.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { ingresarConClaveLocal, ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const web = process.argv[2];
const browser = await chromium.launch();
const usuario = "clara";

function parDeApp() {
  const verificador = randomBytes(32).toString("base64url");
  return { verificador, desafio: createHash("sha256").update(verificador).digest("base64url") };
}

/** Recorre el ingreso como lo haría el navegador del sistema y devuelve el retorno a la app. */
async function ingresoDeApp(desafio) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // El navegador no puede seguir eltruco://, así que se lee el retorno de la respuesta del callback.
  const callback = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/callback");
  await page.goto(new URL("/api/auth/login?app=" + desafio, web).href);
  await ingresarDesdeIdentidad(page, usuario);
  const respuesta = await callback;
  assert.equal(respuesta.status(), 303);
  const retorno = respuesta.headers()["location"];
  const cookies = (await context.cookies()).map(c => c.name);
  await context.close();
  assert.ok(!cookies.includes("truco_sesion"), "el ingreso de la app no deja cookie de sesión");
  assert.match(retorno ?? "", /^eltruco:\/\/ingreso\?codigo=[A-Za-z0-9_-]{43}$/);
  return new URL(retorno).searchParams.get("codigo");
}

const canjear = (codigo, verificador) => fetch(new URL("/api/auth/canje", web), {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo, verificador }),
});

try {
  // El id de la cuenta web del mismo usuario.
  const contextoWeb = await browser.newContext();
  const paginaWeb = await contextoWeb.newPage();
  await paginaWeb.goto(web);
  await ingresarConClaveLocal(paginaWeb, usuario);
  await paginaWeb.waitForURL(url => url.pathname === "/" || url.pathname === "/jugar/");
  await paginaWeb.goto(web);
  await expect(paginaWeb.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  const idWeb = (await (await paginaWeb.request.get(new URL("/api/jugador", web).href)).json()).id;
  await contextoWeb.close();

  // Un verificador ajeno consume el código, que después tampoco sirve con el correcto.
  const primero = parDeApp();
  const codigo = await ingresoDeApp(primero.desafio);
  assert.equal((await canjear(codigo, parDeApp().verificador)).status, 401);
  assert.equal((await canjear(codigo, primero.verificador)).status, 401);

  // Un ingreso nuevo se canjea una sola vez por una sesión de la app.
  const segundo = parDeApp();
  const otroCodigo = await ingresoDeApp(segundo.desafio);
  const canje = await canjear(otroCodigo, segundo.verificador);
  assert.equal(canje.status, 200);
  assert.equal(canje.headers.get("set-cookie"), null);
  assert.equal(canje.headers.get("cache-control"), "no-store");
  const datos = await canje.json();
  assert.equal(datos.jugador.id, idWeb);
  assert.equal(datos.bajaCancelada, false);
  const yo = await fetch(new URL("/api/jugador", web), { headers: { authorization: "Bearer " + datos.sesion } });
  assert.equal(yo.status, 200);
  assert.equal((await yo.json()).id, idWeb);
  assert.equal((await canjear(otroCodigo, segundo.verificador)).status, 401);

  // Un desafío inválido no inicia el ingreso.
  assert.equal((await fetch(new URL("/api/auth/login?app=corto", web), { redirect: "manual" })).status, 400);
  console.log("Ingreso de la app verificado · código de un solo uso, verificador, sesión por encabezado.");
} finally {
  await browser.close();
}
