import { expect, test } from "@playwright/test";
import { aplicarOnline, iniciarOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { hastaLaSubida, reparto } from "./fixtures/flor-querida.ts";

test("la comparación de flor queda entre su Quiero y el del truco, también al recargar", async ({ page }) => {
  const id = "b8539035-709a-49ab-901a-e239c2942db6";
  const ruta = "/api/mesas/" + id;
  const asientos = ["Ana", "Bruno", "Clara", "Diego"].map((nombre, asiento) => ({
    asiento, nombre, tipo: "humano", equipo: asiento % 2,
  }));
  const acciones = [...hastaLaSubida];
  let miAsiento = 0;
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/jugador") {
      return route.fulfill({ json: { id: String(miAsiento), nombre: asientos[miAsiento].nombre } });
    }
    if (path === ruta) return route.fulfill({ json: { id, modo: "2v2", lista: true, asientos, miAsiento } });
    if (path === ruta + "/acciones") {
      const { accion } = route.request().postDataJSON();
      acciones.push({ ...accion, asiento: miAsiento });
    } else {
      expect(path).toBe(ruta + "/partida");
    }
    const estado = acciones.reduce((previo, accion) => {
      const paso = aplicarOnline(previo, accion);
      expect(paso.ok).toBe(true);
      return paso.estado;
    }, iniciarOnline(reparto));
    const puntos = [0, 0];
    for (const cobro of estado.cobros) puntos[cobro.equipo] += cobro.tantos;
    return route.fulfill({
      json: { version: acciones.length, manoNumero: 1, puntos, meta: 40, ganadorPartida: null, vista: vistaOnline(estado, miAsiento) },
    });
  });

  await page.goto("jugar/?mesa=" + id);
  const historia = page.getByRole("region", { name: "Historial de la mano", exact: true });
  const anteriores = historia.locator("details");
  const abrir = anteriores.locator("summary").filter({ hasText: /anteriores/i });
  const entradas = historia.getByRole("listitem");
  const inicio = [
    "Bruno dijo «Truco».", "Ana dijo «Flor».", "Clara dijo «Flor».", "Diego dijo «Flor».", "Diego dijo «Con flor envido».",
  ];
  await expect(entradas).toHaveText(inicio.slice(-3));
  await abrir.press("Enter");
  await expect(anteriores.getByRole("listitem")).toHaveText(inicio.slice(0, -3));
  await abrir.press("Enter");
  const quiero = page.getByRole("button", { name: "Quiero", exact: true });
  await quiero.click();
  const comparacion = "Flor querida. Clara cantó 30, Diego cantó 36 y Ana cantó 32. " +
    "Ganó Diego con 36 de flor. El equipo 2 sumó 5 tantos al tanteador.";
  const flor = [...inicio, "Ana dijo «Quiero».", comparacion];
  await expect(entradas).toHaveText(flor.slice(-3));
  await expect(page.getByRole("heading", { name: "Podés responder", exact: true })).toBeVisible();
  await quiero.click();
  const completa = [...flor, "Ana dijo «Quiero»."];
  await expect(entradas).toHaveText(completa.slice(-3));
  await abrir.press("Enter");
  await expect(anteriores.getByRole("listitem")).toHaveText(completa.slice(0, -3));
  if (process.env.CAPTURAS_UI) await historia.screenshot({
    path: process.env.CAPTURAS_UI + "/historial-flor-" + test.info().project.name + ".jpg", quality: 85, scale: "css",
  });
  // El rival que vuelve a la mesa recibe el mismo historial público.
  miAsiento = 1;
  await page.reload();
  await expect(entradas).toHaveText(completa.slice(-3));
  await abrir.click();
  await expect(anteriores.getByRole("listitem")).toHaveText(completa.slice(0, -3));
});
