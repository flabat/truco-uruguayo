// Sólo se fija el reparto. Las lecturas, indicaciones y jugadas pasan por la API real.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { on } from "node:events";
import WebSocket from "ws";
import pg from "pg";
import { iniciarReplayDB } from "./replay-db.ts";
import { iniciarOnline } from "../src/motor/mesa-online.ts";
import { reproducirChico } from "../src/motor/replay-chico.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://127.0.0.1:3001/api";
const versionSenas = "senas-pie-v1";
const cartas = [
  ["copas-02", "bastos-01", "oros-04"], ["bastos-06", "copas-03", "oros-06"],
  ["copas-04", "espadas-06", "oros-07"], ["oros-12", "bastos-07", "espadas-07"],
  ["oros-02", "espadas-12", "bastos-03"], ["oros-10", "espadas-04", "copas-07"],
];
const jugadores = [];
async function cuenta(asiento) {
  const token = randomUUID();
  const { rows: [jugador] } = await pool.query("INSERT INTO juego.jugadores(emisor,sujeto,nombre) VALUES ('prueba-pie',$1,$2) RETURNING id", [token, "Prueba " + asiento]);
  await pool.query("INSERT INTO juego.sesiones(clave,jugador) VALUES ($1,$2)", [createHash("sha256").update(token).digest("hex"), jugador.id]);
  return { id: jugador.id, cookie: "truco_sesion=" + token };
}
async function pedir(asiento, ruta, datos, cabeceras) {
  return fetch(base + ruta, {
    method: datos === undefined ? "GET" : "POST", redirect: "manual",
    headers: { cookie: jugadores[asiento].cookie, origin: process.env.WEB_ORIGIN, "content-type": "application/json", ...cabeceras },
    body: datos instanceof URLSearchParams ? datos : JSON.stringify(datos),
  });
}
async function json(asiento, ruta, datos, esperado = 200) {
  const r = await pedir(asiento, ruta, datos);
  const cuerpo = await r.json();
  assert.equal(r.status, esperado, ruta + " " + JSON.stringify(cuerpo));
  return cuerpo;
}

async function mesa(cantidad, alternativa = false) {
  const tercetos = cantidad === 6;
  const formato = tercetos ? "triples" : "pairs-private-senas";
  const m = await json(0, "/mesas", { modo: tercetos ? "3v3" : "2v2", meta: 50, formato, versionSenas, publica: !tercetos }, 201);
  assert.equal(m.versionSenas, versionSenas);
  const token = new URL(m.invitacion).searchParams.get("invitacion");
  for (let i = 1; i < cantidad; i++) await json(i, "/invitaciones/" + token + "/unirse", {});
  const manos = cartas.slice(0, cantidad);
  if (alternativa) manos[0] = ["copas-11", "espadas-01", "oros-04"];
  const reparto = { versionReparto: tercetos ? "online-2" : "online-1", reglaFlor: "inmediata-v2", mano: 0, dador: cantidad - 1, muestra: "copas-06", manos };
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`INSERT INTO juego.manos(mesa,numero,version,version_reglas,version_senas,reparto,puntos_inicio,acciones,meta_tercetos,tipo_reparto)
      VALUES ($1,1,1,$2,$3,$4,ARRAY[0,0],'[]',$5,$6)`, [m.id, tercetos ? 2 : 1, versionSenas, reparto, tercetos ? 50 : null, tercetos ? "redondilla" : null]);
    await iniciarReplayDB(db, m.id, formato, manos.map((_, i) => i), iniciarOnline(reparto, [0, 0], 50), 1);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
  return m.id;
}

async function reporte(id, palabras) {
  const datos = new URLSearchParams({ mano: "1", posicion: "0", vuelta: "1", puntos: "0-0", fase: "jugada", cliente: "", indicaciones: String(palabras) });
  const r = await pedir(0, "/mesas/" + id + "/reportes", datos, { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(r.status, 303, await r.text());
  return new URL(r.headers.get("location")).searchParams.get("body");
}

async function indicacionEnVivo(id, pie, orden) {
  function conectar(asiento) {
    const ws = new WebSocket("ws://127.0.0.1:3001/api/mesas/" + id + "/vivo", "truco.v1", {
      headers: { cookie: jugadores[asiento].cookie, origin: process.env.WEB_ORIGIN },
    });
    const mensajes = on(ws, "message", { signal: AbortSignal.timeout(8000) });
    return { ws, async recibir() { return JSON.parse((await mensajes.next()).value[0].toString()); } };
  }
  const autor = conectar(pie);
  const rival = conectar(1);
  try {
    const aviso = { tipo: "actualizar" };
    assert.deepEqual(await autor.recibir(), aviso);
    assert.deepEqual(await rival.recibir(), aviso);
    autor.ws.send(JSON.stringify({ tipo: "indicacion", ...orden }));
    assert.deepEqual(await rival.recibir(), aviso);
    assert.deepEqual(await autor.recibir(), aviso);
    const recibo = await autor.recibir();
    assert.equal(recibo.tipo, "confirmacion");
    assert.equal(recibo.id, orden.id);
    const refresco = await json(1, "/mesas/" + id + "/partida");
    assert.deepEqual(refresco.indicaciones, recibo.partida.indicaciones);
    assert.deepEqual(recibo.partida.pie.grupos.map(g => g.emisor), [0]);
    assert.deepEqual(refresco.pie.grupos.map(g => g.emisor), [1]);
    return recibo.partida;
  } finally {
    autor.ws.close();
    rival.ws.close();
  }
}

async function intentoSinCommit(id, pie, orden) {
  const ruta = "/mesas/" + id;
  // La restricción sólo interrumpe este recibo, después de escribir la palabra y el evento.
  await pool.query(`CREATE FUNCTION juego.interrumpir_indicacion_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Fallo de prueba antes del commit'; END $$;
    CREATE CONSTRAINT TRIGGER interrumpir_indicacion AFTER INSERT ON juego.comandos DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW WHEN (NEW.id='00000000-0000-4000-8000-000000000314') EXECUTE FUNCTION juego.interrumpir_indicacion_prueba()`);
  try {
    assert.ok((await pedir(pie, ruta + "/indicaciones", orden)).status >= 500);
    assert.deepEqual((await json(pie, ruta + "/partida")).indicaciones, []);
    const { rows: [fila] } = await pool.query(`SELECT
      (SELECT count(*)::integer FROM juego.eventos_chico WHERE mesa=$1 AND evento->>'tipo'='indicacion') AS eventos,
      (SELECT count(*)::integer FROM juego.comandos WHERE mesa=$1 AND id=$2) AS recibos`, [id, orden.id]);
    assert.deepEqual(fila, { eventos: 0, recibos: 0 });
  } finally {
    await pool.query("DROP TRIGGER interrumpir_indicacion ON juego.comandos; DROP FUNCTION juego.interrumpir_indicacion_prueba()");
  }
}

async function guardarParaReinicio(id, cantidad, orden, recibo) {
  const vistas = [];
  for (let i = 0; i < cantidad; i++) vistas.push(await json(i, "/mesas/" + id + "/partida"));
  const { rows: [{ replay }] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
  await pool.query(`INSERT INTO juego.prueba_reinicio_pie(cantidad,mesa,orden,recibo,vistas,replay) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT(cantidad) DO UPDATE SET mesa=excluded.mesa, orden=excluded.orden, recibo=excluded.recibo, vistas=excluded.vistas, replay=excluded.replay`,
    [cantidad, id, orden, recibo, JSON.stringify(vistas), replay]);
}

async function reconectar() {
  const { rows } = await pool.query("SELECT * FROM juego.prueba_reinicio_pie ORDER BY cantidad");
  assert.deepEqual(rows.map(f => f.cantidad), [4, 6]);
  for (const { cantidad, mesa, orden, recibo, vistas, replay } of rows) {
    const personas = await pool.query(`SELECT j.sujeto FROM juego.asientos a JOIN juego.jugadores j ON j.id=a.jugador
      WHERE mesa=$1 ORDER BY a.asiento`, [mesa]);
    jugadores.splice(0, jugadores.length, ...personas.rows.map(j => ({ cookie: "truco_sesion=" + j.sujeto })));
    const ruta = "/mesas/" + mesa;
    for (let i = 0; i < cantidad; i++) assert.deepEqual(await json(i, ruta + "/partida"), vistas[i]);
    assert.deepEqual(await json(cantidad - 2, ruta + "/indicaciones", orden), recibo);
    const actual = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [mesa]);
    assert.deepEqual(actual.rows[0].replay, replay);
  }
  await json(0, "/mesas", { modo: "2v2", formato: "pairs-private-senas", versionSenas }, 409);
}

async function verificar(cantidad) {
  const id = await mesa(cantidad);
  const otra = await mesa(cantidad, true);
  const ruta = "/mesas/" + id;
  const par = cantidad - 2, impar = cantidad - 1;
  const asientos = Array.from({ length: cantidad }, (_, i) => i);
  const leer = asiento => json(asiento, ruta + "/partida");
  for (const asiento of asientos) {
    const p = await leer(asiento);
    const alterna = await json(asiento, "/mesas/" + otra + "/partida");
    const pie = asiento % 2 ? impar : par;
    assert.equal(p.pie.pie, pie);
    assert.deepEqual(p.pie.grupos.map(g => g.emisor), asiento === pie ? asientos.filter(i => i !== pie && i % 2 === pie % 2) : [asiento]);
    if (asiento === 0 || asiento === par) {
      assert.deepEqual(p.pie.grupos[0].gestos, ["cejas", "labios-derecha"]);
      assert.notDeepEqual(p.pie.grupos, alterna.pie.grupos);
    } else {
      assert.deepEqual(p, alterna, "Otro asiento pudo distinguir repartos que sólo cambiaron las cartas de A0");
    }
  }
  const salon = "/salon/mesas/" + id;
  let tag;
  if (cantidad === 4) {
    const r = await pedir(6, salon);
    assert.equal(r.status, 200);
    tag = r.headers.get("etag");
    const tablero = (await r.json()).tablero;
    assert.deepEqual(tablero, (await json(6, "/salon/mesas/" + otra)).tablero);
    assert.deepEqual(tablero.indicaciones, []);
    assert.ok(!("pie" in tablero) && !("grupos" in tablero));
  }
  const indicacion = (destinatario, frase, version = 1) => ({ id: randomUUID(), version, indicacion: { destinatario, frase, vuelta: 1 } });
  const hablar = (asiento, orden, estado) => json(asiento, ruta + "/indicaciones", orden, estado);
  await hablar(0, indicacion(2, "juga"), 409);
  await hablar(par, indicacion(1, "veni"), 409);
  await hablar(par, indicacion(0, "voy-a-vos"), 409);
  await hablar(par, indicacion(0, "libre"), 400);
  await json(0, ruta + "/acciones", { id: randomUUID(), version: 1, accion: { tipo: "carta", carta: "oros-04", sena: "cejas" } }, 400);

  const orden = indicacion(0, "veni");
  const antes = await leer(par);
  if (cantidad === 4) {
    orden.id = "00000000-0000-4000-8000-000000000314";
    await intentoSinCommit(id, par, orden);
  }
  const primera = cantidad === 4 ? await indicacionEnVivo(id, par, orden) : await hablar(par, orden);
  assert.deepEqual(await hablar(par, orden), primera);
  await hablar(par, { ...orden, indicacion: { ...orden.indicacion, frase: "juga" } }, 409);
  await hablar(par, indicacion(0, "juga"), 409);
  assert.equal(primera.version, antes.version);
  assert.deepEqual(primera.vista, antes.vista);
  const palabra = { emisor: par, destinatario: 0, frase: "veni", vuelta: 1, indiceAccion: 0 };
  for (const asiento of asientos) assert.deepEqual((await leer(asiento)).indicaciones, [palabra]);

  if (cantidad === 4) {
    const r = await pedir(6, salon, undefined, { "If-None-Match": tag });
    assert.equal(r.status, 200);
    assert.notEqual(r.headers.get("etag"), tag);
    const detalle = await r.json();
    assert.deepEqual(detalle.tablero.indicaciones, [palabra]);
    assert.ok(!JSON.stringify(detalle).includes('"gestos"'));
    assert.doesNotMatch(await reporte(id, 0), /le dijo a A0/);
    assert.match(await reporte(id, 1), /le dijo a A0 «Vení»/);
    const { rows } = await pool.query("SELECT indicaciones,secuencia::integer FROM juego.reportes WHERE mesa=$1 ORDER BY indicaciones", [id]);
    assert.deepEqual(rows, [{ indicaciones: 0, secuencia: 1 }, { indicaciones: 1, secuencia: 2 }]);
  }

  const jugar = (asiento, carta, version) => json(asiento, ruta + "/acciones", { id: randomUUID(), version, accion: { tipo: "carta", carta } });
  const jugada = await jugar(0, "oros-04", antes.version);
  const [carrera, jugadaRival] = await Promise.all([
    pedir(impar, ruta + "/indicaciones", indicacion(1, "juga", jugada.version)),
    jugar(1, "bastos-06", jugada.version),
  ]);
  assert.ok([200, 409].includes(carrera.status), await carrera.text());
  const palabras = carrera.ok ? [palabra, { emisor: impar, destinatario: 1, frase: "juga", vuelta: 1, indiceAccion: 1 }] : [palabra];
  assert.deepEqual((await leer(0)).indicaciones, palabras);
  await hablar(impar, indicacion(1, "juga", jugadaRival.version), 409);
  assert.deepEqual(await hablar(par, orden), primera);

  const { rows: [{ replay }] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
  assert.equal(replay.version, "chico-v2");
  assert.equal(replay.versionSenas, versionSenas);
  assert.deepEqual(replay.eventos.map(e => e.tipo), ["reparto", "indicacion", "decision", ...(carrera.ok ? ["indicacion"] : []), "decision"]);
  for (const asiento of asientos) {
    const prefijo = n => reproducirChico(replay, asiento, n).vista;
    assert.deepEqual(prefijo(1).indicaciones, []);
    assert.deepEqual(prefijo(2).indicaciones, [palabra]);
    const fin = prefijo(replay.eventos.length), enVivo = await leer(asiento);
    assert.deepEqual(fin.indicaciones, palabras);
    assert.deepEqual(fin.pie, enVivo.pie);
  }
  if (cantidad === 4) {
    const pieza = await jugar(2, "copas-04", jugadaRival.version);
    const segunda = await jugar(3, "oros-12", pieza.version);
    assert.equal(segunda.pie.vuelta, 2);
    const salida = await jugar(par, "espadas-06", segunda.version);
    assert.equal(salida.pie.pie, par);
    assert.deepEqual(salida.pie.grupos[0].gestos, ["cejas", "labios-derecha"]);
    const voy = await hablar(par, { id: randomUUID(), version: salida.version, indicacion: { vuelta: 2, destinatario: 0, frase: "voy-a-vos" } });
    for (const asiento of asientos) assert.deepEqual((await leer(asiento)).indicaciones, voy.indicaciones);
    assert.deepEqual((await json(6, salon)).tablero.indicaciones, voy.indicaciones);
    assert.deepEqual(voy.indicaciones.at(-1), { emisor: par, destinatario: 0, frase: "voy-a-vos", vuelta: 2, indiceAccion: 5 });
  } else {
    const fin = await json(2, ruta + "/acciones", { version: jugadaRival.version, id: randomUUID(), accion: { tipo: "mazo" } });
    const siguiente = await json(0, ruta + "/siguiente", { id: randomUUID(), version: fin.version });
    assert.equal(siguiente.lance.tipo, "pico-a-pico");
    assert.equal(siguiente.pie, undefined);
    assert.deepEqual(siguiente.indicaciones, []);
    await hablar(par, indicacion(2, "juga", siguiente.version), 409);
  }
  await guardarParaReinicio(id, cantidad, orden, primera);
}

try {
  if (process.argv[2] === "reconectar") {
    await reconectar();
    console.log("Parejas y tercetos recuperaron las mismas vistas, recibos y prefijos tras reiniciar con las altas cerradas.");
  } else {
    await pool.query(`CREATE TABLE IF NOT EXISTS juego.prueba_reinicio_pie (
      cantidad integer PRIMARY KEY, mesa uuid, orden jsonb, recibo jsonb, vistas jsonb, replay jsonb)`);
    for (let i = 0; i < 7; i++) jugadores.push(await cuenta(i));
    await pool.query("INSERT INTO juego.reporteros(jugador) VALUES ($1)", [jugadores[0].id]);
    await verificar(4);
    await verificar(6);
    console.log("Señas al pie verificadas en parejas y tercetos: privacidad por asiento, indicaciones públicas, carrera, replay, reporte y salón.");
  }
} finally { await pool.end(); }
