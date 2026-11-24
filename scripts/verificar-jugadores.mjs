import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { ingresarConClaveLocal } from "./ingreso-local-navegador.mjs";

const web = process.argv[2];
const usuarios = ["ana", "bruno", "clara", "diego"];
const browser = await chromium.launch();

async function ingresar(page, usuario) {
  await ingresarConClaveLocal(page, usuario);
  const salon = process.env.SALON_HABILITADO === "1";
  await expect(page.getByRole("heading", { name: salon ? "Mesas en juego" : "Crear una mesa" })).toBeVisible();
  await page.goto(web);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  const me = await page.request.get(web + "/api/jugador");
  assert.equal(me.status(), 200);
  const jugador = await me.json();
  assert.equal(jugador.salonHabilitado, salon);
  assert.equal(jugador.nombre.toLowerCase(), usuario);
  await expect(page.locator("[data-id]")).toHaveText(jugador.id);
  return jugador.id;
}

try {
  const ids = await Promise.all(usuarios.map(async (usuario, indice) => {
    const context = await browser.newContext({ viewport: indice === 0
      ? { width: 375, height: 760 } : { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(web);
    assert.equal((await page.request.get(web + "/api/jugador")).status(), 401);
    const id = await ingresar(page, usuario);
    await page.reload();
    await expect(page.locator("[data-id]")).toHaveText(id);

    const [cookie] = (await context.cookies()).filter(c => c.name === "truco_sesion");
    assert.ok(cookie.httpOnly);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("button", { name: "Ingresar al juego" })).toBeVisible();
    const revocada = await page.request.get(web + "/api/jugador", {
      headers: { cookie: cookie.name + "=" + cookie.value },
    });
    assert.equal(revocada.status(), 401);
    await context.close();

    const regreso = await browser.newContext();
    const otraPagina = await regreso.newPage();
    await otraPagina.goto(web);
    assert.equal(await ingresar(otraPagina, usuario), id);
    await regreso.close();
    return id;
  }));
  assert.equal(new Set(ids).size, 4);
  console.log("Cuatro jugadores distintos recuperaron su identidad en un navegador nuevo.");
} finally {
  await browser.close();
}
