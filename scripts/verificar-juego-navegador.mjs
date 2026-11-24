import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { canto } from "../src/lib/cantos.ts";
import { probarTercetos } from "./verificar-tercetos-navegador.mjs";
import { ingresarConClaveLocal as ingresar, ingresarDesdeIdentidad } from "./ingreso-local-navegador.mjs";
import { chromium, expect } from "@playwright/test";

const [web, proyecto] = process.argv.slice(2);
assert.ok(/^truco-check-\d+-\d+$/.test(proyecto), "El reinicio requiere el proyecto desechable de verificar-stack.");
const compose = (...args) => promisify(execFile)("docker", ["compose", "--project-name", proyecto, ...args]);
const browser = await chromium.launch();
const espera = { timeout: 20_000 };
const boton = (p, name) => p.getByRole("button", { name, exact: true });
const tapete = p => p.getByRole("region", { name: "Tapete" });

async function navegador(movil) {
  const context = await browser.newContext({ baseURL: web, viewport: movil
    ? { width: 375, height: 760 } : { width: 1280, height: 800 } });
  const p = await context.newPage();
  p.setDefaultTimeout(20_000);
  return p;
}

async function crear(p, modo, computadoras = false, meta) {
  await p.goto("/jugar/");
  await boton(p, "Crear mi mesa").click();
  await p.getByRole("radio", { name: { "1v1": /1 contra 1/, "2v2": /2 contra 2/, "3v3": /3 contra 3/ }[modo] }).check();
  if (meta) await p.getByRole("spinbutton").fill(String(meta));
  await boton(p, computadoras ? "Jugar con computadoras" : "Crear mesa").click();
  await p.waitForURL(url => url.searchParams.has("mesa"));
}

async function invitar(p, anfitrion, usuario) {
  await p.goto(await anfitrion.getByRole("textbox", { name: "Enlace de invitación" }).inputValue());
  if (usuario) {
    await expect(p.getByRole("heading", { name: "Te invitaron a una mesa" })).toBeVisible(espera);
    await ingresar(p, usuario);
  }
  await boton(p, "Ocupar mi asiento").click();
  await p.waitForURL(anfitrion.url());
}

function ruta(p) {
  const id = new URL(p.url()).searchParams.get("mesa");
  assert.ok(id);
  return "/api/mesas/" + id;
}

async function partida(p) {
  const r = await p.request.get(ruta(p) + "/partida");
  assert.equal(r.status(), 200);
  return r.json();
}

function control(p, tipo) {
  return tipo === "carta"
    ? p.getByRole("group", { name: "Tus cartas" }).getByRole("button").first()
    : boton(p, canto[tipo]);
}

async function jugar(p, tipo) {
  const respuesta = p.waitForResponse(r => r.url().endsWith("/acciones") && r.request().method() === "POST");
  const [r] = await Promise.all([respuesta, control(p, tipo).click()]);
  assert.equal(r.status(), 200, tipo + " · " + await r.text());
  return r.json();
}

// Cada jugada sale del control de Chromium en el asiento que tiene la opción.
async function paso(paginas, preferencias) {
  const manos = await Promise.all(paginas.map(partida));
  if (manos[0].vista.resultado) return manos[0];
  for (const tipo of preferencias) {
    const i = manos.findIndex(m => m.vista.legales.includes(tipo));
    if (i !== -1) return jugar(paginas[i], tipo);
  }
  assert.fail("Ningún humano puede responder: " + JSON.stringify(manos.map(m => m.vista.legales)));
}

const basicas = ["flor", "paso-flor", "quiero", "carta"];
async function hasta(paginas, condicion, preferencias = basicas) {
  let actual = await partida(paginas[0]);
  for (let n = 0; n < 45; n++) {
    if (condicion(actual)) return actual;
    assert.ok(!actual.vista.resultado, "Terminó la mano antes de la condición esperada");
    actual = await paso(paginas, preferencias);
  }
  assert.fail("La mano no avanzó");
}

async function verificarTanteador(paginas, puntos) {
  for (const p of paginas) {
    const { vista } = await partida(p);
    const equipo = vista.equipoPorAsiento[vista.asiento];
    await expect(p.locator('[aria-label="Tanteador"] strong')).toHaveText([String(puntos[equipo]), String(puntos[1 - equipo])], espera);
  }
}

async function repartir(paginas, fin) {
  const primera = paginas[0];
  await boton(primera, "Repartir otra mano").click();
  await Promise.all(paginas.map(p => expect(tapete(p)).toContainText("Mano " + (fin.manoNumero + 1), espera)));
  const nueva = await partida(primera);
  assert.deepEqual(nueva.puntos, fin.puntos);
  assert.equal(nueva.vista.dador, (fin.vista.dador + 1) % nueva.vista.equipoPorAsiento.length);
  return nueva;
}

async function comprobarPrivacidad(paginas) {
  const manos = await Promise.all(paginas.map(partida));
  const repartidas = manos.flatMap(m => m.vista.cartas);
  assert.equal(new Set(repartidas).size, 12);
  for (const [i, m] of manos.entries()) {
    assert.equal(m.vista.asiento, i);
    assert.equal(m.vista.muestra, manos[0].vista.muestra);
    await expect(tapete(paginas[i]).getByRole("button", { name: /^Jugar / })).toHaveCount(3);
    await expect(tapete(paginas[i]).getByRole("img", { name: "3 cartas en mano" })).toHaveCount(3);
    const src = await paginas[i].getByRole("group", { name: "Tus cartas" }).locator("img").evaluateAll(imgs =>
      imgs.map(img => img.getAttribute("src").split("/").pop().split(".")[0]));
    assert.deepEqual(src, m.vista.cartas);
    const privada = JSON.stringify(m);
    for (const carta of repartidas.filter(c => !m.vista.cartas.includes(c))) assert.ok(!privada.includes(carta));
  }
}

async function probarParejas(paginas) {
  const [ana, bruno, clara, diego] = paginas;
  await ana.goto("/");
  await ingresar(ana, "ana");
  await expect(ana.getByRole("heading", { name: "Mesas en juego" })).toBeVisible(espera);
  await crear(ana, "2v2");
  await invitar(bruno, ana, "bruno");
  await invitar(clara, ana, "clara");
  await invitar(diego, ana, "diego");
  await Promise.all(paginas.map(p => expect(tapete(p)).toBeVisible(espera)));
  await comprobarPrivacidad(paginas);
  // Un tercer usuario vuelve desde Discord, entra por OIDC y observa la misma mano.
  const espectadora = await navegador(false);
  try {
    const id = new URL(ana.url()).searchParams.get("mesa");
    await espectadora.goto("/volver/?mesa=" + id);
    await expect(espectadora.locator("#username")).toBeAttached(espera);
    await ingresarDesdeIdentidad(espectadora, "eva");
    await expect(espectadora).toHaveURL(url => url.pathname === "/jugar/" && url.searchParams.get("mirar") === id, espera);
    const historial = espectadora.getByRole("region", { name: "Historial de la mano" });
    await expect(historial).toBeVisible(espera);
    for (const cantidad of [1, 2]) {
      await hasta(paginas, m => m.vista.acciones.filter(a => a.tipo === "carta").length >= cantidad);
      await expect(historial.getByRole("listitem", { includeHidden: true }).filter({ hasText: " jugó " })).toHaveCount(cantidad, espera);
    }
    assert.equal(await espectadora.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("truco.ultima-mesa."))), false);
    await expect(espectadora.getByRole("group", { name: "Tus cartas" })).toHaveCount(0);
    await espectadora.getByRole("button", { name: "Volver al salón" }).press("Enter");
    await expect(espectadora.getByRole("heading", { name: "Mesas en juego" })).toBeVisible(espera);
  } finally { await espectadora.context().close(); }
  // Tras la primera vuelta cada asiento ya declaró sus flores y puede responder al truco.
  await hasta(paginas, m => m.vista.vueltas.length === 1);
  await paso(paginas, ["truco"]);
  const guardadas = await Promise.all(paginas.map(partida));
  await clara.reload();
  const mesa = await (await ana.request.get(ruta(ana))).json();
  const cantor = guardadas[0].vista.pendiente.asiento;
  const anuncio = mesa.asientos[cantor].nombre + " cantó truco.";
  for (const [i, p] of paginas.entries()) {
    const { vista } = guardadas[i];
    assert.deepEqual(vista.pendiente, { tipo: "truco", asiento: cantor });
    const responde = vista.equipoPorAsiento[vista.asiento] !== vista.equipoPorAsiento[cantor];
    const zona = tapete(p).getByRole("region", { name: "Zona de juego" });
    await expect(zona.getByRole("heading", { name: responde ? "Podés responder" : "Responde el equipo rival", exact: true })).toBeVisible(espera);
    await expect(zona.getByRole("status")).toContainText(anuncio, espera);
    for (const tipo of ["quiero", "no-quiero"]) {
      assert.equal(vista.legales.includes(tipo), responde);
      const opcion = boton(zona, canto[tipo]);
      if (responde) await expect(opcion).toBeEnabled(espera);
      else await expect(opcion).toHaveCount(0, espera);
    }
  }
  assert.deepEqual(await partida(clara), guardadas[2]);
  const reconectando = p => tapete(p).getByRole("heading", { name: "Reconectando con tu mesa…", exact: true });
  await compose("stop", "api", "db");
  await Promise.all(paginas.map(p => expect(reconectando(p)).toBeVisible(espera)));
  await compose("up", "-d", "--wait", "--wait-timeout", "180", "db", "api");
  await Promise.all(paginas.map(p => expect(reconectando(p)).toBeHidden(espera)));
  assert.deepEqual(await Promise.all(paginas.map(partida)), guardadas);
  // Ambos clics pasan por la UI. La barrera deja salir los POST juntos con la misma versión.
  const rivales = paginas.filter((_, i) => guardadas[i].vista.legales.includes("quiero"));
  assert.equal(rivales.length, 2);
  let llegar;
  const juntas = new Promise(resolve => { llegar = resolve; });
  let esperando = 0;
  for (const p of rivales) {
    await p.route("**/acciones", async r => {
      if (++esperando === 2) llegar();
      await juntas;
      await r.continue();
    }, { times: 1 });
  }
  const respuestas = await Promise.all(rivales.map(async p => {
    const [r] = await Promise.all([p.waitForResponse(r => r.url().endsWith("/acciones")), boton(p, "Quiero").click()]);
    return r.status();
  }));
  assert.deepEqual(respuestas.sort(), [200, 409]);
  for (const p of paginas) {
    const m = await partida(p);
    assert.equal(m.version, guardadas[0].version + 1);
    assert.equal(m.vista.acciones.filter(a => a.tipo === "quiero").length,
      guardadas[0].vista.acciones.filter(a => a.tipo === "quiero").length + 1);
    assert.equal(m.vista.valorTruco, 2);
  }
  const fin = await hasta(paginas, m => m.vista.resultado);
  assert.equal(fin.vista.resultado.motivo, "vueltas");
  assert.equal(fin.vista.cobros.filter(c => c.motivo === "truco").length, 1);
  await verificarTanteador(paginas, fin.puntos);
  await repartir(paginas, fin);
  await hasta(paginas, m => m.vista.vueltas.length === 1);
  await paso(paginas, ["truco"]);
  const rechazo = await paso(paginas, ["no-quiero"]);
  assert.equal(rechazo.vista.resultado.motivo, "rechazo");
  await verificarTanteador(paginas, rechazo.puntos);
  console.log("2v2 con cuatro usuarios: invitación, doce cartas privadas, reinicio, dos respuestas simultáneas, vueltas y rechazo.");
}

async function probarDuelo([ana, bruno]) {
  await crear(ana, "1v1");
  await invitar(bruno, ana);
  const paginas = [ana, bruno];
  for (let n = 0; n < 80; n++) {
    await Promise.all(paginas.map(p => expect(tapete(p)).toBeVisible(espera)));
    const fin = await hasta(paginas, m => m.vista.resultado, ["flor", "paso-flor", "contraflor-al-resto", "falta-envido", "quiero", "carta"]);
    if (fin.ganadorPartida !== null) {
      assert.ok(fin.puntos[fin.ganadorPartida] >= 40);
      await verificarTanteador(paginas, fin.puntos);
      for (const [i, p] of paginas.entries()) {
        await expect(p.getByRole("heading", { name: i === fin.ganadorPartida ? "Ganaste la partida" : "Ganó el rival" })).toBeVisible(espera);
        await expect(p.getByRole("link", { name: "Crear otra mesa" })).toBeVisible();
      }
      console.log("1v1 humano completo a 40: " + fin.puntos.join("–") + " en " + fin.manoNumero + " mano(s).");
      return;
    }
    await repartir(paginas, fin);
  }
  assert.fail("Una partida a 40 terminó sin ganador tras 80 manos");
}

async function probarComputadoras(ana, bruno) {
  for (const [modo, mixto] of [["1v1", false], ["2v2", false], ["2v2", true]]) {
    await crear(ana, modo, !mixto);
    const paginas = mixto ? [ana, bruno] : [ana];
    if (mixto) {
      await boton(ana, "Agregar computadora al asiento 2").click();
      await invitar(bruno, ana);
      await boton(ana, "Agregar computadora al asiento 4").click();
    }
    await expect(tapete(ana)).toBeVisible(espera);
    const fin = await hasta(paginas, m => m.vista.resultado);
    const mesa = await (await ana.request.get(ruta(ana))).json();
    const bots = mesa.asientos.filter(a => a.tipo === "computadora");
    assert.equal(bots.length, modo === "1v1" ? 1 : mixto ? 2 : 3);
    assert.ok(fin.vista.acciones.some(a => bots.some(b => b.asiento === a.asiento)));
    await verificarTanteador(paginas, fin.puntos);
    console.log(modo + " con " + bots.length + " computadora(s): mano terminada.");
  }
}

try {
  const paginas = await Promise.all([true, false, true, false].map(navegador));
  await probarParejas(paginas);
  await probarDuelo(paginas);
  await probarComputadoras(...paginas.slice(0, 2));
  paginas.push(await navegador(false), await navegador(true));
  await probarTercetos(paginas, { crear, invitar, partida, jugar, boton, tapete, ruta });
} finally {
  await browser.close();
}
