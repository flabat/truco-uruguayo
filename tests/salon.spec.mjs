import { expect, test } from "@playwright/test";

const id = "00000000-0000-4000-8000-000000000232";
const anterior = "00000000-0000-4000-8000-000000000017";
const directorio = "/api/salon/mesas";
const destino = "/jugar/?mirar=" + id;
const humana = {
  id, modo: "2v2", formato: "pairs-private-senas", origen: "humana", humanos: 2,
  computadoras: 2, manoNumero: 3, puntos: [12, 8], meta: 40, ultimaActividad: "2026-11-20T12:00:00Z",
};
const exhibicion = {
  ...humana, id: "00000000-0000-4000-8000-000000000018", modo: "1v1", formato: "duel",
  origen: "exhibicion", humanos: 0, computadoras: 2, manoNumero: 1, puntos: [0, 0],
};
const jugadas = [{ asiento: 0, carta: "espadas-01" }, { asiento: 1, carta: "oros-07" }];
function detalle(cantidad, estado = "en-juego") {
  const jugadasVisibles = jugadas.slice(0, cantidad);
  return {
    ...humana, estado,
    asientos: ["Jugador 1", "Computadora 2", "Jugador 3", "Computadora 4"].map((nombre, asiento) => ({
      nombre, asiento, tipo: asiento % 2 ? "computadora" : "humano", equipo: asiento % 2,
    })),
    puntos: estado === "terminada" ? [40, 8] : humana.puntos,
    tablero: {
      dador: 3, mano: 0, muestra: "copas-12", vueltas: [], valorTruco: 1,
      vueltaActual: { salida: 0, jugadas: jugadasVisibles }, turnoDeCartas: cantidad,
      acciones: jugadasVisibles.map(j => ({ ...j, tipo: "carta" })), cobros: [], resultado: null,
    },
  };
}

async function servicio(page) {
  const estado = { sesion: true, listado: [humana, exhibicion], errorLista: 0, errorMesa: 0, cantidad: 0, estadoMesa: "en-juego" };
  const etiquetas = [];
  const privadas = [];
  const sockets = [];
  page.on("websocket", ws => sockets.push(ws.url()));
  await page.route("**/api/**", async route => {
    const req = route.request();
    const ruta = new URL(req.url()).pathname;
    if (ruta === "/api/jugador") return route.fulfill({ status: estado.sesion ? 200 : 401, json: { id: "ana", nombre: "Ana", salonHabilitado: true } });
    if (req.method() !== "GET" || ![directorio, directorio + "/" + id].includes(ruta)) {
      privadas.push(req.method() + " " + ruta);
      return route.fulfill({ status: 403, json: {} });
    }
    const lista = ruta === directorio;
    const error = lista ? estado.errorLista : estado.errorMesa;
    if (error) return route.fulfill({ status: error, json: { error: "No disponible" } });
    const tag = lista ? '"lista-' + estado.listado.length + '"' : '"' + estado.cantidad + estado.estadoMesa + '"';
    const previa = req.headers()["if-none-match"];
    if (!lista) etiquetas.push(previa);
    if (previa === tag) return route.fulfill({ status: 304, headers: { ETag: tag } });
    const datos = lista ? { mesas: estado.listado } : detalle(estado.cantidad, estado.estadoMesa);
    return route.fulfill({ headers: { ETag: tag }, json: { ...datos, versionPublica: tag.slice(1, -1) } });
  });
  return { estado, etiquetas, privadas, sockets };
}

async function captura(page, nombre) {
  if (process.env.CAPTURAS_SALON) {
    const alto = await page.locator("article.juego").evaluate(el => Math.ceil(el.getBoundingClientRect().bottom + scrollY));
    await page.screenshot({
      clip: { x: 0, y: 0, width: page.viewportSize().width, height: alto }, fullPage: true,
      path: process.env.CAPTURAS_SALON + "/" + nombre + "-" + test.info().project.name + ".jpg",
      type: "jpeg", quality: 80, scale: "css", animations: "disabled",
    });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("desde el salón sigue dos jugadas por teclado y conserva su asiento anterior", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  const { estado, etiquetas, privadas, sockets } = await servicio(page);
  await page.addInitScript(id => {
    if (!sessionStorage.getItem("preparada")) {
      localStorage.setItem("truco.ultima-mesa.ana", id);
      sessionStorage.setItem("preparada", "1");
    }
  }, anterior);
  await page.goto("/jugar/");
  const salon = page.getByRole("region", { name: "Mesas en juego" });
  await expect(salon.getByText("2 personas y 2 computadoras")).toBeVisible();
  await expect(salon.getByText(/Solo computadoras/)).toBeVisible();
  await captura(page, "salon");
  const mirar = salon.getByRole("listitem").filter({ hasText: "2 personas y 2 computadoras" }).getByRole("button", { name: "Mirar mesa" });
  await mirar.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(destino);
  await expect(page.getByRole("heading", { name: "Estás mirando" })).toBeFocused();
  const historial = page.getByRole("region", { name: "Historial de la mano" });
  await expect(historial).toContainText("Todavía no hay jugadas");
  estado.cantidad = 1;
  const entradas = historial.getByRole("listitem");
  await expect(entradas).toHaveText(["Jugador 1 jugó as de espadas."]);
  estado.cantidad = 2;
  await expect(entradas).toHaveText(["Jugador 1 jugó as de espadas.", /Computadora 2 jugó .* de oros\./]);
  await expect.poll(() => etiquetas.filter(v => v === '"2en-juego"').length).toBeGreaterThan(0);
  await expect(entradas).toHaveCount(2);
  await captura(page, "visor");
  await expect(page.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /seña/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Jugar |Truco$|Repartir)/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Volver a mi mesa" })).toBeVisible();
  const volver = page.getByRole("button", { name: "Volver al salón" });
  await volver.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/jugar/");
  await expect(page.getByRole("heading", { name: "Mesas en juego" })).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("truco.ultima-mesa.ana"))).toBe(anterior);
  expect(privadas).toEqual([]);
  expect(sockets).toEqual([]);
});

test("el enlace conserva el regreso al ingresar y descarta el tablero al vencer la sesión", async ({ page }) => {
  const { estado, privadas } = await servicio(page);
  estado.sesion = false;
  await page.goto(destino);
  const volver = page.locator('form[action="/api/auth/login"] input[name="volver"]');
  await expect(volver).toHaveValue(destino);
  await page.route("**/api/auth/login?*", route => {
    const regreso = new URL(route.request().url()).searchParams.get("volver");
    expect(regreso).toBe(destino);
    estado.sesion = true;
    return route.fulfill({ status: 302, headers: { Location: regreso } });
  });
  await page.getByRole("button", { name: "Ingresar al juego" }).click();
  await expect(page.getByRole("group", { name: "Tanteador" })).toBeVisible();
  estado.errorMesa = 401;
  await expect(volver).toHaveValue(destino);
  await expect(page.getByRole("group", { name: "Tanteador" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("truco.ultima-mesa.ana"))).toBeNull();
  expect(privadas).toEqual([]);
});

test("recupera el directorio vacío tras un error y ofrece crear mesa", async ({ page }) => {
  const { estado } = await servicio(page);
  estado.errorLista = 503;
  await page.goto("/jugar/");
  const reintentar = page.getByRole("button", { name: "Reintentar" });
  await expect(reintentar).toBeVisible();
  estado.errorLista = 0;
  estado.listado = [];
  await reintentar.press("Enter");
  await expect(page.getByText(/Todavía no hay mesas en juego/)).toBeVisible();
  await page.getByRole("button", { name: "Crear mi mesa" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Crear una mesa" })).toBeVisible();
});

test("un corte permite reintentar y la pérdida de visibilidad retira la mesa", async ({ page }) => {
  const { estado } = await servicio(page);
  await page.goto(destino);
  const marcador = page.getByRole("group", { name: "Tanteador" });
  await expect(marcador).toBeVisible();
  estado.errorMesa = 503;
  const reintentar = page.getByRole("button", { name: "Reintentar" });
  await expect(reintentar).toBeVisible();
  estado.errorMesa = 0;
  estado.cantidad = 1;
  await reintentar.press("Enter");
  await expect(page.getByRole("region", { name: "Historial de la mano" })).toContainText("Jugador 1 jugó as de espadas");
  estado.errorMesa = 404;
  await expect(page.getByText("Esta mesa ya no está disponible en el salón.")).toBeVisible();
  await expect(marcador).toHaveCount(0);
});

for (const [estadoMesa, titulo] of [["terminada", "Partida terminada"], ["interrumpida", "Partida interrumpida"]]) {
  test("muestra la partida " + estadoMesa + " al abrir un enlace", async ({ page }) => {
    const { estado } = await servicio(page);
    estado.estadoMesa = estadoMesa;
    await page.goto(destino);
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    await expect(page.getByRole("button", { name: "Volver al salón" })).toBeVisible();
  });
}

test("con el salón apagado se crea en privado y el enlace de espectador no abre un asiento", async ({ page }) => {
  const solicitudes = [];
  let jugador = { id: "ana", nombre: "Ana" }; // También puede responder una API anterior al despliegue.
  let creacion;
  await page.route("**/api/**", route => {
    const req = route.request();
    const ruta = new URL(req.url()).pathname;
    solicitudes.push([req.method(), ruta]);
    if (ruta === "/api/jugador") return route.fulfill({ json: jugador });
    if (ruta === "/api/modalidades") return route.fulfill({ json: { modos: ["1v1", "2v2"] } });
    if (ruta === "/api/mesas" && req.method() === "POST") creacion = req.postDataJSON();
    return route.fulfill({ status: 503, json: { error: "Mesa de prueba" } });
  });
  await page.goto("/jugar/");
  await expect(page.getByRole("heading", { name: "Crear una mesa" })).toBeVisible();
  await expect(page.getByText("Mostrar en el salón")).toHaveCount(0);
  await page.getByRole("button", { name: "Crear mesa", exact: true }).click();
  await expect.poll(() => creacion?.modo).toBe("2v2");
  expect(creacion.publica ?? false).toBe(false);
  expect(solicitudes.some(([, ruta]) => ruta.startsWith(directorio))).toBe(false);

  jugador = { ...jugador, salonHabilitado: false };
  solicitudes.length = 0;
  await page.goto(destino);
  await expect(page.getByText(/no está disponible para mirar/)).toBeVisible();
  expect(solicitudes).toEqual([["GET", "/api/jugador"]]);
});

test("el salón pausa la consulta en segundo plano y revalida una sola vez al volver", async ({ page }) => {
  const etiquetas = [];
  const siguiente = Promise.withResolvers();
  await page.clock.install();
  await page.route("**/api/jugador", r => r.fulfill({ json: { id: "ana", nombre: "Ana", salonHabilitado: true } }));
  await page.route("**" + directorio, async route => {
    etiquetas.push(route.request().headers()["if-none-match"]);
    if (etiquetas.length === 1) {
      return route.fulfill({ headers: { ETag: '"primera"' }, json: { mesas: [humana] } });
    }
    await siguiente.promise;
    return route.fulfill({ headers: { ETag: '"segunda"' }, json: { mesas: [exhibicion] } });
  });
  await page.goto("/jugar/");
  await expect(page.getByText("2 personas y 2 computadoras")).toBeVisible();
  const cambiarVisibilidad = oculta => page.evaluate(valor => {
    Object.defineProperty(document, "hidden", { configurable: true, value: valor });
    document.dispatchEvent(new Event("visibilitychange"));
  }, oculta);
  await cambiarVisibilidad(true);
  await page.clock.fastForward(30_000);
  expect(etiquetas).toHaveLength(1);
  await cambiarVisibilidad(false);
  await expect.poll(() => etiquetas).toEqual([undefined, '"primera"']);
  await cambiarVisibilidad(false);
  await page.clock.fastForward(30_000);
  expect(etiquetas).toHaveLength(2);
  siguiente.resolve();
  await expect(page.getByText("Exhibición · Solo computadoras")).toBeVisible();
  await expect(page.getByText("2 personas y 2 computadoras")).toHaveCount(0);
});
