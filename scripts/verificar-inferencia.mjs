// Se ejecuta con el proceso de API detenido en el proyecto Compose descartable.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {crearEnsayo} from "./ensayos.ts";
import {avanzarEnsayo, crearPartidas} from "./partidas.ts";
import {resolverTurno} from "./bot-pendiente.ts";
import {createServing} from "./serving.ts";
import {restaurar} from "./turnos.ts";
import {iniciarReplayDB} from "./replay-db.ts";
import {iniciarOnline} from "@eltruco/motor/mesa-online.ts";
import {reproducirChico} from "../api/replay-chico.ts";

const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
const {rows:[owner]}=await pool.query("INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('race-policy',$1,'ficha') RETURNING id",[randomUUID()]);
const id=await crearEnsayo(pool,"duel",owner.id,"actor-ausente");
const servicio=createServing({loadArtifact:async()=>null});
const current=async()=> (await pool.query("SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero DESC LIMIT 1",[id])).rows[0];
const replay=async mesa=>(await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1",[mesa])).rows[0]?.replay;
async function verificarFlorEntreVueltas(historica) {
  const {rows: [mesa]} = await pool.query(
    "INSERT INTO juego.mesas (modo,creador,invitacion,politica) VALUES ('1v1',$1,$2,'prueba-flor') RETURNING id",
    [owner.id, randomUUID()]);
  await pool.query("INSERT INTO juego.asientos VALUES ($1,0,$2,false), ($1,1,NULL,true)", [mesa.id, owner.id]);
  const reparto = {versionReparto:"online-1", dador:1, mano:0, muestra:"oros-05",
    ...(!historica && { reglaFlor: "inmediata-v2", respondenSinFlor: [1] }),
    manos:[["oros-06","oros-02","oros-10"],["copas-02","bastos-06","espadas-05"]]};
  const declaraciones = [{tipo:"flor",asiento:0},{tipo:"paso-flor",asiento:1}];
  const puntosInicio = historica ? [11,0] : [0,0];
  // Dos mesas independientes: una mano anterior al registro y un reparto nuevo con el mismo caso de flor.
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`INSERT INTO juego.manos (mesa,numero,version,version_reglas,reparto,puntos_inicio,acciones)
      VALUES ($1,$2,$3,1,$4,$5,$6)`, [mesa.id,historica ? 4 : 1,historica ? 3 : 1,reparto,puntosInicio,
      JSON.stringify(historica ? declaraciones : [])]);
    if (!historica) await iniciarReplayDB(db, mesa.id, "duel", [0], iniciarOnline(reparto, puntosInicio, 40), 1);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
  const partidas = crearPartidas(pool,new URL("http://localhost"));
  const jugar = (version,accion) => partidas.ejecutar(mesa.id,owner.id,"acciones",{id:randomUUID(),version,accion});
  const leer = () => partidas.leer(mesa.id,owner.id);
  const decidir = (action) => resolverTurno(pool,{async decide(pin,obs) {
    assert.ok(obs.legalActions.includes(action));
    assert.doesNotMatch(JSON.stringify(obs),/oros-02|oros-10/);
    return {action,policy:pin,latencyMs:0,fallback:null};
  }},()=>{},mesa.id);

  if (!historica) {
    const orden = { id: randomUUID(), version: 1, accion: { tipo: "flor" } };
    const cantar = () => partidas.ejecutar(mesa.id, owner.id, "acciones", orden);
    const recibo = await cantar();
    assert.ok(await decidir("paso-flor"));
    assert.deepEqual(await cantar(), recibo);
    assert.equal(await decidir("paso-flor"), false);
    const confirmada = await leer();
    assert.deepEqual(confirmada.vista.acciones, declaraciones);
    assert.deepEqual(confirmada.puntos, [3,0]);
    assert.deepEqual(confirmada.vista.cobros, [{ equipo: 0, tantos: 3, motivo: "flor" }]);
    assert.equal(confirmada.vista.turno, 0);
    assert.ok(confirmada.vista.legales.includes("carta"));
    const grabada = await replay(mesa.id);
    const decisiones = grabada.eventos.filter(e => e.tipo === "decision");
    assert.deepEqual(decisiones.map(e => e.accion), declaraciones);
    assert.deepEqual(decisiones[0].cobros, []);
    assert.deepEqual(decisiones[1].cobros, confirmada.vista.cobros);
    assert.equal(decisiones[1].bot.aplicada, "prueba-flor");
    assert.deepEqual(reproducirChico(grabada, 0).vista, confirmada.vista);
  }
  await jugar(3,{tipo:"carta",carta:"oros-06"});
  assert.ok(await decidir("espadas-05"));
  const espera = await leer();
  assert.equal(espera.vista.turno,1);
  assert.deepEqual(espera.vista.legales,[]);
  await assert.rejects(jugar(espera.version,{tipo:"carta",carta:"oros-10"}),{status:409});
  assert.ok(await decidir("truco"));
  const oferta = await leer();
  assert.equal(oferta.vista.pendiente.tipo,"truco");
  const aceptado = await jugar(oferta.version,{tipo:"quiero"});
  assert.deepEqual(aceptado.vista.legales,[]);
  assert.ok(await decidir("copas-02"));
  const fin = await leer();
  assert.deepEqual(fin.puntos,[puntosInicio[0]+5,0]);
  assert.deepEqual(fin.vista.acciones.map(a=>a.tipo),["flor","paso-flor","carta","carta","truco","quiero","mazo"]);
  assert.deepEqual(fin.vista.resultado,{motivo:"mazo",equipo:0,tantos:2});
  assert.equal(await decidir("bastos-06"),false);
  if (!historica) {
    const grabada = await replay(mesa.id);
    const entrega = grabada.eventos.at(-1);
    assert.deepEqual(entrega.accion, {tipo:"mazo",asiento:1});
    assert.equal(entrega.bot.propuesta, "copas-02");
    assert.deepEqual(reproducirChico(grabada,0).puntos, fin.puntos);
  } else {
    assert.equal(await replay(mesa.id), undefined);
    const { rows } = await pool.query("SELECT mano, posicion FROM juego.eventos_chico WHERE mesa=$1 ORDER BY secuencia", [mesa.id]);
    assert.deepEqual(rows, [3,4,5,6,7].map(posicion => ({ mano: 4, posicion })));
  }
}

try {
  await verificarFlorEntreVueltas(true);
  await verificarFlorEntreVueltas(false);
  await avanzarEnsayo(pool);
  const first=await current();
  const inicial=await replay(id);
  assert.deepEqual(inicial.eventos.map(e=>e.tipo),["reparto"]);
  // Simula el reinicio después de leer y antes del commit; queda el trabajo duradero.
  await assert.rejects(resolverTurno(pool,{decide:async()=>{throw Error("crash");}},()=>{},id),/crash/);
  assert.deepEqual(await current(),first);
  assert.deepEqual(await replay(id),inicial);
  let arrivals=0,release;
  const barrier=new Promise(resolve=>{release=resolve;});
  const both={async decide(pin,obs) {
    assert.ok(!("reparto" in obs) && !("manos" in obs) && !("seed" in obs));
    if (++arrivals===2) {
      const db=await pool.connect();
      try {await db.query("BEGIN"); await db.query("SELECT id FROM juego.mesas WHERE id=$1 FOR UPDATE NOWAIT",[id]);await db.query("COMMIT");}
      finally {db.release();}
      release();
    }
    await barrier;
    return servicio.decide(pin,obs,.5);
  }};
  const results=await Promise.allSettled([1,2].map(()=>resolverTurno(pool,both,()=>{throw Error("sin aviso");},id)));
  assert.equal(results.filter(r=>r.status==="rejected" && r.reason.message==="sin aviso").length,1);
  assert.equal(results.filter(r=>r.status==="fulfilled" && !r.value).length,1);
  const after=await current();
  assert.equal(after.version,first.version+1);
  assert.equal(after.acciones.length,1);
  const diagnostics=(await pool.query("SELECT * FROM juego.inferencias WHERE mesa=$1",[id])).rows;
  assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0].fallback,"missing");
  assert.equal(diagnostics[0].solicitada,"actor-ausente");
  assert.equal(diagnostics[0].aplicada,"incumbent-online-v1");
  const confirmada=await replay(id);
  assert.deepEqual(confirmada.eventos.map(e=>[e.secuencia,e.tipo]), [[1,"reparto"],[2,"decision"]]);
  const turno=confirmada.eventos[1];
  assert.deepEqual(turno.accion,after.acciones[0]);
  assert.deepEqual(turno.bot, {solicitada:"actor-ausente",aplicada:"incumbent-online-v1",fallback:"missing",
    latenciaMs:diagnostics[0].latencia_ms,observacion:"seat-v1",acciones:"cards-bids-signals-v1"});
  assert.deepEqual(reproducirChico(confirmada,0).puntos,turno.puntos);
  assert.equal(restaurar(after,"duel").turnos.length,1);
  // La API que se reinicia completa esta mesa y registra el mismo pin en las decisiones siguientes.
  await pool.query("CREATE TABLE juego.prueba_reinicio_actor (mesa uuid, accion jsonb)");
  await pool.query("INSERT INTO juego.prueba_reinicio_actor VALUES ($1,$2)",[id,JSON.stringify(after.acciones[0])]);
  console.log("Inferencia sin lock, caída antes de commit y dos respuestas con una sola confirmación verificadas.");
} finally {await servicio.close(); await pool.end();}
