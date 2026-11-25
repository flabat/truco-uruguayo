// Las lecturas, indicaciones y jugadas pasan por la API real.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { on } from "node:events";
import { setTimeout as esperar } from "node:timers/promises";
import WebSocket from "ws";
import pg from "pg";
import { iniciarReplayDB } from "./replay-db.ts";
import { politicaPieParejas } from "@eltruco/motor/modelo-pie.ts";
import { iniciarOnline } from "@eltruco/motor/mesa-online.ts";
import { normalizarPartida } from "@eltruco/motor/partida-jugador.ts";
import { reproducirChico } from "../api/replay-chico.ts";

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

async function mesa(cantidad, { alternativa = false, computadoras = [] } = {}) {
  const tercetos = cantidad === 6;
  const formato = tercetos ? "triples" : "pairs-private-senas";
  const m = await json(0, "/mesas", { modo: tercetos ? "3v3" : "2v2", meta: 50, formato, versionSenas, publica: !tercetos }, 201);
  assert.equal(m.versionSenas, versionSenas);
  assert.equal(m.politica, tercetos ? "pie-clasico-v1" : politicaPieParejas);
  const sinRepartir = await json(0, "/mesas/" + m.id + "/partida");
  assert.equal(sinRepartir.versionSenas, versionSenas);
  assert.deepEqual(sinRepartir.contexto, { versionVista: 1, fase: "sin-repartir" });
  assert.equal(sinRepartir.vista, null);
  assert.equal("lance" in sinRepartir, false);
  const token = new URL(m.invitacion).searchParams.get("invitacion");
  for (let i = 1; i < cantidad; i++) {
    if (computadoras.includes(i)) await json(0, "/mesas/" + m.id + "/computadoras", { asiento: i });
    else await json(i, "/invitaciones/" + token + "/unirse", {});
  }
  const manos = cartas.slice(0, cantidad);
  if (alternativa) manos[0] = ["copas-11", "espadas-01", "oros-04"];
  const reparto = { versionReparto: tercetos ? "online-2" : "online-1", reglaFlor: "inmediata-v2", mano: 0, dador: cantidad - 1, muestra: "copas-06", manos,
    ...(computadoras.length && { respondenSinFlor: computadoras }) };
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`INSERT INTO juego.manos(mesa,numero,version,version_reglas,version_senas,reparto,puntos_inicio,acciones,meta_tercetos,tipo_reparto)
      VALUES ($1,1,1,$2,$3,$4,ARRAY[0,0],'[]',$5,$6)`, [m.id, tercetos ? 2 : 1, versionSenas, reparto, tercetos ? 50 : null, tercetos ? "redondilla" : null]);
    const humanos = manos.map((_, i) => i).filter(i => !computadoras.includes(i));
    await iniciarReplayDB(db, m.id, formato, humanos, iniciarOnline(reparto, [0, 0], 50), 1);
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
    const ruta = "/mesas/" + id + "/partida";
    assert.deepEqual(recibo.partida, await json(pie, ruta));
    const refresco = await json(1, ruta);
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
  // Antes del contexto, sólo los recibos de tercetos ya incluían el lance.
  const anterior = { ...orden, id: randomUUID() };
  const camposNuevos = cantidad === 4 ? ["contexto", "lance"] : ["contexto"];
  const { rowCount } = await pool.query(`INSERT INTO juego.comandos(mesa,jugador,id,peticion,respuesta)
    SELECT mesa,jugador,$3,jsonb_set(peticion,'{id}',to_jsonb($3::uuid)),respuesta - $4::text[]
    FROM juego.comandos WHERE mesa=$1 AND id=$2`, [id, orden.id, anterior.id, camposNuevos]);
  assert.equal(rowCount, 1);
  const vistas = [];
  for (let i = 0; i < cantidad; i++) vistas.push(await json(i, "/mesas/" + id + "/partida"));
  const { rows: [{ replay }] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
  await pool.query(`INSERT INTO juego.prueba_reinicio_pie(cantidad,mesa,orden,recibo,vistas,replay) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT(cantidad) DO UPDATE SET mesa=excluded.mesa, orden=excluded.orden, recibo=excluded.recibo, vistas=excluded.vistas, replay=excluded.replay`,
    [cantidad, id, { vigente: orden, anterior }, recibo, JSON.stringify(vistas), replay]);
}

async function reconectar() {
  const { rows } = await pool.query("SELECT * FROM juego.prueba_reinicio_pie ORDER BY cantidad");
  assert.deepEqual(rows.map(f => f.cantidad), [4, 6]);
  for (const { cantidad, mesa, mesa_con_bots, orden, recibo, vistas, replay } of rows) {
    const personas = await pool.query(`SELECT j.sujeto FROM juego.asientos a JOIN juego.jugadores j ON j.id=a.jugador
      WHERE mesa=$1 ORDER BY a.asiento`, [mesa]);
    jugadores.splice(0, jugadores.length, ...personas.rows.map(j => ({ cookie: "truco_sesion=" + j.sujeto })));
    const ruta = "/mesas/" + mesa;
    for (let i = 0; i < cantidad; i++) assert.deepEqual(await json(i, ruta + "/partida"), vistas[i]);
    assert.deepEqual(await json(cantidad - 2, ruta + "/indicaciones", orden.vigente), recibo);
    const historico = await json(cantidad - 2, ruta + "/indicaciones", orden.anterior);
    assert.deepEqual(normalizarPartida(historico), recibo);
    const actual = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [mesa]);
    assert.deepEqual(actual.rows[0].replay, replay);
    await continuarEspera(cantidad, mesa_con_bots);
  }
  await json(0, "/mesas", { modo: "2v2", formato: "pairs-private-senas", versionSenas }, 409);
}

async function verificar(cantidad) {
  const id = await mesa(cantidad);
  const otra = await mesa(cantidad, { alternativa: true });
  const ruta = "/mesas/" + id;
  const par = cantidad - 2, impar = cantidad - 1;
  const asientos = Array.from({ length: cantidad }, (_, i) => i);
  const leer = asiento => json(asiento, ruta + "/partida");
  for (const asiento of asientos) {
    const p = await leer(asiento);
    const alterna = await json(asiento, "/mesas/" + otra + "/partida");
    assert.equal(p.versionSenas, versionSenas);
    assert.deepEqual(p.contexto, { versionVista: 1, fase: "en-juego" });
    assert.deepEqual(p.lance, { tipo: cantidad === 6 ? "redondilla" : "simple", duelo: null, activos: asientos });
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
  // La carta sólo acompaña a «Jugá» y tiene que ser un gesto que el compañero le mostró al pie (#425).
  const conCarta = (destinatario, frase, carta, version = 1) =>
    ({ id: randomUUID(), version, indicacion: { destinatario, frase, vuelta: 1, carta } });
  await hablar(par, conCarta(0, "veni", "cejas"), 400);
  await hablar(par, conCarta(0, "juga", 2), 400);
  await hablar(par, conCarta(0, "juga", "nariz"), 409);
  await hablar(par, conCarta(0, "juga", "ojos-cerrados"), 409);
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
    // El pie nombra la carta que le mostró Ana (el 4 de la muestra): la oye toda la mesa y la valida el replay.
    const nombrada = await hablar(par, conCarta(2, "juga", "beso", jugadaRival.version));
    const pedida = { emisor: par, destinatario: 2, frase: "juga", carta: "beso", vuelta: 1, indiceAccion: 2 };
    assert.deepEqual(nombrada.indicaciones.at(-1), pedida);
    for (const asiento of asientos) assert.deepEqual((await leer(asiento)).indicaciones.at(-1), pedida);
    const { rows: [{ replay: conPedido }] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
    assert.deepEqual(reproducirChico(conPedido, 2, conPedido.eventos.length).vista.indicaciones.at(-1), pedida);
    const fin = await json(2, ruta + "/acciones", { version: jugadaRival.version, id: randomUUID(), accion: { tipo: "mazo" } });
    const siguiente = await json(0, ruta + "/siguiente", { id: randomUUID(), version: fin.version });
    assert.equal(siguiente.lance.tipo, "pico-a-pico");
    assert.equal(siguiente.pie, undefined);
    assert.deepEqual(siguiente.indicaciones, []);
    await hablar(par, indicacion(2, "juga", siguiente.version), 409);
  }
  await guardarParaReinicio(id, cantidad, orden, primera);
}

const jugarCarta = (ruta, asiento, version, carta) => json(asiento, ruta + "/acciones",
  { id: randomUUID(), version, accion: { tipo: "carta", carta } });
const indicacion = (version, destinatario, frase, vuelta = 1) => ({
  id: randomUUID(), version, indicacion: { destinatario, frase, vuelta },
});

async function prepararEspera(cantidad) {
  const id = await mesa(cantidad, { computadoras: cantidad === 6 ? [1, 3] : [1] });
  const ruta = "/mesas/" + id;
  const pie = cantidad - 1;
  // A0 abre la vuelta. A1 debe decidir entre sus dos seises y el tres.
  const rival = await jugarCarta(ruta, 0, 1, "oros-04");
  assert.equal(rival.pie.esperando, undefined);
  const primera = await json(pie, ruta + "/partida");
  assert.equal(primera.pie.esperando, 1);
  assert.equal(primera.version, 2);
  await json(0, ruta + "/indicaciones", indicacion(2, 1, "sin-indicacion"), 409);
  await json(pie, ruta + "/indicaciones", indicacion(2, 1, "sin-indicacion", 2), 409);
  if (cantidad === 6) {
    await json(pie, ruta + "/indicaciones", indicacion(2, 3, "sin-indicacion"), 409);
    const otro = await json(pie, ruta + "/indicaciones", indicacion(2, 3, "juga"));
    assert.equal(otro.pie.esperando, 1, "Hablarle a A3 no autoriza la carta de A1.");
  } else {
    // Una mesa abierta antes de actualizar el servidor puede tener un trabajo cuyo plazo ya venció.
    await pool.query("UPDATE juego.turnos_bot SET disponible_desde=clock_timestamp() WHERE mesa=$1", [id]);
  }
  await esperar(4800); // El plazo anterior era de cuatro segundos.
  const sigue = await json(pie, ruta + "/partida");
  assert.equal(sigue.pie.esperando, 1);
  assert.equal(sigue.version, 2);
  assert.equal(sigue.vista.turno, 1);
  await pool.query("UPDATE juego.prueba_reinicio_pie SET mesa_con_bots=$2 WHERE cantidad=$1", [cantidad, id]);
}

async function esperarJugada(ruta, pie, version) {
  const hasta = Date.now() + 10000;
  for (;;) {
    const actual = await json(pie, ruta + "/partida");
    if (actual.version > version) return actual;
    assert.ok(Date.now() < hasta, "La computadora no continuó el turno autorizado.");
    await esperar(80);
  }
}

async function continuarEspera(cantidad, id) {
  const ruta = "/mesas/" + id;
  const pie = cantidad - 1;
  const antes = await json(pie, ruta + "/partida");
  assert.equal(antes.version, 2);
  assert.equal(antes.pie.esperando, 1, "La misma computadora debe seguir esperando tras el reinicio.");
  const orden = indicacion(antes.version, 1, cantidad === 6 ? "sin-indicacion" : "juga");
  const recibo = await json(pie, ruta + "/indicaciones", orden);
  assert.equal(recibo.pie.esperando, undefined);
  assert.equal(recibo.version, antes.version);
  const siguiente = await esperarJugada(ruta, pie, antes.version);
  assert.equal(siguiente.version, 3);
  assert.equal(siguiente.vista.vueltaActual.jugadas.at(-1).asiento, 1);
  assert.deepEqual(await json(pie, ruta + "/indicaciones", orden), recibo);
  if (cantidad === 6) {
    assert.deepEqual(recibo.indicaciones, antes.indicaciones);
    assert.deepEqual((await json(0, ruta + "/partida")).indicaciones, antes.indicaciones);
    const { rows: [{ replay }] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
    assert.deepEqual(replay.eventos.map(e => e.tipo), ["reparto", "decision", "indicacion", "decision"]);
    assert.doesNotMatch(JSON.stringify(replay), /sin-indicacion/);
    const turnoA3 = await jugarCarta(ruta, 2, siguiente.version, "espadas-06");
    const turnoA4 = await esperarJugada(ruta, pie, turnoA3.version);
    assert.equal(turnoA4.vista.turno, 4, "A3 ya había recibido su propia indicación.");
  } else {
    assert.equal(siguiente.vista.vueltaActual.jugadas.at(-1).carta, "copas-03", "A1 debe salir fuerte al oír «Jugá».");
    const turnoPie = await jugarCarta(ruta, 2, siguiente.version, "espadas-06");
    const ganaPie = await jugarCarta(ruta, pie, turnoPie.version, "espadas-07");
    assert.equal(ganaPie.vista.turno, pie);
    const turnoA0 = await jugarCarta(ruta, pie, ganaPie.version, "oros-12");
    const turnoA1 = await jugarCarta(ruta, 0, turnoA0.version, "bastos-01");
    const segunda = await json(pie, ruta + "/partida");
    assert.equal(segunda.pie.esperando, 1, "La indicación anterior no autoriza una nueva vuelta.");
    assert.deepEqual(segunda.pie.opciones, [{ destinatario: 1, frases: ["voy-a-vos"] }]);
    await json(pie, ruta + "/indicaciones", indicacion(turnoA1.version, 1, "voy-a-vos", 2));
    const turnoA2 = await esperarJugada(ruta, pie, turnoA1.version);
    assert.equal(turnoA2.vista.turno, 2);
  }
}

try {
  if (process.argv[2] === "reconectar") {
    await reconectar();
    console.log("Parejas y tercetos recuperaron las mismas vistas, recibos y prefijos tras reiniciar con las altas cerradas.");
  } else {
    await pool.query(`CREATE TABLE IF NOT EXISTS juego.prueba_reinicio_pie (
      cantidad integer PRIMARY KEY, mesa uuid, mesa_con_bots uuid, orden jsonb, recibo jsonb, vistas jsonb, replay jsonb)`);
    for (let i = 0; i < 7; i++) jugadores.push(await cuenta(i));
    await pool.query("INSERT INTO juego.reporteros(jugador) VALUES ($1)", [jugadores[0].id]);
    await verificar(4);
    await verificar(6);
    await Promise.all([prepararEspera(4), prepararEspera(6)]);
    console.log("Verificadas las señas, las indicaciones públicas y la espera del compañero hasta que decida el pie en parejas y redondillas.");
  }
} finally { await pool.end(); }
