// Se ejecuta con el proceso de API detenido en el proyecto Compose descartable.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {crearEnsayo} from "./ensayos.ts";
import {avanzarEnsayo} from "./partidas.ts";
import {resolverTurno} from "./bot-pendiente.ts";
import {createServing} from "./serving.ts";
import {restaurar} from "./turnos.ts";

const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
const {rows:[owner]}=await pool.query("INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('race-policy',$1,'ficha') RETURNING id",[randomUUID()]);
const id=await crearEnsayo(pool,"duel",owner.id,"actor-ausente");
const servicio=createServing({loadArtifact:async()=>null});
const current=async()=> (await pool.query("SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero DESC LIMIT 1",[id])).rows[0];
try {
  await avanzarEnsayo(pool);
  const first=await current();
  // Simula el reinicio después de leer y antes del commit; queda el trabajo duradero.
  await assert.rejects(resolverTurno(pool,{decide:async()=>{throw Error("crash");}},()=>{},id),/crash/);
  assert.deepEqual(await current(),first);
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
  assert.equal(restaurar(after,"duel").turnos.length,1);
  // La API que se reinicia completa esta mesa y registra el mismo pin en las decisiones siguientes.
  await pool.query("CREATE TABLE juego.prueba_reinicio_actor (mesa uuid, accion jsonb)");
  await pool.query("INSERT INTO juego.prueba_reinicio_actor VALUES ($1,$2)",[id,JSON.stringify(after.acciones[0])]);
  console.log("Inferencia sin lock, caída antes de commit y dos respuestas con una sola confirmación verificadas.");
} finally {await servicio.close(); await pool.end();}
