// Desde el host, contra la web del stack descartable: la mesa nueva de la app (/jugar/mesa) jugada en Chromium
// con la API, PostgreSQL y el proveedor de identidad locales. Cada jugada sale de tocar la mesa (una carta,
// un botón de la hoja de Cantos, «Dejar jugar», «Repartir otra mano»); la API dice a quién le toca y qué es
// legal. También tercetos (redondilla y pico a pico), el visor de espectador y la mesa de escritorio con
// atajos de teclado, las animaciones con reducir movimiento y el modo liviano guardado. Con `CAPTURAS_MESA`
// guarda capturas a 375 × 760, 360 × 640 y 1280 × 800.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect as expectBase } from "@playwright/test";
import { canto } from "@eltruco/cliente/cantos.ts";
import { nombrar } from "@eltruco/cliente/textos.ts";
import { aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { florAlMazo } from "../tests/fixtures/duelo-mazo.ts";
import { reparto as repartoConFlores } from "../tests/fixtures/flor-querida.ts";
import { mesaDe } from "../tests/unit/fixtures/app-mesa.ts";
import { ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const web = process.argv[2];
const casos = process.argv.slice(3);
const capturas = process.env.CAPTURAS_MESA;
if (capturas) mkdirSync(capturas, { recursive: true });
const browser = await chromium.launch();
const espera = { timeout: 25_000 };
// Con la máquina cargada, la mesa tarda más de los 5 s predeterminados en asentarse (por ejemplo, la hoja al
// cambiar el tamaño de la pantalla): toda aserción espera el estado real hasta el mismo plazo que `espera`.
const expect = expectBase.configure(espera);
const boton = (p, name) => p.getByRole("button", { name, exact: true });
const titulo = (p, name) => p.getByRole("heading", { level: 1, name, exact: true });
const movil = { width: 375, height: 760 };
const minima = { width: 360, height: 640 };
const escritorio = { width: 1280, height: 800 };
const cartasEnMano = p => p.locator('[data-testid^="carta-"]');

async function pagina(viewport = movil, opciones = {}) {
  const context = await browser.newContext({ baseURL: web, viewport, ...opciones });
  const p = await context.newPage();
  p.setDefaultTimeout(25_000);
  return p;
}

async function capturar(p, nombre, { asentar = true } = {}) {
  if (!capturas) return;
  // El reparto y la hoja se animan: la captura espera a que se asienten, salvo la que quiere el movimiento.
  if (asentar) await p.waitForTimeout(1_200);
  await p.screenshot({ path: join(capturas, nombre + ".png") });
}

async function api(p, ruta) {
  const r = await p.request.get(ruta);
  assert.equal(r.status(), 200, ruta + " · " + r.status());
  return r.json();
}

const partida = (p, id) => api(p, `/api/mesas/${id}/partida`);

async function entrar(usuario, viewport, opciones) {
  const p = await pagina(viewport, opciones);
  await p.goto("/jugar/");
  await expect(titulo(p, "Entrá a jugar")).toBeVisible(espera);
  await boton(p, "Ingresar").click();
  await ingresarDesdeIdentidad(p, usuario);
  await expect(titulo(p, "Mesas en juego")).toBeVisible(espera);
  return p;
}

async function crearMesa(p, modalidad, computadoras, meta = 30) {
  await boton(p, "Crear mesa").click();
  await expect(titulo(p, "Crear una mesa")).toBeVisible();
  await p.getByRole("radio", { name: new RegExp("^" + modalidad) }).click();
  await p.getByRole("textbox", { name: "Tantos para ganar el chico" }).fill(String(meta));
  await boton(p, computadoras ? "Jugar con computadoras" : "Crear mesa").click();
}

/** Abre la mesa en juego: la ruta, la mesa nueva y el lienzo de CanvasKit. */
async function enLaMesa(p) {
  await p.waitForURL(/\/jugar\/mesa\?id=[a-f0-9-]{36}$/, espera);
  await expect(p.getByTestId("mesa")).toBeVisible(espera);
  await expect(p.locator('[data-testid="mesa"] canvas')).toBeVisible(espera);
  return new URL(p.url()).searchParams.get("id");
}

/** eva crea la mesa entre personas y los invitados ocupan su asiento por el enlace. */
async function mesaConInvitados(anfitrion, modalidad, invitados, asientosDeComputadora = []) {
  await crearMesa(anfitrion, modalidad, false);
  await anfitrion.waitForURL(/\/jugar\/sala\//, espera);
  const enlace = await anfitrion.getByRole("textbox", { name: "Enlace de invitación" }).inputValue();
  for (const p of invitados) {
    await p.goto(enlace);
    await boton(p, "Ocupar mi asiento").click();
    await p.waitForURL(/\/jugar\/(sala|mesa)/, espera);
  }
  for (const asiento of asientosDeComputadora) await boton(anfitrion, `Agregar computadora al asiento ${asiento}`).click();
  const ids = await Promise.all([anfitrion, ...invitados].map(enLaMesa));
  assert.ok(ids.every(id => id === ids[0]));
  return ids[0];
}

const esAccion = r => /\/api\/mesas\/[^/]+\/(acciones|siguiente|indicaciones)$/.test(new URL(r.url()).pathname)
  && r.request().method() === "POST";

/**
 * Toca un control hasta que la mesa lo envía. Mientras la mesa presenta lo último que pasó, la jugada se
 * rechaza sin enviarse; si ya se envió (la versión cambió), no se repite. Una indicación al pie puede llegar
 * tarde, cuando la vuelta ya avanzó: el servidor la rechaza con 409.
 */
async function tocar(p, id, control, version) {
  return intentar(p, id, async () => (await control()).click({ timeout: 3_000 }).then(() => true, () => false), version);
}

/** Como `tocar`, con un atajo de teclado del escritorio. */
async function teclear(p, id, tecla, version) {
  return intentar(p, id, () => p.keyboard.press(tecla).then(() => true), version);
}

const esPedidoDeAccion = r => /\/api\/mesas\/[^/]+\/(acciones|siguiente|indicaciones)$/.test(new URL(r.url()).pathname)
  && r.method() === "POST";

/**
 * Anota el pedido que sale de la página, no la respuesta: con la máquina cargada la respuesta puede tardar
 * más que cualquier plazo corto, y una indicación al pie no cambia la versión de la mano. Si se la perdiera,
 * la prueba volvería a tocar un control que ya no está hasta agotar los intentos.
 */
async function intentar(p, id, hacer, version) {
  let enviado = null;
  const anotar = r => { if (!enviado && esPedidoDeAccion(r)) enviado = r; };
  p.on("request", anotar);
  try {
    for (let intento = 0; intento < 20 && !enviado; intento++) {
      if (await hacer()) await expect.poll(() => enviado !== null, { timeout: 3_000 }).toBe(true).catch(() => {});
      if (!enviado && (await partida(p, id)).version !== version) return;
    }
  } finally {
    p.off("request", anotar);
  }
  if (!enviado) assert.fail("La mesa no envió la jugada");
  const ruta = new URL(enviado.url()).pathname;
  const r = await enviado.response();
  assert.ok(r, ruta + " · el pedido falló: " + enviado.failure()?.errorText);
  const indicacion = ruta.endsWith("/indicaciones");
  assert.ok(r.status() === 200 || (indicacion && r.status() === 409), ruta + " · " + await r.text());
}

/**
 * El botón de un canto: la hoja sube sola al responder o declarar; si no, se abre desde «Cantos». La hoja
 * forzada sube en el efecto siguiente al cambio, así que el botón «Cantos» puede verse un instante antes.
 */
async function cantoEnHoja(p, nombre) {
  const opcion = boton(p, nombre);
  const cantos = boton(p, "Cantos");
  for (let intento = 0; intento < 15; intento++) {
    if (await opcion.isVisible()) return opcion;
    if (await cantos.isVisible()) await cantos.click({ timeout: 2_000 }).catch(() => {});
    await opcion.waitFor({ state: "visible", timeout: 1_500 }).catch(() => {});
  }
  return opcion;
}

const basicas = ["flor", "paso-flor", "quiero", "carta"];
// Querer una falta envido o una contraflor al resto puede cerrar el chico, y las pruebas necesitan repartir otra.
const alResto = ["falta-envido", "contraflor-al-resto"];
async function jugarTurno(p, id, m, preferencias = basicas) {
  const rechazar = alResto.includes(m.vista.pendiente?.tipo) && m.vista.legales.includes("no-quiero");
  const tipo = rechazar ? "no-quiero" : preferencias.find(t => m.vista.legales.includes(t));
  if (!tipo) return false;
  const control = tipo === "carta" ? () => cartasEnMano(p).first()
    : () => cantoEnHoja(p, tipo === "mazo" ? "Irme al mazo" : canto[tipo]);
  await tocar(p, id, control, m.version);
  return true;
}

/** Con frases del pie a la vista, toca «Dejar jugar» y el compañero computadora juega solo. */
async function dejarJugar(p, id, m) {
  if (!m.pie || m.pie.pie !== m.vista.asiento || m.pie.esperando === undefined) return false;
  await expect(p.getByTestId("frases-pie")).toBeVisible(espera);
  await tocar(p, id, () => boton(p.getByTestId("frases-pie"), "Dejar jugar"), m.version);
  return true;
}

/**
 * Avanza la mano tocando la mesa en la página a la que le toca, hasta que la API cumple `hasta`. Con
 * `antes`, mira cada página en un momento quieto: cuando a esa página le toca, las computadoras esperan.
 */
async function avanzar(paginas, id, hasta, { antes, preferencias, pasos = 200 } = {}) {
  for (let n = 0; n < pasos; n++) {
    const manos = await Promise.all(paginas.map(p => partida(p, id)));
    if (hasta(manos[0])) return manos[0];
    assert.ok(!manos[0].vista.resultado, "Terminó la mano antes de lo esperado");
    let jugo = false;
    for (const [i, p] of paginas.entries()) {
      const m = manos[i];
      const quieta = m.vista.legales.length > 0 || (m.pie?.pie === m.vista.asiento && m.pie.esperando !== undefined);
      if (!quieta) continue;
      if (antes) await antes(p, m);
      jugo = (await dejarJugar(p, id, m)) || (await jugarTurno(p, id, m, preferencias));
      if (jugo) break;
    }
    if (!jugo) await paginas[0].waitForTimeout(300);
  }
  assert.fail("La mano no avanzó");
}

const terminada = m => Boolean(m.vista.resultado);

async function probarDueloConComputadora() {
  const luis = await entrar("luis");
  await crearMesa(luis, "1 contra 1", true);
  const id = await enLaMesa(luis);
  await expect(luis.getByLabel("Tanteador")).toContainText("Vos", espera);

  // Dos toques rápidos con la red lenta: sale una sola jugada y la otra carta vuelve a la mano.
  let m = await avanzar([luis], id, x => x.vista.legales.includes("carta") && !x.vista.pendiente);
  await expect(boton(luis, "Cantos")).toBeVisible(espera);
  await expect(cartasEnMano(luis)).toHaveCount(3, espera);
  await capturar(luis, "duelo-375x760");
  const enviadas = [];
  let respondida = false;
  luis.on("request", r => { if (/\/acciones$/.test(r.url()) && r.method() === "POST") enviadas.push(r.postDataJSON()); });
  luis.on("response", r => {
    if (/\/acciones$/.test(r.url()) && r.request().method() === "POST") respondida = true;
  });
  // La ruta confirma que el primer toque envió la jugada y la retiene hasta después del segundo.
  let primeraRetenida;
  let soltar;
  const retenida = new Promise(listo => { soltar = listo; });
  await luis.route("**/acciones", async r => {
    if (r.request().method() !== "POST") return r.continue();
    primeraRetenida ??= r.request();
    await retenida;
    await r.continue();
  });
  const lugar = async carta => {
    const caja = await carta.boundingBox();
    return caja && { x: Math.round(caja.x), y: Math.round(caja.y) };
  };
  const [primeraId, segundaId] = await cartasEnMano(luis).evaluateAll(cs => cs.map(c => c.dataset.testid));
  assert.notEqual(primeraId, segundaId, "se tocan dos cartas distintas");
  const primera = luis.getByTestId(primeraId);
  const segunda = luis.getByTestId(segundaId);
  try {
    // La API puede dar el turno antes de que la mesa termine de presentarlo. Repetimos solo la
    // primera carta hasta interceptar su POST, antes de tocar la otra por primera vez.
    await expect(async () => {
      if (!primeraRetenida) await primera.click();
      await expect.poll(() => Boolean(primeraRetenida), { timeout: 1_000 }).toBe(true);
    }).toPass(espera);
    assert.equal("carta-" + primeraRetenida.postDataJSON().accion?.carta, primeraId, "sale la carta del primer toque");
    assert.equal(enviadas.length, 1, "el primer toque envió una sola carta");
    const antes = await lugar(segunda);
    assert.ok(antes, "la segunda carta tiene lugar en la mano");
    await segunda.click();
    assert.equal(respondida, false, "el segundo toque terminó antes de la respuesta del primero");
    await expect.poll(() => lugar(segunda), espera).toEqual(antes);
  } finally {
    soltar();
  }
  await expect.poll(() => respondida, espera).toBe(true);
  await luis.unroute("**/acciones");
  assert.equal(enviadas.length, 1, "dos toques rápidos envían una sola carta: " + JSON.stringify(enviadas));
  const tras = await partida(luis, id);
  const propias = tras.vista.acciones.filter(a => a.tipo === "carta" && a.asiento === tras.vista.asiento);
  assert.equal(propias.length, m.vista.acciones.filter(a => a.tipo === "carta" && a.asiento === m.vista.asiento).length + 1);
  await expect(cartasEnMano(luis)).toHaveCount(2, espera);

  m = await avanzar([luis], id, terminada);
  await expect(boton(luis, "Repartir otra mano")).toBeVisible(espera);
  await tocar(luis, id, () => boton(luis, "Repartir otra mano"), m.version);
  await expect.poll(async () => (await partida(luis, id)).manoNumero, espera).toBe(2);
  await luis.setViewportSize(minima);
  await expect(luis.getByTestId("mesa")).toBeVisible();
  await capturar(luis, "duelo-360x640");
  await luis.context().close();
  console.log("1v1 con computadora en la mesa nueva: cartas tocadas, doble toque con una sola jugada, fin de mano y otra mano.");
}

async function probarEnvido() {
  const eva = await entrar("eva");
  const diego = await entrar("diego");
  const id = await mesaConInvitados(eva, "1 contra 1", [diego]);
  const paginas = [eva, diego];
  const mesa = await api(eva, "/api/mesas/" + id);
  for (let mano = 1; mano <= 5; mano++) {
    const manos = await Promise.all(paginas.map(p => partida(p, id)));
    const i = manos.findIndex(m => m.vista.legales.includes("envido"));
    if (i === -1 || manos.some(m => m.vista.tantosPropios.modalidad === "flor")) {
      // Con flor el envido no se responde con «Quiero»: se van al mazo y se reparte otra.
      const fin = await avanzar(paginas, id, terminada, { preferencias: ["mazo", ...basicas] });
      await tocar(eva, id, () => boton(eva, "Repartir otra mano"), fin.version);
      await expect.poll(async () => (await partida(eva, id)).manoNumero, espera).toBe(fin.manoNumero + 1);
      continue;
    }
    const [canta, responde] = i === 0 ? [eva, diego] : [diego, eva];
    await tocar(canta, id, () => cantoEnHoja(canta, "Envido"), manos[i].version);
    const encabezado = `${mesa.asientos[manos[i].vista.asiento].nombre} tocó envido`;
    // La hoja lleva el encabezado como nombre; el estado sobre el paño repite el mismo título.
    const hoja = responde.getByLabel(encabezado, { exact: true });
    await expect(hoja.getByRole("heading", { name: encabezado, exact: true })).toBeVisible(espera);
    await expect(boton(hoja, "Quiero")).toBeVisible();
    await expect(boton(hoja, "No quiero")).toBeVisible();
    await capturar(responde, "hoja-respuesta-375x760");
    // En la pantalla mínima la mano sigue a la vista por encima de la hoja.
    await responde.setViewportSize(minima);
    await expect(boton(hoja, "Quiero")).toBeInViewport();
    await expect(cartasEnMano(responde).first()).toBeInViewport();
    await capturar(responde, "hoja-respuesta-360x640");
    // La hoja forzada no ofrece cerrarse: ni el asa ni el paño, ni Escape en el escritorio. Q responde «Quiero».
    await expect(responde.getByLabel("Cerrar la hoja", { exact: true })).toHaveCount(0);
    await responde.setViewportSize(escritorio);
    await expect(responde.getByTestId("panel-mano")).toBeVisible(espera);
    await responde.keyboard.press("Escape");
    await responde.waitForTimeout(500);
    await expect(boton(hoja, "Quiero")).toBeVisible();
    const pendiente = await partida(responde, id);
    assert.deepEqual(pendiente.vista.pendiente, { tipo: "envido", asiento: manos[i].vista.asiento });
    const respuestas = [];
    responde.on("request", r => { if (/\/acciones$/.test(r.url()) && r.method() === "POST") respuestas.push(r.postDataJSON()); });
    await teclear(responde, id, "q", pendiente.version);
    assert.deepEqual(respuestas.map(r => r.accion?.tipo), ["quiero"], "Q envía «Quiero»");
    assert.ok(!(await partida(responde, id)).vista.pendiente, "Q quiso el envido");
    const cobrada = await avanzar(paginas, id, m => terminada(m) || m.vista.cobros.some(c => c.motivo === "envido"));
    const fin = terminada(cobrada) ? cobrada : await avanzar(paginas, id, terminada);
    assert.ok(fin.vista.cobros.some(c => c.motivo === "envido"), JSON.stringify(fin.vista.cobros));
    await Promise.all(paginas.map(p => p.context().close()));
    console.log(`1v1 entre personas: envido tocado desde Cantos, hoja de respuesta forzada y cobro (mano ${mano}).`);
    return;
  }
  assert.fail("En 5 manos nadie pudo tocar envido");
}

/** Reproduce los cinco movimientos del reporte #451 sobre la app exportada usando la vista del árbitro. */
async function probarFlorAlMazo() {
  const p = await pagina(minima);
  let mesa = { ...mesaDe("1v1", 0, 40), id: "00000000-0000-4000-8000-000000000451" };
  mesa.asientos[1].tipo = "computadora";
  let estado = iniciarOnline(florAlMazo.reparto, [8, 11], 40);
  function aplicar(accion) {
    const siguiente = aplicarOnline(estado, accion);
    assert.ok(siguiente.ok, JSON.stringify(accion));
    estado = siguiente.estado;
  }
  florAlMazo.acciones.slice(0, 3).forEach(aplicar);
  // La página entra al turno de Ana y recibe las dos jugadas juntas, como al contestar la computadora.
  await p.route("**/api/jugador", r => r.fulfill({ json: { id: "j0", nombre: "Ana" } }));
  await p.route("**/api/mesas/*", r => r.fulfill({ json: mesa }));
  await p.route("**/api/mesas/*/partida", r => r.fulfill({ json: {
    version: estado.acciones.length, manoNumero: 6, puntos: marcadorOnline(estado), meta: mesa.meta,
    ganadorPartida: null, vista: vistaOnline(estado, mesa.miAsiento),
  } }));
  await p.routeWebSocket("**/api/mesas/*/vivo", () => {});
  await p.route("**/api/mesas/*/acciones", async r => {
    const { accion } = r.request().postDataJSON();
    assert.deepEqual({ ...accion, asiento: 0 }, florAlMazo.acciones[3]);
    aplicar(florAlMazo.acciones[3]);
    aplicar(florAlMazo.acciones[4]);
    await r.fulfill({ json: {} });
  });
  await p.goto("/jugar/mesa?id=" + mesa.id);
  const fin = p.getByTestId("fin-de-mano");
  await expect(p.getByRole("heading", { name: "Tu turno", exact: true })).toBeVisible();
  await expect(p.getByText("Reconectando…", { exact: true })).toHaveCount(0);
  await expect(fin).toHaveCount(0);
  for (const carta of florAlMazo.reparto.manos[1].slice(1)) await expect(p.getByRole("img", { name: nombrar(carta) })).toHaveCount(0);
  await p.getByTestId("carta-copas-02").click();
  const verificarPrueba = async () => {
    await expect(fin.getByText("Diego · Flor · 30 tantos", { exact: true })).toBeVisible();
    await expect(fin.getByRole("img")).toHaveCount(3);
    for (const carta of florAlMazo.reparto.manos[1]) {
      await expect(fin.getByRole("img", { name: nombrar(carta), exact: true })).toBeInViewport();
    }
    await expect(boton(fin, "Repartir otra mano")).toBeInViewport();
    await expect(p.getByLabel("Tanteador")).toContainText("9 · 14");
  };
  await verificarPrueba();
  await capturar(p, "flor-al-mazo-360x640");
  await p.reload();
  await verificarPrueba();

  // En parejas, Clara y Ana cantan flor antes de rechazar el truco de Diego.
  mesa = { ...mesaDe("2v2", 2, 40), id: "00000000-0000-4000-8000-000000000452" };
  const reparto = { ...repartoConFlores, reglaFlor: "inmediata-v2",
    manos: [...repartoConFlores.manos.slice(0, 3), ["espadas-03", "espadas-06", "oros-07"]] };
  estado = iniciarOnline(reparto, [0, 0], mesa.meta);
  for (const [asiento, tipo] of [[1, "truco"], [0, "flor"], [2, "flor"], [0, "no-quiero"]]) aplicar({ asiento, tipo });
  await p.goto("/jugar/mesa?id=" + mesa.id);
  for (const ancho of [minima, escritorio]) {
    await p.setViewportSize(ancho);
    await expect(fin.getByText("Clara · Flor · 32 tantos", { exact: true })).toBeVisible();
    await expect(fin.getByText("Ana · Flor · 30 tantos", { exact: true })).toBeVisible();
    await expect(fin.getByRole("img")).toHaveCount(6);
    for (const carta of [...reparto.manos[0], ...reparto.manos[2]]) {
      await expect(fin.getByRole("img", { name: nombrar(carta), exact: true })).toBeInViewport();
    }
    await expect(boton(fin, "Repartir otra mano")).toBeInViewport();
  }
  await capturar(p, "collera-1280x800");
  await p.context().close();
  console.log("Flor sin oposición: tres cartas en el cierre por mazo y al recargar, con tanteador 9–14.");
}

async function probarParejasConPie() {
  const luis = await entrar("luis");
  let id, yo, companero;
  const nuevaMesa = async () => {
    await crearMesa(luis, "2 contra 2", true);
    id = await enLaMesa(luis);
    const mesa = await api(luis, "/api/mesas/" + id);
    yo = mesa.miAsiento;
    companero = mesa.asientos.find(a => a.asiento !== yo && a.equipo === mesa.asientos[yo].equipo).asiento;
  };
  await nuevaMesa();
  let globos = 0;
  let pildoras = 0;
  let pedidos = 0;
  const mirar = async (p, m) => {
    if (!m.pie) return;
    if (m.pie.pie === yo) {
      const grupo = m.pie.grupos.find(g => g.emisor === companero);
      if (grupo?.gestos.length) {
        await expect(p.getByTestId("globo-senas-" + companero)).toBeVisible(espera);
        if (globos++ === 0) await capturar(p, "parejas-globo-375x760");
      }
    } else if (m.pie.grupos.some(g => g.emisor === yo)) {
      // Si el pie ya le habló en esta vuelta y no tiró, la frase reemplaza a la píldora junto a la mano (#425).
      const pedido = (m.indicaciones ?? []).some(i => i.emisor === m.pie.pie && i.destinatario === yo && i.vuelta === m.pie.vuelta)
        && !m.vista.vueltaActual?.jugadas.some(j => j.asiento === yo);
      await expect(p.getByTestId(pedido ? "pedido-del-pie" : "pildora-senas")).toBeVisible(espera);
      if (pedido && pedidos++ === 0) await capturar(p, "parejas-pedido-375x760");
      pildoras++;
    }
  };
  // Una mano entera; si luis no fue el pie o su compañero no le hizo señas, se reparte otra hasta ver el
  // globo. El pie del equipo cambia con el dador (luis lo es en dos de cada cuatro manos) y una mano corta
  // puede terminar sin señas: hasta 8 manos.
  for (let mano = 1; mano <= 8; mano++) {
    const fin = await avanzar([luis], id, terminada, { antes: mirar });
    if (globos > 0) break;
    if (fin.ganadorPartida !== null) {
      // Si el chico terminó antes, se sigue en una mesa nueva.
      await boton(luis, "Crear otra mesa").click();
      await expect(titulo(luis, "Crear una mesa")).toBeVisible(espera);
      await luis.goto("/jugar/");
      await expect(titulo(luis, "Mesas en juego")).toBeVisible(espera);
      await nuevaMesa();
      continue;
    }
    await tocar(luis, id, () => boton(luis, "Repartir otra mano"), fin.version);
    await expect.poll(async () => (await partida(luis, id)).manoNumero, espera).toBe(fin.manoNumero + 1);
  }
  assert.ok(globos > 0, "luis vio el globo con las señas de su compañero");
  await luis.context().close();
  console.log(`2v2 con tres computadoras: globo del pie (${globos}) y píldora de señas (${pildoras}), con frase del pie (${pedidos}).`);
}

/** Las cartas de la mano de izquierda a derecha, como las juegan los atajos 1, 2 y 3. */
async function manoEnOrden(p) {
  const cartas = await cartasEnMano(p).evaluateAll(cs => cs.map(c => ({ id: c.dataset.testid, x: c.getBoundingClientRect().x })));
  return cartas.sort((a, b) => a.x - b.x).map(c => c.id);
}

/** Anota en `window.vistos` cada testid de la lista que aparece en la página, aunque dure un instante. */
async function observar(p, selector) {
  await p.evaluate(selector => {
    window.vistos = [];
    const revisar = () => {
      for (const el of document.querySelectorAll(selector)) window.vistos.push(el.dataset.testid);
    };
    revisar();
    new MutationObserver(revisar).observe(document.body, { childList: true, subtree: true });
  }, selector);
}

// Los casos nuevos juegan con luis: después de esta prueba, eva pide la baja (verificar-baja-ingreso.mjs) y sus
// mesas empezadas pasan a jugarlas las computadoras. Un chico de tercetos a 100 entre computadoras ocuparía el
// trabajador con turnos de mesas humanas y frenaría las exhibiciones de las pruebas siguientes.
async function probarTercetos() {
  const luis = await entrar("luis");
  const { modos } = await api(luis, "/api/modalidades");
  assert.ok(modos.includes("3v3"),
    "La pila no ofrece 3 contra 3 a luis: Tercetos tiene que estar habilitado para todos (lo hace verificar-gestion.mjs). Modalidades: " + modos.join(", "));
  // A 100 tantos, el segundo reparto es pico a pico salvo que alguien llegue a 50 en la primera redondilla
  // (una falta envido querida): entonces se prueba en otra mesa.
  for (let mesa = 1; ; mesa++) {
    assert.ok(mesa <= 3, "En 3 mesas nunca hubo pico a pico");
    if (await tercetosConPico(luis)) break;
    await luis.goto("/jugar/");
    await expect(titulo(luis, "Mesas en juego")).toBeVisible(espera);
  }
  await luis.context().close();
}

/** Una mesa de tercetos hasta el fin del pico a pico; false si la redondilla no dejó jugarlo. */
async function tercetosConPico(luis) {
  await crearMesa(luis, "3 contra 3", true, 100);
  const id = await enLaMesa(luis);
  let m = await partida(luis, id);
  assert.equal(m.formato, "triples");
  assert.equal(m.lance.tipo, "redondilla");
  await expect(luis.getByTestId("etiqueta-lance")).toHaveText(/^Reparto 1 · Redondilla · Vuelta \d$/, espera);
  // Un truco no querido o una flor de las computadoras puede cerrar el reparto antes de que luis juegue.
  await expect.poll(async () => await cartasEnMano(luis).count() === 3 || await luis.getByTestId("fin-de-mano").isVisible(), espera)
    .toBe(true);
  await capturar(luis, "tercetos-redondilla-375x760");
  // Cuando le toca, juega sus cartas tocándolas. Un mazo o un truco no querido pueden cerrar el reparto antes.
  const fin = await avanzar([luis], id, terminada, { pasos: 400 });
  await expect(luis.getByTestId("fin-de-mano")).toContainText("Tantos de este reparto", espera);
  // Al terminar el reparto, cada lance (la redondilla o los tres duelos) ya está en el historial.
  const cartasPropias = x => x.historialLances.flatMap(l => l.acciones)
    .filter(a => a.tipo === "carta" && a.asiento === x.vista.asiento).length;
  let jugadas = cartasPropias(fin);
  if (Math.max(...fin.puntos) >= 50) return false;
  // Mientras otros duelos se presentan, el estado narra cada jugada: el aviso del duelo propio puede durar
  // poco. Un observador lo anota aunque dure un instante. Se instala antes de repartir: con la máquina
  // cargada, el aviso puede aparecer y pasar antes de que la prueba vea la etiqueta del pico a pico.
  await luis.evaluate(() => {
    window.avisosDeDuelo = new Set();
    const revisar = () => {
      for (const aviso of document.body.innerText.match(/Te toca en el duelo \d de 3\./g) ?? []) window.avisosDeDuelo.add(aviso);
    };
    revisar();
    new MutationObserver(revisar).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const avisos = () => luis.evaluate(() => [...window.avisosDeDuelo]);
  assert.deepEqual(await avisos(), [], "la redondilla no anuncia duelos");
  await tocar(luis, id, () => boton(luis, "Repartir otra mano"), fin.version);
  await expect.poll(async () => (await partida(luis, id)).manoNumero, espera).toBe(2);

  // Pico a pico: tres duelos; mientras espera el suyo, luis ve en qué duelo le toca y la mesa no juega.
  m = await partida(luis, id);
  assert.equal(m.lance.tipo, "pico-a-pico");
  await expect(luis.getByTestId("etiqueta-lance")).toHaveText(/^Pico a pico · Duelo \d de 3$/, espera);
  let esperoSuDuelo = false;
  let jugoSuDuelo = false;
  // Los duelos salen de la mano: el 1 lo abre la mano y su frente, el 2 el siguiente, y así.
  const dueloPropio = 1 + ((m.vista.asiento - m.vista.mano + 6) % 3);
  for (let paso = 0; ; paso++) {
    assert.ok(paso < 400, "El pico a pico no avanzó");
    m = await partida(luis, id);
    if (terminada(m)) {
      jugadas += cartasPropias(m);
      break;
    }
    const activa = m.lance.activos.includes(m.vista.asiento);
    if (!activa && m.vista.estado === "esperando" && !esperoSuDuelo) {
      if (dueloPropio > m.lance.duelo) {
        await expect.poll(avisos, espera).toContain(`Te toca en el duelo ${dueloPropio} de 3.`);
        await capturar(luis, "tercetos-pico-375x760");
        // Quien espera su duelo no tiene cartas: el servidor se las manda al abrirse su duelo.
        // La mesa presenta detrás de la API: si la API sigue antes de su duelo, la mesa también.
        const cartasEnEspera = await cartasEnMano(luis).count();
        if ((await partida(luis, id)).lance.duelo < dueloPropio) assert.equal(cartasEnEspera, 0, "quien espera su duelo no tiene cartas");
        esperoSuDuelo = true;
        continue;
      }
    }
    if (activa && m.vista.legales.includes("carta")) jugoSuDuelo = true;
    if (!(await jugarTurno(luis, id, m))) await luis.waitForTimeout(300);
  }
  assert.ok(esperoSuDuelo || jugoSuDuelo, "luis esperó o jugó su duelo");
  // Nunca anuncia otro duelo que el propio, ni en el primero. Si la prueba vio a luis esperar su duelo, el
  // aviso tuvo que aparecer. La mesa solo lo muestra cuando no está presentando una jugada (modelo.ts): si
  // la API pasó esa espera entre dos lecturas, los duelos anteriores pudieron presentarse de corrido hasta el
  // de luis sin mostrarlo. Aun así, nunca con otro número.
  const propio = dueloPropio > 1 ? [`Te toca en el duelo ${dueloPropio} de 3.`] : [];
  const vistos = await avisos();
  if (esperoSuDuelo || dueloPropio === 1) assert.deepEqual(vistos, propio);
  else assert.ok(vistos.every(aviso => propio.includes(aviso)), "solo anuncia el duelo propio: " + JSON.stringify(vistos));
  assert.ok(jugadas > 0, "luis jugó cartas tocándolas");
  // Si luis jugó el primer duelo, la mesa le presenta los otros dos a su ritmo: la tarjeta llega más tarde que la API.
  await expect(luis.getByTestId("fin-de-mano")).toContainText("Tantos de este reparto", { timeout: 90_000 });
  console.log(`3v3 con cinco computadoras: redondilla, pico a pico (luis en el duelo ${dueloPropio} de 3), ${jugadas} cartas tocadas y tantos del reparto.`);
  return true;
}

async function probarEspectador() {
  // Las cuatro cuentas esperan nuestras jugadas hasta que Clara esté mirando desde otra sesión.
  const jugadores = [];
  for (const usuario of ["luis", "ana", "bruno", "diego"]) jugadores.push(await entrar(usuario));
  const id = await mesaConInvitados(jugadores[0], "2 contra 2", jugadores.slice(1));
  const clara = await entrar("clara");
  await clara.goto(`/jugar/mirar/${id}`);
  await expect(clara.getByTestId("mesa")).toBeVisible(espera);
  await expect(clara.locator('[data-testid="mesa"] canvas')).toBeVisible(espera);
  await expect(clara.getByText("👁 Mirando", { exact: true })).toBeVisible(espera);
  await expect(boton(clara, "Volver al salón")).toBeVisible();
  // El tanteador nombra a cada pareja con los nombres del salón.
  const { asientos, meta } = await api(clara, "/api/salon/mesas/" + id);
  const pareja = e => asientos.filter(a => a.equipo === e).map(a => a.nombre).join(" y ");
  // Entre las piezas del tanteador van espacios duros (\u00a0): `\s` los acepta.
  const tanteador = `^${pareja(0)} \\d+ · \\d+ ${pareja(1)} · a ${meta}$`.replaceAll(" ", "\\s");
  await expect(clara.getByLabel("Tanteador")).toHaveText(new RegExp(tanteador), espera);
  // Una mano entera: el espectador nunca tiene cartas propias ni Cantos, y el estado sigue la mano.
  await observar(clara, '[data-testid^="carta-"]');
  const mesa = clara.getByTestId("mesa");
  await expect(mesa.getByText("Se repartieron las cartas.", { exact: true })).toBeVisible(espera);
  const fin = await avanzar(jugadores, id, terminada);
  // La API puede terminar antes de que el visor presente la última jugada.
  const ganador = fin.vista.resultado.equipo + 1;
  await expect(mesa.getByText(`El equipo ${ganador} ganó la mano.`, { exact: true })).toBeVisible(espera);
  assert.deepEqual(await clara.evaluate(() => window.vistos), [], "el espectador vio cartas para tocar");
  await expect(boton(clara, "Cantos")).toHaveCount(0);
  await capturar(clara, "espectador-375x760");
  await boton(clara, "Volver al salón").click();
  await expect(titulo(clara, "Mesas en juego")).toBeVisible(espera);
  await Promise.all([...jugadores, clara].map(p => p.context().close()));
  console.log("Espectador con la mesa nueva: 👁 Mirando, tanteador con las parejas, sin cartas ni Cantos, y vuelta al salón.");
}

async function probarEscritorio() {
  const luis = await entrar("luis", escritorio);
  await crearMesa(luis, "1 contra 1", true);
  const id = await enLaMesa(luis);
  await expect(luis.getByTestId("panel-mano")).toBeVisible(espera);
  await expect(luis.getByTestId("panel-tantos")).toBeVisible();
  await expect(luis.getByRole("tab")).toHaveCount(0);
  await expect(boton(luis, "Más")).toHaveCount(0);

  // C abre la hoja de Cantos propia y Escape la cierra.
  const m = await avanzar([luis], id, x => x.vista.legales.includes("carta") && !x.vista.pendiente);
  await expect(cartasEnMano(luis)).toHaveCount(3, espera);
  const hoja = luis.getByLabel("Cantos", { exact: true });
  // Con algún canto legal (o irse al mazo) está la hoja de Cantos.
  const abrioCantos = m.vista.legales.some(t => t !== "carta");
  if (abrioCantos) {
    await expect(boton(luis, "Cantos")).toBeVisible(espera);
    await expect(async () => {
      await luis.keyboard.press("c");
      await expect(hoja).toBeVisible({ timeout: 1_000 });
    }).toPass(espera);
    await capturar(luis, "escritorio-cantos-1280x800");
    await luis.keyboard.press("Escape");
    await expect(hoja).toHaveCount(0);
  }
  await capturar(luis, "escritorio-1280x800");

  // Tocar un interruptor del panel (un checkbox en la web) deja el foco ahí: los atajos siguen andando.
  const sonido = luis.getByRole("switch", { name: "Sonido" });
  await expect(sonido).toBeChecked();
  await sonido.click();
  await expect(sonido).toBeFocused();
  // El interruptor es el de la 4e: apaga las voces y lo recuerda en `truco.sonido`.
  await expect(sonido).not.toBeChecked();
  assert.equal(await luis.evaluate(() => localStorage.getItem("truco.sonido")), "0");

  // «1» y enseguida «2»: sale una sola jugada, la de la primera carta de la izquierda.
  const enviadas = [];
  luis.on("request", r => { if (/\/acciones$/.test(r.url()) && r.method() === "POST") enviadas.push(r.postDataJSON()); });
  const orden = await manoEnOrden(luis);
  for (let intento = 0; enviadas.length === 0 && intento < 20; intento++) {
    await luis.keyboard.press("1");
    await luis.keyboard.press("2");
    await luis.waitForTimeout(1_500);
    if (enviadas.length === 0) assert.equal((await partida(luis, id)).version, m.version, "la mesa jugó sin enviar");
  }
  assert.equal(enviadas.length, 1, "1 y 2 seguidos envían una sola carta: " + JSON.stringify(enviadas));
  assert.equal("carta-" + enviadas[0].accion?.carta, orden[0], "el 1 juega la carta de la izquierda");
  await expect(cartasEnMano(luis)).toHaveCount(2, espera);
  await luis.waitForTimeout(1_000);
  assert.equal(enviadas.length, 1);
  await luis.context().close();
  console.log(`Escritorio 1v1: paneles sin tira, ${abrioCantos ? "C abre Cantos y Escape la cierra, " : ""}tras tocar Sonido, 1 y 2 seguidos juegan una sola carta.`);
}

/** luis abandona un duelo contra la computadora desde «Más», confirma y vuelve al salón; la mesa ya no lo recibe. */
async function probarAbandono() {
  const luis = await entrar("luis");
  await crearMesa(luis, "1 contra 1", true);
  const id = await enLaMesa(luis);
  // En su turno sin canto por responder no hay hoja forzada que tape «Más».
  await avanzar([luis], id, x => x.vista.legales.includes("carta") && !x.vista.pendiente && x.vista.porDeclararFlor === null);
  await boton(luis, "Más").click();
  await expect(luis.getByTestId("hoja-mas")).toBeVisible(espera);
  await boton(luis, "Abandonar la partida").click();
  await expect(luis.getByTestId("confirmar-abandono"))
    .toContainText("Vas a perder esta partida y quedará como Abandonada en tu historial.");
  await expect(luis.getByTestId("confirmar-abandono")).not.toContainText("Una computadora va a jugar tu lugar.");
  await capturar(luis, "abandono-375x760");
  await boton(luis, "Seguir jugando").click();
  await expect(luis.getByTestId("confirmar-abandono")).toHaveCount(0);
  await boton(luis, "Abandonar la partida").click();
  await boton(luis, "Abandonar").click();
  await expect(titulo(luis, "Mesas en juego")).toBeVisible(espera);
  const lectura = await luis.request.get(`/api/mesas/${id}/partida`);
  assert.equal(lectura.status(), 409);
  assert.equal((await lectura.json()).error, "Abandonaste esta partida.");
  // Volver por el enlace muestra el motivo del servidor y la salida al salón.
  await luis.goto(`/jugar/mesa?id=${id}`);
  await expect(luis.getByText("Abandonaste esta partida.")).toBeVisible(espera);
  await boton(luis, "Volver al salón").click();
  await expect(titulo(luis, "Mesas en juego")).toBeVisible(espera);
  await luis.context().close();
  console.log("Abandono desde la mesa: confirmación, vuelta al salón y 409 con el motivo al volver.");
}

/**
 * Duelo entre eva y luis: a quien le toca se le cierra la página. El rival ve «Esperando a …» con la cuenta
 * y, al vencer el plazo corto de la pila, cobra la partida; el fin dice que el otro se desconectó.
 */
async function probarEsperaYCobro() {
  const eva = await entrar("eva");
  const luis = await entrar("luis", escritorio);
  const id = await mesaConInvitados(eva, "1 contra 1", [luis]);
  const mesa = await api(eva, "/api/mesas/" + id);
  const paginas = [eva, luis];
  let manos;
  await expect.poll(async () => {
    manos = await Promise.all(paginas.map(p => partida(p, id)));
    return manos.filter(m => m.vista.legales.length > 0).length;
  }, espera).toBe(1);
  const i = manos.findIndex(m => m.vista.legales.length > 0);
  const [sale, queda] = i === 0 ? [eva, luis] : [luis, eva];
  const nombre = mesa.asientos[manos[i].vista.asiento].nombre;
  await sale.context().close();
  const aviso = queda.getByTestId("aviso-espera-" + manos[i].vista.asiento);
  await expect(aviso).toContainText(`Esperando a ${nombre}…`, espera);
  await expect(boton(queda, "Cobrar la partida")).toBeVisible(espera);
  await expect(boton(queda, "Seguir esperando")).toBeVisible();
  await capturar(queda, "espera-" + (queda === luis ? "1280x800" : "375x760"));
  await boton(queda, "Seguir esperando").click();
  await expect(aviso).toHaveCount(0);
  // Ocultado no vuelve hasta el minuto: el cobro se prueba recargando la mesa, que olvida lo ocultado.
  await queda.reload();
  await boton(queda, "Cobrar la partida").click();
  await expect(queda.getByTestId("fin-de-mano")).toContainText(`${nombre} se desconectó.`, espera);
  await expect(queda.getByTestId("fin-de-mano")).toContainText("Ganaste la partida");
  await expect(boton(queda, "Crear otra mesa")).toBeVisible();
  await capturar(queda, "cobro-" + (queda === luis ? "1280x800" : "375x760"));
  await queda.context().close();
  console.log(`Duelo entre personas: ${nombre} se desconectó, el rival vio la cuenta, siguió esperando y cobró la partida.`);
}

/** El interruptor «Modo liviano» de la hoja Más (en el teléfono, el ☰ de la barra). */
async function abrirModoLiviano(p) {
  await boton(p, "Más").click();
  await expect(p.getByTestId("hoja-mas")).toBeVisible(espera);
  return p.getByRole("switch", { name: "Modo liviano" });
}

async function cerrarHoja(p) {
  await boton(p, "Cerrar la hoja").first().click();
  await expect(p.getByTestId("hoja-mas")).toHaveCount(0, espera);
}

/**
 * luis juega una mano 1 contra 1 con la computadora hasta la tarjeta del fin de mano y reparte otra. La
 * tarjeta, el tanteador y la mano nueva tienen que llegar igual con animaciones o sin ellas. `enElFin` corre
 * con la tarjeta a la vista: después de repartir, un canto de la computadora puede subir una hoja forzada
 * que no deja abrir Más.
 */
async function dueloHastaElFin(luis, sufijo, enElFin = async () => {}) {
  await crearMesa(luis, "1 contra 1", true);
  const id = await enLaMesa(luis);
  const fin = await avanzar([luis], id, terminada);
  await expect(luis.getByTestId("fin-de-mano")).toBeVisible(espera);
  await expect(boton(luis, "Repartir otra mano")).toBeVisible(espera);
  const { puntos, vista } = await partida(luis, id);
  const equipo = vista.asiento % 2;
  // El tanteador termina en los tantos de la API, aunque cuente de a uno.
  await expect(luis.getByLabel("Tanteador"))
    .toHaveText(new RegExp(`\\s${puntos[equipo]}\\s·\\s${puntos[1 - equipo]}\\s`), espera);
  await capturar(luis, "fin-de-mano-" + sufijo);
  await enElFin(id);
  const repartida = luis.waitForResponse(r => esAccion(r) && r.status() === 200, espera);
  await tocar(luis, id, () => boton(luis, "Repartir otra mano"), fin.version);
  await repartida;
  // A mitad del reparto: el mazo ya está repartiendo y la mano nueva todavía no se toca.
  await luis.waitForTimeout(500);
  await capturar(luis, "reparto-" + sufijo, { asentar: false });
  await expect.poll(async () => (await partida(luis, id)).manoNumero, espera).toBe(2);
  await expect(cartasEnMano(luis)).toHaveCount(3, espera);
  return { id, puntos };
}

async function probarAnimaciones() {
  // Con animaciones, en el teléfono y en el escritorio: cuadros del fin de mano y del reparto. En el
  // teléfono, además, el interruptor «Modo liviano» de la hoja Más se guarda en el dispositivo (en la web,
  // localStorage) y sigue al recargar. Se vuelve a apagar antes de repartir, para ver el reparto animado.
  const luis = await entrar("luis");
  await dueloHastaElFin(luis, "375x760", async () => {
    let liviano = await abrirModoLiviano(luis);
    await expect(liviano).not.toBeChecked();
    await expect(luis.getByText("Sin brillos ni partículas.")).toBeVisible();
    await liviano.click();
    await expect(liviano).toBeChecked();
    const guardado = () => luis.evaluate(() => JSON.parse(localStorage.getItem("truco.preferencias-mesa") ?? "{}").liviano);
    await expect.poll(guardado).toBe(true);
    await luis.reload();
    await enLaMesa(luis);
    await expect(luis.getByTestId("fin-de-mano")).toBeVisible(espera);
    liviano = await abrirModoLiviano(luis);
    await expect(liviano).toBeChecked();
    await liviano.click();
    await expect(liviano).not.toBeChecked();
    await expect.poll(guardado).toBe(false);
    await cerrarHoja(luis);
  });
  await luis.context().close();
  const enEscritorio = await entrar("luis", escritorio);
  await dueloHastaElFin(enEscritorio, "1280x800");
  await enEscritorio.context().close();

  // Reducir movimiento del sistema: la mesa va en liviano (sin poder apagarlo) y la mano llega igual al fin.
  const quieto = await entrar("luis", movil, { reducedMotion: "reduce" });
  await dueloHastaElFin(quieto, "liviano-375x760", async () => {
    const forzado = await abrirModoLiviano(quieto);
    await expect(forzado).toBeChecked();
    await expect(forzado).toBeDisabled();
    await expect(quieto.getByText("Lo activa la opción de reducir movimiento del sistema.")).toBeVisible();
    await cerrarHoja(quieto);
  });
  await quieto.context().close();
  console.log("Animaciones: fin de mano y otra mano con animaciones y con reducir movimiento (liviano forzado), y Modo liviano guardado al recargar.");
}

async function probarPrivacidad() {
  const eva = await entrar("eva");
  const diego = await entrar("diego");
  const id = await mesaConInvitados(eva, "2 contra 2", [diego], [3, 4]);
  const mesa = await api(eva, "/api/mesas/" + id);
  const deDiego = await api(diego, "/api/mesas/" + id);
  const equipoEva = mesa.asientos[mesa.miAsiento].equipo;
  assert.notEqual(deDiego.asientos[deDiego.miAsiento].equipo, equipoEva, "eva y diego son rivales");
  const delEquipoDeEva = mesa.asientos.filter(a => a.equipo === equipoEva);
  const ajenos = delEquipoDeEva.map(a => `[data-testid="globo-senas-${a.asiento}"]`).join(", ");

  const clara = await entrar("clara");
  await clara.goto(`/jugar/mirar/${id}`);
  await expect(clara.getByTestId("mesa")).toBeVisible(espera);
  await expect(clara.getByText("👁 Mirando", { exact: true })).toBeVisible(espera);
  // El visor nunca muestra señas: ni caras, ni globos, ni la píldora, ni las frases del pie, en toda la mano.
  const senasDelVisor = ["cara-sena", "pildora-senas", "pedido-del-pie", "frases-pie"].map(t => `[data-testid="${t}"]`)
    .concat('[data-testid^="globo-senas-"]').join(", ");
  await observar(clara, senasDelVisor);

  const sinGestosAjenos = m => {
    for (const g of m.pie?.grupos ?? []) assert.ok(!delEquipoDeEva.some(a => a.asiento === g.emisor), "gesto ajeno en /partida de diego");
    for (const t of m.turnos ?? []) {
      if (delEquipoDeEva.some(a => a.asiento === t.action.asiento)) assert.ok(!t.signal, "seña ajena en /partida de diego");
    }
  };
  // Toda respuesta de /partida que recibe la mesa de diego, no solo las que pide la prueba.
  const recibidas = [];
  diego.on("response", r => {
    if (new URL(r.url()).pathname.endsWith("/partida") && r.status() === 200) recibidas.push(r.json());
  });
  // Un observador en la página de diego anota cualquier globo o píldora del equipo de eva, aunque dure un instante.
  await diego.evaluate(({ selector, nombres }) => {
    window.senasAjenas = [];
    const revisar = () => {
      if (document.querySelector(selector)) window.senasAjenas.push("globo");
      for (const pildora of document.querySelectorAll('[data-testid="pildora-senas"], [data-testid="pedido-del-pie"]')) {
        if (nombres.some(n => pildora.textContent.includes(n))) window.senasAjenas.push(pildora.textContent);
      }
    };
    revisar();
    new MutationObserver(revisar).observe(document.body, { childList: true, subtree: true, characterData: true });
  }, { selector: ajenos, nombres: delEquipoDeEva.map(a => a.nombre) });

  // Control positivo en la misma mesa: el compañero de eva es una computadora, así que el equipo de eva
  // sí hace señas. Si eva no las recibiera ni las viera, la ausencia en la página de diego no probaría nada.
  await eva.evaluate(() => {
    window.senasPropias = 0;
    const revisar = () => {
      if (document.querySelector('[data-testid^="globo-senas-"], [data-testid="pildora-senas"], [data-testid="pedido-del-pie"]')) {
        window.senasPropias++;
      }
    };
    revisar();
    new MutationObserver(revisar).observe(document.body, { childList: true, subtree: true });
  });
  let gestosDeEva = 0;

  let muestras = 0;
  const vigilar = async () => {
    const deEva = await partida(eva, id);
    gestosDeEva += (deEva.pie?.grupos ?? [])
      .filter(g => delEquipoDeEva.some(a => a.asiento === g.emisor) && g.gestos.length > 0).length;
    sinGestosAjenos(await partida(diego, id));
    assert.equal(await clara.locator(senasDelVisor).count(), 0, "el visor muestra señas");
    muestras++;
  };
  for (let mano = 1; mano <= 3; mano++) {
    const fin = await avanzar([eva, diego], id, terminada, { antes: vigilar });
    await vigilar();
    if (gestosDeEva > 0 && await eva.evaluate(() => window.senasPropias) > 0) break;
    await tocar(eva, id, () => boton(eva, "Repartir otra mano"), fin.version);
    await expect.poll(async () => (await partida(eva, id)).manoNumero, espera).toBe(fin.manoNumero + 1);
  }
  assert.ok(gestosDeEva > 0, "la /partida de eva trajo gestos de su equipo");
  assert.ok(await eva.evaluate(() => window.senasPropias) > 0, "la mesa de eva mostró sus señas");
  assert.deepEqual(await diego.evaluate(() => window.senasAjenas), [], "diego vio señas del equipo de eva");
  assert.deepEqual(await clara.evaluate(() => window.vistos), [], "el visor de clara mostró señas");
  assert.ok(recibidas.length > 0, "la mesa de diego pidió /partida");
  for (const m of await Promise.all(recibidas)) sinGestosAjenos(m);
  await Promise.all([eva, diego, clara].map(p => p.context().close()));
  console.log(`2v2 rivales con dos computadoras: eva vio sus señas (${gestosDeEva} grupos) y diego, en ${recibidas.length} lecturas y ${muestras} miradas, ninguna.`);
}

const todos = {
  probarDueloConComputadora, probarEnvido, probarFlorAlMazo, probarParejasConPie, probarPrivacidad, probarTercetos, probarEspectador, probarEscritorio,
  probarAnimaciones, probarAbandono, probarEsperaYCobro,
};
try {
  for (const [nombre, caso] of Object.entries(todos)) {
    if (casos.length === 0 || casos.includes(nombre)) await caso();
  }
  console.log("Mesa nueva de la app verificada contra la pila local · duelo, envido, señas al pie, privacidad, tercetos, espectador, escritorio, animaciones, abandono y espera.");
} catch (error) {
  // Con una falla, la captura de cada página abierta muestra en qué quedó la mesa.
  const abiertas = browser.contexts().flatMap(c => c.pages());
  for (const [i, p] of abiertas.entries()) await capturar(p, "falla-" + (i + 1)).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
