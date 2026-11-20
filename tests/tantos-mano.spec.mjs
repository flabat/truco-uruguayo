import { test, expect } from "@playwright/test";
import { manoReportada } from "./fixtures/flor-retruco.ts";
import { marcadorOnline, vistaOnline } from "../src/motor/mesa-online.ts";

const id = "44b9a82c-c1f9-404f-b0fd-f7956d9b50b0";
async function abrir(page, estado, miAsiento = 0) {
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const puntos = marcadorOnline(estado);
    let json = { id: "fabian", nombre: "Fabian", salonHabilitado: true };
    if (path.endsWith("/" + id)) json = {
      id, miAsiento, creadorId: "fabian", modo: "1v1", meta: estado.meta, lista: true,
      asientos: ["Fabian", "Computadora 2"].map((nombre, asiento) => ({ asiento, equipo: asiento, nombre, tipo: "humano" })),
    };
    if (path.endsWith("/partida")) json = {
      version: 20, manoNumero: 1, puntos, meta: estado.meta,
      ganadorPartida: puntos.findIndex(p => p === estado.meta) < 0 ? null : puntos.findIndex(p => p === estado.meta),
      vista: vistaOnline(estado, miAsiento),
    };
    return route.fulfill({ json });
  });
  await page.goto("jugar/?mesa=" + id);
}

for (const asiento of [0, 1]) test(`el desglose conserva flor y retruco desde el asiento ${asiento}, también al recargar`, async ({ page }) => {
  await abrir(page, manoReportada(), asiento);
  for (let intento = 0; intento < 2; intento++) {
    const cobros = page.locator(".j-lances");
    await expect(cobros.getByRole("listitem")).toHaveCount(2);
    await expect(cobros).toContainText(`${asiento === 0 ? "Vos" : "Tu rival"} · 3 tantos por flor`);
    await expect(cobros).toContainText("3 tantos por retruco querido");
    if (intento === 0) await page.reload();
  }
});
