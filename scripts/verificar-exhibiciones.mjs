// Dos procesos de la API y un reloj controlado sobre una base descartable sin clientes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "./migrate.ts";
import { avanzarExhibicion, reponerExhibiciones } from "./exhibiciones.ts";
import { servicioComputadoras } from "./ensayos.ts";
import { reproducirChico } from "../src/motor/replay-chico.ts";

const admin = new pg.Pool({connectionString: process.env.DATABASE_URL});
const nombre = "exhibiciones_" + randomUUID().replaceAll("-", "");
const url = new URL(process.env.DATABASE_URL);
url.pathname = "/" + nombre;
await admin.query("CREATE DATABASE " + nombre);
const pool = new pg.Pool({connectionString: url.href});
const servicio = servicioComputadoras(pool);
const inicio = Date.now();
let ahora = inicio;
const reloj = () => new Date(ahora);
const abiertas = () => pool.query(`SELECT id, modo, version_senas, cupo_exhibicion, proximo_paso, creador, politica FROM juego.mesas
  WHERE origen='exhibicion' AND fin_publico IS NULL AND NOT exhibicion_retirada ORDER BY cupo_exhibicion`).then(r => r.rows);

function proceso(codigo) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--input-type=module","-e", `
      import pg from 'pg';
      import {avanzarExhibicion,reponerExhibiciones} from './exhibiciones.ts';
      const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
      const reloj = new Date(${ahora});
      ${codigo}
      await pool.end();
    `], {env: {...process.env, DATABASE_URL:url.href}, stdio:"inherit"});
    p.once("error", reject);
    p.once("exit", resolve);
  });
}
async function simularMesasHumanas(creador, cantidad) {
  const { rows } = await pool.query(`INSERT INTO juego.mesas(modo,creador,invitacion,publica)
    SELECT '2v2',$1,gen_random_uuid(),true FROM generate_series(1,$2::int) RETURNING id`, [creador,cantidad]);
  for (const {id} of rows) {
    await pool.query("INSERT INTO juego.asientos(mesa,asiento,jugador,computadora) VALUES ($1,0,$2,false)", [id,creador]);
    await pool.query(`INSERT INTO juego.eventos_chico(mesa,mano,posicion,secuencia,build,evento)
      VALUES ($1,1,0,1,'prueba','{"tipo":"reparto"}')`, [id]);
  }
  return rows.map(m => m.id);
}
try {
  await migrate(pool);
  const alta = "await reponerExhibiciones(pool,reloj);";
  assert.deepEqual(await Promise.all([proceso(alta), proceso(alta)]), [0,0]);
  const iniciales = await abiertas();
  assert.equal(iniciales.length, 6);
  assert.equal(iniciales.filter(m => m.modo==="1v1").length, 3);
  assert.ok(iniciales.filter(m=>m.modo==="2v2").every(m=>m.version_senas==="senas-equipo-v1"));
  assert.ok(iniciales.every(m=>m.politica==="incumbent-online-v1"));
  assert.equal(new Set(iniciales.map(m=>m.proximo_paso.getTime())).size,6);
  assert.equal((await pool.query("SELECT * FROM juego.asientos WHERE jugador IS NOT NULL")).rowCount,0);
  assert.equal((await pool.query("SELECT * FROM juego.asientos")).rowCount,18);
  assert.equal((await pool.query("SELECT * FROM juego.mesas_en_juego")).rowCount,0);
  ahora += 3000;
  for (let i=0;i<6;i++) assert.ok(await avanzarExhibicion(pool,servicio,reloj()));
  assert.equal((await pool.query("SELECT * FROM juego.mesas_en_juego")).rowCount,6);
  assert.equal(await avanzarExhibicion(pool,servicio,reloj()),null);

  const {rows:[persona]} = await pool.query("INSERT INTO juego.jugadores(emisor,sujeto,nombre) VALUES ('prueba','1','Jugador') RETURNING id");
  const humanos = await simularMesasHumanas(persona.id,12);
  assert.equal(await reponerExhibiciones(pool,reloj()),0);
  assert.deepEqual((await abiertas()).map(m=>m.id),iniciales.map(m=>m.id));
  ahora += 4000;
  await pool.query("INSERT INTO juego.turnos_bot(mesa) VALUES ($1)",[humanos[0]]);
  assert.equal(await avanzarExhibicion(pool,servicio,reloj()),null);
  await pool.query("DELETE FROM juego.turnos_bot WHERE mesa=$1",[humanos[0]]);
  // Cae el único trabajador tras leer las cartas de su asiento y antes de confirmar.
  assert.equal(await proceso("await avanzarExhibicion(pool,{decide:()=>process.exit(31)},reloj);"),31);
  assert.equal((await pool.query("SELECT * FROM juego.inferencias")).rowCount,0);
  const primero = await avanzarExhibicion(pool,servicio,reloj());
  assert.equal(primero,iniciales[0].id);
  assert.equal((await pool.query("SELECT * FROM juego.inferencias")).rowCount,1);
  // La próxima fecha se calcula desde este paso, incluso después de una pausa larga.
  ahora += 3600_000;
  for (let i=0;i<6;i++) assert.ok(await avanzarExhibicion(pool,servicio,reloj()));
  assert.equal(await avanzarExhibicion(pool,servicio,reloj()),null);
  for (let i=0; i<6000 && (await abiertas()).length; i++) {
    ahora += 4000;
    await avanzarExhibicion(pool,servicio,reloj());
  }
  assert.equal((await abiertas()).length,0);
  const {rows: replays} = await pool.query("SELECT replay FROM juego.replays_chico_v1");
  assert.equal(replays.length,6);
  for (const {replay} of replays) {
    assert.equal(reproducirChico(replay,0).estado,"terminado");
    assert.ok(replay.asientos.every(a=>a.tipo==="computadora"));
    assert.equal(replay.eventos.filter(e=>e.tipo==="cierre").length,1);
  }
  assert.equal(await reponerExhibiciones(pool,reloj()),0);

  // Quedan cinco parejas humanas. El único hueco corresponde a un duelo.
  await pool.query("UPDATE juego.mesas SET ultimo_hecho_publico=now()-interval '6 minutes' WHERE id=ANY($1::uuid[])",[humanos.slice(5)]);
  const pin = "a".repeat(64);
  await pool.query("INSERT INTO juego.artefactos(pin,formato,contenido) VALUES ($1,'duel','{}')",[pin]);
  await pool.query("INSERT INTO juego.activaciones(formato,pin) VALUES ('duel',$1)",[pin]);
  assert.equal(await reponerExhibiciones(pool,reloj()),1);
  const [duelo] = await abiertas();
  assert.equal(duelo.modo,"1v1");
  assert.equal(duelo.politica,pin);
  await pool.query("DELETE FROM juego.activaciones WHERE formato='duel'");
  await pool.query("DELETE FROM juego.artefactos WHERE pin=$1",[pin]);
  ahora += 4000;
  await avanzarExhibicion(pool,servicio,reloj());
  ahora += 4000;
  await avanzarExhibicion(pool,servicio,reloj());
  const {rows:[inferencia]} = await pool.query("SELECT solicitada,aplicada,fallback FROM juego.inferencias WHERE mesa=$1",[duelo.id]);
  assert.deepEqual(inferencia,{solicitada:pin, aplicada:"incumbent-online-v1", fallback:"missing"});
  const falla = {decide() { throw Error("fallo simulado"); }};
  if (!(await pool.query("SELECT 1 FROM juego.turnos_bot WHERE mesa=$1",[duelo.id])).rowCount) {
    ahora += 8000;
    await avanzarExhibicion(pool,servicio,reloj());
  }
  for (const retraso of [4000,8000,16000]) {
    ahora += retraso;
    assert.equal(await avanzarExhibicion(pool,falla,reloj()),duelo.id);
    assert.equal((await pool.query("SELECT id FROM juego.mesas_en_juego WHERE id=$1",[duelo.id])).rowCount,0);
    assert.equal(await avanzarExhibicion(pool,falla,reloj()),null);
  }
  assert.equal((await abiertas()).length,0);
  assert.equal((await pool.query("SELECT exhibicion_retirada FROM juego.mesas WHERE id=$1",[duelo.id])).rows[0].exhibicion_retirada,true);
  assert.equal(await reponerExhibiciones(pool,reloj()),1);
  assert.notEqual((await abiertas())[0].cupo_exhibicion,duelo.cupo_exhibicion);
  console.log("Seis chicos reproducidos sin espectadores, cupos concurrentes, ritmo, prioridad, caída y retiro verificados.");
} finally {
  await servicio.close();
  await pool.end();
  try { await admin.query("DROP DATABASE " + nombre); } finally { await admin.end(); }
}
