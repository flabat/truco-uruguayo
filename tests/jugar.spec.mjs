import { test, expect } from "@playwright/test";

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
  expect(comando.accion).toEqual({ tipo: "truco" });
  expect(comando.version).toBe(1);
  expect(comando.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  await page.getByRole("button", { name: "Repartir otra mano" }).click();
  await expect(page.getByText("Mano 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Jugar As de espadas" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Turno de CPU 1" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Tus cartas" }).getByRole("button")).toHaveCount(2);
});

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
  await expect(page.getByText("Tu equipo · 2 tantos")).toBeVisible();
  await expect(page.getByText(/CPU 1 con 33/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Repartir otra mano" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Crear otra mesa" })).toBeVisible();
});
