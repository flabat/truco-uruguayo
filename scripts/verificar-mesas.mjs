// Desde el contenedor de la API y sobre la base descartable de check:stack.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";
import { versionReglasOnline, versionReglasTercetos } from "@eltruco/motor/mesa-online.ts";
import { initial } from "../training/anchored/actor.ts";

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
async function misMesas(p) {
  const r = await llamar(p, "GET", "/api/mis-mesas");
  assert.equal(r.estado, 200);
  return r.datos.mesas;
}
async function crear(p, modo, meta, publica) {
  const r = await llamar(p, "POST", "/api/mesas", {modo, meta, publica});
  assert.equal(r.datos.publica, publica ?? false);
  assert.equal(r.estado, 201);
  assert.equal(r.datos.miAsiento, 0);
  assert.equal(r.datos.creadorId, p.id);
  assert.equal(r.datos.lista, false);
  assert.equal(r.datos.meta, meta ?? (modo === "3v3" ? 50 : 40));
  assert.equal(r.datos.versionReglas, modo === "3v3" ? versionReglasTercetos : versionReglasOnline);
  assert.equal(r.datos.politica, modo === "3v3" ? "tercetos-basica-v1" : "incumbent-online-v1");
  return r.datos;
}

async function verificarPublicaciones(persona) {
  const modelo = initial("duel");
  const registrar = actor => execFileSync(process.execPath, ["policyctl.ts", "register", "duel"],
    { input: JSON.stringify(actor), encoding: "utf8" }).trim();
  const politica = (...args) => execFileSync(process.execPath, ["policyctl.ts", ...args], { encoding: "utf8" }).trim();
  const primero = registrar(modelo);
  const segundo = registrar({ ...modelo, bands: ["balanced", "v1", "v1"] });
  const publicados = () => pool.query("SELECT pin FROM juego.publicaciones_modelo WHERE pin=ANY($1::text[])", [[primero, segundo]]);
  const diaUruguayo = async () => (await pool.query("SELECT to_char(now() AT TIME ZONE 'America/Montevideo','YYYY-MM-DD') AS dia")).rows[0].dia;
  const nuevaMesa = async () => {
    const respuesta = await llamar(persona, "POST", "/api/mesas", { modo: "1v1" });
    assert.equal(respuesta.estado, 201);
    return respuesta.datos;
  };
  const releer = async mesa => {
    const respuesta = await llamar(persona, "GET", "/api/mesas/" + mesa.id);
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.datos.politica, mesa.politica);
    assert.deepEqual(respuesta.datos.edicionModelo, mesa.edicionModelo);
  };
  assert.notEqual(primero, segundo);
  assert.equal((await publicados()).rowCount, 0);
  const inicio = await diaUruguayo();
  assert.equal(politica("activate", "duel", primero), primero);
  const anterior = await nuevaMesa();
  assert.equal(anterior.politica, primero);
  assert.equal(anterior.edicionModelo.nombre, "Duelo 2");
  assert.ok([inicio, await diaUruguayo()].includes(anterior.edicionModelo.publicado));

  const db = await pool.connect();
  const cambiar = "UPDATE juego.activaciones SET pin=$1 WHERE formato='duel'";
  try {
    await db.query("BEGIN");
    await db.query(cambiar, [segundo]);
    assert.equal((await db.query("SELECT pin FROM juego.publicaciones_modelo WHERE pin=$1", [segundo])).rowCount, 1);
  } finally {
    await db.query("ROLLBACK");
    db.release();
  }
  assert.deepEqual((await publicados()).rows, [{ pin: primero }]);
  await Promise.all([pool.query(cambiar, [segundo]), pool.query(cambiar, [segundo])]);
  const siguiente = await nuevaMesa();
  assert.equal(siguiente.politica, segundo);
  assert.equal(siguiente.edicionModelo.nombre, "Duelo 3");
  assert.ok([inicio, await diaUruguayo()].includes(siguiente.edicionModelo.publicado));
  await releer(anterior);

  politica("rollback", "duel");
  assert.equal((await nuevaMesa()).politica, "incumbent-online-v1");
  await releer(siguiente);
  // Simula que la primera edición se publicó un día antes de la reactivación.
  const { rows: [publicacionAnterior] } = await pool.query(`UPDATE juego.publicaciones_modelo
    SET publicada_el=publicada_el - 1 WHERE pin=$1 RETURNING publicada_el::text AS fecha`, [primero]);
  anterior.edicionModelo.publicado = publicacionAnterior.fecha;
  politica("activate", "duel", primero);
  politica("activate", "duel", primero);
  assert.equal((await publicados()).rowCount, 2);
  assert.deepEqual((await nuevaMesa()).edicionModelo, anterior.edicionModelo);
  await releer(anterior);
  politica("rollback", "duel");
  console.log("Registrados, publicados por CLI y SQL, revertidos y reactivados dos modelos con sus mesas y ediciones originales.");
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
    const { rows: [publica] } = await pool.query(`UPDATE juego.mesas SET ultimo_hecho_publico=now()
      WHERE creador=$1 AND publica AND modo='2v2' RETURNING id`, [ana.id]);
    assert.ok((await pool.query("SELECT 1 FROM juego.mesas_en_juego WHERE id=$1", [publica.id])).rowCount);
    for (const ruta of ["/api/salon/mesas", "/api/salon/mesas/" + publica.id]) {
      const r = await fetch(base + ruta, { headers: { Cookie: ana.cookie, "If-None-Match": "*" } });
      assert.equal(r.status, 404);
      assert.equal(r.headers.get("etag"), null);
      assert.deepEqual(await r.json(), { error: "No se encontró la mesa en el salón." });
    }
    assert.equal((await llamar(ana, "POST", "/api/mesas", {modo:"1v1", publica:true})).estado, 409);
    const privada = await crear(ana, "1v1");
    const propias = await misMesas(ana);
    for (const id of [publica.id, privada.id]) assert.ok(propias.some(m => m.id === id), "con el salón cerrado se puede retomar " + id);
    console.log("Salón cerrado aun con ETag. Se conservaron las mesas, las invitaciones y la creación privada.");
  } else {
    assert.equal((await llamar(null, "GET", "/api/mis-mesas")).estado, 401);
    assert.deepEqual(await misMesas(ana), []);
    assert.equal((await llamar(null, "POST", "/api/mesas", {modo:"2v2"})).estado, 401);
    assert.equal((await llamar(ana, "POST", "/api/mesas", {modo:"2v2"}, "https://example.org")).estado, 403);
    assert.equal((await llamar(ana, "POST", "/api/mesas", {modo:"4v4"})).estado, 400);
    assert.equal((await llamar(ana, "POST", "/api/invitaciones/invalida/unirse")).estado, 404);
    assert.equal((await llamar(ana, "POST", "/api/mesas", {modo: "1v1", formato: "pairs-senas"})).estado, 400);
    for (const meta of [0, 25, 1.5, "50", null, 2147483648]) {
      assert.equal((await llamar(ana, "POST", "/api/mesas", {modo: "2v2", meta})).estado, 400);
    }
    for (const datos of [{ modo: "3v3", publica: true }, { modo: "2v2", publica: "false" }, { modo: "1v1", publica: null }]) {
      assert.equal((await llamar(ana, "POST", "/api/mesas", datos)).estado, 400);
    }
    const seis = await crear(ana, "3v3");
    assert.equal(seis.formato, "triples");
    assert.deepEqual(seis.asientos.map(a => a.equipo), [0,1,0,1,0,1]);
    const dupla = await crear(ana, "2v2", 50);
    const previa = invitacion(dupla).replace(/\/unirse$/, "");
    assert.equal((await llamar(null, "GET", previa)).estado, 401);
    assert.deepEqual((await llamar(eva, "GET", previa)).datos, { publica: false, sentada: false });
    assert.deepEqual((await llamar(ana, "GET", previa)).datos, { publica: false, sentada: true, id: dupla.id });
    assert.equal((await llamar(eva, "POST", previa)).estado, 405);
    assert.equal(dupla.formato, "pairs");
    assert.equal(dupla.asientos.length, 4);
    assert.deepEqual(dupla.asientos.map(a=>a.equipo), [0,1,0,1]);
    assert.equal((await llamar(eva, "GET", "/api/mesas/" + dupla.id)).estado, 404);
    const espera = await misMesas(ana);
    assert.deepEqual(espera.map(m => m.id).sort(), [seis.id, dupla.id].sort());
    for (const m of espera) {
      assert.equal(m.mano, null);
      assert.equal(m.puntos, null);
      assert.equal(m.teToca, false);
      assert.deepEqual(m.participantes, []);
    }
    assert.deepEqual(await misMesas(eva), [], "la vista previa de una invitación no ocupa asiento");
    const dos = await Promise.all([entrar(bruno, dupla), entrar(bruno, dupla)]);
    assert.deepEqual(dos.map(r=>r.datos.miAsiento), [1,1]);
    assert.equal((await bot(bruno, dupla, 3)).estado, 403);
    assert.equal((await entrar(clara, dupla)).datos.miAsiento, 2);
    const candidatos = [diego, eva];
    const carrera = await Promise.all(candidatos.map(p => entrar(p, dupla)));
    assert.deepEqual(carrera.map(r=>r.estado).sort(), [200,409]);
    const ultimo = carrera.find(r=>r.estado===200).datos;
    assert.equal(ultimo.meta, 50);
    assert.equal(ultimo.miAsiento, 3);
    assert.equal(ultimo.lista, true);
    assert.deepEqual(ultimo.asientos.map(a=>a.tipo), Array(4).fill("humano"));
    const sinAsiento = candidatos[carrera.findIndex(r=>r.estado===409)];
    assert.equal((await llamar(sinAsiento, "GET", "/api/mesas/" + dupla.id)).estado, 404);
    const vistaAna = await llamar(ana, "GET", "/api/mesas/" + dupla.id);
    assert.deepEqual(vistaAna.datos.asientos, ultimo.asientos);
    assert.equal((await entrar(bruno, dupla)).datos.miAsiento, 1);

    const manoAMano = await crear(bruno, "1v1", 40, false);
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

    const mixta = await crear(ana, "2v2", 40, true);
    assert.deepEqual((await llamar(diego, "GET", invitacion(mixta).replace(/\/unirse$/, ""))).datos,
      { publica: true, sentada: false });
    assert.equal((await bot(ana, mixta, 2)).datos.asientos[2].equipo, 0);
    assert.equal((await entrar(diego, mixta)).datos.miAsiento, 1);
    const final = await bot(ana, mixta, 3);
    assert.deepEqual(final.datos.asientos.map(a=>a.tipo), ["humano","humano","computadora","computadora"]);
    assert.equal(final.datos.lista, true);
    assert.equal(final.datos.publica, true);
    const listada = () => pool.query("SELECT id FROM juego.mesas_en_juego WHERE id=$1", [mixta.id]).then(r => r.rowCount);
    assert.equal(await listada(), 0);
    const partida = await llamar(ana, "GET", "/api/mesas/" + mixta.id + "/partida");
    assert.equal(partida.datos.manoNumero, 1);
    assert.equal(await listada(), 1);
    const personal = (await misMesas(ana)).find(m => m.id === mixta.id);
    assert.equal(personal.modo, "2v2");
    assert.equal(personal.meta, 40);
    assert.equal(personal.mano, 1);
    assert.deepEqual(personal.participantes, ["Jugador 4", "Computadora 3", "Computadora 4"]);
    assert.deepEqual(Object.keys(personal).sort(), ["id", "mano", "meta", "modo", "participantes", "puntos", "teToca", "ultimaActividad"]);
    console.log("Mesas de 2 y 4: invitación, carreras, reingreso y computadoras verificados.");
    await verificarPublicaciones(ana);
  }
} finally {
  await pool.end();
}
