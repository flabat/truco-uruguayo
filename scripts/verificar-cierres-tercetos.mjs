// Vectores de aceptación del ADR 1. Sólo se precarga el reparto inicial en la base desechable.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";
import pg from "pg";
import { crearEnsayo } from "./ensayos.ts";
import { restaurarTercetosDB } from "./partidas-tercetos.ts";
import { marcadorOnline } from "../src/motor/mesa-online.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const modo = process.argv[2];
const reparto = {
  versionReparto: "online-2", dador: 5, mano: 0, muestra: "oros-07",
  manos: [
    ["oros-01","bastos-06","espadas-06"], ["copas-05","copas-06","copas-07"],
    ["espadas-12","copas-03","bastos-07"], ["copas-04","espadas-05","oros-06"],
    ["bastos-01","bastos-02","bastos-03"], ["oros-03","espadas-03","bastos-04"],
  ],
};

async function sesion(i) {
  const token = randomBytes(32).toString("base64url");
  const {rows:[j]} = await pool.query(`INSERT INTO juego.jugadores(emisor,sujeto,nombre)
    VALUES ('vectores-tercetos',$1,$1) ON CONFLICT (emisor,sujeto) DO UPDATE SET nombre=excluded.nombre RETURNING id`, ["asiento-" + i]);
  await pool.query("INSERT INTO juego.sesiones (clave,jugador) VALUES ($1,$2)", [createHash("sha256").update(token).digest("hex"), j.id]);
  return { id: j.id, cookie: "truco_sesion=" + token };
}

async function peticion(persona, ruta, body, status = 200) {
  const r = await fetch("http://web" + ruta, {method: body ? "POST" : "GET",
    headers: {cookie: persona.cookie, origin: process.env.WEB_ORIGIN, "content-type": "application/json"},
    body: body && JSON.stringify(body)});
  const json = await r.json();
  assert.equal(r.status, status, JSON.stringify(json));
  return json;
}

async function precargar(mesa, meta, cartas, acciones = []) {
  await pool.query(`INSERT INTO juego.manos
    (mesa, numero, version, version_reglas, reparto, puntos_inicio, acciones, meta_tercetos, tipo_reparto)
    VALUES ($1,2,$2,2,$3,$4,$5,$6,'pico-a-pico')`,
    [mesa, 20 + acciones.length, cartas, [0, meta/2 - 1], JSON.stringify(acciones), meta]);
}

async function probarCobros(personas, meta, primerDuelo, dosRestos = false) {
  const [anfitrion] = personas;
  const m = await peticion(anfitrion, "/api/mesas", {modo: "3v3", meta}, 201);
  const ruta = "/api/mesas/" + m.id;
  const token = new URL(m.invitacion).searchParams.get("invitacion");
  for (const p of personas.slice(1)) await peticion(p, "/api/invitaciones/" + token + "/unirse", {});
  const cartas = structuredClone(reparto);
  if (primerDuelo) {
    [cartas.manos[0],cartas.manos[4]] = [cartas.manos[4],cartas.manos[0]];
    [cartas.manos[3],cartas.manos[1]] = [cartas.manos[1],cartas.manos[3]];
  }
  if (dosRestos) {
    cartas.manos[0] = ["copas-10", "copas-11", "copas-12"];
    cartas.manos[3] = ["espadas-01", "espadas-02", "espadas-03"];
    cartas.manos[5] = ["oros-03", "oros-06", "bastos-04"];
  }
  await precargar(m.id, meta, cartas);
  let p = await peticion(anfitrion, ruta + "/partida");
  const jugar = async (asiento, tipo) => {
    const orden = {id: randomUUID(), version: p.version, accion: {tipo}};
    p = await peticion(personas[asiento], ruta + "/acciones", orden);
    assert.deepEqual(await peticion(personas[asiento], ruta + "/acciones", orden), p);
  };
  if (dosRestos) {
    await jugar(0, "flor");
    await jugar(3, "flor");
    await jugar(3, "contraflor-al-resto");
    await jugar(0, "quiero");
    assert.deepEqual(p.puntos, [0,39]);
    await jugar(0, "mazo");
    assert.deepEqual(p.puntos, [0,40]);
    assert.equal(p.lance.duelo, 2);
  } else if (!primerDuelo) {
    await jugar(0, "mazo");
    await jugar(3, "paso-flor");
    assert.equal(p.lance.duelo, 2);
    assert.deepEqual(p.puntos, [0, meta/2]);
  }
  const mayor = primerDuelo ? 3 : 1;
  const menor = primerDuelo ? 0 : 4;
  await jugar(primerDuelo ? menor : mayor, "flor");
  await jugar(primerDuelo ? mayor : menor, "flor");
  await jugar(primerDuelo ? mayor : menor, "contraflor-al-resto");
  await jugar(primerDuelo ? menor : mayor, "quiero");
  if (meta === 50 && !dosRestos) {
    assert.deepEqual(p.puntos, [0,40]);
    assert.equal(p.ganadorPartida, null);
    await jugar(1, "mazo");
    assert.equal(p.lance.duelo, 3);
    await jugar(2, "mazo");
    await jugar(5, "paso-flor");
    const siguiente = await peticion(anfitrion, ruta + "/siguiente", {id: randomUUID(), version: p.version});
    assert.equal(siguiente.lance.tipo, "redondilla");
    assert.equal(siguiente.vista.dador, 0);
    assert.deepEqual(siguiente.puntos, [1,41]);
  } else {
    assert.equal(p.ganadorPartida, 1);
    assert.deepEqual(p.puntos, [0,meta]);
    assert.equal(p.lance.duelo, primerDuelo ? 1 : 2);
    for (const persona of personas) {
      const final = await peticion(persona, ruta + "/partida");
      assert.equal(final.version, p.version);
      assert.equal(final.vista.estado, "terminado");
      assert.deepEqual(final.vista.legales, []);
    }
    await peticion(anfitrion, ruta + "/siguiente", {id: randomUUID(), version: p.version}, 409);
    await peticion(personas[mayor], ruta + "/acciones", {id: randomUUID(), version: p.version, accion:{tipo:"mazo"}}, 409);
  }
}

async function dejarPendiente() {
  const owner = await sesion(0);
  const id = await crearEnsayo(pool, "triples", owner.id);
  await precargar(id, 50, reparto, [{duelo: 1, asiento: 0, tipo: "mazo"}, {duelo: 1, asiento: 3, tipo: "paso-flor"}]);
  await pool.query("INSERT INTO juego.turnos_bot(mesa) VALUES ($1)", [id]);
  await pool.query("CREATE TABLE juego.prueba_pendiente_tercetos (mesa uuid)");
  await pool.query("INSERT INTO juego.prueba_pendiente_tercetos VALUES ($1)", [id]);
}

async function auditarEnsayo() {
  const {rows: [{mesa}]} = await pool.query("SELECT mesa FROM juego.prueba_pendiente_tercetos");
  const plazo = Date.now() + 90000;
  while (!(await pool.query("SELECT ensayo_terminado FROM juego.mesas WHERE id=$1", [mesa])).rows[0].ensayo_terminado) {
    assert.ok(Date.now() < plazo, "El ensayo de seis computadoras debe terminar después del reinicio.");
    await esperar(75);
  }
  const manos = (await pool.query("SELECT * FROM juego.manos WHERE mesa=$1 ORDER BY numero", [mesa])).rows;
  const inferencias = (await pool.query("SELECT * FROM juego.inferencias WHERE mesa=$1 ORDER BY version_anterior", [mesa])).rows;
  assert.equal(inferencias[0].asiento, 1);
  assert.equal(inferencias[0].version_anterior, 22);
  assert.equal(inferencias.length, manos.reduce((n,m) => n + m.acciones.length, -2));
  assert.equal(new Set(inferencias.map(i => i.version_anterior)).size, inferencias.length);
  assert.ok(inferencias.every(i => i.aplicada === "tercetos-basica-v1" && i.fallback === null));
  assert.equal(Math.max(...marcadorOnline(restaurarTercetosDB(manos.at(-1)))), 50);
}

try {
  if (modo === "preparar-bot") await dejarPendiente();
  else if (modo === "auditar-bot") await auditarEnsayo();
  else if (modo === "cerrar-altas") {
    const p = await sesion(0);
    assert.ok(!(await peticion(p,"/api/modalidades")).modos.includes("3v3"));
    await peticion(p,"/api/mesas",{modo:"3v3"},400);
  } else {
    const personas = await Promise.all(Array.from({length:6}, (_,i) => sesion(i)));
    await probarCobros(personas, 50, false);
    await probarCobros(personas, 50, false, true);
    await probarCobros(personas, 26, false);
    await probarCobros(personas, 26, true);
  }
  console.log("Tercetos verificados · " + (modo ?? "cruce a buenas, tres duelos y victoria por canto en el primero y el segundo"));
} finally { await pool.end(); }
