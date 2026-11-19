// Ejecutar en la API del Compose de prueba, antes y después de recrear API y PostgreSQL.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import pg from "pg";
import WebSocket from "ws";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://127.0.0.1:" + (process.env.PORT || 3001);
const origin = new URL(process.env.WEB_ORIGIN).origin;
const hash = valor => createHash("sha256").update(valor).digest("hex");
const comando = (version, tipo) => ({ id: randomUUID(), version, ...(tipo && {accion: {tipo}}) });
const sinFlor = {
  versionReparto: "online-2", dador: 5, mano: 0, muestra: "copas-06",
  manos: [
    ["oros-03", "espadas-12", "oros-01"], ["copas-03", "oros-12", "copas-01"],
    ["bastos-04", "espadas-05", "oros-07"], ["oros-04", "bastos-05", "espadas-07"],
    ["bastos-01", "espadas-02", "bastos-07"], ["oros-06", "espadas-03", "oros-11"],
  ],
};

async function sesion(indice) {
  const token = randomBytes(32).toString("base64url");
  const {rows: [jugador]} = await pool.query(`INSERT INTO juego.jugadores (emisor,sujeto,nombre)
    VALUES ('prueba-reingreso-tercetos',$1,$1) ON CONFLICT (emisor,sujeto)
    DO UPDATE SET nombre=excluded.nombre RETURNING id`, [String(indice)]);
  await pool.query("INSERT INTO juego.sesiones (clave,jugador) VALUES ($1,$2)", [hash(token), jugador.id]);
  return { indice, id: jugador.id, cookie: "truco_sesion=" + token };
}

async function llamar(persona, ruta, datos, esperados = [200]) {
  const res = await fetch(base + ruta, {
    method: datos ? "POST" : "GET", headers: { cookie: persona.cookie, origin, "content-type": "application/json" },
    body: datos && JSON.stringify(datos),
  });
  const body = await res.json();
  assert.ok(esperados.includes(res.status), ruta + " respondió " + res.status + " " + JSON.stringify(body));
  return { status: res.status, body };
}

async function crear(personas) {
  const {body: sala} = await llamar(personas[0], "/api/mesas", {modo: "3v3"}, [201]);
  assert.deepEqual(sala.asientos.map(a => a.equipo), [0, 1, 0, 1, 0, 1]);
  assert.equal(sala.meta, 50);
  const unir = "/api/invitaciones/" + new URL(sala.invitacion).searchParams.get("invitacion") + "/unirse";
  for (let i = 1; i < 5; i++) assert.equal((await llamar(personas[i], unir, {})).body.miAsiento, i);
  const candidatos = personas.slice(5);
  const carrera = await Promise.all(candidatos.map(p => llamar(p, unir, {}, [200, 409])));
  assert.deepEqual(carrera.map(r => r.status).sort(), [200, 409]);
  const ultimo = carrera.findIndex(r => r.status === 200);
  assert.equal(carrera[ultimo].body.miAsiento, 5);
  const mesa = {id: sala.id, personas: [...personas.slice(0, 5), candidatos[ultimo]]};
  await llamar(candidatos[1 - ultimo], "/api/mesas/" + mesa.id + "/partida", undefined, [404]);
  const inicial = await vistas(mesa);
  assert.ok(inicial.every(p => p.version === 1 && p.manoNumero === 1));
  assert.equal(new Set(inicial.flatMap(p => p.vista.cartas)).size, 18);
  return mesa;
}

const partida = (mesa, asiento, ruta, orden, status) =>
  llamar(mesa.personas[asiento], "/api/mesas/" + mesa.id + "/" + ruta, orden, status);
const vistas = mesa => Promise.all(mesa.personas.map((_, i) => partida(mesa, i, "partida").then(r => r.body)));

async function colocar(mesa, numero, reparto) {
  const res = await pool.query(`UPDATE juego.manos SET reparto=$3 WHERE mesa=$1 AND numero=$2
    AND acciones='[]' AND version_reglas=2`, [mesa.id, numero, reparto]);
  assert.equal(res.rowCount, 1);
}

async function comprobarPrivacidad(mesa) {
  const {rows: [{reparto}]} = await pool.query("SELECT reparto FROM juego.manos WHERE mesa=$1 ORDER BY numero DESC LIMIT 1", [mesa.id]);
  const todas = await vistas(mesa);
  for (const [i, p] of todas.entries()) {
    assert.equal(p.version, todas[0].version);
    assert.equal(p.vista.asiento, i);
    const activa = p.lance.activos.includes(i);
    if (activa) assert.deepEqual(p.vista.cartas, reparto.manos[i]);
    else {
      assert.equal(p.vista.estado, "esperando");
      assert.ok(!Object.hasOwn(p.vista, "cartas"));
      assert.ok(!Object.hasOwn(p.vista, "tantosPropios"));
      assert.deepEqual(p.vista.legales, []);
    }
    // En estos cortes todavía no se jugó ninguna carta ni se publicó ningún tanto individual.
    const serializada = JSON.stringify(p);
    for (const [j, terna] of reparto.manos.entries()) {
      if (activa && i === j) continue;
      for (const carta of terna) assert.ok(!serializada.includes(carta), "Carta oculta en asiento " + i);
    }
  }
  return todas;
}

async function guardar(mesa, asiento, orden, respuesta) {
  const proyecciones = await comprobarPrivacidad(mesa);
  await pool.query("INSERT INTO juego.prueba_reingreso_tercetos VALUES ($1,$2,$3,$4,$5,$6)",
    [mesa.id, mesa.personas.map(p => p.indice), asiento, orden, respuesta, proyecciones.map(p => hash(JSON.stringify(p)))]);
}

async function hastaCerrar(mesa) {
  for (let i = 0; i < 10; i++) {
    const actuales = await vistas(mesa);
    if (actuales[0].vista.resultado) return actuales[0];
    const turno = actuales.find(p => p.vista.legales.includes("mazo") || p.vista.legales.includes("paso-flor"));
    assert.ok(turno, "Se esperaba el retiro o la consulta de flor");
    const tipo = turno.vista.legales.includes("paso-flor") ? "paso-flor" : "mazo";
    await partida(mesa, turno.vista.asiento, "acciones", comando(turno.version, tipo));
  }
  throw new Error("El retiro no cerró el reparto");
}

async function iniciar(personas) {
  await pool.query("CREATE TABLE juego.prueba_reingreso_tercetos (mesa uuid PRIMARY KEY, personas int[], asiento int, orden jsonb, respuesta jsonb, huellas text[])");
  const mesa = await crear(personas);
  await colocar(mesa, 1, sinFlor);
  await partida(mesa, 0, "acciones", comando(1, "truco"));
  const quieren = await Promise.all([1, 3].map(i => partida(mesa, i, "acciones", comando(2, "quiero"), [200, 409])));
  assert.deepEqual(quieren.map(r => r.status).sort(), [200, 409]);
  const aceptada = quieren.find(r => r.status === 200).body;
  assert.equal(aceptada.vista.acciones.filter(a => a.tipo === "quiero").length, 1);
  const cierre = await hastaCerrar(mesa);
  assert.deepEqual(cierre.puntos, [0, 2]);
  const siguientes = await Promise.all([0, 5].map(i => partida(mesa, i, "siguiente", comando(cierre.version), [200, 409])));
  assert.deepEqual(siguientes.map(r => r.status).sort(), [200, 409]);
  const pico = siguientes.find(r => r.status === 200).body;
  assert.equal(pico.manoNumero, 2);
  assert.equal(pico.vista.dador, 0);
  assert.deepEqual(pico.lance, {tipo: "pico-a-pico", duelo: 1, activos: [1, 4]});
  await colocar(mesa, 2, {...sinFlor, dador: 0, mano: 1});
  const orden = comando(pico.version, "mazo");
  const {body: retiro} = await partida(mesa, 1, "acciones", orden);
  let segundo = retiro;
  for (let pasos = 0; segundo.lance.duelo === 1 && pasos < 2; pasos++) {
    const actual = (await vistas(mesa)).find(p => p.vista.legales.includes("paso-flor"));
    assert.ok(actual);
    segundo = (await partida(mesa, actual.vista.asiento, "acciones", comando(actual.version, "paso-flor"))).body;
  }
  assert.deepEqual(segundo.lance, {tipo: "pico-a-pico", duelo: 2, activos: [2, 5]});
  await partida(mesa, 4, "acciones", comando(segundo.version, "mazo"), [409]);
  assert.deepEqual((await partida(mesa, 1, "acciones", orden)).body, retiro);
  await partida(mesa, 1, "acciones", {...orden, accion: {tipo: "truco"}}, [409]);
  await guardar(mesa, 1, orden, retiro);

  const flores = await crear(personas);
  const reparto = structuredClone(sinFlor);
  reparto.manos[0] = ["espadas-01", "espadas-04", "espadas-06"];
  await colocar(flores, 1, reparto);
  const declarar = comando(1, "flor");
  const {body: flor} = await partida(flores, 0, "acciones", declarar);
  assert.equal(flor.vista.pendiente.tipo, "flor");
  assert.equal(flor.vista.porDeclararFlor, 1);
  await guardar(flores, 0, declarar, flor);
}

async function confirmarPorSocket(mesa, asiento, orden, esperada) {
  const ws = new WebSocket(base.replace("http:", "ws:") + "/api/mesas/" + mesa.id + "/vivo",
    "truco.v1", { headers: { cookie: mesa.personas[asiento].cookie, origin } });
  const recibir = async () => JSON.parse(String((await once(ws, "message", {signal: AbortSignal.timeout(8000)}))[0]));
  try {
    assert.deepEqual(await recibir(), {tipo: "actualizar"});
    const mensaje = recibir();
    ws.send(JSON.stringify({tipo: "accion", ...orden}));
    assert.deepEqual(await mensaje, {tipo: "confirmacion", id: orden.id, partida: esperada});
  } finally { ws.terminate(); }
}

async function reconectar(personas) {
  const {rows} = await pool.query("SELECT * FROM juego.prueba_reingreso_tercetos");
  assert.equal(rows.length, 2);
  for (const previa of rows) {
    const mesa = {id: previa.mesa, personas: previa.personas.map(i => personas[i])};
    const actuales = await comprobarPrivacidad(mesa);
    assert.deepEqual(actuales.map(p => hash(JSON.stringify(p))), previa.huellas);
    await confirmarPorSocket(mesa, previa.asiento, previa.orden, previa.respuesta);
  }
}

try {
  const personas = await Promise.all(Array.from({length: 7}, (_, i) => sesion(i)));
  if (process.argv[2] === "reconectar") await reconectar(personas);
  else await iniciar(personas);
  console.log("Persistencia de tercetos verificada · " + (process.argv[2] || "iniciar"));
} finally { await pool.end(); }
