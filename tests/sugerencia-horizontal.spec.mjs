import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { iniciarOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";

const id = "153092fc-cb59-4556-833a-f8ec1547991b";
const ruta = "jugar/?mesa=" + id;
const clave = "truco.sugerencia-horizontal.v1";
const vertical = { width: 393, height: 852 };
const horizontal = { width: 852, height: 393 };
const encabezado = page => page.getByRole("heading", { name: "Esperando jugadores" });
const descartar = page => page.getByRole("button", { name: "Ahora no" });

async function simularMesa(context, modo, enJuego = false) {
  const cantidad = { "1v1": 2, "2v2": 4, "3v3": 6 }[modo];
  const asientos = Array.from({ length: cantidad }, (_, asiento) => ({
    asiento, equipo: asiento % 2,
    nombre: asiento === 0 ? "Ana" : enJuego ? "Computadora " + asiento : null,
    tipo: asiento === 0 ? "humano" : enJuego ? "computadora" : "vacio",
  }));
  await context.routeWebSocket("**/vivo", () => {});
  await context.route("**/api/jugador", route => route.fulfill({ json: { id: "ana", nombre: "Ana", salonHabilitado: true } }));
  await context.route("**/api/mesas/" + id, route => route.fulfill({ json: {
    id, modo, formato: { "1v1": "duel", "2v2": "pairs", "3v3": "triples" }[modo],
    meta: 40, miAsiento: 0, creadorId: "ana", publica: false,
    invitacion: "http://localhost/jugar/?invitacion=prueba", lista: enJuego, asientos,
  } }));
  if (enJuego) {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/replay-chico/parejas.json", import.meta.url), "utf8"));
    const estado = iniciarOnline(fixture.eventos[0].reparto, [0, 0], 40);
    await context.route("**/partida", route => route.fulfill({ json: {
      manoNumero: 1, version: 1, meta: 40, puntos: [0, 0], ganadorPartida: null, vista: vistaOnline(estado, 0),
    } }));
  }
}

test.use({ viewport: vertical });

test("en la espera de parejas la sugerencia se presenta una vez por pestaña en el teléfono", async ({ context, page, isMobile }) => {
  await simularMesa(context, "2v2");
  await page.goto(ruta);
  await expect(encabezado(page)).toBeVisible();
  if (!isMobile) {
    await expect(descartar(page)).toHaveCount(0);
    expect(await page.evaluate(k => sessionStorage.getItem(k), clave)).toBeNull();
    return;
  }
  await expect(page.getByRole("note")).toHaveText(/Girás el celular y ves mejor toda la mesa\./);
  expect(await page.evaluate(k => sessionStorage.getItem(k), clave)).toBe("1");
  await descartar(page).focus();
  await page.setViewportSize(horizontal);
  await expect(descartar(page)).toHaveCount(0);
  await expect(encabezado(page)).toBeFocused();
  await page.setViewportSize(vertical);
  await expect(descartar(page)).toHaveCount(0);
  await page.reload();
  await expect(encabezado(page)).toBeVisible();
  await expect(descartar(page)).toHaveCount(0);

  const otra = await context.newPage();
  await otra.goto(ruta);
  await expect(descartar(otra)).toBeVisible();
});

test.describe("teléfono táctil", () => {
  test.use({ hasTouch: true });

  test("se puede descartar en la espera de tercetos con almacenamiento bloqueado", async ({ context, page }) => {
    await page.addInitScript(() => Object.defineProperty(window, "sessionStorage", {
      get() { throw new DOMException("Acceso denegado", "SecurityError"); },
    }));
    await simularMesa(context, "3v3");
    await page.setViewportSize(horizontal);
    await page.goto(ruta);
    await expect(encabezado(page)).toBeVisible();
    await expect(descartar(page)).toHaveCount(0);
    await page.setViewportSize(vertical);
    await descartar(page).press("Enter");
    await expect(encabezado(page)).toBeFocused();
    await page.setViewportSize(horizontal);
    await page.setViewportSize(vertical);
    await expect(descartar(page)).toHaveCount(0);
  });

  for (const caso of [{ modo: "1v1", juego: false, nombre: "la espera de duelo" }, { modo: "2v2", juego: true, nombre: "una partida de parejas en curso" }]) {
    test("la sugerencia no consume la exposición al entrar directamente a " + caso.nombre, async ({ context, page }) => {
      await simularMesa(context, caso.modo, caso.juego);
      await page.goto(ruta);
      const llegada = caso.juego ? page.getByRole("region", { name: "Tapete" }) : encabezado(page);
      await expect(llegada).toBeVisible();
      await expect(descartar(page)).toHaveCount(0);
      expect(await page.evaluate(k => sessionStorage.getItem(k), clave)).toBeNull();
    });
  }
});
