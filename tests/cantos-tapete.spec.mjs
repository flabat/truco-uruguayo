import { expect, test } from "@playwright/test";
import { aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";

const id = "04a2a60c-500f-4dc5-aca4-a0abb48d3dcc";
const conFlores = {
  versionReparto: "online-1", mano: 0, dador: 3, muestra: "espadas-01",
  manos: [
    ["oros-01", "espadas-07", "bastos-04"], ["copas-07", "copas-06", "copas-10"],
    ["espadas-02", "espadas-04", "oros-05"], ["oros-03", "copas-04", "bastos-06"],
  ],
};
const conEnvido = {
  versionReparto: "online-1", mano: 0, dador: 1, muestra: "espadas-01",
  manos: [["oros-03", "copas-02", "bastos-06"], ["bastos-10", "oros-06", "oros-07"]],
};

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
});

async function abrirMesa(page, reparto, acciones) {
  const jugadores = ["Ana", "Bruno", "Computadora 3", "Computadora 4"];
  const asientos = reparto.manos.map((_, asiento) => ({
    asiento, nombre: jugadores[asiento], tipo: asiento < 2 ? "humano" : "computadora", equipo: asiento % 2,
  }));
  let estado = iniciarOnline(reparto);
  let manoNumero = 1;
  let version = 1;
  let socket;
  function aplicar(accion) {
    const paso = aplicarOnline(estado, accion);
    expect(paso.ok).toBe(true);
    estado = paso.estado;
    version++;
  }
  acciones.forEach(aplicar);
  await page.routeWebSocket("**/vivo", canal => { socket = canal; });
  await page.route("**/api/**", async route => {
    const ruta = new URL(route.request().url()).pathname;
    if (ruta === "/api/jugador") return route.fulfill({ json: { id: "ana", nombre: "Ana", puedeReportar: true } });
    if (ruta.endsWith(id)) return route.fulfill({ json: {
      id, lista: true, modo: asientos.length === 4 ? "2v2" : "1v1", miAsiento: 0, asientos,
    } });
    if (ruta.endsWith("/siguiente")) {
      expect(route.request().postDataJSON().version).toBe(version);
      expect(estado.resultado).toBeTruthy();
      estado = iniciarOnline({ ...reparto, mano: 1, dador: 0 }, marcadorOnline(estado));
      manoNumero++;
      version++;
    } else {
      expect(ruta).toBe("/api/mesas/" + id + "/partida");
    }
    const puntos = marcadorOnline(estado);
    const ganador = puntos.findIndex(total => total >= estado.meta);
    return route.fulfill({ json: {
      version, manoNumero, puntos, meta: estado.meta,
      ganadorPartida: ganador >= 0 ? ganador : null, vista: vistaOnline(estado, 0),
    } });
  });
  await page.goto("jugar/?mesa=" + id);
  const tapete = page.getByRole("region", { name: "Tapete" });
  await expect(tapete).toBeVisible();
  await expect(page.getByText("Reconectando con tu mesa…")).toHaveCount(0);
  return {
    tapete,
    async publicar(nuevas) {
      nuevas.forEach(aplicar);
      const lectura = page.waitForResponse("**/partida");
      socket.send(JSON.stringify({ tipo: "actualizar" }));
      await (await lectura).finished();
    },
  };
}

async function captura(page, tipo) {
  if (process.env.CAPTURAS_UI) {
    await page.locator(".j-partida").screenshot({
      path: process.env.CAPTURAS_UI + "/cantos-" + tipo + "-" + test.info().project.name + ".jpg",
      quality: 85, scale: "css",
    });
  }
}

test("una contraflor al resto entre una computadora y un rival remoto se escucha antes de mostrar la flor", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
  const { tapete, publicar } = await abrirMesa(page, conFlores, [{ tipo: "carta", asiento: 0, carta: "oros-01" }]);
  const pareja = tapete.getByRole("group", { name: "Tu pareja · Computadora 3", exact: true });
  const rival = tapete.getByRole("group", { name: "Rival · Bruno", exact: true });
  const dador = tapete.getByRole("group", { name: "Rival · Computadora 4", exact: true });
  const flor = pareja.getByRole("figure", { name: "Flor ganadora · 44 tantos" });
  const fin = page.getByRole("heading", { name: "Ganaste la partida" });
  const historia = page.getByRole("region", { name: "Historial de la mano" });
  await publicar([
    { tipo: "flor", asiento: 1 }, { tipo: "flor", asiento: 2 }, { tipo: "paso-flor", asiento: 3 },
    { tipo: "contraflor-al-resto", asiento: 2 }, { tipo: "quiero", asiento: 1 },
  ]);
  const reporte = historia.locator("form");
  for (const [puesto, texto, posicion, indice] of [
    [rival, "Flor", 2, 0], [pareja, "Flor", 3, 0], [dador, "Yo no canto", 4, 0], [pareja, "Contraflor al resto", 5, 0],
    [rival, "Quiero", 6, 0], [rival, "33 de flor", 6, 1], [pareja, "44 de flor", 6, 2],
  ]) {
    const voz = puesto.locator(".j-voz");
    await expect(voz).toBeVisible();
    await expect(voz).toHaveText(texto);
    await expect(reporte.getByRole("button", { name: "Reportar esta jugada" })).toBeEnabled();
    await expect(reporte.locator("[name=posicion]")).toHaveValue(String(posicion));
    await expect(reporte.locator("[name=voz]")).toHaveValue(String(indice));
    await expect(reporte.locator("[name=fase]")).toHaveValue("presentacion");
    await expect(reporte.locator("[name=puntos]")).toHaveValue("0-0");
    await expect(tapete.getByRole("figure")).toHaveCount(0);
    await expect(fin).toHaveCount(0);
    if (texto === "Contraflor al resto") await captura(page, "contraflor");
    await page.clock.runFor(1500);
  }
  async function comprobarFinal() {
    await expect(fin).toBeVisible();
    await expect(reporte.locator("[name=fase]")).toHaveValue("resultado");
    await expect(reporte.locator("[name=puntos]")).toHaveValue("40-0");
    await expect(historia.getByRole("listitem")).toHaveCount(3);
    await expect(historia.locator("details")).not.toHaveAttribute("open", "");
    await expect(historia.getByText("Flor querida.", { exact: true })).toBeVisible();
    await expect(flor).toBeVisible();
    await expect(flor.getByText("Contraflor al resto", { exact: true })).toBeVisible();
    await expect(rival.locator(".j-voz")).toHaveText("33 de flor");
    await expect(flor.getByRole("img")).toHaveCount(3);
    for (const nombre of ["2 de espadas", "4 de espadas", "5 de oros"]) {
      await expect(flor.getByRole("img", { name: nombre, exact: true })).toBeVisible();
    }
    await expect(rival.getByRole("img", { name: "3 cartas en mano" })).toBeVisible();
    await expect(dador.getByRole("img", { name: "3 cartas en mano" })).toBeVisible();
    await expect(tapete.getByRole("figure")).toHaveCount(1);
    await expect(page.locator(".j-tanteador strong")).toHaveText(["40", "0"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await comprobarFinal();
  await captura(page, "flor");
  await page.reload();
  // Al reabrir una mano terminada no es preciso ver los anuncios otra vez.
  await comprobarFinal();
});

test("el envido ganador se acredita con su par al terminar la mano, incluida la carta ya jugada", async ({ page }) => {
  const { tapete, publicar } = await abrirMesa(page, conEnvido, [
    { tipo: "envido", asiento: 0 }, { tipo: "quiero", asiento: 1 },
  ]);
  const rival = tapete.getByRole("group", { name: "Rival · Bruno", exact: true });
  await expect(page.getByRole("heading", { name: "Tu turno" })).toBeVisible();
  await expect(rival.getByRole("figure")).toHaveCount(0);
  await expect(rival.getByRole("img", { name: "6 de oros", exact: true })).toHaveCount(0);
  await expect(rival.getByRole("img", { name: "7 de oros", exact: true })).toHaveCount(0);
  await publicar([
    { tipo: "carta", asiento: 0, carta: "bastos-06" }, { tipo: "carta", asiento: 1, carta: "oros-07" },
    { tipo: "truco", asiento: 1 }, { tipo: "no-quiero", asiento: 0 },
  ]);
  const prueba = rival.getByRole("figure", { name: "Envido ganador · 33 tantos" });
  await expect.poll(async () => {
    await page.clock.runFor(1000);
    return prueba.isVisible();
  }, { intervals: [50] }).toBe(true);
  await expect(prueba).toBeVisible();
  await expect(prueba.getByRole("img")).toHaveCount(2);
  for (const nombre of ["6 de oros", "7 de oros"]) {
    await expect(prueba.getByRole("img", { name: nombre, exact: true })).toBeVisible();
  }
  await expect(rival.getByRole("img", { name: "Sota de bastos", exact: true })).toHaveCount(0);
  await page.clock.runFor(10_000);
  await expect(prueba).toBeVisible();
  await page.getByRole("button", { name: "Repartir otra mano" }).press("Enter");
  await expect(tapete.getByText("Mano 2", { exact: true })).toBeVisible();
  const reporte = page.getByRole("region", { name: "Historial de la mano" }).locator("form");
  await expect(reporte.locator("[name=mano]")).toHaveValue("2");
  await expect(reporte.locator("[name=posicion]")).toHaveValue("0");
  await expect(reporte.locator("[name=fase]")).toHaveValue("jugada");
  await expect(tapete.getByRole("figure")).toHaveCount(0);
  await expect(rival.getByRole("img", { name: "3 cartas en mano" })).toBeVisible();
});
