// Desde el contenedor de la API y sobre la base descartable de check:stack.
// Corre después de registrar las políticas de ensayo, para que exista una política de duelo en cola.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { crearPartidas } from "./partidas.ts";
import { leerMesa } from "./mesas.ts";
import { retirarJugador } from "./retiro.ts";
import { elegirAccionOnline } from "@eltruco/motor/mesa-online.ts";
import { reproducirChico } from "./replay-chico.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { politicaPie } from "@eltruco/motor/bot-pie.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const web = new URL(process.env.WEB_ORIGIN);
const servicio = crearPartidas(pool, web);
const base = "http://127.0.0.1:" + (process.env.PORT || 3001);
const comando = (version, accion) => ({ id: randomUUID(), version, ...(accion && { accion }) });

async function jugador(nombre) {
  const { rows: [j] } = await pool.query(`INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('prueba-retiro',$1,$1)
    ON CONFLICT (emisor,sujeto) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id`, [nombre + "-" + randomUUID()]);
  const sesion = randomUUID();
  await pool.query("INSERT INTO juego.sesiones (clave,jugador) VALUES ($1,$2)", [createHash("sha256").update(sesion).digest("hex"), j.id]);
  return { id: j.id, cookie: "truco_sesion=" + sesion };
}
async function mesa(modo, creador, asientos, { meta = 4, politica = "incumbent-online-v1", versionSenas = null } = {}) {
  const { rows: [m] } = await pool.query(`INSERT INTO juego.mesas (modo, creador, invitacion, meta, politica, version_senas)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, invitacion`, [modo, creador.id, randomUUID(), meta, politica, versionSenas]);
  for (const [asiento, persona] of asientos.entries()) {
    if (persona !== undefined) await pool.query("INSERT INTO juego.asientos (mesa,asiento,jugador,computadora) VALUES ($1,$2,$3,$4)",
      [m.id, asiento, persona?.id ?? null, persona === null]);
  }
  return m;
}
async function retirar(persona) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const mesas = await retirarJugador(db, persona.id);
    await db.query("COMMIT");
    return mesas;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
}
async function replayDe(id) {
  const { rows: [fila] } = await pool.query("SELECT replay FROM juego.replays_chico_v1 WHERE mesa=$1", [id]);
  return fila?.replay;
}
const esperar = async (condicion, ms = 20000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await condicion()) return true; await new Promise(r => setTimeout(r, 200)); }
  return false;
};

/** En las señas al pie, un compañero computadora puede esperar la palabra de una persona: esa persona pasa sin indicación. */
async function pasarSiEsperan(id, persona, partida) {
  const esperando = partida.pie?.esperando;
  if (esperando === undefined) return false;
  await servicio.ejecutar(id, persona.id, "indicaciones", { id: randomUUID(), version: partida.version,
    indicacion: { destinatario: esperando, frase: "sin-indicacion", vuelta: partida.pie.vuelta } });
  return true;
}

/** B juega hasta el final del chico; la computadora juega el asiento cedido de A. */
async function jugarHastaElFinal(id, b, asientoB) {
  let partida = await servicio.leer(id, b.id);
  for (let pasos = 0; partida.ganadorPartida === null; pasos++) {
    assert.ok(pasos < 500, "el chico debe terminar");
    if (partida.vista.resultado) {
      partida = await servicio.ejecutar(id, b.id, "siguiente", comando(partida.version));
      continue;
    }
    const elegida = elegirAccionOnline(partida.vista);
    if (!elegida && await pasarSiEsperan(id, b, partida)) {
      partida = await servicio.leer(id, b.id);
      continue;
    }
    if (!elegida) {
      // Turno del asiento cedido en una mesa en cola: lo resuelve el trabajador de la API.
      const version = partida.version;
      if (!await esperar(async () => (await servicio.leer(id, b.id)).version !== version)) {
        const { rows: [estado] } = await pool.query(`SELECT m.politica, m.version_senas,
          EXISTS (SELECT 1 FROM juego.turnos_bot t WHERE t.mesa=m.id) AS en_cola,
          (SELECT acciones FROM juego.manos h WHERE h.mesa=m.id ORDER BY numero DESC LIMIT 1) AS acciones
          FROM juego.mesas m WHERE m.id=$1`, [id]);
        const { turno, pendiente, legales, trucoPendiente, porDeclararFlor } = partida.vista;
        assert.fail("la computadora juega el asiento cedido: " + JSON.stringify({ estado, turno, pendiente, legales, trucoPendiente, porDeclararFlor }));
      }
      partida = await servicio.leer(id, b.id);
      continue;
    }
    const { asiento, ...accion } = elegida;
    assert.equal(asiento, asientoB);
    partida = await servicio.ejecutar(id, b.id, "acciones", comando(partida.version, accion));
  }
  return partida;
}

/** Deja la mano en el turno de A (asiento 0): B juega, reparte o espera a las computadoras. */
async function llevarAlTurnoDeA(id, a, b) {
  for (let pasos = 0; ; pasos++) {
    assert.ok(pasos < 200, "la mano debe llegar al turno de A");
    const partida = await servicio.leer(id, a.id);
    // Le toca a A cuando tiene jugadas legales: puede ser su carta o la respuesta a un canto.
    if (!partida.vista.resultado && elegirAccionOnline(partida.vista)) return partida;
    if (await pasarSiEsperan(id, a, partida)) continue;
    const deB = await servicio.leer(id, b.id);
    if (deB.vista.resultado) {
      if (deB.ganadorPartida !== null) throw new Error("El chico terminó antes del turno de A.");
      await servicio.ejecutar(id, b.id, "siguiente", comando(deB.version));
      continue;
    }
    const elegida = elegirAccionOnline(deB.vista);
    if (elegida) {
      const { asiento, ...accion } = elegida;
      await servicio.ejecutar(id, b.id, "acciones", comando(deB.version, accion));
    } else if (!await pasarSiEsperan(id, b, deB)) {
      const version = deB.version;
      assert.ok(await esperar(async () => (await servicio.leer(id, b.id)).version !== version), "las computadoras juegan antes del turno de A");
    }
  }
}

/** Un reparto puede cerrar el chico antes del turno de A: en ese caso se prueba con otra mesa. */
async function mesaEnTurnoDeA(crear) {
  for (let intento = 1; ; intento++) {
    const { a, b, m } = await crear();
    try {
      return { a, b, m, partida: await llevarAlTurnoDeA(m.id, a, b) };
    } catch (error) {
      if (intento === 3 || !(error instanceof Error) || error.message !== "El chico terminó antes del turno de A.") throw error;
    }
  }
}

async function probarCesion(politica) {
  const { a, b, m, partida: antes } = await mesaEnTurnoDeA(async () => {
    const a = await jugador("a"), b = await jugador("b");
    return { a, b, m: await mesa("1v1", a, [a, b], { politica, meta: 12 }) };
  });
  assert.deepEqual(await retirar(a), [m.id]);
  // Quien se fue ya no ve ni controla la mesa; su historial la conserva.
  assert.equal(await leerMesa(pool, m.id, a.id, web), null);
  await assert.rejects(servicio.leer(m.id, a.id), { status: 404 });
  const perfil = await fetch(base + "/api/perfil", { headers: { cookie: a.cookie } }).then(r => r.json());
  assert.ok(perfil.partidas.some(p => p.id === m.id));
  // Los demás ven una computadora en ese asiento.
  const vistaB = await leerMesa(pool, m.id, b.id, web);
  assert.equal(vistaB.asientos[0].tipo, "computadora");
  // La computadora juega enseguida el turno pendiente.
  assert.ok(await esperar(async () => (await servicio.leer(m.id, b.id)).version > antes.version), "la computadora juega el turno de A");
  const final = await jugarHastaElFinal(m.id, b, 1);
  assert.notEqual(final.ganadorPartida, null);
  // El replay se reproduce: el asiento sigue siendo humano y sus decisiones no llevan inferencia.
  const replay = await replayDe(m.id);
  assert.equal(replay.asientos[0].tipo, "humano");
  assert.ok(replay.eventos.filter(e => e.tipo === "decision" && e.accion.asiento === 0).every(e => e.bot === undefined));
  for (const asiento of [0, 1]) reproducirChico(replay, asiento);
  assert.equal(replay.eventos.at(-1).tipo, "cierre");
}

/** Parejas con señas al pie: A y B humanos, dos computadoras; la computadora no espera palabras del asiento cedido. */
async function probarCesionPie() {
  const { a, b, m, partida } = await mesaEnTurnoDeA(async () => {
    const a = await jugador("a"), b = await jugador("b");
    return { a, b, m: await mesa("2v2", a, [a, b, null, null], { politica: politicaPie, versionSenas: versionSenasPie, meta: 6 }) };
  });
  const antes = partida.version;
  assert.deepEqual(await retirar(a), [m.id]);
  assert.ok(await esperar(async () => (await servicio.leer(m.id, b.id)).version > antes), "la computadora juega el turno cedido al pie");
  const final = await jugarHastaElFinal(m.id, b, 1);
  assert.notEqual(final.ganadorPartida, null);
  const replay = await replayDe(m.id);
  assert.equal(replay.asientos[0].tipo, "humano");
  assert.ok(replay.eventos.filter(e => e.tipo === "decision" && e.accion.asiento === 0).every(e => e.bot === undefined));
  for (const asiento of [0, 1, 2, 3]) reproducirChico(replay, asiento);
}

try {
  await probarCesion();
  await probarCesionPie();
  const { rows: [enCola] } = await pool.query("SELECT pin FROM juego.artefactos WHERE contenido->>'format'='duel' LIMIT 1");
  assert.ok(enCola, "falta una política de duelo registrada");
  await probarCesion(enCola.pin);

  // Mesa en espera creada por quien se va: se cancela y nadie más puede sumarse.
  const a = await jugador("a"), b = await jugador("b"), c = await jugador("c");
  const propia = await mesa("2v2", a, [a, b]);
  assert.deepEqual(await retirar(a), [propia.id]);
  const vista = await leerMesa(pool, propia.id, b.id, web);
  assert.equal(vista.cancelada, true);
  assert.equal(vista.asientos[0].tipo, "vacio");
  const unirse = await fetch(base + "/api/invitaciones/" + propia.invitacion + "/unirse",
    { method: "POST", headers: { cookie: c.cookie, origin: web.origin } });
  assert.equal(unirse.status, 409);
  assert.equal((await unirse.json()).error, "La mesa se canceló.");
  await assert.rejects(servicio.leer(propia.id, b.id), { status: 409 });

  // Mesa en espera de otra persona: el asiento queda libre para alguien más.
  const ajena = await mesa("2v2", b, [b, a]);
  assert.deepEqual(await retirar(a), [ajena.id]);
  const libre = await leerMesa(pool, ajena.id, b.id, web);
  assert.equal(libre.cancelada, false);
  assert.equal(libre.asientos[1].tipo, "vacio");
  const entra = await fetch(base + "/api/invitaciones/" + ajena.invitacion + "/unirse",
    { method: "POST", headers: { cookie: c.cookie, origin: web.origin } });
  assert.equal(entra.status, 200);

  // Una mesa terminada no cambia.
  const d = await jugador("d"), e = await jugador("e");
  const terminada = await mesa("1v1", d, [d, null]);
  let partida = await servicio.leer(terminada.id, d.id);
  while (partida.ganadorPartida === null) {
    if (partida.vista.resultado) { partida = await servicio.ejecutar(terminada.id, d.id, "siguiente", comando(partida.version)); continue; }
    const { asiento, ...accion } = elegirAccionOnline(partida.vista);
    partida = await servicio.ejecutar(terminada.id, d.id, "acciones", comando(partida.version, accion));
  }
  assert.deepEqual(await retirar(d), []);
  assert.equal((await pool.query("SELECT cedido FROM juego.asientos WHERE mesa=$1 AND asiento=0", [terminada.id])).rows[0].cedido, false);
  void e;
  console.log("Retiro verificado · computadora en partidas empezadas (directa y en cola), mesas en espera liberadas o canceladas.");
} finally {
  await pool.end();
}
