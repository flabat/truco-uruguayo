// El servidor vivo avanza estos chicos; la prueba solo inscribe mesas y audita registros completos.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";
import pg from "pg";
import { crearEnsayo } from "./ensayos.ts";
import { restaurar } from "./turnos.ts";
import { formats, seatsFor } from "../training/contracts/index.ts";

const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
const {rows: [creador]} = await pool.query(`INSERT INTO juego.jugadores (emisor,sujeto,nombre)
  VALUES ('ensayo-local',$1,'Operador de prueba') RETURNING id`, [randomUUID()]);
const mesas = [];
const recuperado=process.argv[2]==="recuperado", aprendidos=process.argv[2]==="aprendidos";
try {
  for (const formato of (recuperado ? ["duel"] : formats)) {
    const previa = recuperado && (await pool.query("SELECT * FROM juego.prueba_reinicio_actor")).rows[0];
    const id = previa ? previa.mesa : await crearEnsayo(pool, formato, creador.id);
    mesas.push(id);
    const limite = Date.now() + 90_000;
    while (!(await pool.query("SELECT ensayo_terminado FROM juego.mesas WHERE id=$1", [id])).rows[0].ensayo_terminado) {
      assert.ok(Date.now() < limite, "El servidor no completó " + formato);
      await esperar(50);
    }
    const asientos = await pool.query("SELECT jugador,computadora FROM juego.asientos WHERE mesa=$1", [id]);
    assert.equal(asientos.rowCount, seatsFor(formato));
    assert.ok(asientos.rows.every(a => a.computadora && a.jugador === null));
    const filas = await pool.query("SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero", [id]);
    const inferencias=(await pool.query("SELECT * FROM juego.inferencias WHERE mesa=$1",[id])).rows;
    assert.equal(inferencias.length,filas.rows.reduce((n,h)=>n+h.acciones.length,0));
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
      if (dador !== undefined) assert.equal(fila.reparto.dador, (dador + 1) % seatsFor(formato));
      dador = fila.reparto.dador;
      const mano = restaurar(fila, formato);
      assert.ok(mano.estado.resultado);
      assert.ok(mano.turnos.length);
      if (!aprendidos) assert.ok(mano.turnos.every(t => Boolean(t.signal) === (formato === "pairs-senas")));
      for (const a of mano.estado.cobros) puntos[a.equipo] = Math.min(40, puntos[a.equipo] + a.tantos);
    }
    assert.equal(Math.max(...puntos), 40);
    console.log(formato, filas.rowCount, "manos reproducidas", puntos);
  }
} finally {
  for (const tabla of ["manos", "asientos"]) await pool.query("DELETE FROM juego." + tabla + " WHERE mesa=ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.mesas WHERE id=ANY($1::uuid[])", [mesas]);
  await pool.query("DELETE FROM juego.jugadores WHERE id=$1", [creador.id]);
  await pool.end();
}
