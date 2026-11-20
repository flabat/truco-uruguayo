import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { crearPartidas } from "./partidas.ts";
import { elegirAccionOnline } from "../src/motor/mesa-online.ts";
import { reproducirChico } from "../src/motor/replay-chico.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const web = new URL(process.env.WEB_ORIGIN);
const servicio = crearPartidas(pool, web);
const jugadores = [];
const mesas = [];
const sesiones = [];
async function perfilDe(indice, query = "") {
  let cookie = sesiones[indice];
  if (!cookie) {
    const valor = randomUUID();
    const clave = createHash("sha256").update(valor).digest("hex");
    await pool.query("INSERT INTO juego.sesiones (clave, jugador) VALUES ($1,$2)", [clave, jugadores[indice]]);
    cookie = sesiones[indice] = "truco_sesion=" + valor;
  }
  return fetch("http://localhost:3001/api/perfil" + query, { headers: { cookie } });
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

async function probarMesa() {
  const id = await preparar("2v2");
  const leer = i => servicio.leer(id, jugadores[i]);
  const accion = (i, datos) => servicio.ejecutar(id, jugadores[i], "acciones", datos);
  await sentar(id, 0, jugadores[0]);
  assert.equal((await leer(0)).vista, null);
  await assert.rejects(leer(1), { status: 404 });
  for (const i of [1, 2, 3]) await sentar(id, i, jugadores[i]);
  const vistas = await Promise.all([0, 1, 2, 3].map(leer));
  assert.ok(vistas.every(p => p.manoNumero === 1 && p.version === 1));
  assert.equal(new Set(vistas.flatMap(p => p.vista.cartas)).size, 12);
  for (const [i, p] of vistas.entries()) {
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
  const nueva = comando(partida.version);
  const siguiente = await servicio.ejecutar(id, jugadores[0], "siguiente", nueva);
  assert.equal(siguiente.manoNumero, 2);
  assert.equal(siguiente.vista.dador, 0);
  assert.deepEqual(siguiente.puntos, partida.puntos);
  assert.deepEqual(await servicio.ejecutar(id, jugadores[0], "siguiente", nueva), siguiente);
  assert.deepEqual(await accion(0, truco), cantado);
  const { eventos } = await replayDe(id);
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
  assert.deepEqual(await servicio.leer(id, jugadores[0]), partida);
  await assert.rejects(servicio.ejecutar(id, jugadores[0], "siguiente", comando(partida.version)), { status: 409 });
  const replay = await replayDe(id);
  const manos = (await pool.query("SELECT acciones FROM juego.manos WHERE mesa=$1 ORDER BY numero", [id])).rows;
  assert.equal(replay.id, id);
  assert.equal(replay.origen, "mesa");
  assert.equal(replay.eventos.filter(e => e.tipo === "reparto").length, manos.length);
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
