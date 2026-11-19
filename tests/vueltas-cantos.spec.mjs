import { test, expect } from "@playwright/test";
import { confirmar, jugarComputadoras } from "../api/turnos.ts";
import { iniciarOnline, vistaOnline } from "../src/motor/mesa-online.ts";

const id = "be480827-2dae-4e55-81d2-64ed0ccc0ac2";
const puntosInicio = [7, 9];
const mesa = {
  id, modo: "1v1", formato: "duel", creadorId: "ana", miAsiento: 0, lista: true,
  asientos: [
    { asiento: 0, equipo: 0, nombre: "Ana", tipo: "humano" },
    { asiento: 1, equipo: 1, nombre: "CPU", tipo: "computadora" },
  ],
};
const casos = [
  {
    canto: "Truco", manos: [["bastos-03", "copas-04", "espadas-05"], ["espadas-01", "bastos-01", "copas-07"]],
    valor: "2 tantos", puntos: ["7", "9"],
  },
  {
    canto: "Real envido", manos: [["copas-04", "oros-03", "espadas-05"], ["bastos-07", "bastos-06", "espadas-04"]],
    valor: "1 tanto", puntos: ["7", "12"],
  },
];

for (const { canto, manos, valor, puntos } of casos) {
  test("al aceptar " + canto + " la cuenta acompaña a la carta que cierra la vuelta", async ({ page }) => {
    const reparto = { versionReparto: "online-1", mano: 0, dador: 1, muestra: "oros-06", manos };
    let mano = { estado: iniciarOnline(reparto, puntosInicio), turnos: [] };
    let version = 5;
    function juegaAna(accion) {
      mano = jugarComputadoras(confirmar(mano, "duel", { ...accion, asiento: 0 }), "duel", [0]);
      version++;
    }
    juegaAna({ tipo: "carta", carta: manos[0][0] });
    await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
    await page.routeWebSocket("**/vivo", () => {});
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let datos = { id: "ana", nombre: "Ana" };
      if (path.endsWith(id)) datos = mesa;
      if (path.endsWith("/acciones")) {
        const comando = route.request().postDataJSON();
        expect(comando.accion).toEqual({ tipo: "quiero" });
        expect(comando.version).toBe(version);
        juegaAna(comando.accion);
      }
      if (path.endsWith("/partida")) {
        const tantos = [...puntosInicio];
        for (const cobro of mano.estado.cobros) tantos[cobro.equipo] += cobro.tantos;
        datos = { version, manoNumero: 3, meta: 40, puntos: tantos, ganadorPartida: null, vista: vistaOnline(mano.estado, 0) };
      }
      await route.fulfill({ json: datos });
    });
    await page.goto("jugar/?mesa=" + id);
    await expect(page.getByRole("heading", { name: canto, exact: true })).toBeVisible();
    const quiero = page.getByRole("button", { name: "Quiero", exact: true });
    await expect(quiero).toBeEnabled();
    await quiero.press("Enter");
    const tapete = page.getByRole("region", { name: "Tapete" });
    if (canto === "Real envido") {
      const rival = tapete.getByRole("group", { name: "Rival · CPU", exact: true });
      await expect(rival.locator(".j-voz")).toHaveText("33 de envido");
      await expect(tapete.getByText("Ganó la vuelta", { exact: true })).toHaveCount(0);
      await page.clock.runFor(1500);
    }
    await expect(tapete.getByText("Ganó la vuelta", { exact: true })).toBeVisible();
    await expect(tapete.getByText("Vuelta 1", { exact: true })).toBeVisible();
    await expect(page.locator(".j-cuenta div").filter({ hasText: "Valor de la mano" }).locator("dd")).toHaveText(valor);
    await expect(page.locator(".j-tanteador strong")).toHaveText(puntos);
    if (canto === "Real envido") {
      await expect(page.locator(".j-lances")).toContainText("Tu rival · 3 tantos por envido");
    }
    await page.clock.runFor(2000);
    await expect(tapete.getByText("Vuelta 2", { exact: true })).toBeVisible();
    await expect(page.locator(".j-tanteador strong")).toHaveText(puntos);
  });
}
