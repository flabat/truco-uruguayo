import { test, expect } from "@playwright/test";
import { iniciarOnline, vistaOnline } from "../src/motor/mesa-online.ts";
import { versions } from "../training/contracts/index.ts";
import { commitTurn } from "../training/signals/index.ts";

const id = "c81ab831-4566-44a9-9915-041919edc73d";
const nombres = ["Ana", "CPU 1", "Clara", "Diego"];
const duelo = [
  ["bastos-03", "copas-04", "espadas-05"],
  ["espadas-01", "copas-03", "bastos-06"],
];
const parejas = [
  ["copas-03", "espadas-06", "bastos-04"],
  ["bastos-03", "copas-05", "oros-12"],
  ["copas-06", "espadas-01", "bastos-07"],
  ["espadas-04", "oros-07", "bastos-06"],
];

// La misma notificación puede traer varias cartas, incluida la salida de la vuelta siguiente.
async function abrirMesa(page, formato, manos, jugadasIniciales) {
  const senas = formato === "pairs-senas";
  const reparto = { versionReparto: "online-1", mano: 0, dador: manos.length - 1, muestra: "oros-06", manos };
  const mesa = {
    id, modo: manos.length === 2 ? "1v1" : "2v2", formato, creadorId: "ana", miAsiento: 0, lista: true,
    asientos: manos.map((_, asiento) => ({
      asiento, equipo: asiento % 2, nombre: nombres[asiento], tipo: asiento === 0 ? "humano" : "computadora",
    })),
  };
  let estado = iniciarOnline(reparto);
  let turnos = [];
  let version = 1;
  let manoNumero = 1;
  let socket;

  function jugar(jugada) {
    const paso = commitTurn(estado, estado.mano.turno, formato, jugada);
    estado = paso.state;
    turnos.push(paso.turn);
    version++;
  }
  function tanteador() {
    const puntos = [...estado.puntosInicio];
    for (const cobro of estado.cobros) puntos[cobro.equipo] += cobro.tantos;
    return puntos;
  }
  jugadasIniciales.forEach(jugar);
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
  await page.routeWebSocket("**/vivo", canal => { socket = canal; });
  await page.route("**/api/**", async route => {
    const peticion = route.request();
    const ruta = new URL(peticion.url()).pathname;
    let datos = { id: "ana", nombre: "Ana" };
    if (ruta.endsWith(id)) datos = mesa;
    if (ruta.endsWith("/acciones") || ruta.endsWith("/siguiente")) {
      const comando = peticion.postDataJSON();
      expect(comando.version).toBe(version);
      if (comando.accion) {
        expect(estado.mano.turno).toBe(0);
        const { carta, sena } = comando.accion;
        jugar(sena ? sena + "/" + carta : carta);
      } else {
        expect(estado.resultado).toBeTruthy();
        estado = iniciarOnline({ ...reparto, mano: 1, dador: 0 }, tanteador());
        turnos = [];
        version++;
        manoNumero++;
      }
    }
    if (ruta.endsWith("/partida")) {
      datos = {
        version, manoNumero, puntos: tanteador(), meta: 40, ganadorPartida: null,
        vista: vistaOnline(estado, 0), formato, ...(senas && { versionSenas: versions.signals, turnos }),
      };
    }
    await route.fulfill({ json: datos });
  });
  await page.goto("jugar/?mesa=" + id);
  const tapete = page.getByRole("region", { name: "Tapete" });
  await expect(tapete).toBeVisible();
  await expect(page.getByText("Reconectando con tu mesa…")).toHaveCount(0);
  await page.clock.runFor(1000);
  return {
    tapete,
    async publicar(...jugadas) {
      jugadas.forEach(jugar);
      const respuesta = page.waitForResponse("**/partida");
      socket.send(JSON.stringify({ tipo: "actualizar" }));
      await (await respuesta).finished();
    },
  };
}

function cartaEn(tapete, jugador, carta) {
  return tapete.getByRole("group", { name: jugador, exact: true })
    .locator(".j-jugada").getByRole("img", { name: carta, exact: true });
}

async function esperarNaipes(tapete) {
  await expect.poll(() => tapete.locator(".j-jugada img").evaluateAll(naipes =>
    naipes.length > 0 && naipes.every(img => img.complete && img.naturalWidth > 0),
  )).toBe(true);
}

async function captura(tapete, tipo) {
  if (process.env.CAPTURAS_UI) {
    await tapete.screenshot({
      path: process.env.CAPTURAS_UI + "/vuelta-" + tipo + "-" + test.info().project.name + ".jpg",
      quality: 85, scale: "css",
    });
  }
}

test("el duelo conserva la ganadora dos segundos aunque la computadora ya haya salido otra vez", async ({ page }) => {
  const { tapete, publicar } = await abrirMesa(page, "duel", duelo, ["bastos-03"]);
  const rival = "Rival · CPU 1";
  const as = cartaEn(tapete, rival, "As de espadas");
  const salida = cartaEn(tapete, rival, "3 de copas");
  const ganadora = tapete.getByRole("group", { name: rival }).getByText("Ganó la vuelta", { exact: true });
  const jugarCuatro = page.getByRole("button", { name: "Jugar 4 de copas" });
  await expect(cartaEn(tapete, "Vos · Ana", "3 de bastos")).toBeVisible();
  await esperarNaipes(tapete);
  const descarga = Promise.withResolvers();
  await page.route("**/img/cartas/tatu/espadas-01.webp", async route => {
    await descarga.promise;
    await route.continue();
  }, { times: 1 });
  await publicar("espadas-01", "copas-03");
  await expect(as).toBeVisible();
  expect(await as.evaluate(img => img.complete)).toBe(false);
  await page.clock.runFor(2500);
  await expect(salida).toHaveCount(0);
  // Esperar el evento real de la imagen antes de medir los dos segundos en el reloj detenido.
  const carga = await as.evaluateHandle(img => ({
    ancho: new Promise(resolve => img.addEventListener("load", () => resolve(img.naturalWidth), { once: true })),
  }));
  descarga.resolve();
  expect(await carga.evaluate(estado => estado.ancho)).toBeGreaterThan(0);
  await carga.dispose();
  await expect(as).toHaveCSS("outline-style", "solid");
  await expect(ganadora).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /CPU 1/ })).toContainText(/ganó/i);
  await expect(tapete.locator(".j-jugada img")).toHaveCount(2);
  await expect(tapete.getByText("Vuelta 1", { exact: true })).toBeVisible();
  await expect(jugarCuatro).toBeDisabled();
  await captura(tapete, "ganada");

  await page.clock.runFor(1000);
  await publicar(); // Una lectura repetida de la misma versión no reinicia la pausa.
  await page.clock.runFor(999);
  await expect(as).toBeVisible();
  await expect(salida).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(salida).toBeVisible();
  await expect(as).toHaveCount(0);
  await expect(ganadora).toHaveCount(0);
  await expect(jugarCuatro).toBeEnabled();
  await page.clock.runFor(600);
  await jugarCuatro.press("Enter");
  await expect(cartaEn(tapete, "Vos · Ana", "4 de copas")).toBeVisible();
  await expect(ganadora).toBeVisible();
  await expect(page.getByRole("heading", { name: "El rival ganó la mano" })).toBeVisible();
  const repartir = page.getByRole("button", { name: "Repartir otra mano" });
  await esperarNaipes(tapete);
  await expect(repartir).toBeDisabled();
  await page.clock.runFor(1999);
  await expect(repartir).toBeDisabled();
  await page.clock.runFor(1);
  await expect(repartir).toBeEnabled();
  await page.clock.runFor(6000);
  await expect(salida).toBeVisible();
  await expect(ganadora).toBeVisible();
  await repartir.press("Enter");
  await expect(tapete.getByText("Mano 2", { exact: true })).toBeVisible();
  await expect(tapete.locator(".j-jugada")).toHaveCount(0);
  await expect(ganadora).toHaveCount(0);
});

test("en parejas una parda muestra las cuatro cartas y la vuelta decisiva señala a la compañera", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
  const { tapete, publicar } = await abrirMesa(page, "pairs-senas", parejas, ["copas-03", "bastos-03", "copas-06"]);
  const sena = page.getByRole("combobox", { name: "Seña para esta jugada" });
  const seis = page.getByRole("button", { name: "Jugar 6 de espadas" });
  await publicar("espadas-04");
  await expect(page.getByRole("status").filter({ hasText: /parda/i })).toBeVisible();
  await expect(tapete.locator(".j-jugada img")).toHaveCount(4);
  await expect(cartaEn(tapete, "Rival · Diego", "4 de espadas")).toBeVisible();
  await expect(tapete.getByText("Ganó la vuelta", { exact: true })).toHaveCount(0);
  await expect(tapete.locator(".j-ganadora")).toHaveCount(0);
  await expect(seis).toBeDisabled();
  await expect(page.locator("select:enabled")).toHaveCount(0);
  await esperarNaipes(tapete);
  await captura(tapete, "parda");
  await page.clock.runFor(1999);
  await expect(tapete.locator(".j-jugada img")).toHaveCount(4);
  await page.clock.runFor(1);
  await expect(sena).toBeEnabled();
  await expect(seis).toBeEnabled();
  await expect(tapete.locator(".j-jugada img")).toHaveCount(0);
  await sena.selectOption("cejas");
  await seis.press("Enter");
  await expect(cartaEn(tapete, "Vos · Ana", "6 de espadas")).toBeVisible();
  await expect(page.getByRole("region", { name: "Señas de esta mano" })).toContainText(/Alzar ambas cejas/);

  await page.clock.runFor(1000);
  await publicar("copas-05", "espadas-01", "oros-07");
  await expect(cartaEn(tapete, "Rival · CPU 1", "5 de copas")).toBeVisible();
  await expect(tapete.locator(".j-jugada img")).toHaveCount(2);
  await page.clock.runFor(600);
  await expect(cartaEn(tapete, "Tu pareja · Clara", "As de espadas")).toBeVisible();
  await expect(cartaEn(tapete, "Rival · Diego", "7 de oros")).toHaveCount(0);
  await expect(tapete.getByText("Ganó la vuelta", { exact: true })).toHaveCount(0);
  await page.clock.runFor(3000);
  await expect(tapete.locator(".j-jugada img")).toHaveCount(4);
  const pareja = tapete.getByRole("group", { name: "Tu pareja · Clara" });
  await expect(pareja.getByRole("img", { name: "As de espadas" })).toBeVisible();
  await expect(pareja.getByText("Ganó la vuelta", { exact: true })).toBeVisible();
  await expect(tapete.getByText("Ganó la vuelta", { exact: true })).toHaveCount(1);
  await captura(tapete, "pareja-ganadora");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("al volver a una mano terminada en parejas, la última parda sigue en el tapete", async ({ page }) => {
  const { tapete } = await abrirMesa(page, "pairs", parejas, [
    "espadas-06", "oros-12", "espadas-01", "oros-07",
    "copas-06", "espadas-04", "copas-03", "bastos-03",
  ]);
  await page.clock.runFor(5000);
  await expect(page.getByRole("heading", { name: "Ganaste la mano" })).toBeVisible();
  await expect(tapete.getByText("Parda", { exact: true })).toBeVisible();
  await expect(tapete.locator(".j-jugada img")).toHaveCount(4);
  await expect(cartaEn(tapete, "Tu pareja · Clara", "6 de copas")).toBeVisible();
  await expect(tapete.getByText("Ganó la vuelta", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Repartir otra mano" })).toBeEnabled();
});
