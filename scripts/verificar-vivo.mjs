// Invocado dentro de la API del Compose descartable, antes y después de recrear sus contenedores.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import pg from "pg";
import WebSocket from "ws";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const origin = new URL(process.env.WEB_ORIGIN).origin;
const hash = s => createHash("sha256").update(s).digest("hex");
const conexiones = new Set();

async function sesion(indice) {
  const token = randomBytes(32).toString("base64url");
  const jugador = await pool.query(`INSERT INTO juego.jugadores (emisor,sujeto,nombre)
    VALUES ('prueba-vivo',$1,$1) ON CONFLICT (emisor,sujeto) DO UPDATE SET nombre=excluded.nombre RETURNING id`,
    ["socket-" + indice]);
  await pool.query("INSERT INTO juego.sesiones (clave,jugador) VALUES ($1,$2)", [hash(token), jugador.rows[0].id]);
  return { cookie: "truco_sesion=" + token, clave: hash(token) };
}

async function http(s, ruta, body) {
  const res = await fetch("http://web" + ruta, {
    method: body === undefined ? "GET" : "POST", headers: { Cookie: s.cookie, Origin: origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(res.ok, ruta + " respondió " + res.status);
  return res.json();
}

function conectar(s, id) {
  const ws = new WebSocket("ws://web/api/mesas/" + id + "/vivo", "truco.v1", { headers: { Cookie: s.cookie, Origin: origin } });
  conexiones.add(ws);
  const mensajes = [];
  let avisar;
  ws.on("message", texto => {
    mensajes.push(JSON.parse(texto.toString()));
    avisar?.();
  });
  ws.on("error", () => {});
  return {
    ws,
    async recibir() {
      if (!mensajes.length) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("No llegó el mensaje de la mesa.")), 8000);
          avisar = () => { clearTimeout(t); resolve(); };
        });
      }
      avisar = undefined;
      return mensajes.shift();
    },
  };
}

async function suscribir(sesiones, id) {
  const clientes = sesiones.map((s, i) => conectar(s, i === 0 ? id.toUpperCase() : id));
  for (const c of clientes) assert.deepEqual(await c.recibir(), { tipo: "actualizar" });
  return clientes;
}

async function rechaza(id, cookie, desde, esperado) {
  const ws = new WebSocket("ws://web/api/mesas/" + id + "/vivo", "truco.v1", { headers: { Cookie: cookie, Origin: desde } });
  ws.on("error", () => {});
  const [, res] = await once(ws, "unexpected-response", { signal: AbortSignal.timeout(8000) });
  assert.equal(res.statusCode, esperado);
  res.resume();
  ws.terminate();
}

async function vistas(sesiones, ruta) {
  const todas = await Promise.all(sesiones.map(s => http(s, ruta)));
  for (const [i, { vista, version }] of todas.entries()) {
    assert.equal(vista.asiento, i);
    assert.equal(version, todas[0].version);
    assert.deepEqual(vista.acciones, todas[0].vista.acciones);
    const texto = JSON.stringify(todas[i]);
    for (const [otro, rival] of todas.entries()) {
      if (otro !== i) for (const oculta of rival.vista.cartas) assert.ok(!texto.includes(oculta));
    }
  }
  return todas;
}

async function iniciar(sesiones, ajena) {
  const mesa = await http(sesiones[0], "/api/mesas", { modo: "2v2", formato: "pairs-senas" });
  assert.equal(mesa.formato, "pairs-senas");
  const id = mesa.id;
  const token = new URL(mesa.invitacion).searchParams.get("invitacion");
  for (const s of sesiones.slice(1)) await http(s, "/api/invitaciones/" + token + "/unirse", {});
  await rechaza(id, "", origin, 401);
  await rechaza(id, ajena.cookie, origin, 404);
  await rechaza(id, sesiones[0].cookie, "https://otra.invalid", 403);
  const ruta = "/api/mesas/" + id + "/partida";
  const antes = await vistas(sesiones, ruta);
  const clientes = await suscribir(sesiones, id);
  const turno = antes.findIndex(p => p.vista.legales.length);
  assert.notEqual(turno, -1);
  const { vista, version } = antes[turno];
  const accion = vista.legales.includes("carta") ? { tipo: "carta", carta: vista.cartas[0] } : { tipo: "flor" };
  const orden = { tipo: "accion", id: randomUUID(), version, accion: {...accion, sena: "cejas"} };
  const autor = clientes[turno];
  // El aviso se emite después del commit. Cortar en ese punto deja al autor sin leer la confirmación.
  autor.ws.send(JSON.stringify(orden));
  assert.deepEqual(await autor.recibir(), { tipo: "actualizar" });
  autor.ws.terminate();
  for (const [i, cliente] of clientes.entries()) {
    if (i !== turno) assert.deepEqual(await cliente.recibir(), { tipo: "actualizar" });
  }
  const despues = await vistas(sesiones, ruta);
  assert.ok(despues[0].version > version);
  for (const p of despues) {
    assert.equal(p.versionSenas, "senas-publicas-v1");
    assert.equal(p.formato, "pairs-senas");
    assert.deepEqual(p.turnos, despues[0].turnos);
    assert.deepEqual(p.turnos.map(t => t.signal), ["cejas"]);
    assert.deepEqual(p.turnos.map(t => t.action), p.vista.acciones);
  }
  const regreso = conectar(sesiones[turno], id);
  assert.deepEqual(await regreso.recibir(), { tipo: "actualizar" });
  regreso.ws.send(JSON.stringify(orden));
  assert.deepEqual(await regreso.recibir(), { tipo: "confirmacion", id: orden.id, partida: despues[turno] });
  regreso.ws.send(JSON.stringify({...orden, accion: {...orden.accion, sena: "beso"}}));
  assert.equal((await regreso.recibir()).tipo, "error");
  const viejo = { ...orden, id: randomUUID() };
  regreso.ws.send(JSON.stringify(viejo));
  const error = await regreso.recibir();
  assert.equal(error.tipo, "error");
  assert.equal(error.id, viejo.id);
  assert.equal(typeof error.mensaje, "string");
  const revocada = clientes[(turno + 1) % 4].ws;
  await pool.query("DELETE FROM juego.sesiones WHERE clave=$1", [sesiones[(turno + 1) % 4].clave]);
  const cierre = once(revocada, "close", { signal: AbortSignal.timeout(8000) });
  revocada.send(JSON.stringify({ ...orden, id: randomUUID(), version: despues[0].version }));
  assert.equal((await cierre)[0], 1008);
  await pool.query("CREATE TABLE juego.prueba_vivo (mesa uuid, asiento int, orden jsonb, huellas jsonb)");
  await pool.query("INSERT INTO juego.prueba_vivo VALUES ($1,$2,$3,$4)", [
    id, turno, JSON.stringify(orden), JSON.stringify(despues.map(p => hash(JSON.stringify(p)))),
  ]);
}

async function reconectar(sesiones) {
  const [previo] = (await pool.query("SELECT * FROM juego.prueba_vivo")).rows;
  const clientes = await suscribir(sesiones, previo.mesa);
  const vigentes = await vistas(sesiones, "/api/mesas/" + previo.mesa + "/partida");
  assert.deepEqual(vigentes.map(p => hash(JSON.stringify(p))), previo.huellas);
  const autor = clientes[previo.asiento];
  autor.ws.send(JSON.stringify(previo.orden));
  const confirmacion = await autor.recibir();
  assert.deepEqual(confirmacion, { tipo: "confirmacion", id: previo.orden.id, partida: vigentes[previo.asiento] });
}

try {
  const sesiones = await Promise.all(Array.from({ length: 4 }, (_, i) => sesion(i)));
  if (process.argv[2] === "iniciar") await iniciar(sesiones, await sesion(4));
  else if (process.argv[2] === "reconectar") await reconectar(sesiones);
  else throw new Error("Indicá iniciar o reconectar.");
  console.log("Cuatro conexiones de mesa verificadas · " + process.argv[2]);
} finally {
  for (const ws of conexiones) ws.terminate();
  await pool.end();
}
