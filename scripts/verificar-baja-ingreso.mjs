// Desde el host, contra la web del stack descartable: volver a ingresar cancela la baja; una baja vencida no ingresa.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { ingresarConClaveLocal, ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const [web, proyecto] = process.argv.slice(2);
const usuario = "eva";
const sql = consulta => execFileSync("docker", ["compose", "--project-name", proyecto, "exec", "-T", "db",
  "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "truco", "-d", "truco", "-Atc", consulta], { encoding: "utf8" }).trim();
const browser = await chromium.launch();

async function ingresar(context) {
  const page = await context.newPage();
  await page.goto(web);
  await ingresarConClaveLocal(page, usuario);
  await page.waitForURL(url => url.pathname === "/" || url.pathname === "/jugar/");
  return page;
}

try {
  // Pedir la baja desde Mi perfil.
  const primero = await browser.newContext();
  const page = await ingresar(primero);
  const { id } = await (await page.request.get(new URL("/api/jugador", web).href)).json();
  await page.goto(new URL("/perfil/", web).href);
  await page.getByRole("button", { name: "Eliminar mi cuenta" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar mi cuenta" }).click();
  await expect(page.getByText(/^Pediste eliminar tu cuenta\. Se elimina el .+ si no volvés a ingresar\.$/)).toBeVisible();
  assert.equal(sql(`SELECT count(*) FROM juego.bajas WHERE jugador='${id}'`), "1");
  assert.equal((await page.request.get(new URL("/api/jugador", web).href)).status(), 401);
  await primero.close();

  // Volver a ingresar la cancela y lleva al perfil con el aviso.
  const segundo = await browser.newContext();
  const otra = await segundo.newPage();
  await otra.goto(new URL("/api/auth/login?volver=/jugar/", web).href);
  await ingresarDesdeIdentidad(otra, usuario);
  await otra.waitForURL(url => url.pathname === "/perfil/" && url.searchParams.get("baja") === "cancelada");
  await expect(otra.getByText("Cancelamos la eliminación de tu cuenta.")).toBeVisible();
  assert.equal(sql(`SELECT count(*) FROM juego.bajas WHERE jugador='${id}'`), "0");
  await segundo.close();

  // Con la baja ya vencida, el ingreso se rechaza sin crear sesión.
  sql(`INSERT INTO juego.bajas (jugador, pedida, vence) VALUES ('${id}', now() - interval '31 days', now() - interval '1 minute')`);
  const tercero = await browser.newContext();
  const ultima = await tercero.newPage();
  const respuesta = ultima.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/callback");
  await ultima.goto(new URL("/api/auth/login", web).href);
  await ingresarDesdeIdentidad(ultima, usuario);
  const callback = await respuesta;
  assert.equal(callback.status(), 403);
  assert.equal(await callback.text(), "Tu cuenta se está eliminando.");
  assert.ok(!(await tercero.cookies()).some(c => c.name === "truco_sesion"));
  await tercero.close();
  sql(`DELETE FROM juego.bajas WHERE jugador='${id}'`);
  console.log("Baja verificada desde el navegador · pedido, arrepentimiento y baja vencida.");
} finally {
  await browser.close();
}
