// Corre dentro de la API de check:stack con una base nueva y sin servidores de juego.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { migrate } from "./migrate.ts";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const nombre = "salon_" + randomUUID().replaceAll("-", "");
const url = new URL(process.env.DATABASE_URL);
url.pathname = "/" + nombre;
await admin.query("CREATE DATABASE " + nombre);
const db = new pg.Client({ connectionString: url.href });
try {
  await db.connect();
  const migraciones = new URL("./migrations/", import.meta.url);
  await db.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())");
  for (const archivo of (await readdir(migraciones)).sort().filter(f => f.endsWith(".sql") && f < "013-salon.sql")) {
    await db.query(await readFile(new URL(archivo, migraciones), "utf8"));
    await db.query("INSERT INTO schema_migrations(name) VALUES ($1)", [archivo]);
  }
  const { rows: [jugador] } = await db.query("INSERT INTO juego.jugadores(emisor,sujeto,nombre) VALUES ('prueba','1','Ana') RETURNING id");
  for (const [modo, ensayo] of [["1v1", false], ["2v2", false], ["3v3", false], ["2v2", true]]) {
    const { rows: [mesa] } = await db.query(`INSERT INTO juego.mesas(modo,creador,invitacion,solo_computadoras,perfil_tercetos)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`, [modo, jugador.id, randomUUID(), ensayo, modo === "3v3" ? "tercetos-v1" : null]);
    const cantidad = { "1v1": 2, "2v2": 4, "3v3": 6 }[modo];
    for (let i = 0; i < cantidad; i++) {
      const humano = i === 0 && !ensayo;
      await db.query("INSERT INTO juego.asientos(mesa,asiento,jugador,computadora) VALUES ($1,$2,$3,$4)",
        [mesa.id, i, humano ? jugador.id : null, !humano]);
    }
  }
  const invitados = () => db.query(`SELECT m.id, m.invitacion, a.asiento, a.jugador, a.computadora FROM juego.mesas m
    JOIN juego.asientos a ON a.mesa=m.id ORDER BY m.id, a.asiento`).then(r => r.rows);
  const anteriores = await invitados();
  const activoHistorico = "a".repeat(64), usadoEnMesa = "b".repeat(64), soloEnEnsayo = "c".repeat(64);
  await db.query("INSERT INTO juego.artefactos VALUES ($1,'pairs','{}'),($2,'pairs','{}'),($3,'pairs','{}')",
    [activoHistorico, usadoEnMesa, soloEnEnsayo]);
  await db.query("INSERT INTO juego.activaciones VALUES ('pairs',$1)", [activoHistorico]);
  await db.query("UPDATE juego.mesas SET politica=CASE WHEN solo_computadoras THEN $1 ELSE $2 END WHERE modo='2v2'",
    [soloEnEnsayo, usadoEnMesa]);
  const pool = new pg.Pool({ connectionString: url.href });
  try { await migrate(pool); await migrate(pool); } finally { await pool.end(); }
  assert.deepEqual(await invitados(), anteriores);
  const publicacion = async pin => (await db.query(
    "SELECT nombre, publicada_el::text AS fecha FROM juego.publicaciones_modelo WHERE pin=$1", [pin])).rows[0];
  assert.equal((await publicacion(activoHistorico)).fecha, null);
  await db.query("UPDATE juego.activaciones SET pin=$1 WHERE formato='pairs'", [usadoEnMesa]);
  assert.equal((await publicacion(usadoEnMesa)).fecha, null);
  assert.equal(await publicacion(soloEnEnsayo), undefined);
  await db.query("UPDATE juego.activaciones SET pin=$1 WHERE formato='pairs'", [soloEnEnsayo]);
  assert.equal((await publicacion(soloEnEnsayo)).nombre, "Parejas 2");
  const ceibo = "6167e85c55fad708de425839d3ff51ca05eb7af5c5f9ae94252bb5513071d2e2";
  await db.query("INSERT INTO juego.artefactos VALUES ($1,'pairs','{}')", [ceibo]);
  await db.query("UPDATE juego.activaciones SET pin=$1 WHERE formato='pairs'", [ceibo]);
  assert.deepEqual(await publicacion(ceibo), { nombre: "Ceibo Parejas", fecha: "2026-11-20" });
  assert.equal((await db.query("SELECT id FROM juego.mesas WHERE publica OR origen <> CASE WHEN solo_computadoras THEN 'ensayo' ELSE 'humana' END")).rowCount, 0);
  assert.equal((await db.query("SELECT id FROM juego.mesas_en_juego")).rowCount, 0);
  assert.equal((await db.query("SELECT numero FROM juego.cupos_exhibicion")).rowCount, 10);

  const alta = () => db.query(`INSERT INTO juego.mesas(modo,creador,invitacion,publica,solo_computadoras,cupo_exhibicion)
    VALUES ('1v1',$1,$2,true,true,1) RETURNING id, origen`, [jugador.id, randomUUID()]).then(r => r.rows[0]);
  const mesa = await alta();
  assert.equal(mesa.origen, "exhibicion");
  await assert.rejects(alta, { code: "23505" });
  const visible = () => db.query("SELECT id FROM juego.mesas_en_juego WHERE id=$1", [mesa.id]).then(r => r.rowCount);
  const evento = (pos, dato, id = mesa.id) => db.query(`INSERT INTO juego.eventos_chico(mesa,mano,posicion,secuencia,evento,build)
    VALUES ($1,1,$2,$2::integer+1,$3,'prueba')`, [id, pos, dato]);

  // Las salas anteriores sin fecha siguen sin fecha hasta la primera jugada visible.
  const privada = anteriores.find(a => a.jugador === jugador.id).id;
  const actividad = async () => (await db.query("SELECT actividad_jugadores::text AS fecha FROM juego.mesas WHERE id=$1", [privada])).rows[0].fecha;
  assert.equal(await actividad(), null);
  await evento(0, { tipo: "reparto" }, privada);
  assert.ok(await actividad());
  await db.query("UPDATE juego.mesas SET actividad_jugadores=now()-interval '8 days' WHERE id=$1", [privada]);
  const antes = await actividad();
  await evento(1, { tipo: "decision", accion: { tipo: "paso-flor", asiento: 0 } }, privada);
  await db.query(`INSERT INTO juego.eventos_chico(mesa,mano,posicion,secuencia,evento,build)
    VALUES ($1,1,NULL,3,'{"tipo":"indicacion"}','prueba')`, [privada]);
  assert.equal(await actividad(), antes);
  await evento(3, { tipo: "decision", accion: { tipo: "truco", asiento: 0 } }, privada);
  assert.notEqual(await actividad(), antes);

  assert.equal(await visible(), 0);
  await evento(0, { tipo: "reparto" });
  assert.equal(await visible(), 1);
  await db.query("UPDATE juego.mesas SET ultimo_hecho_publico=now()-interval '61 seconds' WHERE id=$1", [mesa.id]);
  await evento(1, { tipo: "decision", accion: { tipo: "paso-flor" } });
  assert.equal(await visible(), 0);
  await db.query("BEGIN");
  await evento(2, { tipo: "decision", accion: { tipo: "truco" } });
  assert.equal(await visible(), 1);
  await db.query("ROLLBACK");
  assert.equal(await visible(), 0);
  await evento(2, { tipo: "decision", accion: { tipo: "truco" } });
  await evento(3, { tipo: "cierre", fecha: new Date().toISOString() });
  assert.equal(await visible(), 0);
  assert.ok((await db.query("SELECT fin_publico FROM juego.mesas WHERE id=$1", [mesa.id])).rows[0].fin_publico);
  const nueva = await alta();
  assert.notEqual(nueva.id, mesa.id);
  await evento(0, { tipo: "reparto", reparto: { respondenSinFlor: [1] } }, nueva.id);
  await evento(1, { tipo: "decision", accion: { tipo: "flor", asiento: 0 } }, nueva.id);
  await db.query("UPDATE juego.mesas SET ultimo_hecho_publico=now()-interval '61 seconds' WHERE id=$1", [nueva.id]);
  await evento(2, { tipo: "decision", accion: { tipo: "paso-flor", asiento: 1 } }, nueva.id);
  assert.equal((await db.query("SELECT id FROM juego.mesas_en_juego WHERE id=$1", [nueva.id])).rowCount, 1);
  console.log("Migración, privacidad histórica, frescura, cierre y reutilización del cupo comprobados.");
} finally {
  await db.end();
  try { await admin.query("DROP DATABASE " + nombre); } finally { await admin.end(); }
}
