// Desde el contenedor de la API y sobre la base descartable de check:stack.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://127.0.0.1:" + (process.env.PORT || 3001);

async function jugador(numero) {
  const sesion = randomBytes(32).toString("base64url");
  const { rows: [j] } = await pool.query(`
    INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('prueba-mesas',$1,$2)
    ON CONFLICT (emisor,sujeto) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id
  `, [String(numero), "Jugador " + numero]);
  const hash = createHash("sha256").update(sesion).digest("hex");
  await pool.query("INSERT INTO juego.sesiones (clave,jugador) VALUES ($1,$2)", [hash,j.id]);
  return {id:j.id, cookie:"truco_sesion=" + sesion};
}

async function llamar(persona, metodo, ruta, datos, origen = process.env.WEB_ORIGIN) {
  const headers = { origin: origen };
  if (persona) headers.cookie = persona.cookie;
  if (datos) headers["content-type"] = "application/json";
  const response = await fetch(base + ruta, { method: metodo, headers, body: datos ? JSON.stringify(datos) : undefined });
  return { estado: response.status, datos: await response.json() };
}
const invitacion = mesa => "/api/invitaciones/" + new URL(mesa.invitacion).searchParams.get("invitacion") + "/unirse";
const bot = (p, mesa, asiento) => llamar(p, "POST", "/api/mesas/" + mesa.id + "/computadoras", { asiento });
const entrar = (p, mesa) => llamar(p, "POST", invitacion(mesa));
async function crear(p, modo) {
  const r = await llamar(p, "POST", "/api/mesas", {modo});
  assert.equal(r.estado, 201);
  assert.equal(r.datos.miAsiento, 0);
  assert.equal(r.datos.creadorId, p.id);
  assert.equal(r.datos.lista, false);
  return r.datos;
}

try {
  const [ana, bruno, clara, diego, eva] = await Promise.all([1,2,3,4,5].map(jugador));
  if (process.argv[2] === "reinicio") {
    const mesa = (await pool.query("SELECT id FROM juego.mesas WHERE creador=$1 AND modo='2v2' ORDER BY id", [ana.id])).rows;
    assert.ok(mesa.length >= 1);
    for (const { id } of mesa) {
      const r = await llamar(ana, "GET", "/api/mesas/" + id);
      assert.equal(r.estado, 200);
      assert.equal(r.datos.lista, true);
      assert.equal((await entrar(ana, r.datos)).datos.miAsiento, 0);
    }
    console.log("Las mesas, invitaciones y asientos se conservaron tras el reinicio.");
  } else {
    assert.equal((await llamar(null, "POST", "/api/mesas", {modo:"2v2"})).estado, 401);
    assert.equal((await llamar(ana, "POST", "/api/mesas", {modo:"2v2"}, "https://example.org")).estado, 403);
    assert.equal((await llamar(ana, "POST", "/api/mesas", {modo:"3v3"})).estado, 400);
    assert.equal((await llamar(ana, "POST", "/api/invitaciones/invalida/unirse")).estado, 404);
    const dupla = await crear(ana, "2v2");
    assert.equal(dupla.asientos.length, 4);
    assert.deepEqual(dupla.asientos.map(a=>a.equipo), [0,1,0,1]);
    assert.equal((await llamar(eva, "GET", "/api/mesas/" + dupla.id)).estado, 404);
    const dos = await Promise.all([entrar(bruno, dupla), entrar(bruno, dupla)]);
    assert.deepEqual(dos.map(r=>r.datos.miAsiento), [1,1]);
    assert.equal((await bot(bruno, dupla, 3)).estado, 403);
    assert.equal((await entrar(clara, dupla)).datos.miAsiento, 2);
    const candidatos = [diego, eva];
    const carrera = await Promise.all(candidatos.map(p => entrar(p, dupla)));
    assert.deepEqual(carrera.map(r=>r.estado).sort(), [200,409]);
    const ultimo = carrera.find(r=>r.estado===200).datos;
    assert.equal(ultimo.miAsiento, 3);
    assert.equal(ultimo.lista, true);
    assert.deepEqual(ultimo.asientos.map(a=>a.tipo), Array(4).fill("humano"));
    const sinAsiento = candidatos[carrera.findIndex(r=>r.estado===409)];
    assert.equal((await llamar(sinAsiento, "GET", "/api/mesas/" + dupla.id)).estado, 404);
    const vistaAna = await llamar(ana, "GET", "/api/mesas/" + dupla.id);
    assert.deepEqual(vistaAna.datos.asientos, ultimo.asientos);
    assert.equal((await entrar(bruno, dupla)).datos.miAsiento, 1);

    const manoAMano = await crear(bruno, "1v1");
    assert.equal(manoAMano.asientos.length, 2);
    assert.equal((await bot(ana, manoAMano, 1)).estado, 404);
    assert.equal((await bot(bruno, manoAMano, 0)).estado, 409);
    assert.equal((await bot(bruno, manoAMano, 2)).estado, 400);
    const cpu = await Promise.all([bot(bruno, manoAMano, 1), bot(bruno, manoAMano, 1)]);
    for (const r of cpu) {
      assert.equal(r.estado, 200);
      assert.equal(r.datos.lista, true);
      assert.equal(r.datos.asientos[1].tipo, "computadora");
    }
    assert.equal((await entrar(ana, manoAMano)).estado, 409);

    const mixta = await crear(ana, "2v2");
    assert.equal((await bot(ana, mixta, 2)).datos.asientos[2].equipo, 0);
    assert.equal((await entrar(diego, mixta)).datos.miAsiento, 1);
    const final = await bot(ana, mixta, 3);
    assert.deepEqual(final.datos.asientos.map(a=>a.tipo), ["humano","humano","computadora","computadora"]);
    assert.equal(final.datos.lista, true);
    console.log("Mesas de 2 y 4: invitación, carreras, reingreso y computadoras verificados.");
  }
} finally {
  await pool.end();
}
