import { test, expect } from "@playwright/test";
import { manoReportada } from "./fixtures/flor-retruco.ts";
import { aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";

const id = "44b9a82c-c1f9-404f-b0fd-f7956d9b50b0";
async function abrir(page, estado, miAsiento = 0) {
  let manoNumero = 1;
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/siguiente")) {
      estado = iniciarOnline(estado.mano.reparto, marcadorOnline(estado), estado.meta);
      manoNumero++;
    }
    const puntos = marcadorOnline(estado);
    let json = { id: "fabian", nombre: "Fabian", salonHabilitado: true };
    if (path.endsWith("/" + id)) json = {
      id, miAsiento, creadorId: "fabian", modo: estado.mano.reparto.manos.length === 2 ? "1v1" : "2v2", meta: estado.meta, lista: true,
      asientos: ["Fabian", "Computadora 2", "Compañero", "Rival"].slice(0, estado.mano.reparto.manos.length).map((nombre, asiento) => ({ asiento, equipo: asiento % 2, nombre, tipo: "humano" })),
    };
    if (path.endsWith("/partida")) json = {
      version: 20 + manoNumero, manoNumero, puntos, meta: estado.meta,
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
    const cobros = page.getByRole("region", { name: "Tantos de esta mano" });
    await expect(cobros.locator(":scope > ul > li")).toHaveCount(2);
    await expect(cobros).toContainText("3 tantos por flor");
    await expect(cobros).toContainText("3 tantos por retruco querido");
    await expect(cobros).toContainText(`${asiento === 0 ? "Vos" : "Tu rival"} (Fabian) · +6 tantos`);
    await expect(cobros).toContainText(`${asiento === 0 ? "Tu rival" : "Vos"} (Computadora 2) · 0 tantos`);
    expect(await cobros.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (process.env.CAPTURAS_TANTOS && intento === 0) await page.screenshot({ path: `${process.env.CAPTURAS_TANTOS}/resumen-${asiento}-${test.info().project.name}.png`, fullPage: true });
    if (intento === 0) await page.reload();
  }
});

const envite = {
  versionReparto: "online-1", reglaFlor: "inmediata-v2", dador: 1, mano: 0, muestra: "oros-06",
  manos: [["oros-02", "copas-07", "bastos-03"], ["bastos-06", "bastos-10", "espadas-07"]],
};
function aplicar(estado, acciones) {
  for (const accion of acciones) {
    const paso = aplicarOnline(estado, accion);
    if (!paso.ok) throw Error(JSON.stringify({ accion, paso }));
    estado = paso.estado;
  }
  return estado;
}

test("separa los tantos de ambos lados del acumulado del chico", async ({ page }) => {
  const estado = aplicar(iniciarOnline(envite, [4, 5]), [
    { tipo: "envido", asiento: 0 }, { tipo: "quiero", asiento: 1 },
    { tipo: "carta", asiento: 0, carta: "oros-02" }, { tipo: "truco", asiento: 1 }, { tipo: "no-quiero", asiento: 0 },
  ]);
  await abrir(page, estado);
  const resumen = page.getByRole("region", { name: "Tantos de esta mano" });
  await expect(resumen).toContainText("Vos (Fabian) · +2 tantos");
  await expect(resumen).toContainText("Tu rival (Computadora 2) · +1 tanto");
  await expect(resumen).toContainText("truco no querido");
  await expect(page.getByRole("group", { name: "Tanteador", exact: true }).locator("strong")).toHaveText(["6", "6"]);
});

test("al completar el chico distingue el valor de la flor de los puntos acreditados", async ({ page }) => {
  await abrir(page, manoReportada([8, 0], 10));
  const resumen = page.getByRole("region", { name: "Tantos de esta mano" });
  await expect(resumen).toContainText("Vos (Fabian) · +2 tantos");
  await expect(resumen).toContainText("2 tantos por flor (valor de la apuesta: 3 tantos)");
  await expect(resumen).not.toContainText("retruco");
});

test("en parejas atribuye el cobro al equipo y muestra el cero rival", async ({ page }) => {
  const reparto = { ...envite, dador: 3, manos: [...envite.manos, ["copas-02", "espadas-03", "oros-07"], ["copas-04", "espadas-12", "bastos-01"]] };
  const estado = aplicar(iniciarOnline(reparto), [{ tipo: "truco", asiento: 0 }, { tipo: "no-quiero", asiento: 1 }]);
  await abrir(page, estado, 2);
  const resumen = page.getByRole("region", { name: "Tantos de esta mano" });
  await expect(resumen).toContainText("Tu equipo · +1 tanto");
  await expect(resumen).toContainText("Rivales · 0 tantos");
  await expect(resumen).not.toContainText("Fabian");
});


test("repartir limpia el resumen anterior y conserva el acumulado", async ({ page }) => {
  await abrir(page, manoReportada());
  await expect(page.getByRole("region", { name: "Tantos de esta mano" })).toBeVisible();
  await page.getByRole("button", { name: "Repartir otra mano" }).click();
  await expect(page.getByRole("region", { name: "Tantos de esta mano" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Tanteador", exact: true }).locator("strong")).toHaveText(["6", "0"]);
});
