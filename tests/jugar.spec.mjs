import { test, expect } from "@playwright/test";
import { confirmar, confirmarComputadora, jugarComputadoras, restaurar } from "../api/turnos.ts";
import { aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline } from "../src/motor/mesa-online.ts";
import { dueloFlor, dueloMazo } from "./fixtures/duelo-mazo.ts";

const mesaId = "44b9a82c-c1f9-404f-b0fd-f7956d9b50b0";
const token = "t".repeat(32);
const yo = { id: "ana", nombre: "Ana" };
const seat = (asiento, tipo, nombre) => ({ asiento, tipo, nombre, equipo: asiento % 2 });
const personas = [
  seat(0, "humano", "Ana"),
  seat(1, "humano", "Bruno"),
  seat(2, "computadora", "CPU 1"),
  seat(3, "humano", "Diego"),
];
const mesa = (modo, asientos, miAsiento = 0) => ({
  id: mesaId,
  creadorId: "ana",
  miAsiento,
  modo,
  meta: 40,
  asientos,
  lista: asientos.every((a) => a.tipo !== "vacio"),
  invitacion: "http://localhost/jugar/?invitacion=" + token,
});
const vista = {
  asiento: 0,
  cartas: ["espadas-01", "copas-12", "oros-03"],
  muestra: "bastos-04",
  dador: 3,
  mano: 0,
  turno: 0,
  vueltaActual: { salida: 0, jugadas: [] },
  vueltas: [],
  equipoGanador: null,
  equipoPorAsiento: [0, 1, 0, 1],
  apuesta: "sin-canto",
  valorTruco: 1,
  legales: ["carta", "truco", "envido", "real-envido", "falta-envido"],
  resultado: null,
  pendiente: null,
  trucoPendiente: null,
  porDeclararFlor: null,
  acciones: [],
  cobros: [],
  tantosPropios: { modalidad: "envido", total: 3 },
};
const partida = { version: 1, manoNumero: 1, puntos: [0, 0], meta: 40, ganadorPartida: null, vista };

async function simular(page, handler) {
  const sockets = [];
  await page.routeWebSocket("**/vivo", (ws) => sockets.push(ws));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const result = await handler(path, request);
    await route.fulfill({ status: result?.status ?? 200, json: result?.json ?? yo });
  });
  return sockets;
}

test("de a seis se proponen 25 malas y 25 buenas y la mesa puede pactar otra meta", async ({ page }) => {
  await page.goto("reglas/seis-jugadores/");
  const campo = page.getByRole("spinbutton", { name: "Tantos para ganar el chico de a seis" });
  const mitades = page.locator("output[for=meta-seis]");
  await expect(campo).toHaveValue("50");
  await expect(mitades).toHaveText("25 malas y 25 buenas");
  if (process.env.CAPTURAS_UI)
    await page.locator(".meta-de-seis").screenshot({ path: `${process.env.CAPTURAS_UI}/meta-seis-${test.info().project.name}.png`, scale: "css" });
  await campo.fill("26");
  await campo.press("ArrowUp");
  await expect(mitades).toHaveText("14 malas y 14 buenas");
  await page.reload();
  await expect(campo).toHaveValue("28");
  await campo.fill("25");
  await expect(mitades).toHaveText("Elegí un número par desde 2.");
  await campo.fill("50");
  await expect(page).not.toHaveURL(/meta=/);
});

test("la mesa guarda la meta acordada al crearla", async ({ page }) => {
  const asientos = [personas[0], seat(1, "vacio", null)];
  let meta;
  await simular(page, (path, req) => {
    if (path === "/api/mesas") {
      const datos = req.postDataJSON();
      expect(datos).toEqual({ modo: "1v1", meta: 26 });
      meta = datos.meta;
    }
    if (path === "/api/mesas" || path.endsWith("/" + mesaId)) return { json: { ...mesa("1v1", asientos), meta } };
  });
  await page.goto("jugar/");
  await page.getByRole("radio", { name: /1 contra 1/ }).check();
  const campo = page.getByRole("spinbutton", { name: "Tantos para ganar el chico" });
  const crear = page.getByRole("button", { name: "Crear mesa", exact: true });
  await expect(campo).toHaveValue("40");
  await campo.fill("25");
  await expect(crear).toBeDisabled();
  await campo.fill("26");
  await expect(page.getByText("13 malas y 13 buenas")).toBeVisible();
  if (process.env.CAPTURAS_UI)
    await page.locator(".j-crear .j-panel").screenshot({ path: `${process.env.CAPTURAS_UI}/crear-meta-${test.info().project.name}.png`, scale: "css" });
  await crear.press("Enter");
  await expect(page.getByText("Chico a 26 tantos.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Chico a 26 tantos.")).toBeVisible();
});

test("crea un duelo con computadora y juega desde su mano", async ({ page }) => {
  let bot = false,
    comando,
    cantada = false;
  let segunda;
  const sockets = await simular(page, (path, req) => {
    if (path === "/api/mesas") {
      expect(req.postDataJSON()).toEqual({ modo: "1v1" });
      return { json: mesa("1v1", [personas[0], seat(1, "vacio", null)]) };
    }
    if (path.endsWith("/computadoras")) {
      expect(req.postDataJSON()).toEqual({ asiento: 1 });
      bot = true;
    }
    if (path.endsWith("/" + mesaId))
      return { json: mesa("1v1", [personas[0], seat(1, "computadora", "CPU 1")]) };
    if (path.endsWith("/siguiente")) {
      expect(req.postDataJSON().version).toBe(2);
      segunda = { ...partida, manoNumero: 2, version: 3, puntos: [1, 0] };
      return { json: segunda };
    }
    if (segunda && path.endsWith("/acciones")) {
      const accion = req.postDataJSON().accion;
      expect(accion).toEqual({ tipo: "carta", carta: "espadas-01" });
      segunda = {
        ...segunda,
        version: 4,
        vista: {
          ...vista,
          turno: 1,
          legales: [],
          cartas: vista.cartas.slice(1),
          acciones: [{ ...accion, asiento: 0 }],
          vueltaActual: { salida: 0, jugadas: [{ asiento: 0, carta: accion.carta }] },
        },
      };
      return { json: segunda };
    }
    if (segunda && path.endsWith("/partida")) return { json: segunda };
    if (path.endsWith("/acciones")) {
      comando = req.postDataJSON();
      cantada = true;
    }
    if (path.endsWith("/partida") || path.endsWith("/acciones"))
      return {
        json: cantada
          ? {
              ...partida,
              version: 2,
              puntos: [1, 0],
              vista: {
                ...vista,
                legales: [],
                turno: null,
                vueltaActual: null,
                resultado: { equipo: 0, tantos: 1, motivo: "rechazo" },
                acciones: [
                  { tipo: "truco", asiento: 0 },
                  { tipo: "no-quiero", asiento: 1 },
                ],
              },
            }
          : { ...partida, vista: { ...vista, equipoPorAsiento: [0, 1] } },
      };
  });
  await page.goto("jugar/");
  await page.getByRole("radio", { name: /1 contra 1/ }).check();
  await page.getByRole("button", { name: "Jugar con computadoras" }).click();
  await expect(page).toHaveURL(new RegExp("mesa=" + mesaId + "$"));
  await expect(page.getByRole("button", { name: "Jugar As de espadas" })).toBeEnabled();
  expect(bot).toBe(true);
  await expect(page.getByRole("group", { name: "Tanteador" }).getByText("0 malas", { exact: true })).toHaveCount(2);
  if (process.env.CAPTURAS_UI)
    await page.screenshot({
      path: process.env.CAPTURAS_UI + "/duelo-" + test.info().project.name + ".jpg",
      quality: 80,
      fullPage: true,
      scale: "css",
    });
  expect(sockets.length).toBeGreaterThan(0);
  const truco = page.getByRole("button", { name: "Truco", exact: true });
  await truco.focus();
  await truco.press("Enter");
  await expect(page.getByRole("heading", { name: "Ganaste la mano" })).toBeFocused();
  await expect(page.getByText("1 mala", { exact: true })).toBeVisible();
  expect(comando.accion).toEqual({ tipo: "truco" });
  expect(comando.version).toBe(1);
  expect(comando.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  await page.getByRole("button", { name: "Repartir otra mano" }).click();
  await expect(page.getByText("Mano 2", { exact: true })).toBeVisible();
  const historial = page.getByRole("region", { name: "Historial de la mano", exact: true });
  await expect(historial).toBeVisible();
  await expect(historial.getByText("Todavía no hay jugadas.")).toBeVisible();
  await expect(historial.getByRole("listitem")).toHaveCount(0);
  await expect(historial.locator("summary")).toHaveCount(0);
  await page.getByRole("button", { name: "Jugar As de espadas" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Turno de CPU 1" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(2);
});

for (const [caso, cantos] of [
  ["la flor de salida en duelo", ["flor"]],
  ["la flor seguida de dos declaraciones en parejas", ["flor", "paso-flor", "paso-flor"]],
  ["el rechazo del envido sin que nadie cante flor", ["envido", "no-quiero", "paso-flor"]],
]) {
  test("la declaración muestra el contexto de " + caso, async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
    const duelo = cantos.length === 1;
    const conFlor = cantos[0] === "flor";
    const asientos = ["Ana", "Computadora 2", "Clara", "Diego"].slice(0, duelo ? 2 : 4)
      .map((nombre, i) => seat(i, i === 0 ? "humano" : "computadora", nombre));
    const manos = [
      ["oros-05", "copas-12", "bastos-11"],
      conFlor ? ["copas-01", "copas-04", "copas-06"] : ["oros-04", "copas-04", "bastos-06"],
      ["espadas-07", "oros-03", "bastos-04"],
      ["oros-06", "copas-07", "bastos-03"],
    ];
    let estado = iniciarOnline({ versionReparto: "online-1", mano: 1, dador: 0,
      muestra: "espadas-04", manos: manos.slice(0, asientos.length) });
    function confirmarCanto(tipo, asiento) {
      const paso = aplicarOnline(estado, { tipo, asiento });
      expect(paso.ok).toBe(true);
      estado = paso.estado;
    }
    cantos.forEach((tipo, i) => confirmarCanto(tipo, i + 1));
    await simular(page, (path, req) => {
      if (path.endsWith("/" + mesaId)) return { json: mesa(duelo ? "1v1" : "2v2", asientos) };
      if (path.endsWith("/acciones")) {
        expect(req.postDataJSON().accion).toEqual({ tipo: "paso-flor" });
        confirmarCanto("paso-flor", 0);
      }
      if (path.endsWith("/partida") || path.endsWith("/acciones"))
        return { json: { ...partida, version: estado.acciones.length, puntos: marcadorOnline(estado), vista: vistaOnline(estado, 0) } };
    });
    await page.goto("jugar/?mesa=" + mesaId);
    const panel = page.locator(".j-jugada-panel");
    const respuesta = panel.getByRole("button", { name: "Sin flor", exact: true });
    const estadoDelTurno = panel.getByRole("status");
    const anuncio = estadoDelTurno.getByText(/Computadora 2 cantó flor/i);
    const historial = page.getByRole("region", { name: "Historial de la mano", exact: true });
    await expect(respuesta).toBeEnabled();
    await expect(historial).toBeVisible();
    await expect(historial.getByRole("listitem")).toHaveCount(cantos.length);
    await expect(historial.getByRole("listitem").first()).toHaveText(conFlor ? "Computadora 2 dijo «Flor»." : "Computadora 2 dijo «Envido».");
    await expect(historial.locator("summary")).toHaveCount(0);
    if (conFlor) {
      await expect(anuncio).toBeVisible();
      const cajaAnuncio = await anuncio.boundingBox();
      const cajaRespuesta = await respuesta.boundingBox();
      expect(cajaAnuncio.y + cajaAnuncio.height).toBeLessThanOrEqual(cajaRespuesta.y);
      if (isMobile) {
        await respuesta.scrollIntoViewIfNeeded();
        await expect(anuncio).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      }
    } else {
      await expect(estadoDelTurno).not.toContainText(/cantó flor/i);
    }
    if (duelo && process.env.CAPTURAS_UI) await panel.screenshot({
      path: process.env.CAPTURAS_UI + "/flor-de-salida-" + test.info().project.name + ".png", scale: "css",
    });
    await respuesta.press("Enter");
    await expect(respuesta).toHaveCount(0);
    await expect(anuncio).toHaveCount(0);
    await expect(historial.getByRole("listitem")).toContainText([/Ana dijo «Sin flor»/]);
    if (duelo) {
      await page.reload();
      await expect(historial.getByRole("listitem")).toContainText([/Computadora 2 dijo «Flor»/, /Ana dijo «Sin flor»/]);
    }
  });
}

test("la entrega en duelo deja el cobro y el historial visibles al volver a la mesa", async ({ page }) => {
  const rival = seat(1, "computadora", "Computadora 2");
  const fin = confirmarComputadora(restaurar(dueloMazo, "duel"), "duel", 1, "oros-07");
  await simular(page, (path) => {
    if (path.endsWith("/" + mesaId)) return { json: mesa("1v1", [personas[0], rival]) };
    if (path.endsWith("/partida")) return { json: { ...partida, manoNumero: 5,
      vista: vistaOnline(fin.estado, 0), puntos: [2, 1] } };
  });
  await page.goto("jugar/?mesa=" + mesaId);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ganaste la mano" })).toBeVisible();
  await expect(page.getByText("Computadora 2 se fue al mazo. Se anotaron 2 tantos.")).toBeVisible();
  const historial = page.getByRole("region", { name: "Historial de la mano", exact: true });
  await expect(historial.getByRole("listitem")).toHaveCount(3);
  await expect(historial.getByRole("listitem").last()).toHaveText("Computadora 2 se fue al mazo.");
  await historial.locator("summary").filter({ hasText: /anteriores/i }).press("Enter");
  await expect(historial.getByRole("listitem")).toHaveCount(8);
  await expect(historial).not.toContainText(/7 de oros|as de bastos/i);
  await expect(page.getByRole("button", { name: "Repartir otra mano" })).toBeEnabled();
  if (process.env.CAPTURAS_MAZO)
    await historial.screenshot({ path: process.env.CAPTURAS_MAZO + "/mazo-" + test.info().project.name + ".png" });
});

test("Ana responde al bluff sobre su flor antes de abrir la segunda vuelta", async ({ page }) => {
  const rival = seat(1, "computadora", "Computadora 2");
  let mano = restaurar(dueloFlor, "duel", 40, [0]);
  let version = 5;
  const sockets = await simular(page, (path, req) => {
    if (path.endsWith("/" + mesaId)) return { json: mesa("1v1", [personas[0], rival]) };
    if (path.endsWith("/acciones")) {
      expect(req.postDataJSON().accion).toEqual({ tipo: "quiero" });
      mano = jugarComputadoras(confirmar(mano, "duel", { tipo: "quiero", asiento: 0 }), "duel", [0]);
      version++;
    }
    if (path.endsWith("/partida") || path.endsWith("/acciones"))
      return { json: { ...partida, manoNumero: 4, version, vista: vistaOnline(mano.estado, 0),
        puntos: [mano.estado.resultado ? 16 : 14, 0] } };
  });
  await page.goto("jugar/?mesa=" + mesaId);
  await expect(page.getByRole("heading", { name: "Turno de Computadora 2" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Tus cartas" }).getByRole("button").first()).toBeDisabled();
  mano = confirmarComputadora(mano, "duel", 1, "truco");
  version++;
  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  sockets.at(-1).send(JSON.stringify({ tipo: "actualizar" }));
  await page.getByRole("button", { name: "Quiero", exact: true }).press("Enter");
  await page.reload();
  await expect(page.getByText("Computadora 2 se fue al mazo. Se anotaron 2 tantos.")).toBeVisible();
  const historial = page.getByRole("region", { name: "Historial de la mano", exact: true });
  await expect(historial.getByRole("listitem")).toHaveCount(3);
  await expect(historial.getByRole("listitem").last()).toHaveText("Computadora 2 se fue al mazo.");
  await historial.locator("summary").filter({ hasText: /anteriores/i }).press("Enter");
  await expect(historial.getByRole("listitem")).toHaveCount(7);
  await expect(historial.getByRole("listitem").filter({ hasText: "jugó" })).toHaveCount(2);
  if (process.env.CAPTURAS_MAZO)
    await historial.screenshot({ path: process.env.CAPTURAS_MAZO + "/flor-mazo-" + test.info().project.name + ".png", scale: "css" });
});

for (const entrada of ["crear la mesa", "completar la sala de espera"]) {
  test("muestra las salidas de las computadoras en orden al " + entrada + " y al día al retomarla", async ({ page }) => {
    const desdeSala = entrada === "completar la sala de espera";
    const computadora = i => seat(i, "computadora", "CPU " + i);
    const asientos = [personas[0], ...[1, 2, 3].map(i =>
      desdeSala && i < 3 ? computadora(i) : seat(i, "vacio", null)
    )];
    const jugadas = ["copas-06", "bastos-04", "oros-05"].map((carta, i) => ({ carta, asiento: i + 1 }));
    const mano = {
      ...vista, mano: 1, dador: 0,
      acciones: jugadas.map(j => ({ tipo: "carta", ...j })),
      vueltaActual: { salida: 1, jugadas },
    };
    let recibida = { ...partida, vista: mano };
    const sockets = await simular(page, (path, req) => {
      if (path.endsWith("/computadoras")) {
        const { asiento } = req.postDataJSON();
        asientos[asiento] = computadora(asiento);
      }
      if (path === "/api/mesas" || path.endsWith("/" + mesaId)) return { json: mesa("2v2", asientos) };
      if (path.endsWith("/partida")) return { json: recibida };
    });
    await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
    if (desdeSala) {
      await page.goto("jugar/?mesa=" + mesaId);
      await expect(page.getByRole("heading", { name: "Esperando jugadores" })).toBeVisible();
      const agregar = page.getByRole("button", { name: "Agregar computadora al asiento 4" });
      await expect(agregar).toBeEnabled();
      await agregar.press("Enter");
    } else {
      await page.goto("jugar/");
      await page.getByRole("button", { name: "Jugar con computadoras" }).press("Enter");
    }
    const cartas = page.getByRole("region", { name: "Tapete" }).locator(".j-jugada img");
    const jugar = page.getByRole("button", { name: "Jugar As de espadas" });
    const jugadasVisibles = page.getByRole("region", { name: "Historial de la mano", exact: true }).getByRole("listitem");
    for (const [i, nombre] of ["6 de copas", "4 de bastos", "5 de oros"].entries()) {
      await expect(cartas).toHaveCount(i + 1);
      await expect(jugadasVisibles).toHaveCount(i + 1);
      await expect(jugadasVisibles.last()).toHaveText(asientos[i + 1].nombre + " jugó " + nombre + ".");
      const nueva = cartas.nth(i);
      await expect(nueva).toHaveAttribute("alt", nombre);
      if (i < 2) {
        await expect(jugar).toBeDisabled();
        await nueva.evaluate(img => img.decode());
        await page.clock.runFor(450);
      }
    }
    await expect(jugar).toBeEnabled();
    await page.reload();
    await expect(cartas).toHaveCount(3);
    await expect(jugar).toBeEnabled();

    // Si el aviso posterior trae otra mano sin su cierre anterior, el tanteador parte del estado recibido.
    const siguientes = jugadas.slice(1);
    recibida = {
      ...partida, manoNumero: 2, version: 7, puntos: [2, 3],
      vista: {
        ...mano, mano: 2, dador: 1,
        acciones: siguientes.map(j => ({ tipo: "carta", ...j })),
        vueltaActual: { salida: 2, jugadas: siguientes },
      },
    };
    sockets.at(-1).send(JSON.stringify({ tipo: "actualizar" }));
    await expect(page.getByText("Mano 2", { exact: true })).toBeVisible();
    await expect(cartas).toHaveCount(2);
    await expect(jugadasVisibles).toHaveCount(2);
    await expect(jugar).toBeEnabled();
    await expect(page.locator(".j-tanteador strong")).toHaveText(["2", "3"]);
  });
}

for (const modo of ["1v1", "2v2"]) {
  test(`el chico a 40 cuenta las malas y buenas por lado en ${modo}`, async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
    const asientos = modo === "1v1" ? personas.slice(0, 2) : personas;
    let puntos = [19, 19];
    const sockets = await simular(page, (path) => {
      if (path.endsWith("/" + mesaId)) return { json: mesa(modo, asientos, 1) };
      if (path.endsWith("/partida")) return { json: { ...partida, puntos, vista: { ...vista, asiento: 1 } } };
    });
    await page.goto("jugar/?mesa=" + mesaId);
    const marcador = page.getByRole("group", { name: "Tanteador" });
    const propio = marcador.getByRole("group", { name: modo === "1v1" ? "Vos" : "Tu equipo" });
    const rival = marcador.getByRole("group", { name: modo === "1v1" ? "Tu rival" : "Rivales" });
    await expect(marcador.getByText("Chico a 40")).toBeVisible();
    await expect(marcador.getByText("20 malas y 20 buenas")).toBeVisible();
    await expect(propio.getByText("19 malas")).toBeVisible();
    for (const [total, cuenta] of [[20, "0 buenas"], [21, "1 buena"]]) {
      puntos = [19, total];
      sockets.at(-1).send(JSON.stringify({ tipo: "actualizar" }));
      await expect(propio.locator("strong")).toHaveText(String(total));
      await expect(propio.getByText(cuenta)).toBeVisible();
      await expect(rival.getByText("19 malas")).toBeVisible();
    }
    if (process.env.CAPTURAS_UI)
      await marcador.screenshot({ path: `${process.env.CAPTURAS_UI}/tanteador-${modo}-${test.info().project.name}.png` });
  });
}

test("reserva la invitación para el ingreso y recupera la pareja con un canto pendiente", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 780 });
  let anon = true,
    joined = 0;
  const misAsientos = [personas[0], personas[1], seat(2, "humano", "Clara"), personas[3]];
  const mano = {
    ...vista,
    asiento: 2,
    turno: 1,
    legales: ["quiero", "no-quiero", "real-envido", "falta-envido"],
    acciones: [
      { tipo: "truco", asiento: 0 },
      { tipo: "envido", asiento: 1 },
    ],
    pendiente: { tipo: "envido", asiento: 1 },
    trucoPendiente: { tipo: "truco", asiento: 0 },
    apuesta: "pendiente",
  };
  await simular(page, (path) => {
    if (path === "/api/jugador")
      return anon ? { status: 401, json: { error: "Ingresá" } } : { json: { id: "clara", nombre: "Clara" } };
    if (path.endsWith("/unirse")) {
      joined++;
      return { json: mesa("2v2", misAsientos, 2) };
    }
    if (path.endsWith("/" + mesaId)) return { json: mesa("2v2", misAsientos, 2) };
    if (path.endsWith("/partida")) return { json: { ...partida, vista: mano } };
  });
  await page.goto("jugar/?invitacion=" + token);
  await expect(page.getByRole("heading", { name: "Te invitaron a una mesa" })).toBeVisible();
  await expect(page.locator('input[name="volver"]')).toHaveValue("/jugar/?invitacion=" + token);
  anon = false;
  await page.reload();
  await expect(page.getByRole("button", { name: "Real envido", exact: true })).toBeEnabled();
  expect(joined).toBe(1);
  await expect(page.getByRole("group", { name: "Tu pareja · Ana", exact: true })).toBeVisible();
  await expect(page.getByText("Queda pendiente el truco de Ana.")).toBeVisible();
  const [frente, muestra, naipes] = await Promise.all(
    [".j-frente", ".j-muestra", ".j-mano"].map((sel) => page.locator(sel).boundingBox()),
  );
  expect(frente.y + frente.height).toBeLessThanOrEqual(muestra.y);
  expect(muestra.y + muestra.height).toBeLessThanOrEqual(naipes.y);
  if (process.env.CAPTURAS_UI)
    await page.screenshot({
      path: process.env.CAPTURAS_UI + "/parejas-" + test.info().project.name + ".jpg",
      quality: 80,
      fullPage: true,
      scale: "css",
    });
  await expect(page.getByRole("button", { name: "Jugar As de espadas" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Quiero", exact: true })).toBeEnabled();
  expect(joined).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("reintenta una sesión temporalmente indisponible sin perder la invitación", async ({ page }) => {
  let consultas = 0;
  let ingresos = 0;
  const lugares = [personas[0], personas[1], seat(2, "humano", "Clara"), seat(3, "vacio", null)];
  await simular(page, (path) => {
    if (path === "/api/jugador") {
      consultas++;
      return consultas === 1
        ? { status: 503, json: { error: "Servicio temporalmente indisponible." } }
        : { json: { id: "clara", nombre: "Clara" } };
    }
    if (path === "/api/invitaciones/" + token + "/unirse") ingresos++;
    return { json: mesa("2v2", lugares, 2) };
  });
  await page.goto("jugar/?invitacion=" + token);
  await expect(page.getByRole("alert")).toHaveText("Servicio temporalmente indisponible.");
  await expect(page).toHaveURL(new RegExp("invitacion=" + token + "$"));
  expect(ingresos).toBe(0);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page).toHaveURL(new RegExp("mesa=" + mesaId + "$"));
  await expect(page.getByText("Clara · Vos")).toBeVisible();
  expect(ingresos).toBe(1);
});

test("crea un lugar para tres amigos y completa un asiento puntual", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    Object.defineProperty(document, "execCommand", { value: undefined, configurable: true });
  });
  let lugares = [personas[0], ...[1, 2, 3].map((n) => seat(n, "vacio", null))];
  let jugador = yo;
  const sockets = await simular(page, (path, req) => {
    if (path === "/api/jugador") return { json: jugador };
    if (path === "/api/mesas") expect(req.postDataJSON()).toEqual({ modo: "2v2" });
    if (path.endsWith("/computadoras")) {
      expect(req.postDataJSON()).toEqual({ asiento: 2 });
      lugares[2] = seat(2, "computadora", "CPU 1");
    }
    return { json: mesa("2v2", lugares) };
  });
  await page.goto("jugar/");
  await page.getByRole("button", { name: "Crear mesa", exact: true }).click();
  await expect(page.getByText("Faltan 3 jugadores para repartir.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Enlace de invitación" })).toHaveValue(
    new RegExp(token + "$"),
  );
  await page.getByRole("button", { name: "Copiar invitación" }).click();
  await expect(page.getByText("Enlace seleccionado. Copialo para compartirlo.")).toBeVisible();
  await expect(page.getByLabel("Enlace de invitación")).toBeFocused();
  await page.getByRole("button", { name: "Agregar computadora al asiento 3" }).click();
  await expect(page.getByText("Faltan 2 jugadores para repartir.")).toBeVisible();
  lugares[1] = personas[1];
  sockets.at(-1).send(JSON.stringify({ tipo: "actualizar" }));
  await expect(page.getByText("Falta un jugador para repartir.")).toBeVisible();
  await page.getByRole("link", { name: "Volver al salón" }).click();
  await expect(page.getByRole("link", { name: "Volver a mi mesa" })).toHaveAttribute(
    "href",
    new RegExp(mesaId + "$"),
  );
  jugador = { id: "bruno", nombre: "Bruno" };
  await page.reload();
  await expect(page.getByRole("button", { name: "Crear mesa", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver a mi mesa" })).toHaveCount(0);
});

test("recupera el marcador al reconectar y cierra la partida por envido", async ({ page }) => {
  let mano = { ...partida, puntos: [38, 39] };
  let leerDeNuevo;
  const corte = new Promise((resolve) => {
    leerDeNuevo = resolve;
  });
  let interrumpida = false;
  const sockets = await simular(page, async (path, req) => {
    if (path.endsWith("/" + mesaId)) return { json: mesa("2v2", personas) };
    if (path.endsWith("/partida")) {
      if (interrumpida) await corte;
      return { json: mano };
    }
    if (path.endsWith("/acciones")) {
      expect(req.postDataJSON().accion).toEqual({ tipo: "quiero" });
      mano = {
        ...mano,
        version: 3,
        puntos: [40, 39],
        ganadorPartida: 0,
        vista: {
          ...vista,
          legales: [],
          turno: null,
          resultado: { equipo: 0, tantos: 2, motivo: "envido" },
          cobros: [{ equipo: 0, tantos: 2, motivo: "envido", asiento: 2, tantoGanador: 33 }],
        },
      };
      return { json: mano };
    }
  });
  await page.goto("jugar/?mesa=" + mesaId);
  const carta = page.getByRole("button", { name: "Jugar As de espadas" });
  await expect(carta).toBeEnabled();
  interrumpida = true;
  sockets.at(-1).close();
  await expect(page.getByText("Reconectando con tu mesa…")).toBeVisible();
  await expect(carta).toBeDisabled();
  mano = {
    ...mano,
    version: 2,
    vista: { ...vista, legales: ["quiero", "no-quiero"], pendiente: { tipo: "envido", asiento: 1 } },
  };
  leerDeNuevo();
  await page.getByRole("button", { name: "Quiero", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ganaste la partida" })).toBeVisible();
  const marcador = page.getByRole("group", { name: "Tanteador" });
  await expect(marcador.locator("strong")).toHaveText(["40", "39"]);
  await expect(marcador.getByText("20 buenas", { exact: true })).toBeVisible();
  await expect(marcador.getByText("19 buenas", { exact: true })).toBeVisible();
  await expect(page.getByText("Tu equipo · 2 tantos")).toBeVisible();
  await expect(page.getByText(/CPU 1 con 33/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Repartir otra mano" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Crear otra mesa" })).toBeVisible();
});
