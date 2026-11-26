// Desde el contenedor de la API y sobre la base descartable de check:stack.
// Corre después de registrar las políticas de ensayo, para que exista una política de duelo en cola.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
import { crearPartidas } from "./partidas.ts";
import { leerMesa } from "./mesas.ts";
import { elegirAccionOnline } from "@eltruco/motor/mesa-online.ts";
import { reproducirChico } from "./replay-chico.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const web = new URL(process.env.WEB_ORIGIN);
const servicio = crearPartidas(pool, web);
const base = "http://127.0.0.1:" + (process.env.PORT || 3001);
const comando = (version, accion) => ({ id: randomUUID(), version, ...(accion && { accion }) });
const abandono = "Abandonaste esta partida.";
const terminada = "La partida ya terminó.";
const noVencida = "Ese jugador volvió o todavía no pasó el minuto.";
const plazo = Number(process.env.PLAZO_ESPERA_MS);
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function jugador(nombre) {
  const sujeto = nombre + "-" + randomUUID();
  const { rows: [j] } = await pool.query(`INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('prueba-abandono',$1,$1)
    ON CONFLICT (emisor,sujeto) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`, [sujeto]);
  const sesion = randomUUID();
  await pool.query("INSERT INTO juego.sesiones (clave,jugador) VALUES ($1,$2)", [createHash("sha256").update(sesion).digest("hex"), j.id]);
  return { id: j.id, nombre: sujeto, cookie: "truco_sesion=" + sesion };
}
async function mesa(modo, creador, asientos, { meta = 4, politica = "incumbent-online-v1" } = {}) {
  const { rows: [m] } = await pool.query(`INSERT INTO juego.mesas (modo, creador, invitacion, meta, politica)
    VALUES ($1,$2,$3,$4,$5) RETURNING id, invitacion`, [modo, creador.id, randomUUID(), meta, politica]);
  for (const [asiento, persona] of asientos.entries()) {
    if (persona !== undefined) await pool.query("INSERT INTO juego.asientos (mesa,asiento,jugador,computadora) VALUES ($1,$2,$3,$4)",
      [m.id, asiento, persona?.id ?? null, persona === null]);
  }
  return m;
}
const abandonar = (persona, id) => fetch(base + "/api/mesas/" + id + "/abandonar",
  { method: "POST", headers: { cookie: persona.cookie, origin: web.origin } });
const reemplazar = (persona, id, asiento) => fetch(base + "/api/mesas/" + id + "/reemplazar", {
  method: "POST", headers: { cookie: persona.cookie, origin: web.origin, "content-type": "application/json" },
  body: JSON.stringify({ asiento }) });
/** La partida como la lee el servidor real, que sabe quién está conectado. */
async function leerPorHttp(persona, id) {
  const respuesta = await fetch(base + "/api/mesas/" + id + "/partida", { headers: { cookie: persona.cookie } });
  assert.equal(respuesta.status, 200);
  return respuesta.json();
}
/** Una conexión en vivo a la mesa; `avisos` cuenta los «actualizar» recibidos. */
async function conectar(persona, id) {
  const ws = new WebSocket(base.replace("http", "ws") + "/api/mesas/" + id + "/vivo", "truco.v1",
    { headers: { cookie: persona.cookie, origin: web.origin } });
  const conexion = { ws, avisos: 0 };
  ws.on("message", datos => { if (JSON.parse(datos.toString()).tipo === "actualizar") conexion.avisos++; });
  await new Promise((listo, fallo) => { ws.once("open", listo); ws.once("error", fallo); });
  assert.ok(await esperar(async () => conexion.avisos > 0, 2000), "la conexión recibe su vista inicial");
  return conexion;
}
async function desconectar({ ws }) {
  if (ws.readyState === WebSocket.CLOSED) return;
  await new Promise(listo => { ws.once("close", listo); ws.close(); });
}
async function rechazo(respuesta, status, error) {
  assert.equal(respuesta.status, status);
  assert.equal((await respuesta.json()).error, error);
}
async function replayDe(id) {
  const { rows: [fila] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
  return fila?.replay;
}
async function enMisMesas(persona, id) {
  const respuesta = await fetch(base + "/api/mis-mesas", { headers: { cookie: persona.cookie } });
  assert.equal(respuesta.status, 200);
  return (await respuesta.json()).mesas.some(m => m.id === id);
}
const salidas = async id => Number((await pool.query(
  "SELECT count(*) FROM juego.eventos_chico WHERE mesa=$1 AND evento->>'tipo'='salida'", [id])).rows[0].count);
const versionMano = async id => (await pool.query(
  "SELECT version FROM juego.manos WHERE mesa=$1 ORDER BY numero DESC LIMIT 1", [id])).rows[0].version;
const esperar = async (condicion, ms = 20000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await condicion()) return true; await new Promise(r => setTimeout(r, 200)); }
  return false;
};

/** B juega hasta el final del chico; la computadora juega el asiento cedido de A. */
async function jugarHastaElFinal(id, b, asientoB) {
  let partida = await servicio.leer(id, b.id);
  for (let pasos = 0; partida.ganadorPartida === null; pasos++) {
    assert.ok(pasos < 500, "el chico debe terminar");
    if (partida.vista.resultado) {
      partida = await servicio.ejecutar(id, b.id, "siguiente", comando(partida.version));
      continue;
    }
    const elegida = elegirAccionOnline(partida.vista);
    if (!elegida) {
      const version = partida.version;
      assert.ok(await esperar(async () => (await servicio.leer(id, b.id)).version !== version), "la computadora juega el asiento cedido");
      partida = await servicio.leer(id, b.id);
      continue;
    }
    const { asiento, ...accion } = elegida;
    assert.equal(asiento, asientoB);
    partida = await servicio.ejecutar(id, b.id, "acciones", comando(partida.version, accion));
  }
  return partida;
}

/**
 * Deja la mano en una decisión que solo puede tomar A (asiento 0): B juega, responde por el equipo,
 * reparte o espera a las computadoras. Si B también puede responder, la computadora no responde por A.
 */
async function llevarAlTurnoDeA(id, a, b) {
  for (let pasos = 0; ; pasos++) {
    assert.ok(pasos < 200, "la mano debe llegar al turno de A");
    const partida = await servicio.leer(id, a.id);
    const deB = await servicio.leer(id, b.id);
    if (!partida.vista.resultado && elegirAccionOnline(partida.vista) && !elegirAccionOnline(deB.vista)) return partida;
    if (deB.vista.resultado) {
      if (deB.ganadorPartida !== null) throw new Error("El chico terminó antes del turno de A.");
      await servicio.ejecutar(id, b.id, "siguiente", comando(deB.version));
      continue;
    }
    const elegida = elegirAccionOnline(deB.vista);
    if (elegida) {
      const { asiento, ...accion } = elegida;
      await servicio.ejecutar(id, b.id, "acciones", comando(deB.version, accion));
    } else {
      const version = deB.version;
      assert.ok(await esperar(async () => (await servicio.leer(id, b.id)).version !== version), "las computadoras juegan antes del turno de A");
    }
  }
}

/** Lleva la mano a una carta que solo puede jugar A; los demás humanos juegan, reparten o esperan. */
async function llevarAlTurno(id, a, otros) {
  for (let pasos = 0; ; pasos++) {
    assert.ok(pasos < 200, "la mano debe llegar al turno de A");
    const deA = await servicio.leer(id, a.id);
    const vistas = await Promise.all(otros.map(o => servicio.leer(id, o.id)));
    if (!deA.vista.resultado && elegirAccionOnline(deA.vista) && !vistas.some(v => elegirAccionOnline(v.vista))) {
      // Una respuesta pendiente la puede dar también el compañero de A; se espera una carta que solo juega A.
      if (deA.vista.legales.includes("carta")) return deA;
      const { asiento: _, ...accion } = elegirAccionOnline(deA.vista);
      await servicio.ejecutar(id, a.id, "acciones", comando(deA.version, accion));
      continue;
    }
    if (deA.vista.resultado) {
      if (deA.ganadorPartida !== null) throw new Error("El chico terminó antes del turno de A.");
      await servicio.ejecutar(id, otros[0].id, "siguiente", comando(vistas[0].version));
      continue;
    }
    const juega = vistas.findIndex(v => elegirAccionOnline(v.vista));
    if (juega >= 0) {
      const { asiento: _, ...accion } = elegirAccionOnline(vistas[juega].vista);
      await servicio.ejecutar(id, otros[juega].id, "acciones", comando(vistas[juega].version, accion));
    } else {
      const version = deA.version;
      assert.ok(await esperar(async () => (await servicio.leer(id, a.id)).version !== version), "las computadoras juegan antes del turno de A");
    }
  }
}

/** Una mesa nueva en el turno de A, reintentando si un falta envido cierra el chico antes. */
async function mesaEnTurnoDeA(modo, asientos, a, otros) {
  for (let intento = 1; ; intento++) {
    const m = await mesa(modo, a, asientos(), { meta: 12 });
    try {
      await llevarAlTurno(m.id, a, otros);
      return m;
    } catch (error) {
      if (intento === 3 || !(error instanceof Error) || error.message !== "El chico terminó antes del turno de A.") throw error;
    }
  }
}

/** Parejas con A (0) y B (1) rivales: A se desconecta en su turno y B lo reemplaza después del plazo. */
async function probarReemplazoParejas() {
  const a = await jugador("a"), b = await jugador("b");
  const m = await mesaEnTurnoDeA("2v2", () => [a, b, null, null], a, [b]);
  const enVivo = await conectar(b, m.id);
  const { esperas: [espera, ...otras] } = await leerPorHttp(b, m.id);
  assert.deepEqual(otras, []);
  assert.equal(espera.asiento, 0);
  assert.equal(espera.nombre, a.nombre);
  assert.equal(Date.parse(espera.disponible) - Date.parse(espera.desde), plazo);
  await rechazo(await reemplazar(b, m.id, 0), 409, noVencida);
  await dormir(plazo + 300);
  const respuesta = await reemplazar(b, m.id, 0);
  assert.equal(respuesta.status, 200);
  const deB = await respuesta.json();
  assert.equal(deB.ganadorPartida, null);
  assert.deepEqual(deB.esperas, [], "la computadora ya juega el asiento de A");
  const { rows: [asiento] } = await pool.query("SELECT cedido, salida FROM juego.asientos WHERE mesa=$1 AND asiento=0", [m.id]);
  assert.deepEqual(asiento, { cedido: true, salida: "desconectada" });
  assert.equal(await salidas(m.id), 1);
  await assert.rejects(servicio.leer(m.id, a.id), { status: 409, message: "Una computadora te reemplazó porque te desconectaste." });
  await rechazo(await reemplazar(a, m.id, 1), 409, "Solo quien sigue en la mesa puede reemplazar a otro jugador.");
  await desconectar(enVivo);
}

/** Duelo con A desconectado en su turno: B cobra la partida. */
async function probarCobroDuelo() {
  const a = await jugador("a"), b = await jugador("b");
  const m = await mesaEnTurnoDeA("1v1", () => [a, b], a, [b]);
  const enVivo = await conectar(b, m.id);
  assert.deepEqual((await leerPorHttp(b, m.id)).esperas.map(e => e.asiento), [0]);
  await dormir(plazo + 300);
  const respuesta = await reemplazar(b, m.id, 0);
  assert.equal(respuesta.status, 200);
  const deB = await respuesta.json();
  assert.equal(deB.ganadorPartida, 1);
  assert.deepEqual(deB.cierreAbandono, { asiento: 0, nombre: a.nombre, motivo: "desconectada", ganador: 1 });
  assert.equal(reproducirChico(await replayDe(m.id), 1).ganador, 1);
  await desconectar(enVivo);
}

/** A vuelve antes del plazo; con dos conexiones, cerrar una no lo desconecta. */
async function probarRegreso() {
  const a = await jugador("a"), b = await jugador("b");
  const m = await mesaEnTurnoDeA("1v1", () => [a, b], a, [b]);
  const enVivo = await conectar(b, m.id);
  assert.deepEqual((await leerPorHttp(b, m.id)).esperas.map(e => e.asiento), [0]);
  let avisos = enVivo.avisos;
  const primera = await conectar(a, m.id);
  assert.ok(await esperar(async () => enVivo.avisos > avisos, 2000), "la mesa relee cuando A se conecta");
  assert.deepEqual((await leerPorHttp(b, m.id)).esperas, []);
  await dormir(plazo + 300);
  await rechazo(await reemplazar(b, m.id, 0), 409, noVencida);
  const segunda = await conectar(a, m.id);
  await desconectar(primera);
  await dormir(300);
  assert.deepEqual((await leerPorHttp(b, m.id)).esperas, [], "A sigue conectado por la otra conexión");
  avisos = enVivo.avisos;
  await desconectar(segunda);
  assert.ok(await esperar(async () => enVivo.avisos > avisos, 2000), "la mesa relee cuando A cierra su última conexión");
  assert.deepEqual((await leerPorHttp(b, m.id)).esperas.map(e => e.asiento), [0]);
  await desconectar(enVivo);
}

/** B y C piden a la vez reemplazar a A: uno lo consigue y el otro recibe 409. */
async function probarReemplazoSimultaneo() {
  const a = await jugador("a"), b = await jugador("b"), c = await jugador("c");
  const m = await mesaEnTurnoDeA("2v2", () => [a, b, null, c], a, [b, c]);
  const enVivo = await conectar(b, m.id);
  assert.deepEqual((await leerPorHttp(b, m.id)).esperas.map(e => e.asiento), [0]);
  await dormir(plazo + 300);
  const respuestas = await Promise.all([reemplazar(b, m.id, 0), reemplazar(c, m.id, 0)]);
  assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409]);
  assert.equal((await respuestas.find(r => r.status === 409).json()).error, noVencida);
  assert.equal(await salidas(m.id), 1);
  await desconectar(enVivo);
}

/** Duelo contra una computadora en cola: la partida se cierra y la computadora programada ya no juega. */
async function probarDueloComputadora(pin) {
  const a = await jugador("a");
  const m = await mesa("1v1", a, [a, null], { politica: pin, meta: 12 });
  await servicio.leer(m.id, a.id);
  await pool.query("INSERT INTO juego.turnos_bot (mesa) VALUES ($1) ON CONFLICT DO NOTHING", [m.id]);
  const antes = await versionMano(m.id);
  assert.ok(await enMisMesas(a, m.id));
  assert.equal((await abandonar(a, m.id)).status, 204);
  assert.equal(await enMisMesas(a, m.id), false, "la mesa abandonada sale de las mesas de A");
  await assert.rejects(servicio.leer(m.id, a.id), { status: 409, message: abandono });
  await rechazo(await fetch(base + "/api/mesas/" + m.id, { headers: { cookie: a.cookie } }), 409, abandono);
  assert.equal(await leerMesa(pool, m.id, a.id, web), null);
  const { rows: [asiento] } = await pool.query("SELECT cedido, salida, salida_fecha FROM juego.asientos WHERE mesa=$1 AND asiento=0", [m.id]);
  assert.equal(asiento.cedido, false);
  assert.equal(asiento.salida, "abandonada");
  assert.ok(asiento.salida_fecha);
  const replay = await replayDe(m.id);
  assert.ok(replay, "el replay sigue completo");
  assert.equal(reproducirChico(replay, 1).ganador, 1);
  assert.deepEqual(replay.eventos.slice(-2).map(e => [e.tipo, e.estado ?? e.motivo]), [["salida", "abandonada"], ["cierre", "abandonado"]]);
  assert.equal(Number((await pool.query("SELECT count(*) FROM juego.turnos_bot WHERE mesa=$1", [m.id])).rows[0].count), 0);
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(await versionMano(m.id), antes, "la computadora no juega después del cierre");
  // Un reintento del pedido no duplica la salida.
  await rechazo(await abandonar(a, m.id), 409, abandono);
  assert.equal(await salidas(m.id), 1);
}

/** Duelo entre dos personas: quien se queda gana en el momento. */
async function probarDueloHumano() {
  const a = await jugador("a"), b = await jugador("b");
  const m = await mesa("1v1", a, [a, b], { meta: 12 });
  let inicial = await servicio.leer(m.id, b.id);
  // B hace una jugada antes del cierre; su reintento después del cierre recibe el mismo recibo.
  // A puede seguir decidiendo después de su primera acción, o cerrar la mano y repartir otra.
  for (let pasos = 0; !elegirAccionOnline(inicial.vista); pasos++) {
    assert.ok(pasos < 10, "B debe llegar a decidir");
    const deA = await servicio.leer(m.id, a.id);
    if (deA.vista.resultado) await servicio.ejecutar(m.id, a.id, "siguiente", comando(deA.version));
    else {
      const { asiento: _, ...accion } = elegirAccionOnline(deA.vista);
      await servicio.ejecutar(m.id, a.id, "acciones", comando(deA.version, accion));
    }
    inicial = await servicio.leer(m.id, b.id);
  }
  const { asiento: _, ...accion } = elegirAccionOnline(inicial.vista);
  const pedido = comando(inicial.version, accion);
  const recibo = await servicio.ejecutar(m.id, b.id, "acciones", pedido);
  inicial = await servicio.leer(m.id, b.id);
  assert.equal((await abandonar(a, m.id)).status, 204);
  assert.deepEqual(await servicio.ejecutar(m.id, b.id, "acciones", pedido), recibo, "el reintento conserva su recibo");
  const deB = await servicio.leer(m.id, b.id);
  assert.equal(deB.ganadorPartida, 1);
  assert.deepEqual(deB.cierreAbandono, { asiento: 0, nombre: a.nombre, motivo: "abandonada", ganador: 1 });
  assert.equal(deB.contexto.fase, "chico-terminado");
  assert.deepEqual(deB.vista.legales, []);
  assert.deepEqual(deB.puntos, inicial.puntos);
  await assert.rejects(servicio.ejecutar(m.id, b.id, "siguiente", comando(deB.version)), { status: 409, message: terminada });
  await assert.rejects(servicio.ejecutar(m.id, a.id, "siguiente", comando(deB.version)), { status: 409, message: abandono });
  await rechazo(await abandonar(b, m.id), 409, terminada);
  assert.equal(await salidas(m.id), 1);
  for (const asiento of [0, 1]) assert.equal(reproducirChico(await replayDe(m.id), asiento).ganador, 1);
}

/** Parejas: A (0) y B (2) compañeros contra dos computadoras. La computadora juega el asiento de A y B termina el chico. */
async function probarParejas() {
  let a, b, m, partida;
  for (let intento = 1; ; intento++) {
    a = await jugador("a"); b = await jugador("b");
    m = await mesa("2v2", a, [a, null, b, null], { meta: 12 });
    try {
      partida = await llevarAlTurnoDeA(m.id, a, b);
      break;
    } catch (error) {
      if (intento === 3 || !(error instanceof Error) || error.message !== "El chico terminó antes del turno de A.") throw error;
    }
  }
  assert.ok(await enMisMesas(a, m.id));
  assert.equal((await abandonar(a, m.id)).status, 204);
  assert.equal(await enMisMesas(a, m.id), false, "la mesa abandonada sale de las mesas de A");
  assert.ok(await enMisMesas(b, m.id), "B sigue viendo la mesa");
  const { rows: [asiento] } = await pool.query("SELECT cedido, salida FROM juego.asientos WHERE mesa=$1 AND asiento=0", [m.id]);
  assert.deepEqual(asiento, { cedido: true, salida: "abandonada" });
  // La computadora jugó enseguida el turno de A.
  const despues = await versionMano(m.id);
  assert.ok(despues > partida.version);
  // Un comando viejo de A (otra pestaña) no se aplica.
  const { asiento: _, ...accion } = elegirAccionOnline(partida.vista);
  await assert.rejects(servicio.ejecutar(m.id, a.id, "acciones", comando(partida.version, accion)), { status: 409, message: abandono });
  assert.equal(await versionMano(m.id), despues);
  await rechazo(await abandonar(a, m.id), 409, abandono);
  assert.equal(await salidas(m.id), 1);
  const deB = await servicio.leer(m.id, b.id);
  assert.equal(deB.ganadorPartida, null);
  assert.equal(deB.cierreAbandono, undefined);
  const final = await jugarHastaElFinal(m.id, b, 2);
  assert.notEqual(final.ganadorPartida, null);
  const replay = await replayDe(m.id);
  assert.ok(replay, "el replay sigue completo después de la salida");
  assert.equal(replay.eventos.at(-1).estado, "terminado");
  for (const s of [0, 1, 2, 3]) reproducirChico(replay, s);
  // Si hubo repartos después de la salida, la secuencia de la mano siguiente contó el evento.
  return replay.eventos.findIndex(e => e.tipo === "salida") < replay.eventos.findLastIndex(e => e.tipo === "reparto");
}

/** Sin reparto, abandonar es retirarse: libera el asiento y cancela la mesa propia. */
async function probarSinReparto() {
  const a = await jugador("a"), b = await jugador("b");
  const propia = await mesa("2v2", a, [a, b]);
  assert.equal((await abandonar(a, propia.id)).status, 204);
  const vista = await leerMesa(pool, propia.id, b.id, web);
  assert.equal(vista.cancelada, true);
  assert.equal(vista.asientos[0].tipo, "vacio");
  const ajena = await mesa("2v2", b, [b, a]);
  assert.equal((await abandonar(a, ajena.id)).status, 204);
  const libre = await leerMesa(pool, ajena.id, b.id, web);
  assert.equal(libre.cancelada, false);
  assert.equal(libre.asientos[1].tipo, "vacio");
  assert.equal(await salidas(ajena.id), 0);
}

try {
  const { rows: [enCola] } = await pool.query("SELECT pin FROM juego.artefactos WHERE contenido->>'format'='duel' LIMIT 1");
  assert.ok(enCola, "falta una política de duelo registrada");
  await probarDueloComputadora(enCola.pin);
  await probarDueloHumano();
  // Un falta envido puede cerrar el chico en la mano de la salida: se repite hasta que haya un reparto después.
  let repartoDespues = false;
  for (let intento = 0; intento < 3 && !repartoDespues; intento++) repartoDespues = await probarParejas();
  assert.ok(repartoDespues, "hubo un reparto después de la salida");
  await probarSinReparto();
  assert.ok(plazo > 0 && plazo <= 5000, "la pila usa un plazo de espera corto (PLAZO_ESPERA_MS)");
  await probarReemplazoParejas();
  await probarCobroDuelo();
  await probarRegreso();
  await probarReemplazoSimultaneo();
  console.log("Abandono verificado · duelo cerrado (computadora en cola y humano), parejas cedidas hasta el final, mesas sin reparto liberadas,"
    + " reemplazo y cobro por desconexión después del plazo, regreso a tiempo y un único reemplazo simultáneo.");
} finally {
  await pool.end();
}
