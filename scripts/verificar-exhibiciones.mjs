// Dos procesos de la API y un reloj controlado sobre una base descartable sin clientes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "./migrate.ts";
import { crearPartidas } from "./partidas.ts";
import { avanzarExhibicion, configuracionExhibiciones, reponerExhibiciones } from "./exhibiciones.ts";
import { servicioComputadoras } from "./ensayos.ts";
import { reproducirChico } from "../api/replay-chico.ts";

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

function proceso(codigo, entorno = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--input-type=module","-e", `
      import pg from 'pg';
      import {procesarEnsayos} from './ensayos.ts';
      import {avanzarExhibicion,configuracionExhibiciones,procesarExhibiciones,reponerExhibiciones} from './exhibiciones.ts';
      const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
      const reloj = new Date(${ahora});
      ${codigo}
      await pool.end();
    `], {env: {...process.env, DATABASE_URL:url.href, ...entorno}, stdio:"inherit"});
    p.once("error", reject);
    p.once("exit", resolve);
  });
}
// Cada invocación arranca el mismo lazo que server.ts en un proceso nuevo.
async function probarTrabajador(objetivo, pausadas, habilitadas, esperaPaso) {
  const salida = await proceso(`
    let aviso;
    const progreso = new Promise(resolve => { aviso = resolve; });
    const detener = procesarExhibiciones(pool, configuracionExhibiciones(process.env), aviso);
    const detenerOrdinario = procesarEnsayos(pool, () => {});
    let timer;
    const observado = await Promise.race([progreso, new Promise(resolve => {
      timer = setTimeout(() => resolve(null), ${esperaPaso ? 8000 : 650});
    })]);
    clearTimeout(timer);
    detener();
    detenerOrdinario();
    if (Boolean(observado) !== ${esperaPaso}) throw Error("Avance inesperado del trabajador");
  `, { EXHIBICIONES_OBJETIVO: String(objetivo), EXHIBICIONES_PAUSADAS: String(pausadas),
       EXHIBICIONES_HABILITADAS: String(habilitadas) });
  assert.equal(salida, 0);
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
  assert.deepEqual(configuracionExhibiciones({EXHIBICIONES_HABILITADAS:"1"}), {objetivo:6, pausadas:false});
  assert.deepEqual(configuracionExhibiciones({}), {objetivo:0, pausadas:false});
  for (const texto of ["-1", "11", "3.5", "oops"]) {
    assert.deepEqual(configuracionExhibiciones({EXHIBICIONES_HABILITADAS:"1", EXHIBICIONES_OBJETIVO:texto}),
      {objetivo:0, pausadas:true});
  }
  assert.deepEqual(configuracionExhibiciones({EXHIBICIONES_PAUSADAS:"oops"}), {objetivo:0, pausadas:true});
  await probarTrabajador(10, 1, 1, false);
  await probarTrabajador(0, 0, 1, false);
  assert.equal((await abiertas()).length, 0);
  assert.equal(await reponerExhibiciones(pool, reloj(), 1), 1);
  assert.equal(await reponerExhibiciones(pool, reloj(), 3), 2);
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
  // Llegar a diez con dos servidores, incluso tras el enfriamiento de un cupo.
  await pool.query("UPDATE juego.mesas SET ultimo_hecho_publico=now()-interval '6 minutes' WHERE id=ANY($1::uuid[])", [humanos]);
  ahora += 600_000;
  const llenar = "await reponerExhibiciones(pool,reloj,10);";
  assert.deepEqual(await Promise.all([proceso(llenar), proceso(llenar)]), [0,0]);
  const diez = await abiertas();
  assert.equal(diez.length, 10);
  assert.equal(diez.filter(m => m.modo === "2v2" && m.version_senas === "senas-equipo-v1").length, 5);
  assert.equal(diez.filter(m => m.modo === "1v1").length, 5);
  const ids = diez.map(m => m.id);
  for (const objetivo of [3,0]) assert.equal(await reponerExhibiciones(pool, reloj(), objetivo), 0);
  assert.deepEqual((await abiertas()).map(m => m.id), ids);

  // Sin espectadores, la pausa conserva todos los turnos pendientes, manos y plazos.
  await pool.query("UPDATE juego.mesas SET meta=2 WHERE id=ANY($1::uuid[])", [ids]);
  ahora += 8000;
  for (const _ of ids) assert.ok(await avanzarExhibicion(pool, servicio, reloj()));
  await pool.query(`UPDATE juego.mesas SET proximo_paso=now()-interval '1 hour',
    ultimo_hecho_publico=now()-interval '61 seconds' WHERE id=ANY($1::uuid[])`, [ids]);
  const estado = () => pool.query(`SELECT m.id, m.proximo_paso, h.version, m.ultimo_hecho_publico,
    EXISTS (SELECT 1 FROM juego.turnos_bot t WHERE t.mesa=m.id) AS pendiente
    FROM juego.mesas m JOIN juego.manos h ON h.mesa=m.id WHERE m.id=ANY($1::uuid[]) ORDER BY m.id`,
    [ids]).then(r => r.rows);
  // La otra cola conserva el turno de computadora de una persona simulada.
  const { rows: [mixta] } = await pool.query(`INSERT INTO juego.mesas(modo,creador,invitacion,politica)
    VALUES ('1v1',$1,gen_random_uuid(),$2) RETURNING id`, [persona.id, pin]);
  await pool.query(`INSERT INTO juego.asientos(mesa,asiento,jugador,computadora)
    VALUES ($1,0,$2,false), ($1,1,NULL,true)`, [mixta.id, persona.id]);
  const partidas = crearPartidas(pool, new URL("http://localhost"));
  const pendienteMixta = async () => (await pool.query("SELECT 1 FROM juego.turnos_bot WHERE mesa=$1", [mixta.id])).rowCount;
  let partida = await partidas.leer(mixta.id, persona.id);
  for (let i=0; i<8 && !await pendienteMixta(); i++) {
    const tipo = partida.vista.legales.includes("carta") ? "carta" : partida.vista.legales[0];
    const accion = tipo === "carta" ? {tipo, carta:partida.vista.cartas[0]} : {tipo};
    partida = await partidas.ejecutar(mixta.id, persona.id, "acciones", {id:randomUUID(), version:partida.version, accion});
  }
  assert.equal(await pendienteMixta(), 1);
  const antes = await estado();
  await probarTrabajador(10, 1, 1, false);
  assert.deepEqual(await estado(), antes);
  assert.ok((await pool.query("SELECT 1 FROM juego.inferencias WHERE mesa=$1", [mixta.id])).rowCount > 0);
  assert.equal((await pool.query("SELECT id FROM juego.mesas_en_juego WHERE id=ANY($1::uuid[])", [ids])).rowCount, 0);

  // Al reanudar, el trabajador da un solo paso por mesa vencida y reprograma desde el presente.
  for (const [objetivo, habilitadas] of [[0,1], [10,0]]) {
    const antes = await estado();
    await probarTrabajador(objetivo, 0, habilitadas, true);
    const despues = await estado();
    const cambiadas = despues.filter((fila,i) => fila.version !== antes[i].version);
    assert.equal(cambiadas.length, 1);
    assert.equal(cambiadas[0].version, antes.find(fila => fila.id === cambiadas[0].id).version + 1);
    assert.ok(cambiadas[0].proximo_paso > cambiadas[0].ultimo_hecho_publico);
  }
  // Al reducir el objetivo las mesas excedentes terminan por el motor.
  for (let i=0; i<1200 && (await abiertas()).length; i++) {
    ahora += 8000;
    await avanzarExhibicion(pool, servicio, reloj());
    assert.equal(await reponerExhibiciones(pool, reloj(), 0), 0);
  }
  assert.equal((await abiertas()).length, 0);
  assert.equal((await pool.query("SELECT id FROM juego.mesas WHERE id=ANY($1::uuid[]) AND fin_publico IS NOT NULL", [ids])).rowCount, 10);
  assert.equal(await reponerExhibiciones(pool, reloj(), 3), 3);
  console.log("Metas 0/1/3/6/10, concurrencia entre procesos, terminación, pausa, reanudación, prioridad humana y recuperación verificadas.");
} finally {
  await servicio.close();
  await pool.end();
  try { await admin.query("DROP DATABASE " + nombre); } finally { await admin.end(); }
}
