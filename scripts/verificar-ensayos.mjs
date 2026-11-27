// El servidor vivo avanza estos chicos; la prueba solo inscribe mesas y audita registros completos.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";
import pg from "pg";
import { crearEnsayo } from "./ensayos.ts";
import { politicaPieParejas } from "@eltruco/motor/modelo-pie.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { restaurar } from "./turnos.ts";
import { restaurarTercetosDB } from "./partidas-tercetos.ts";
import { marcadorOnline } from "@eltruco/motor/mesa-online.ts";
import { reproducirChico } from "../api/replay-chico.ts";
import { hasSignals, activeFormats, seatsFor } from "../training/contracts/index.ts";

const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
const {rows: [creador]} = await pool.query(`INSERT INTO juego.jugadores (emisor,sujeto,nombre)
  VALUES ('ensayo-local',$1,'Operador de prueba') RETURNING id`, [randomUUID()]);
const mesas = [];
const recuperado=process.argv[2]==="recuperado", aprendidos=process.argv[2]==="aprendidos";
const pieAprendido = process.argv[2] === "al-pie-aprendido";
const alPie = process.argv[2] === "al-pie" || pieAprendido;
// Con actores aprendidos al pie activados, cada modalidad al pie que tenga uno se ensaya con su pin.
const pinesPie = pieAprendido ? Object.fromEntries((await pool.query(
  "SELECT formato, pin FROM juego.activaciones WHERE formato IN ('pairs-pie','triples-pie')")).rows.map(f => [f.formato, f.pin])) : {};
const pinPie = formato => pieAprendido ? pinesPie[formato === "triples" ? "triples-pie" : "pairs-pie"] : politicaPieParejas;
const formatos = pieAprendido ? ["pairs-private-senas", "triples"].filter(pinPie) : alPie ? ["pairs-private-senas"] : recuperado ? ["duel"]
  : aprendidos ? activeFormats : [...activeFormats, "triples"];
try {
  for (const formato of formatos) {
    const previa = recuperado && (await pool.query("SELECT * FROM juego.prueba_reinicio_actor")).rows[0];
    const id = previa ? previa.mesa : await crearEnsayo(pool, formato, creador.id, alPie ? pinPie(formato) : undefined);
    mesas.push(id);
    const limite = Date.now() + 90_000;
    while (!(await pool.query("SELECT ensayo_terminado FROM juego.mesas WHERE id=$1", [id])).rows[0].ensayo_terminado) {
      assert.ok(Date.now() < limite, "El servidor no completó " + formato);
      await esperar(50);
    }
    const asientos = await pool.query("SELECT jugador,computadora FROM juego.asientos WHERE mesa=$1", [id]);
    const cantidad = formato === "triples" ? 6 : seatsFor(formato);
    assert.equal(asientos.rowCount, cantidad);
    assert.ok(asientos.rows.every(a => a.computadora && a.jugador === null));
    const filas = await pool.query("SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero", [id]);
    const inferencias=(await pool.query("SELECT * FROM juego.inferencias WHERE mesa=$1 ORDER BY mano, version_anterior",[id])).rows;
    assert.equal(inferencias.length,filas.rows.reduce((n,h)=>n+h.acciones.length,0));
    if (alPie) {
      assert.ok(inferencias.length > 0);
      const pin = pinPie(formato);
      if (pieAprendido) assert.match(pin, /^[0-9a-f]{64}$/);
      assert.ok(inferencias.every(i => i.solicitada === pin && i.aplicada === pin && i.fallback === null));
      assert.ok(filas.rows.every(fila => fila.version_senas === versionSenasPie));
    }
    if (aprendidos) {
      const {politica}=(await pool.query("SELECT politica FROM juego.mesas WHERE id=$1",[id])).rows[0];
      assert.match(politica, /^[0-9a-f]{64}$/);
      assert.ok(inferencias.every(i=>i.solicitada===politica));
      assert.ok(inferencias.some(i=>i.aplicada===politica && i.fallback===null));
    }
    if (previa) {
      assert.deepEqual(filas.rows[0].acciones[0],previa.accion);
      assert.ok(inferencias.every(i=>i.fallback==="missing" && i.aplicada==="incumbent-online-v1"));
    }
    let puntos = [0,0], dador;
    for (const [i, fila] of filas.rows.entries()) {
      assert.deepEqual(fila.puntos_inicio, puntos);
      assert.equal(fila.numero, i + 1);
      if (dador !== undefined) assert.equal(fila.reparto.dador, (dador + 1) % cantidad);
      dador = fila.reparto.dador;
      if (formato === "triples") {
        const estado = restaurarTercetosDB(fila);
        assert.ok(estado.resultado);
        puntos = marcadorOnline(estado);
        continue;
      }
      const mano = restaurar(fila, formato);
      assert.ok(mano.estado.resultado);
      assert.ok(mano.turnos.length);
      if (!aprendidos && !alPie) assert.ok(mano.turnos.every(t => Boolean(t.signal) === hasSignals(formato)));
      for (const a of mano.estado.cobros) puntos[a.equipo] = Math.min(40, puntos[a.equipo] + a.tantos);
    }
    assert.equal(Math.max(...puntos), formato === "triples" ? 50 : 40);
    const { rows: [{ replay }] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
    assert.equal(replay.origen, "mesa");
    assert.equal(replay.perfil, formato === "triples" ? "tercetos-v1" : formato);
    assert.deepEqual(replay.eventos.filter(e => e.tipo === "reparto").map(e => e.reparto), filas.rows.map(f => f.reparto));
    assert.equal(replay.eventos.filter(e => e.tipo === "cierre").length, 1);
    const decisiones = replay.eventos.filter(e => e.tipo === "decision");
    assert.deepEqual(decisiones.map(({ accion, duelo }) => duelo === undefined ? accion : { ...accion, duelo }),
      filas.rows.flatMap(f => f.acciones));
    for (const [i, { bot }] of decisiones.entries()) {
      assert.equal(bot.solicitada, inferencias[i].solicitada);
      assert.equal(bot.aplicada, inferencias[i].aplicada);
      assert.equal(bot.fallback ?? null, inferencias[i].fallback);
      if (bot.fallback) assert.equal(bot.latenciaMs, inferencias[i].latencia_ms);
    }
    for (const asiento of replay.asientos.keys()) {
      const final = reproducirChico(replay, asiento);
      assert.equal(final.estado, "terminado");
      assert.deepEqual(final.puntos, puntos);
      assert.equal(final.ganador, puntos.indexOf(replay.meta));
    }
    console.log(formato, filas.rowCount, "manos reproducidas", puntos);
  }
} finally {
  for (const tabla of ["manos", "asientos"]) await pool.query("DELETE FROM juego." + tabla + " WHERE mesa=ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.mesas WHERE id=ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.jugadores WHERE id=$1", [creador.id]);
  await pool.end();
}
