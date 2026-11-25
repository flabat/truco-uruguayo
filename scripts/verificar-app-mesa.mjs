// Desde el host, contra la web del stack descartable: la mesa nueva de la app (/app/mesa) jugada en Chromium
// con la API, PostgreSQL y el proveedor de identidad locales. Cada jugada sale de tocar la mesa (una carta,
// un botón de la hoja de Cantos, «Dejar jugar», «Repartir otra mano»); la API dice a quién le toca y qué es
// legal. También tercetos (redondilla y pico a pico), el visor de espectador y la mesa de escritorio con
// atajos de teclado. Con `CAPTURAS_MESA` guarda capturas a 375 × 760, 360 × 640 y 1280 × 800.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { canto } from "@eltruco/cliente/cantos.ts";
import { ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";

const web = process.argv[2];
const casos = process.argv.slice(3);
const capturas = process.env.CAPTURAS_MESA;
if (capturas) mkdirSync(capturas, { recursive: true });
const browser = await chromium.launch();
const espera = { timeout: 25_000 };
const boton = (p, name) => p.getByRole("button", { name, exact: true });
const titulo = (p, name) => p.getByRole("heading", { level: 1, name, exact: true });
const movil = { width: 375, height: 760 };
const minima = { width: 360, height: 640 };
const escritorio = { width: 1280, height: 800 };
const cartasEnMano = p => p.locator('[data-testid^="carta-"]');

async function pagina(viewport = movil) {
  const context = await browser.newContext({ baseURL: web, viewport });
  const p = await context.newPage();
  p.setDefaultTimeout(25_000);
  return p;
}

async function capturar(p, nombre) {
  if (!capturas) return;
  // El reparto y la hoja se animan: la captura espera a que se asienten.
  await p.waitForTimeout(1_200);
  await p.screenshot({ path: join(capturas, nombre + ".png") });
}

async function api(p, ruta) {
  const r = await p.request.get(ruta);
  assert.equal(r.status(), 200, ruta + " · " + r.status());
  return r.json();
}

const partida = (p, id) => api(p, `/api/mesas/${id}/partida`);

async function entrar(usuario, viewport) {
  const p = await pagina(viewport);
  await p.goto("/app/");
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
  await p.waitForURL(/\/app\/mesa\?id=[a-f0-9-]{36}$/, espera);
  await expect(p.getByTestId("mesa")).toBeVisible(espera);
  await expect(p.locator('[data-testid="mesa"] canvas')).toBeVisible(espera);
  return new URL(p.url()).searchParams.get("id");
}

/** eva crea la mesa entre personas y los invitados ocupan su asiento por el enlace. */
async function mesaConInvitados(anfitrion, modalidad, invitados, asientosDeComputadora = []) {
  await crearMesa(anfitrion, modalidad, false);
  await anfitrion.waitForURL(/\/app\/sala\//, espera);
  const enlace = await anfitrion.getByRole("textbox", { name: "Enlace de invitación" }).inputValue();
  for (const p of invitados) {
    await p.goto(enlace);
    await boton(p, "Ocupar mi asiento").click();
    await p.waitForURL(/\/app\/(sala|mesa)/, espera);
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

async function intentar(p, id, hacer, version) {
  for (let intento = 0; intento < 20; intento++) {
    const respuesta = p.waitForResponse(esAccion, { timeout: 3_000 }).catch(() => null);
    const tocado = await hacer();
    const r = tocado ? await respuesta : null;
    if (r) {
      const indicacion = new URL(r.url()).pathname.endsWith("/indicaciones");
      assert.ok(r.status() === 200 || (indicacion && r.status() === 409), new URL(r.url()).pathname + " · " + await r.text());
      return;
    }
    if ((await partida(p, id)).version !== version) return;
  }
  assert.fail("La mesa no envió la jugada");
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
  const eva = await entrar("eva");
  await crearMesa(eva, "1 contra 1", true);
  const id = await enLaMesa(eva);
  await expect(eva.getByLabel("Tanteador")).toContainText("Vos", espera);

  // Dos toques rápidos con la red lenta: sale una sola jugada y la otra carta vuelve a la mano.
  let m = await avanzar([eva], id, x => x.vista.legales.includes("carta") && !x.vista.pendiente);
  await expect(boton(eva, "Cantos")).toBeVisible(espera);
  await expect(cartasEnMano(eva)).toHaveCount(3, espera);
  await capturar(eva, "duelo-375x760");
  const enviadas = [];
  let respondida = Infinity;
  eva.on("request", r => { if (/\/acciones$/.test(r.url()) && r.method() === "POST") enviadas.push(r.postDataJSON()); });
  eva.on("response", r => {
    if (/\/acciones$/.test(r.url()) && r.request().method() === "POST") respondida = Math.min(respondida, Date.now());
  });
  // La ruta retiene el envío: el segundo toque llega mientras el primero sigue en viaje.
  let soltar;
  const retenida = new Promise(listo => { soltar = listo; });
  await eva.route("**/acciones", async r => {
    await Promise.race([retenida, new Promise(listo => setTimeout(listo, 4_000))]);
    await r.continue();
  });
  const lugar = async carta => {
    const caja = await carta.boundingBox();
    return caja && { x: Math.round(caja.x), y: Math.round(caja.y) };
  };
  for (let intento = 0; enviadas.length === 0 && intento < 20; intento++) {
    const [primeraId, segundaId] = await cartasEnMano(eva).evaluateAll(cs => cs.map(c => c.dataset.testid));
    const segunda = eva.getByTestId(segundaId);
    const antes = await lugar(segunda);
    await eva.getByTestId(primeraId).click();
    await segunda.click();
    const segundoToque = Date.now();
    await eva.waitForTimeout(1_000);
    if (enviadas.length === 0) continue;
    assert.equal("carta-" + enviadas[0].accion?.carta, primeraId, "sale la carta del primer toque");
    assert.ok(segundoToque < respondida, "el segundo toque terminó antes de la respuesta del primero");
    // Con el envío retenido, la segunda carta volvió a su lugar en la mano.
    await expect.poll(() => lugar(segunda), espera).toEqual(antes);
    soltar();
  }
  await expect.poll(() => respondida < Infinity, espera).toBe(true);
  await eva.unroute("**/acciones");
  assert.equal(enviadas.length, 1, "dos toques rápidos envían una sola carta: " + JSON.stringify(enviadas));
  const tras = await partida(eva, id);
  const propias = tras.vista.acciones.filter(a => a.tipo === "carta" && a.asiento === tras.vista.asiento);
  assert.equal(propias.length, m.vista.acciones.filter(a => a.tipo === "carta" && a.asiento === m.vista.asiento).length + 1);
  await expect(cartasEnMano(eva)).toHaveCount(2, espera);

  m = await avanzar([eva], id, terminada);
  await expect(boton(eva, "Repartir otra mano")).toBeVisible(espera);
  await tocar(eva, id, () => boton(eva, "Repartir otra mano"), m.version);
  await expect.poll(async () => (await partida(eva, id)).manoNumero, espera).toBe(2);
  await eva.setViewportSize(minima);
  await expect(eva.getByTestId("mesa")).toBeVisible();
  await capturar(eva, "duelo-360x640");
  await eva.context().close();
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
    await teclear(responde, id, "q", pendiente.version);
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

async function probarParejasConPie() {
  const eva = await entrar("eva");
  let id, yo, companero;
  const nuevaMesa = async () => {
    await crearMesa(eva, "2 contra 2", true);
    id = await enLaMesa(eva);
    const mesa = await api(eva, "/api/mesas/" + id);
    yo = mesa.miAsiento;
    companero = mesa.asientos.find(a => a.asiento !== yo && a.equipo === mesa.asientos[yo].equipo).asiento;
  };
  await nuevaMesa();
  let globos = 0;
  let pildoras = 0;
  const mirar = async (p, m) => {
    if (!m.pie) return;
    if (m.pie.pie === yo) {
      const grupo = m.pie.grupos.find(g => g.emisor === companero);
      if (grupo?.gestos.length) {
        await expect(p.getByTestId("globo-senas-" + companero)).toBeVisible(espera);
        if (globos++ === 0) await capturar(p, "parejas-globo-375x760");
      }
    } else if (m.pie.grupos.some(g => g.emisor === yo)) {
      await expect(p.getByTestId("pildora-senas")).toBeVisible(espera);
      pildoras++;
    }
  };
  // Una mano entera; si eva no fue el pie o su compañero no le hizo señas, se reparte otra hasta ver el
  // globo. El pie del equipo cambia con el dador (eva lo es en dos de cada cuatro manos) y una mano corta
  // puede terminar sin señas: hasta 8 manos.
  for (let mano = 1; mano <= 8; mano++) {
    const fin = await avanzar([eva], id, terminada, { antes: mirar });
    if (globos > 0) break;
    if (fin.ganadorPartida !== null) {
      // Si el chico terminó antes, se sigue en una mesa nueva.
      await boton(eva, "Crear otra mesa").click();
      await expect(titulo(eva, "Crear una mesa")).toBeVisible(espera);
      await eva.goto("/app/");
      await expect(titulo(eva, "Mesas en juego")).toBeVisible(espera);
      await nuevaMesa();
      continue;
    }
    await tocar(eva, id, () => boton(eva, "Repartir otra mano"), fin.version);
    await expect.poll(async () => (await partida(eva, id)).manoNumero, espera).toBe(fin.manoNumero + 1);
  }
  assert.ok(globos > 0, "eva vio el globo con las señas de su compañero");
  await eva.context().close();
  console.log(`2v2 con tres computadoras: globo del pie (${globos}) y píldora de señas (${pildoras}).`);
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

async function probarTercetos() {
  const eva = await entrar("eva");
  const { modos } = await api(eva, "/api/modalidades");
  assert.ok(modos.includes("3v3"),
    "La pila no ofrece 3 contra 3 a eva: Tercetos tiene que estar habilitado para todos (lo hace verificar-gestion.mjs). Modalidades: " + modos.join(", "));
  // A 100 tantos, el segundo reparto es pico a pico salvo que alguien llegue a 50 en la primera redondilla.
  await crearMesa(eva, "3 contra 3", true, 100);
  const id = await enLaMesa(eva);
  let m = await partida(eva, id);
  assert.equal(m.formato, "triples");
  assert.equal(m.lance.tipo, "redondilla");
  await expect(eva.getByTestId("etiqueta-lance")).toHaveText(/^Reparto 1 · Redondilla · Vuelta \d$/, espera);
  await expect(cartasEnMano(eva)).toHaveCount(3, espera);
  await capturar(eva, "tercetos-redondilla-375x760");
  // Cuando le toca, juega sus cartas tocándolas. Un mazo o un truco no querido pueden cerrar el reparto antes.
  const fin = await avanzar([eva], id, terminada, { pasos: 400 });
  await expect(eva.getByTestId("fin-de-mano")).toContainText("Tantos de este reparto", espera);
  // Al terminar el reparto, cada lance (la redondilla o los tres duelos) ya está en el historial.
  const cartasPropias = x => x.historialLances.flatMap(l => l.acciones)
    .filter(a => a.tipo === "carta" && a.asiento === x.vista.asiento).length;
  let jugadas = cartasPropias(fin);
  assert.ok(Math.max(...fin.puntos) < 50, "nadie llegó a 50 en la redondilla: " + fin.puntos);
  await tocar(eva, id, () => boton(eva, "Repartir otra mano"), fin.version);
  await expect.poll(async () => (await partida(eva, id)).manoNumero, espera).toBe(2);

  // Pico a pico: tres duelos; mientras espera el suyo, eva ve en qué duelo le toca y la mesa no juega.
  m = await partida(eva, id);
  assert.equal(m.lance.tipo, "pico-a-pico");
  await expect(eva.getByTestId("etiqueta-lance")).toHaveText(/^Pico a pico · Duelo \d de 3$/, espera);
  const enviadas = [];
  eva.on("request", r => { if (/\/acciones$/.test(r.url()) && r.method() === "POST") enviadas.push(r.url()); });
  // Mientras otros duelos se presentan, el estado narra cada jugada: el aviso del duelo propio puede durar
  // poco. Un observador lo anota aunque dure un instante.
  await eva.evaluate(() => {
    window.avisosDeDuelo = new Set();
    const revisar = () => {
      for (const aviso of document.body.innerText.match(/Te toca en el duelo \d de 3\./g) ?? []) window.avisosDeDuelo.add(aviso);
    };
    revisar();
    new MutationObserver(revisar).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const avisos = () => eva.evaluate(() => [...window.avisosDeDuelo]);
  let esperoSuDuelo = false;
  let jugoSuDuelo = false;
  // Los duelos salen de la mano: el 1 lo abre la mano y su frente, el 2 el siguiente, y así.
  const dueloPropio = 1 + ((m.vista.asiento - m.vista.mano + 6) % 3);
  for (let paso = 0; ; paso++) {
    assert.ok(paso < 400, "El pico a pico no avanzó");
    m = await partida(eva, id);
    if (terminada(m)) {
      jugadas += cartasPropias(m);
      break;
    }
    const activa = m.lance.activos.includes(m.vista.asiento);
    if (!activa && m.vista.estado === "esperando" && !esperoSuDuelo) {
      if (dueloPropio > m.lance.duelo) {
        await expect.poll(avisos, espera).toContain(`Te toca en el duelo ${dueloPropio} de 3.`);
        await capturar(eva, "tercetos-pico-375x760");
        // El servidor no manda cartas a quien espera su duelo: si la mesa muestra alguna, no se juega.
        const antes = enviadas.length;
        for (const carta of await cartasEnMano(eva).all()) await carta.click({ timeout: 2_000 }).catch(() => {});
        await eva.waitForTimeout(1_000);
        assert.equal(enviadas.length, antes, "la mano en espera no juega");
        esperoSuDuelo = true;
        continue;
      }
    }
    if (activa && m.vista.legales.includes("carta")) jugoSuDuelo = true;
    if (!(await jugarTurno(eva, id, m))) await eva.waitForTimeout(300);
  }
  assert.ok(esperoSuDuelo || jugoSuDuelo, "eva esperó o jugó su duelo");
  // Nunca anuncia otro duelo que el propio, ni en el primero.
  assert.deepEqual(await avisos(), dueloPropio > 1 ? [`Te toca en el duelo ${dueloPropio} de 3.`] : []);
  assert.ok(jugadas > 0, "eva jugó cartas tocándolas");
  await expect(eva.getByTestId("fin-de-mano")).toContainText("Tantos de este reparto", espera);
  await eva.context().close();
  console.log(`3v3 con cinco computadoras: redondilla, pico a pico (eva en el duelo ${dueloPropio} de 3), ${jugadas} cartas tocadas y tantos del reparto.`);
}

async function probarEspectador() {
  const eva = await entrar("eva");
  await crearMesa(eva, "2 contra 2", true);
  const id = await enLaMesa(eva);
  const clara = await entrar("clara");
  await clara.goto(`/app/mirar/${id}`);
  await expect(clara.getByTestId("mesa")).toBeVisible(espera);
  await expect(clara.locator('[data-testid="mesa"] canvas')).toBeVisible(espera);
  await expect(clara.getByText("👁 Mirando", { exact: true })).toBeVisible(espera);
  await expect(boton(clara, "Volver al salón")).toBeVisible();
  // El tanteador nombra a cada pareja con los nombres del salón.
  const { asientos, meta } = await api(clara, "/api/salon/mesas/" + id);
  const pareja = e => asientos.filter(a => a.equipo === e).map(a => a.nombre).join(" y ");
  await expect(clara.getByLabel("Tanteador")).toHaveText(new RegExp(`^${pareja(0)} \\d+ · \\d+ ${pareja(1)} · a ${meta}$`), espera);
  // Una mano entera: el espectador nunca tiene cartas propias ni Cantos.
  await observar(clara, '[data-testid^="carta-"]');
  await avanzar([eva], id, terminada);
  assert.deepEqual(await clara.evaluate(() => window.vistos), [], "el espectador vio cartas para tocar");
  await expect(boton(clara, "Cantos")).toHaveCount(0);
  await capturar(clara, "espectador-375x760");
  await boton(clara, "Volver al salón").click();
  await expect(titulo(clara, "Mesas en juego")).toBeVisible(espera);
  await Promise.all([eva, clara].map(p => p.context().close()));
  console.log("Espectador con la mesa nueva: 👁 Mirando, tanteador con las parejas, sin cartas ni Cantos, y vuelta al salón.");
}

async function probarEscritorio() {
  const eva = await entrar("eva", escritorio);
  await crearMesa(eva, "1 contra 1", true);
  const id = await enLaMesa(eva);
  await expect(eva.getByTestId("panel-mano")).toBeVisible(espera);
  await expect(eva.getByTestId("panel-tantos")).toBeVisible();
  await expect(eva.getByRole("tab")).toHaveCount(0);
  await expect(boton(eva, "Más")).toHaveCount(0);

  // C abre la hoja de Cantos propia y Escape la cierra.
  const m = await avanzar([eva], id, x => x.vista.legales.includes("carta") && !x.vista.pendiente);
  await expect(cartasEnMano(eva)).toHaveCount(3, espera);
  const hoja = eva.getByLabel("Cantos", { exact: true });
  // Con algún canto legal (o irse al mazo) está la hoja de Cantos.
  const abrioCantos = m.vista.legales.some(t => t !== "carta");
  if (abrioCantos) {
    await expect(boton(eva, "Cantos")).toBeVisible(espera);
    await expect(async () => {
      await eva.keyboard.press("c");
      await expect(hoja).toBeVisible({ timeout: 1_000 });
    }).toPass(espera);
    await capturar(eva, "escritorio-cantos-1280x800");
    await eva.keyboard.press("Escape");
    await expect(hoja).toHaveCount(0);
  }
  await capturar(eva, "escritorio-1280x800");

  // «1» y enseguida «2»: sale una sola jugada, la de la primera carta de la izquierda.
  const enviadas = [];
  eva.on("request", r => { if (/\/acciones$/.test(r.url()) && r.method() === "POST") enviadas.push(r.postDataJSON()); });
  const orden = await manoEnOrden(eva);
  for (let intento = 0; enviadas.length === 0 && intento < 20; intento++) {
    await eva.keyboard.press("1");
    await eva.keyboard.press("2");
    await eva.waitForTimeout(1_500);
    if (enviadas.length === 0) assert.equal((await partida(eva, id)).version, m.version, "la mesa jugó sin enviar");
  }
  assert.equal(enviadas.length, 1, "1 y 2 seguidos envían una sola carta: " + JSON.stringify(enviadas));
  assert.equal("carta-" + enviadas[0].accion?.carta, orden[0], "el 1 juega la carta de la izquierda");
  await expect(cartasEnMano(eva)).toHaveCount(2, espera);
  await eva.waitForTimeout(1_000);
  assert.equal(enviadas.length, 1);
  await eva.context().close();
  console.log(`Escritorio 1v1: paneles sin tira, ${abrioCantos ? "C abre Cantos y Escape la cierra, " : ""}1 y 2 seguidos juegan una sola carta.`);
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
  await clara.goto(`/app/mirar/${id}`);
  await expect(clara.getByTestId("mesa")).toBeVisible(espera);
  await expect(clara.getByText("👁 Mirando", { exact: true })).toBeVisible(espera);
  // El visor nunca muestra señas: ni caras, ni globos, ni la píldora, ni las frases del pie, en toda la mano.
  const senasDelVisor = ["cara-sena", "pildora-senas", "frases-pie"].map(t => `[data-testid="${t}"]`)
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
      for (const pildora of document.querySelectorAll('[data-testid="pildora-senas"]')) {
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
      if (document.querySelector('[data-testid^="globo-senas-"], [data-testid="pildora-senas"]')) window.senasPropias++;
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
  probarDueloConComputadora, probarEnvido, probarParejasConPie, probarPrivacidad, probarTercetos, probarEspectador, probarEscritorio,
};
try {
  for (const [nombre, caso] of Object.entries(todos)) {
    if (casos.length === 0 || casos.includes(nombre)) await caso();
  }
  console.log("Mesa nueva de la app verificada contra la pila local · duelo, envido, señas al pie, privacidad, tercetos, espectador y escritorio.");
} catch (error) {
  // Con una falla, la captura de cada página abierta muestra en qué quedó la mesa.
  const abiertas = browser.contexts().flatMap(c => c.pages());
  for (const [i, p] of abiertas.entries()) await capturar(p, "falla-" + (i + 1)).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
