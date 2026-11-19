import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { crearPartidas } from "./partidas.ts";
import { elegirAccionOnline } from "../src/motor/mesa-online.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const web = new URL(process.env.WEB_ORIGIN);
const servicio = crearPartidas(pool, web);
const jugadores = [];
const mesas = [];
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
}

async function probarComputadoras(modo, meta) {
  const id = await preparar(modo, meta);
  const cantidad = modo === "1v1" ? 2 : 4;
  await sentar(id, 0, jugadores[0]);
  for (let i = 1; i < cantidad; i++) await sentar(id, i, null);
  let partida = await servicio.leer(id, jugadores[0]);
  let pasos = 0;
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
    partida = await servicio.ejecutar(id, jugadores[0], "acciones", comando(partida.version, accion));
  }
  assert.equal(partida.puntos[partida.ganadorPartida], meta);
  assert.deepEqual(await servicio.leer(id, jugadores[0]), partida);
  await assert.rejects(servicio.ejecutar(id, jugadores[0], "siguiente", comando(partida.version)), { status: 409 });
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
  await pool.query("DELETE FROM juego.jugadores WHERE id = ANY($1::uuid[])", [jugadores]);
  await pool.end();
}
