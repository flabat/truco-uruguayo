import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { crearPartidas } from "./partidas.ts";
import { elegirAccionOnline } from "@eltruco/motor/mesa-online.ts";
import { reproducirChico } from "../api/replay-chico.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const web = new URL(process.env.WEB_ORIGIN);
const servicio = crearPartidas(pool, web);
const jugadores = [];
const mesas = [];
const sesiones = [];
async function cookieDe(indice) {
  let cookie = sesiones[indice];
  if (!cookie) {
    const valor = randomUUID();
    const clave = createHash("sha256").update(valor).digest("hex");
    await pool.query("INSERT INTO juego.sesiones (clave, jugador) VALUES ($1,$2)", [clave, jugadores[indice]]);
    cookie = sesiones[indice] = "truco_sesion=" + valor;
  }
  return cookie;
}

async function perfilDe(indice, query = "") {
  return fetch("http://localhost:3001/api/perfil" + query, { headers: { cookie: await cookieDe(indice) } });
}

const comando = (version, accion) => ({ id: randomUUID(), version, ...(accion && { accion }) });

async function preparar(modo, meta = 40) {
  const { rows: [mesa] } = await pool.query("INSERT INTO juego.mesas (modo, creador, invitacion, meta) VALUES ($1,$2,$3,$4) RETURNING id",
    [modo, jugadores[0], randomUUID(), meta]);
  mesas.push(mesa.id);
  return mesa.id;
}

async function sentar(id, asiento, jugador) {
  await pool.query("INSERT INTO juego.asientos (mesa,asiento,jugador,computadora) VALUES ($1,$2,$3,$4)",
    [id, asiento, jugador, jugador === null]);
}

async function replayDe(mesa) {
  const { rows } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [mesa]);
  assert.equal(rows.length, 1);
  return rows[0].replay;
}

async function probarReintentoAtomico(mesa, orden) {
  // La restricción diferida falla al confirmar, después de escribir la mano, el replay y el recibo.
  orden.id = "00000000-0000-4000-8000-000000000195";
  const antes = await replayDe(mesa);
  // Una instancia anterior puede avanzar la mano durante un despliegue sin escribir el evento.
  const vieja = await pool.connect();
  try {
    await vieja.query("BEGIN");
    await vieja.query("UPDATE juego.manos SET acciones=acciones || $2::jsonb WHERE mesa=$1 AND numero=$3",
      [mesa, JSON.stringify([{ ...orden.accion, asiento: 0 }]), antes.eventos.filter(e => e.tipo === "reparto").length]);
    assert.equal((await vieja.query("SELECT mesa FROM juego.replays_chico_v1 WHERE mesa=$1", [mesa])).rowCount, 0);
  } finally {
    await vieja.query("ROLLBACK");
    vieja.release();
  }
  await pool.query(`
    CREATE FUNCTION juego.fallar_recibo_de_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fallo de prueba antes del commit'; END $$;
    CREATE CONSTRAINT TRIGGER fallar_recibo AFTER INSERT ON juego.comandos DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW WHEN (NEW.id = '00000000-0000-4000-8000-000000000195')
      EXECUTE FUNCTION juego.fallar_recibo_de_prueba()`);
  try {
    await assert.rejects(servicio.ejecutar(mesa, jugadores[0], "acciones", orden), /Fallo de prueba antes del commit/);
    assert.deepEqual(await replayDe(mesa), antes);
    assert.equal((await servicio.leer(mesa, jugadores[0])).version, orden.version);
    assert.equal((await pool.query("SELECT id FROM juego.comandos WHERE mesa=$1 AND id=$2", [mesa, orden.id])).rowCount, 0);
  } finally {
    await pool.query("DROP TRIGGER fallar_recibo ON juego.comandos; DROP FUNCTION juego.fallar_recibo_de_prueba()");
  }
  const otraInstancia = crearPartidas(pool, web);
  const [primera, repetida] = await Promise.all([servicio, otraInstancia].map(s => s.ejecutar(mesa, jugadores[0], "acciones", orden)));
  assert.deepEqual(repetida, primera);
  const despues = await replayDe(mesa);
  assert.deepEqual(despues.eventos.slice(0, antes.eventos.length), antes.eventos);
  const nuevasHumanas = despues.eventos.slice(antes.eventos.length).filter(e => e.tipo === "decision" && !e.bot);
  assert.deepEqual(nuevasHumanas.map(e => e.accion), [{ ...orden.accion, asiento: 0 }]);
  await assert.rejects(otraInstancia.ejecutar(mesa, jugadores[0], "acciones", { ...orden, id: randomUUID() }), { status: 409 });
  assert.deepEqual(await replayDe(mesa), despues);
  return primera;
}

async function probarReporte(mesa) {
  const api = "http://localhost:3001/api";
  const ruta = api + "/mesas/" + mesa + "/reportes";
  const cookie = await cookieDe(0);
  const cursor = { mano: "1", posicion: "1", vuelta: "1", puntos: "0-0", fase: "jugada", cliente: "a".repeat(40) };
  const enviar = (campos = cursor, sesion = cookie, origen = web.origin, url = ruta) =>
    fetch(url, { method: "POST", headers: { cookie: sesion, origin: origen }, body: new URLSearchParams(campos), redirect: "manual" });
  const permiso = async () => (await (await fetch(api + "/jugador", { headers: { cookie } })).json()).puedeReportar;
  assert.equal(await permiso(), false);
  assert.equal((await enviar(cursor, "")).status, 401);
  assert.equal((await enviar()).status, 403);
  await pool.query("INSERT INTO juego.reporteros (jugador) VALUES ($1)", [jugadores[0]]);
  assert.equal(await permiso(), true);
  assert.equal((await enviar(cursor, cookie, "https://otro.example")).status, 403);
  assert.equal((await enviar(cursor, cookie, web.origin, api + "/mesas/" + randomUUID() + "/reportes")).status, 404);
  assert.equal((await enviar({ ...cursor, posicion: "9999" })).status, 409);
  assert.equal((await enviar({ ...cursor, asiento: "3" })).status, 400);
  // La API ya está en la mano 2. El navegador envía la primera jugada de la mano anterior.
  const respuestas = await Promise.all([enviar(), enviar()]);
  assert.ok(respuestas.every(r => r.status === 303));
  const ubicacion = respuestas[0].headers.get("location");
  assert.equal(respuestas[1].headers.get("location"), ubicacion);
  const url = new URL(ubicacion);
  assert.equal(url.origin + url.pathname, "https://github.com/flabat/truco-uruguayo/issues/new");
  const body = url.searchParams.get("body");
  assert.ok(body.includes(mesa));
  assert.match(body, /Truco/i);
  assert.doesNotMatch(body, /Quiero|oros-03|espadas-12/);
  const { rows } = await pool.query("SELECT id, mano, posicion, secuencia, asiento, cliente FROM juego.reportes WHERE mesa=$1", [mesa]);
  assert.equal(rows.length, 1);
  assert.ok(body.includes(rows[0].id));
  assert.deepEqual([rows[0].mano, rows[0].posicion, Number(rows[0].secuencia), rows[0].asiento, rows[0].cliente],
    [1, 1, 2, 0, cursor.cliente]);
  await pool.query("DELETE FROM juego.reporteros WHERE jugador=$1", [jugadores[0]]);
  assert.equal(await permiso(), false);
  assert.equal((await enviar()).status, 403);
}

async function probarMesa() {
  const id = await preparar("2v2");
  const leer = i => servicio.leer(id, jugadores[i]);
  const accion = (i, datos) => servicio.ejecutar(id, jugadores[i], "acciones", datos);
  await sentar(id, 0, jugadores[0]);
  const sinRepartir = await leer(0);
  assert.equal(sinRepartir.vista, null);
  assert.equal("lance" in sinRepartir, false);
  assert.deepEqual(sinRepartir.contexto, { versionVista: 1, fase: "sin-repartir" });
  await assert.rejects(leer(1), { status: 404 });
  for (const i of [1, 2, 3]) await sentar(id, i, jugadores[i]);
  const vistas = await Promise.all([0, 1, 2, 3].map(leer));
  assert.ok(vistas.every(p => p.manoNumero === 1 && p.version === 1));
  assert.equal(new Set(vistas.flatMap(p => p.vista.cartas)).size, 12);
  for (const [i, p] of vistas.entries()) {
    assert.deepEqual(p.lance, { tipo: "simple", duelo: null, activos: [0, 1, 2, 3] });
    assert.deepEqual(p.contexto, { versionVista: 1, fase: "en-juego" });
    for (const [j, otra] of vistas.entries()) {
      if (i !== j) for (const carta of otra.vista.cartas) assert.ok(!JSON.stringify(p).includes(carta));
    }
  }
  assert.equal((await pool.query("SELECT numero FROM juego.manos WHERE mesa=$1", [id])).rowCount, 1);

  // Reparto conocido con cuatro manos sin flor para enfrentar a dos rivales al mismo truco.
  const reparto = { versionReparto: "online-1", dador: 3, mano: 0, muestra: "copas-06", manos: [
    ["oros-03", "espadas-12", "oros-01"], ["copas-03", "oros-12", "copas-01"],
    ["bastos-04", "espadas-05", "oros-07"], ["oros-04", "bastos-05", "espadas-07"],
  ] };
  await pool.query("UPDATE juego.manos SET reparto=$2 WHERE mesa=$1", [id, reparto]);
  await assert.rejects(accion(1, comando(1, { tipo: "truco" })), { status: 409 });
  await assert.rejects(accion(1, comando(1, { tipo: "truco", asiento: 0 })), { status: 400 });
  await assert.rejects(accion(0, comando(1, { tipo: "carta", carta: reparto.manos[1][0] })), { status: 409 });
  assert.equal((await leer(0)).version, 1);
  const truco = comando(1, { tipo: "truco" });
  const cantado = await accion(0, truco);
  const otraInstancia = crearPartidas(pool, web);
  assert.deepEqual(await otraInstancia.leer(id, jugadores[0]), cantado);
  const respuestas = await Promise.allSettled([1, 3].map(i => accion(i, comando(2, { tipo: "quiero" }))));
  assert.equal(respuestas.filter(r => r.status === "fulfilled").length, 1);
  assert.ok(respuestas.some(r => r.status === "rejected" && r.reason.status === 409));
  assert.deepEqual(await accion(0, truco), cantado);
  await assert.rejects(accion(0, { ...truco, accion: { tipo: "envido" } }), { status: 409 });
  const estado = await leer(3);
  assert.equal(estado.version, 3);
  assert.equal(estado.vista.acciones.filter(a => a.tipo === "quiero").length, 1);

  let partida = estado;
  while (!partida.vista.resultado) {
    const turno = partida.vista.turno;
    const propia = await leer(turno);
    partida = await accion(turno, comando(propia.version, { tipo: "carta", carta: propia.vista.cartas[0] }));
  }
  assert.equal(partida.puntos.reduce((a, b) => a + b), 2);
  assert.equal(partida.contexto.fase, "reparto-cerrado");
  assert.ok(Array.isArray(partida.vista.cartas));
  const nueva = comando(partida.version);
  const siguiente = await servicio.ejecutar(id, jugadores[0], "siguiente", nueva);
  assert.equal(siguiente.manoNumero, 2);
  assert.equal(siguiente.vista.dador, 0);
  assert.deepEqual(siguiente.puntos, partida.puntos);
  assert.deepEqual(await servicio.ejecutar(id, jugadores[0], "siguiente", nueva), siguiente);
  assert.deepEqual(await accion(0, truco), cantado);
  const { eventos } = await replayDe(id);
  await probarReporte(id);
  assert.deepEqual(eventos.filter(e => e.tipo === "reparto").map(e => e.manoNumero), [1, 2]);
  assert.equal(eventos.filter(e => e.tipo === "decision" && e.accion.tipo === "quiero").length, 1);
}

async function probarComputadoras(modo, meta) {
  const id = await preparar(modo, meta);
  const cantidad = modo === "1v1" ? 2 : 4;
  await sentar(id, 0, jugadores[0]);
  for (let i = 1; i < cantidad; i++) await sentar(id, i, null);
  let partida = await servicio.leer(id, jugadores[0]);
  let pasos = 0;
  let probarReintento = modo === "1v1";
  while (partida.ganadorPartida === null) {
    assert.equal(partida.meta, meta);
    assert.ok(++pasos < 2500);
    if (partida.vista.resultado) {
      partida = await servicio.ejecutar(id, jugadores[0], "siguiente", comando(partida.version));
      continue;
    }
    const elegida = elegirAccionOnline(partida.vista);
    assert.ok(elegida, "La mesa debe detenerse al llegar al turno humano.");
    const { asiento, ...accion } = elegida;
    assert.equal(asiento, 0);
    const orden = comando(partida.version, accion);
    if (probarReintento) {
      partida = await probarReintentoAtomico(id, orden);
      probarReintento = false;
    } else {
      partida = await servicio.ejecutar(id, jugadores[0], "acciones", orden);
    }
  }
  assert.equal(partida.puntos[partida.ganadorPartida], meta);
  assert.equal(partida.contexto.fase, "chico-terminado");
  assert.deepEqual(await servicio.leer(id, jugadores[0]), partida);
  await assert.rejects(servicio.ejecutar(id, jugadores[0], "siguiente", comando(partida.version)), { status: 409 });
  const replay = await replayDe(id);
  const manos = (await pool.query("SELECT reparto, acciones FROM juego.manos WHERE mesa=$1 ORDER BY numero", [id])).rows;
  assert.equal(replay.id, id);
  assert.equal(replay.origen, "mesa");
  const repartos = replay.eventos.filter(e => e.tipo === "reparto").map(e => e.reparto);
  assert.deepEqual(repartos, manos.map(m => m.reparto));
  const computadoras = Array.from({ length: cantidad - 1 }, (_, i) => i + 1);
  for (const reparto of repartos) assert.deepEqual(reparto.respondenSinFlor, computadoras);
  assert.equal(replay.eventos.filter(e => e.tipo === "cierre").length, 1);
  const decisiones = replay.eventos.filter(e => e.tipo === "decision");
  assert.deepEqual(decisiones.map(e => e.accion), manos.flatMap(m => m.acciones));
  assert.ok(decisiones.some(e => e.bot));
  assert.ok(decisiones.some(e => !e.bot));
  const final = reproducirChico(replay, 0);
  assert.equal(final.estado, "terminado");
  assert.equal(final.ganador, partida.ganadorPartida);
  assert.deepEqual(final.puntos, partida.puntos);
  assert.deepEqual(final.vista, partida.vista);

  const respuesta = await perfilDe(0);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get("cache-control"), "no-store");
  const perfil = await respuesta.json();
  assert.equal(perfil.jugador.id, jugadores[0]);
  const resumen = perfil.partidas.find(p => p.id === id);
  assert.deepEqual(resumen, {
    id, modo, meta, mano: partida.manoNumero, fecha: replay.eventos.at(-1).fecha,
    resultado: partida.ganadorPartida === 0 ? "ganada" : "perdida",
    puntos: { propios: partida.puntos[0], rivales: partida.puntos[1] },
  });

  const rival = await (await perfilDe(1, "?jugador=" + jugadores[0])).json();
  assert.equal(rival.jugador.id, jugadores[1]);
  assert.ok(rival.partidas.every(p => p.id !== id));
  assert.equal((await perfilDe(0, "?pagina=0")).status, 400);

  // Compatibilidad con chicos guardados antes de la captura de eventos.
  await pool.query("DELETE FROM juego.eventos_chico WHERE mesa=$1", [id]);
  await pool.query("DELETE FROM juego.replays_chico WHERE mesa=$1", [id]);
  const historica = await (await perfilDe(0)).json();
  assert.deepEqual(historica.partidas.find(p => p.id === id), { ...resumen, fecha: null });

}

try {
  for (let i = 0; i < 4; i++) {
    const { rows: [j] } = await pool.query("INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('prueba-partidas',$1,$1) RETURNING id", [randomUUID()]);
    jugadores.push(j.id);
  }
  await probarMesa();
  await probarComputadoras("1v1", 26);
  await probarComputadoras("2v2", 50);
  console.log("Partidas verificadas: reparto, manos privadas, reintentos y chicos a 26 y a 50 con computadoras.");
} finally {
  for (const tabla of ["comandos", "manos", "asientos"]) await pool.query("DELETE FROM juego." + tabla + " WHERE mesa = ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.mesas WHERE id = ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.sesiones WHERE jugador = ANY($1::uuid[])", [jugadores]);
  await pool.query("DELETE FROM juego.jugadores WHERE id = ANY($1::uuid[])", [jugadores]);
  await pool.end();
}
