import { test, expect } from "@playwright/test";
import { iniciarOnline, aplicarOnline, vistaOnline } from "../src/motor/mesa-online.ts";
import { comprobarMuestra } from "./helpers/muestra.mjs";
import { tableroEspectador } from "../api/tablero-espectador.ts";

const id = "07682d57-2c6e-45ec-8aa2-369951b9d229";
const manos = [
  ["copas-04", "espadas-01", "bastos-06"],
  ["oros-03", "copas-05", "espadas-06"],
  ["espadas-04", "copas-07", "oros-06"],
  ["oros-05", "espadas-07", "copas-06"],
];

function repartir(cantidad, dador, muestra) {
  return iniciarOnline({
    versionReparto: "online-1", dador, mano: (dador + 1) % cantidad,
    manos: manos.slice(0, cantidad), muestra,
  });
}

async function comprobarDador(page, estado, nombres, lado) {
  const { dador, mano, muestra } = estado.mano.reparto;
  const puesto = page.locator(".j-puesto").filter({ has: page.getByText(nombres[dador], { exact: true }) });
  await expect(puesto.getByText(/· Dador$/)).toBeVisible();
  await expect(page.locator(".j-persona", { hasText: "Dador" })).toHaveCount(1);
  await expect(page.locator(".j-persona", { hasText: "Mano" })).toContainText(nombres[mano]);
  await comprobarMuestra(page, muestra);

  const geometria = await puesto.evaluate((asiento) => {
    const caja = (selector) => asiento.querySelector(selector).getBoundingClientRect();
    const persona = caja(".j-ocupante");
    const mazo = caja(".j-muestra");
    const tapete = asiento.closest(".j-tapete").getBoundingClientRect();
    const vecinos = document.querySelectorAll(".j-persona, .j-jugada, .j-dorsos img, .j-mano button, .j-jugada-panel");
    const mismaFila = persona.top < mazo.bottom && persona.bottom > mazo.top;
    const mismaColumna = persona.left < mazo.right && persona.right > mazo.left;
    return {
      izquierda: mismaFila && mazo.right <= persona.left,
      derecha: mismaFila && mazo.left >= persona.right,
      arriba: mismaColumna && mazo.bottom <= persona.top,
      abajo: mismaColumna && mazo.top >= persona.bottom,
      dentro: mazo.left >= tapete.left && mazo.right <= tapete.right && mazo.top >= tapete.top && mazo.bottom <= tapete.bottom,
      superposiciones: [...vecinos].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < mazo.right && r.right > mazo.left && r.top < mazo.bottom && r.bottom > mazo.top;
      }).map((el) => el.outerHTML),
    };
  });
  expect(geometria).toMatchObject({ [lado]: true, dentro: true, superposiciones: [] });
}

for (const [modo, cantidad, miAsiento, ladoAna, ladoSiguiente] of [
  ["1v1", 2, 0, "derecha", "izquierda"],
  ["1v1", 2, 1, "izquierda", "derecha"],
  ["2v2", 4, 0, "derecha", "arriba"],
  ["2v2", 4, 2, "izquierda", "abajo"],
]) {
  test(`el mazo acompaña al dador en ${modo} desde el asiento ${miAsiento + 1}`, async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
    const nombres = modo === "1v1" ? ["Ana", "Bruno"] : ["Ana", "Computadora 2", "Clara", "Diego"];
    const asientos = nombres.map((nombre, asiento) => ({
      nombre, asiento, equipo: asiento % 2, tipo: asiento === 1 && modo === "2v2" ? "computadora" : "humano",
    }));
    let estado = repartir(cantidad, 0, "bastos-07");
    let numero = 1;
    let version = 1;
    let socket;
    async function capturarTapete() {
      if (!process.env.CAPTURAS_UI) return;
      await page.locator(".j-tapete").screenshot({
        path: `${process.env.CAPTURAS_UI}/dador-${modo}-${test.info().project.name}-${miAsiento}-mano${numero}.png`,
        scale: "css",
      });
    }
    await page.routeWebSocket("**/vivo", (ws) => { socket = ws; });
    await page.route("**/api/jugador", (r) => r.fulfill({ json: { id: "yo", nombre: nombres[miAsiento] } }));
    await page.route("**/api/mesas/" + id, (r) => r.fulfill({ json: { id, modo, lista: true, miAsiento, asientos } }));
    await page.route("**/partida", (r) => r.fulfill({ json: {
      version, manoNumero: numero, meta: 40,
      puntos: [0, numero === 2 || estado.resultado ? 1 : 0], ganadorPartida: null, vista: vistaOnline(estado, miAsiento),
    } }));
    await page.route("**/siguiente", (r) => {
      numero++;
      version++;
      estado = repartir(cantidad, 1, "oros-07");
      return r.fulfill({ json: {} });
    });
    await page.goto("jugar/?mesa=" + id);
    await comprobarDador(page, estado, nombres, ladoAna);
    await expect.poll(() => Boolean(socket)).toBe(true);

    // Las tres vueltas se juegan con el motor y llegan al tablero por su canal de actualización.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      for (let i = 0; i < cantidad; i++) {
        const asiento = estado.mano.turno;
        const paso = aplicarOnline(estado, { tipo: "carta", asiento, carta: manos[asiento][vuelta] });
        expect(paso.ok).toBe(true);
        estado = paso.estado;
        version++;
        socket.send(JSON.stringify({ tipo: "actualizar" }));
        const historial = page.getByRole("region", { name: "Historial de la mano", exact: true });
        await expect(historial.locator("li")).toHaveCount(estado.acciones.length);
        await expect(historial.getByRole("listitem")).toHaveCount(Math.min(3, estado.acciones.length));
        if (i === cantidad - 2 || estado.resultado) await comprobarDador(page, estado, nombres, ladoAna);
        if (vuelta === 0 && i === cantidad - 2) await capturarTapete();
      }
    }
    const cierre = estado.mano.vueltas.at(-1).resultado;
    const tapete = page.getByRole("region", { name: "Tapete" });
    await expect(tapete.locator("header")).toContainText("Vuelta 3");
    if (cierre.tipo === "ganada") {
      await expect(tapete.locator("header")).toContainText("Ganó " + nombres[cierre.asiento]);
      const ganador = tapete.locator(".j-puesto").filter({ has: page.getByText(nombres[cierre.asiento], { exact: true }) });
      await expect(ganador.getByText("Ganó la vuelta")).toBeVisible();
    } else {
      await expect(tapete.locator("header")).toContainText("Parda");
      await expect(tapete.locator(".j-ganadora")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Repartir otra mano" }).click();
    await expect(page.locator(".j-tapete header")).toContainText("Mano 2");
    await comprobarDador(page, estado, nombres, ladoSiguiente);
    await capturarTapete();
  });
}

test("el jugador y el espectador ven el mismo tapete desde el asiento inferior", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
  const nombres = manos.map((_, i) => "Computadora " + (i + 1));
  const asientos = nombres.map((nombre, asiento) => ({
    nombre, asiento, equipo: asiento % 2, tipo: "computadora",
  }));
  let estado = repartir(4, 2, "oros-07");
  for (let i = 0; i < 4; i++) {
    const asiento = estado.mano.turno;
    const paso = aplicarOnline(estado, { tipo: "carta", asiento, carta: manos[asiento][0] });
    expect(paso.ok).toBe(true);
    estado = paso.estado;
  }
  const cerrada = estado.mano.vueltas[0];
  // La presentación de jugador deja la vuelta a la vista antes de iniciar la siguiente.
  const vista = { ...vistaOnline(estado, 0), vueltaActual: null };
  const veredicto = cerrada.resultado.tipo === "ganada"
    ? "Ganó " + nombres[cerrada.resultado.asiento] : "Parda";
  let numero = 8;
  await page.route("**/api/jugador", r => r.fulfill({ json: { id: "yo", nombre: "Ana", salonHabilitado: true } }));
  await page.route("**/api/mesas/" + id, r => r.fulfill({ json: { id, modo: "2v2", lista: true, miAsiento: 0, asientos } }));
  await page.route("**/partida", r => r.fulfill({ json: {
    version: 1, manoNumero: 8, meta: 40, puntos: [22, 15], ganadorPartida: null, vista,
  } }));
  await page.route("**/api/salon/mesas/" + id, r => r.fulfill({ json: {
    id, modo: "2v2", origen: "exhibicion", humanos: 0, computadoras: 4, estado: "en-juego",
    manoNumero: numero, meta: 40, puntos: [22, 15], asientos, tablero: tableroEspectador(estado),
  } }));

  const tapete = page.getByRole("region", { name: "Tapete" });
  for (const entrada of ["mesa", "mirar"]) {
    await page.goto("/jugar/?" + entrada + "=" + id);
    await comprobarDador(page, estado, nombres, "izquierda");
    await expect(tapete.locator("header")).toContainText("Mano 8");
    await expect(tapete.locator("header")).toContainText(veredicto);
    await expect(tapete.locator(".j-jugada img")).toHaveCount(4);
    await expect(tapete.getByText("Ganó la vuelta", { exact: true })).toHaveCount(cerrada.resultado.tipo === "ganada" ? 1 : 0);
    if (process.env.CAPTURAS_UI) await tapete.screenshot({
      path: `${process.env.CAPTURAS_UI}/tapete-compartido-${test.info().project.name}-${entrada}.png`,
      scale: "css",
    });
  }

  estado = repartir(4, 3, "bastos-07");
  numero++;
  await expect(tapete.locator("header")).toContainText("Mano 9");
  await expect(tapete.getByRole("img", { name: /^Muestra 7 de bastos$/i })).toBeVisible();
  await comprobarDador(page, estado, nombres, "abajo");
  await expect(tapete.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
});

for (const [modo, cantidad] of [["1v1", 2], ["2v2", 4]]) {
  test(`el espectador de ${modo} ve los dorsos que corresponden a la vuelta visible`, async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
    const asientos = manos.slice(0, cantidad).map((_, asiento) => ({
      nombre: "Computadora " + (asiento + 1), asiento, equipo: asiento % 2, tipo: "computadora",
    }));
    let estado = repartir(cantidad, cantidad - 1, "oros-07");
    let numero = 1;
    await page.route("**/api/jugador", r => r.fulfill({ json: { id: "yo", nombre: "Ana", salonHabilitado: true } }));
    await page.route("**/api/salon/mesas/" + id, r => r.fulfill({ json: {
      id, modo, origen: "exhibicion", humanos: 0, computadoras: cantidad, estado: "en-juego",
      manoNumero: numero, meta: 40, puntos: [0, 0], asientos, tablero: tableroEspectador(estado),
    } }));

    function jugar(vuelta) {
      const asiento = estado.mano.turno;
      const paso = aplicarOnline(estado, { tipo: "carta", asiento, carta: manos[asiento][vuelta] });
      expect(paso.ok).toBe(true);
      estado = paso.estado;
      return asiento;
    }

    const tapete = page.getByRole("region", { name: "Tapete" });
    const puesto = asiento => tapete.getByRole("group", { name: asientos[asiento].nombre, exact: true });
    const dorsos = (asiento, numero) => puesto(asiento).getByRole("img", { name: numero + " cartas en mano", exact: true });
    await page.goto("jugar/?mirar=" + id);
    for (const { asiento } of asientos) {
      await expect(dorsos(asiento, 3).locator('img[src$="/reverso.webp"]')).toHaveCount(3);
    }
    await expect(tapete.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
    await expect(tapete.locator(".j-jugada")).toHaveCount(0);
    if (process.env.CAPTURAS_TAPETE) await tapete.screenshot({
      path: `${process.env.CAPTURAS_TAPETE}/dorsos-espectador-${modo}-${test.info().project.name}.jpg`,
      type: "jpeg", quality: 86, scale: "css",
    });

    const primero = jugar(0);
    await expect(puesto(primero).locator(".j-jugada")).toHaveCount(1);
    await expect(dorsos(primero, 3)).toHaveCount(0);
    await expect(dorsos((primero + 1) % cantidad, 3)).toHaveCount(1);

    for (let i = 1; i < cantidad; i++) jugar(0);
    await expect(tapete.locator(".j-jugada")).toHaveCount(cantidad);
    await expect(tapete.locator(".j-dorsos")).toHaveCount(0);

    const salida = jugar(1);
    await expect(tapete.locator("header")).toContainText("Vuelta 2");
    await expect(tapete.locator(".j-jugada")).toHaveCount(1);
    await expect(puesto(salida).locator(".j-jugada")).toHaveCount(1);
    for (const { asiento } of asientos.filter(a => a.asiento !== salida)) {
      await expect(dorsos(asiento, 2).locator('img[src$="/reverso.webp"]')).toHaveCount(2);
    }

    estado = repartir(cantidad, 0, "bastos-07");
    numero++;
    await expect(tapete.locator("header")).toContainText("Mano 2");
    for (const { asiento } of asientos) await expect(dorsos(asiento, 3)).toHaveCount(1);
  });
}
