// Se ejecuta en el proyecto descartable de verificar-stack, con el realm local.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";
import { elegirAccionOnline } from "@eltruco/motor/mesa-online.ts";

const [web, proyecto] = process.argv.slice(2);
assert.match(proyecto, /^truco-check-\d+-\d+$/);
const gestion = "/api/gestion/";
const browser = await chromium.launch();

async function pagina() {
  return browser.newPage({ baseURL: web });
}

async function leer(page, ruta) {
  const res = await page.request.get(ruta);
  assert.equal(res.status(), 200, ruta);
  return res.json();
}

async function enviar(page, ruta, data, status = 200) {
  const res = await page.request.post(ruta, { headers: { Origin: web }, data });
  assert.equal(res.status(), status, ruta);
  return res.json();
}

async function ingresar(page, usuario) {
  await page.goto("/gestion/");
  await page.locator('a[href^="/api/auth/login"]').click();
  const nombre = page.locator("#username");
  await nombre.waitFor({ state: "attached" });
  const cuenta = page.locator("#truco-existing-account:not([open]) > summary");
  if (await cuenta.isVisible()) await cuenta.click();
  await nombre.fill(usuario);
  await page.locator("#password").fill("truco-local");
  await page.locator("#kc-login").click();
  await page.waitForURL(new URL("/gestion/", web).href);
  return leer(page, "/api/jugador");
}

async function comprobarAcceso(page, estado) {
  for (const vista of ["vivo", "jugadores", "historial", "funciones/tercetos"]) {
    const res = await page.request.get(gestion + vista);
    assert.equal(res.status(), estado, vista);
    assert.match(res.headers()["cache-control"] ?? "", /no-store/);
  }
}

async function preparar(ana, bruno, modo, meta) {
  const mesa = await enviar(ana, "/api/mesas", { modo, meta }, 201);
  const token = new URL(mesa.invitacion).searchParams.get("invitacion");
  await enviar(bruno, "/api/invitaciones/" + token + "/unirse", {});
  if (modo === "2v2") {
    for (const asiento of [2, 3]) await enviar(ana, "/api/mesas/" + mesa.id + "/computadoras", { asiento });
  }
  return mesa;
}

async function conectarAMesa(page, id) {
  await page.evaluate(id => new Promise((resolve, reject) => {
    const url = new URL("/api/mesas/" + id + "/vivo", location.href);
    url.protocol = "ws:";
    const canal = new WebSocket(url, "truco.v1");
    canal.onerror = () => reject(new Error("No se pudo conectar a la mesa."));
    canal.onmessage = () => resolve();
    window.canalDePrueba = canal;
  }), id);
}

async function sqlDeMesa(id, consulta) {
  assert.match(id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  const { stdout } = await promisify(execFile)("docker", ["compose", "--project-name", proyecto, "exec", "-T", "db",
    "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "truco", "-d", "truco", "-c", consulta.replaceAll("$mesa", "'" + id + "'")]);
  return stdout.trim();
}

async function terminarChico(paginas, mesa) {
  const ruta = "/api/mesas/" + mesa.id;
  for (let i = 0; i < 160; i++) {
    const estados = await Promise.all(paginas.map(page => leer(page, ruta + "/partida")));
    const inicial = estados[0];
    if (inicial.ganadorPartida !== null) return inicial;
    const orden = { id: randomUUID(), version: inicial.version };
    if (inicial.vista.resultado) {
      await enviar(paginas[0], ruta + "/siguiente", orden);
    } else {
      const indice = estados.findIndex(p => p.vista.legales.length);
      assert.ok(indice >= 0, "La mesa debe llegar a un turno humano.");
      const { asiento, ...accion } = elegirAccionOnline(estados[indice].vista);
      await enviar(paginas[indice], ruta + "/acciones", { ...orden, accion });
    }
  }
  assert.fail("No terminó el chico de prueba.");
}

async function jugador(ana, persona) {
  const lista = await leer(ana, gestion + "jugadores?vigentes=1&q=" + encodeURIComponent(persona.nombre));
  const registro = lista.elementos.find(j => j.id === persona.id);
  assert.ok(registro?.sesionVigente);
  return registro;
}

const funcion = gestion + "funciones/tercetos";
async function configurar(page, data, status = 200, origin = web) {
  const res = await page.request.put(funcion, { headers: { Origin: origin }, data });
  assert.equal(res.status(), status, await res.text());
  return res.json();
}

async function probarFunciones(ana, bruno, id) {
  const inicial = await leer(ana, funcion);
  assert.equal(inicial.audiencia, "desactivado");
  assert.deepEqual(inicial.historial, []);
  const seleccion = { audiencia: "seleccionados", jugadores: [id], version: inicial.version };
  await configurar(bruno, seleccion, 403);
  await configurar(ana, seleccion, 403, "https://otro.example");
  await configurar(ana, { ...seleccion, jugadores: [randomUUID()] }, 400);
  await enviar(ana, "/api/mesas", {modo: "3v3"}, 403);
  const cambios = await Promise.all([1, 2].map(() => ana.request.put(funcion, { headers: { Origin: web }, data: seleccion })));
  assert.deepEqual(cambios.map(r => r.status()).sort(), [200, 409]);
  const beta = await leer(ana, funcion);
  assert.equal(beta.version, inicial.version + 1);
  assert.deepEqual(beta.historial[0].agregados, [id]);
  assert.equal(beta.historial[0].anterior, "desactivado");
  assert.equal(beta.historial.length, 1);
  assert.equal((await configurar(ana, {...seleccion, version: beta.version})).version, beta.version);
  assert.deepEqual((await leer(ana, "/api/modalidades")).modos, ["1v1","2v2","3v3"]);
  assert.deepEqual((await leer(bruno, "/api/modalidades")).modos, ["1v1","2v2"]);
  await enviar(bruno, "/api/mesas", {modo: "3v3"}, 403);
  const mesa = await enviar(ana, "/api/mesas", {modo: "3v3"}, 201);
  const invitacion = "/api/invitaciones/" + new URL(mesa.invitacion).searchParams.get("invitacion");
  assert.equal((await bruno.request.get(invitacion)).status(), 403);
  await enviar(bruno, invitacion + "/unirse", {}, 403);
  const cerrado = await configurar(ana, {version: beta.version, audiencia: "desactivado", jugadores: []});
  assert.deepEqual(cerrado.historial[0].retirados, [id]);
  await enviar(ana, "/api/mesas", {modo: "3v3"}, 403);
  assert.equal((await leer(ana, invitacion)).sentada, true);
  assert.equal((await enviar(ana, invitacion + "/unirse", {})).miAsiento, 0);
  assert.equal((await leer(ana, "/api/mesas/" + mesa.id)).id, mesa.id);
  await configurar(ana, {version: cerrado.version, audiencia: "todos", jugadores: []});
  assert.equal((await leer(bruno, invitacion)).sentada, false);
  assert.equal((await enviar(bruno, invitacion + "/unirse", {})).miAsiento, 1);
}

try {
  const [ana, bruno] = await Promise.all([pagina(), pagina()]);
  await comprobarAcceso(ana, 401);
  await configurar(ana, {}, 401);
  assert.deepEqual((await leer(ana, "/api/modalidades")).modos, ["1v1","2v2"]);
  const personas = await Promise.all([ingresar(ana, "ana"), ingresar(bruno, "bruno")]);
  await comprobarAcceso(bruno, 403);
  await comprobarAcceso(ana, 200);
  assert.equal((await ana.request.post(gestion + "jugadores", { data: {} })).status(), 405);

  await probarFunciones(ana, bruno, personas[0].id);
  const totalesPrevios = await Promise.all(personas.map(persona => jugador(ana, persona)));
  const antes = await leer(ana, gestion + "vivo");
  const otroNavegador = await pagina();
  const deNuevo = await ingresar(otroNavegador, "bruno");
  assert.equal(deNuevo.id, personas[1].id);
  const abierta = await preparar(ana, bruno, "1v1", 40);
  await Promise.all([bruno, otroNavegador].map(p => conectarAMesa(p, abierta.id)));
  const espera = await leer(ana, gestion + "vivo");
  assert.equal(espera.personasConectadas, antes.personasConectadas + 1);
  assert.equal(espera.sesionesVigentes, antes.sesionesVigentes);
  const mesa = espera.elementos.find(m => m.id === abierta.id);
  assert.equal(mesa?.estado, "esperando");
  assert.deepEqual(mesa.asientos.map(a => a.conectado), [false, true]);
  assert.ok((await jugador(ana, personas[1])).mesasConectadas.includes(abierta.id));
  const historial = gestion + "historial?jugador=" + personas[0].id;
  assert.ok(!(await leer(ana, historial)).elementos.some(m => m.id === abierta.id));
  assert.ok((await leer(ana, "/api/mis-mesas")).mesas.some(m => m.id === abierta.id));
  assert.equal(await sqlDeMesa(abierta.id, "SELECT count(*) FROM juego.manos WHERE mesa=$mesa"), "0",
    "Inspeccionar una mesa lista no puede repartir cartas.");

  const parcial = await leer(ana, "/api/mesas/" + abierta.id + "/partida");
  const enJuego = await leer(ana, gestion + "vivo");
  assert.equal(enJuego.partidasEnCurso, antes.partidasEnCurso + 1);
  const pendiente = (await leer(ana, historial + "&estado=sin-terminar")).elementos.find(m => m.id === abierta.id);
  assert.equal(pendiente?.estado, "sin-terminar");
  assert.equal(pendiente.ganador, null);
  assert.equal(pendiente.fin, null);
  assert.deepEqual(pendiente.puntos, parcial.puntos);
  const resumen = JSON.stringify([pendiente, enJuego]);
  for (const dato of [...parcial.vista.cartas, new URL(abierta.invitacion).searchParams.get("invitacion")]) {
    assert.ok(!resumen.includes(dato), "El panel expuso un dato privado de la mesa.");
  }
  assert.doesNotMatch(resumen, /"(reparto|cartas|acciones|eventos|sena|invitacion|sujeto|clave)"\s*:/);

  const mixta = await preparar(ana, bruno, "2v2", 2);
  const final = await terminarChico([ana, bruno], mixta);
  const terminadas = (await leer(ana, historial + "&estado=terminada")).elementos;
  assert.ok(!terminadas.some(m => m.id === abierta.id));
  const terminada = terminadas.find(m => m.id === mixta.id);
  assert.equal(terminada?.estado, "terminada");
  assert.ok(terminada.inicio && terminada.fin);
  assert.deepEqual(terminada.puntos, final.puntos);
  assert.equal(terminada.ganador, final.ganadorPartida);
  assert.deepEqual(terminada.asientos.map(a => a.tipo), ["humano", "humano", "computadora", "computadora"]);
  assert.deepEqual(terminada.asientos.map(a => a.equipo), [0, 1, 0, 1]);
  assert.deepEqual(terminada.asientos.slice(0, 2).map(a => a.jugador), personas.map(p => p.id));
  const dia = terminada.fin.slice(0, 10);
  const filtros = historial + "&q=" + mixta.id + "&modo=2v2&desde=" + dia + "&hasta=" + dia;
  const exacta = await leer(ana, filtros);
  assert.deepEqual(exacta.elementos.map(m => m.id), [mixta.id]);
  assert.equal(exacta.total, 1);
  const vacia = await leer(ana, filtros + "&pagina=2");
  assert.deepEqual(vacia.elementos, []);
  assert.equal(vacia.total, 1);

  // Un chico anterior a la captura de replays conserva las manos originales, sin cabecera ni cierre.
  await sqlDeMesa(mixta.id, "DELETE FROM juego.eventos_chico WHERE mesa=$mesa; DELETE FROM juego.replays_chico WHERE mesa=$mesa");
  assert.ok(!(await leer(ana, "/api/mis-mesas")).mesas.some(m => m.id === mixta.id), "el chico antiguo también quedó terminado");
  const antigua = (await leer(ana, historial + "&estado=terminada")).elementos.find(m => m.id === mixta.id);
  assert.equal(antigua?.inicio, null);
  assert.equal(antigua.fin, null);
  assert.deepEqual(antigua.puntos, final.puntos);
  assert.equal(antigua.ganador, final.ganadorPartida);
  for (const [equipo, persona] of personas.entries()) {
    const actual = await jugador(ana, persona);
    assert.equal(actual.terminadas, totalesPrevios[equipo].terminadas + 1);
    assert.equal(actual.ganadas, totalesPrevios[equipo].ganadas + Number(equipo === final.ganadorPartida));
  }
  // Una mesa cerrada por abandono queda terminada: gana quien se quedó y no suma a las ganadas de quien abandonó.
  const previos = await Promise.all(personas.map(persona => jugador(ana, persona)));
  const huida = await preparar(ana, bruno, "1v1", 40);
  await leer(ana, "/api/mesas/" + huida.id + "/partida");
  const salida = await ana.request.post("/api/mesas/" + huida.id + "/abandonar", { headers: { Origin: web }, data: {} });
  assert.equal(salida.status(), 204, await salida.text());
  const abandonada = (await leer(ana, historial + "&estado=terminada")).elementos.find(m => m.id === huida.id);
  assert.equal(abandonada?.estado, "terminada");
  assert.equal(abandonada.ganador, 1);
  assert.ok(!(await leer(ana, historial + "&estado=sin-terminar")).elementos.some(m => m.id === huida.id));
  const [deAna, deBruno] = await Promise.all(personas.map(persona => jugador(ana, persona)));
  assert.equal(deAna.terminadas, previos[0].terminadas + 1);
  assert.equal(deAna.ganadas, previos[0].ganadas);
  assert.equal(deBruno.terminadas, previos[1].terminadas + 1);
  assert.equal(deBruno.ganadas, previos[1].ganadas + 1);
  // En parejas la mesa sigue sin ganador, pero quien abandonó ya terminó y perdió, como en su historial.
  const enParejas = await preparar(ana, bruno, "2v2", 40);
  await leer(ana, "/api/mesas/" + enParejas.id + "/partida");
  const cedida = await ana.request.post("/api/mesas/" + enParejas.id + "/abandonar", { headers: { Origin: web }, data: {} });
  assert.equal(cedida.status(), 204, await cedida.text());
  assert.equal((await leer(ana, historial + "&estado=sin-terminar")).elementos.find(m => m.id === enParejas.id)?.ganador, null);
  const [anaCedida, brunoSigue] = await Promise.all(personas.map(persona => jugador(ana, persona)));
  assert.equal(anaCedida.terminadas, deAna.terminadas + 1);
  assert.equal(anaCedida.ganadas, deAna.ganadas);
  assert.equal(brunoSigue.terminadas, deBruno.terminadas);
  assert.equal(brunoSigue.ganadas, deBruno.ganadas);
  await expect(ana.getByRole("navigation", { name: "Secciones del panel" })).toBeVisible();
  console.log("Gestión verificada con Keycloak, sesiones duplicadas, mesa sin repartir y chicos parciales, terminados y antiguos.");
} finally {
  await browser.close();
}
