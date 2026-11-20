// Dentro de check:stack. Cada lector entra por HTTP y los comandos pasan por el árbitro.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { crearPartidas } from "./partidas.ts";
import { iniciarReplayDB } from "./replay-db.ts";
import { iniciarOnline } from "../src/motor/mesa-online.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const partidas = crearPartidas(pool, new URL(process.env.WEB_ORIGIN));
const base = "http://127.0.0.1:3001/api/salon/mesas";
const reparto = { versionReparto: "online-1", reglaFlor: "inmediata-v2", dador: 3, mano: 0, muestra: "copas-06",
  manos: [["oros-03","espadas-12","oros-01"],["copas-03","oros-12","copas-01"],
    ["bastos-04","espadas-05","oros-07"],["oros-04","bastos-05","espadas-07"]] };
const formato = "pairs-private-senas";
const jugadores = [];
async function cuenta() {
  const token = randomUUID();
  const clave = createHash("sha256").update(token).digest("hex");
  const { rows: [fila] } = await pool.query("INSERT INTO juego.jugadores(emisor,sujeto,nombre) VALUES ('salon',$1,'Nombre privado') RETURNING id", [token]);
  await pool.query("INSERT INTO juego.sesiones(clave,jugador) VALUES ($1,$2)", [clave, fila.id]);
  return { id: fila.id, clave, cookie: "truco_sesion=" + token };
}
const leer = (id, lector, tag) => fetch(base + (id ? "/" + id : ""), { headers: {
  ...(lector && { Cookie: lector.cookie }), ...(tag && { "If-None-Match": tag }),
} });
async function ok(id, lector) {
  const r = await leer(id, lector);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-cache");
  const datos = await r.json();
  const tag = r.headers.get("etag");
  assert.equal(tag, '"' + datos.versionPublica + '"');
  return { datos, tag };
}
async function altas(exhibicion, politica = "incumbent-online-v1") {
  const invitacion = randomUUID();
  const { rows: [mesa] } = await pool.query(`INSERT INTO juego.mesas(modo, meta, creador, invitacion, publica, version_senas, solo_computadoras, cupo_exhibicion, politica)
    VALUES ('2v2',2,$1,$2,true,'senas-equipo-v1',$3,$4,$5) RETURNING id`,
    [jugadores[0].id, invitacion, exhibicion, exhibicion ? 1 : null, politica]);
  for (let i = 0; i < 4; i++) await pool.query("INSERT INTO juego.asientos(mesa,asiento,jugador,computadora) VALUES ($1,$2,$3,$4)",
    [mesa.id, i, exhibicion ? null : jugadores[i].id, exhibicion]);
  return { ...mesa, invitacion };
}
async function repartir(id, humanos) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`INSERT INTO juego.manos(mesa,numero,version,version_reglas,version_senas,reparto,puntos_inicio,acciones)
      VALUES ($1,1,1,1,'senas-equipo-v1',$2,ARRAY[0,0],'[]')`, [id, reparto]);
    await iniciarReplayDB(db, id, formato, humanos, iniciarOnline(reparto, [0,0], 2), 1);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}
async function huella(id) {
  const valores = [];
  for (const tabla of ["mesas","asientos","manos","comandos","turnos_bot","inferencias","eventos_chico","replays_chico","voz_discord"]) {
    const clave = tabla === "mesas" ? "id" : "mesa";
    const { rows } = await pool.query(`SELECT xmin::text AS revision, to_jsonb(t) AS fila FROM juego.${tabla} t WHERE ${clave}=$1 ORDER BY to_jsonb(t)::text`, [id]);
    valores.push(rows);
  }
  return valores;
}

try {
  for (let i = 0; i < 6; i++) jugadores.push(await cuenta());
  const [ana, rival, , , lector, otro] = jugadores;
  const { id, invitacion } = await altas(false);
  const pin = createHash("sha256").update(randomUUID()).digest("hex");
  const expo = await altas(true, pin);
  assert.equal((await leer(id, lector)).status, 404);
  assert.equal((await leer("", null)).status, 401);
  assert.equal((await leer(expo.id, null)).status, 401);
  assert.equal((await fetch(base + "/" + id, { method: "POST", headers: { Cookie: lector.cookie } })).status, 405);
  await repartir(id, [0,1,2,3]);
  await repartir(expo.id, []);
  const lista = await ok("", lector);
  const filas = lista.datos.mesas.filter(m => m.id === id || m.id === expo.id);
  assert.deepEqual(filas.map(m => [m.id,m.humanos,m.computadoras]), [[id,4,0],[expo.id,0,4]]);
  for (const campo of ["versionReglas", "politica", "edicionModelo"])
    assert.ok(filas.every(m => !(campo in m)));
  const sinEdicion = await ok(expo.id, lector);
  assert.equal(sinEdicion.datos.versionReglas, 1);
  assert.equal(sinEdicion.datos.politica, pin);
  assert.ok(!("edicionModelo" in sinEdicion.datos));
  const edicion = { nombre: "Parejas con señas 7", publicado: "2026-11-24" };
  await pool.query(`INSERT INTO juego.publicaciones_modelo (pin, formato, edicion, nombre, publicada_el)
    VALUES ($1,$2,7,$3,$4)`, [pin, formato, edicion.nombre, edicion.publicado]);
  const conEdicion = await leer(expo.id, lector, sinEdicion.tag);
  assert.equal(conEdicion.status, 200);
  const nuevaVista = await conEdicion.json();
  assert.equal(nuevaVista.politica, pin);
  assert.deepEqual(nuevaVista.edicionModelo, edicion);
  assert.equal((await leer(expo.id, otro, conEdicion.headers.get("etag"))).status, 304);
  assert.equal((await leer("", otro, lista.tag)).status, 304);
  let version = 1;
  async function actuar(asiento, accion) {
    const turno = await partidas.ejecutar(id, jugadores[asiento].id, "acciones", { id: randomUUID(), version, accion });
    version = turno.version;
  }
  for (let i = 0; i < 4; i++) await actuar(i, { tipo: "carta", carta: reparto.manos[i][0], sena: "cejas" });
  const listaConJugadas = await ok("", otro);
  const antes = await huella(id);
  const vista = await ok(id, lector);
  assert.equal(vista.datos.versionReglas, 1);
  assert.equal(vista.datos.politica, "incumbent-online-v1");
  assert.ok(!("edicionModelo" in vista.datos));
  assert.deepEqual(await ok(id, otro), vista);
  assert.deepEqual(await ok(id, ana), vista);
  assert.equal((await leer(id, otro, "W/" + vista.tag)).status, 304);
  assert.deepEqual(await huella(id), antes);
  assert.equal(vista.datos.tablero.vueltas.length, 1);
  assert.deepEqual(vista.datos.tablero.acciones.map(a => a.carta), reparto.manos.map(m => m[0]));
  for (const oculta of [...reparto.manos.flatMap(m => m.slice(1)), invitacion, ana.id, rival.id, "cejas", "Nombre privado"])
    assert.ok(!JSON.stringify([vista, lista]).includes(oculta));

  // Reconstruir la misma posición con silencio y cartas ocultas permutadas. La
  // versión interna cambia para obligar al servidor a reproyectar con caché fría.
  const ocultas = structuredClone(reparto);
  [ocultas.manos[0][1], ocultas.manos[2][1]] = [ocultas.manos[2][1], ocultas.manos[0][1]];
  await pool.query(`UPDATE juego.manos SET reparto=$2, version=version+1,
    acciones=(SELECT jsonb_agg(a - 'sena' ORDER BY i) FROM jsonb_array_elements(acciones) WITH ORDINALITY AS t(a,i))
    WHERE mesa=$1`, [id, ocultas]);
  version++;
  assert.deepEqual(await ok(id, lector), vista);
  assert.deepEqual(await ok("", otro), listaConJugadas);
  await pool.query("UPDATE juego.sesiones SET vence=now() WHERE clave=$1", [otro.clave]);
  assert.equal((await leer(id, otro, vista.tag)).status, 401);
  await pool.query("UPDATE juego.mesas SET publica=false WHERE id=$1", [id]);
  const privada = await leer(id, lector, vista.tag);
  assert.equal(privada.status, 404);
  const desconocida = await leer(randomUUID(), lector);
  assert.deepEqual(await privada.json(), await desconocida.json());
  assert.equal(desconocida.status, 404);
  await pool.query("UPDATE juego.mesas SET publica=true, ultimo_hecho_publico=now()-interval '6 minutes' WHERE id=$1", [id]);
  assert.equal((await leer(id, lector, vista.tag)).status, 404);

  // Se cierra el chico por el rechazo de un retruco después de la primera vuelta.
  const sale = vista.datos.tablero.turnoDeCartas;
  await actuar(sale, { tipo: "truco" });
  const canto = await ok(id, lector);
  assert.deepEqual(canto.datos.tablero.acciones.at(-1), { tipo: "truco", asiento: sale });
  assert.deepEqual(await ok(id, ana), canto);
  const canta = (sale + 1) % 4;
  await actuar(canta, { tipo: "retruco" });
  await actuar(sale, { tipo: "no-quiero" });
  const fin = await ok(id, lector);
  assert.equal(fin.datos.estado, "terminada");
  assert.ok(fin.datos.puntos.includes(2));
  assert.notEqual(fin.tag, vista.tag);
  await pool.query(`UPDATE juego.manos SET reparto=$2, version=version+1,
    acciones=(SELECT jsonb_agg(a || '{"sena":"cejas"}'::jsonb ORDER BY i) FROM jsonb_array_elements(acciones) WITH ORDINALITY AS t(a,i))
    WHERE mesa=$1`, [id, reparto]);
  assert.deepEqual(await ok(id, lector), fin);
  assert.ok(!(await ok("", lector)).datos.mesas.some(m => m.id === id));
  await pool.query("UPDATE juego.mesas SET fin_publico=now()-interval '31 minutes' WHERE id=$1", [id]);
  assert.equal((await leer(id, lector, fin.tag)).status, 404);
  await pool.query("UPDATE juego.mesas SET exhibicion_retirada=true WHERE id=$1", [expo.id]);
  const retirada = (await ok(expo.id, lector)).datos;
  assert.equal(retirada.estado, "interrumpida");
  assert.deepEqual(retirada.edicionModelo, edicion);
  await pool.query("DELETE FROM juego.publicaciones_modelo WHERE pin=$1", [pin]);
  assert.ok(!(await ok("", lector)).datos.mesas.some(m => m.id === expo.id));
  const otra = await altas(false);
  await repartir(otra.id, [0,1,2,3]);
  await partidas.ejecutar(otra.id, ana.id, "acciones", { id: randomUUID(), version: 1, accion: { tipo: "truco" } });
  await partidas.ejecutar(otra.id, rival.id, "acciones", { id: randomUUID(), version: 2, accion: { tipo: "no-quiero" } });
  const manoUno = await ok(otra.id, lector);
  assert.equal(manoUno.datos.tablero.resultado.motivo, "rechazo");
  assert.equal(manoUno.datos.estado, "en-juego");
  await partidas.ejecutar(otra.id, ana.id, "siguiente", { id: randomUUID(), version: 3 });
  const manoDos = await ok(otra.id, lector);
  assert.equal(manoDos.datos.manoNumero, 2);
  assert.deepEqual(manoDos.datos.puntos, manoUno.datos.puntos);
  assert.deepEqual(manoDos.datos.tablero.acciones, []);
  assert.notEqual(manoDos.tag, manoUno.tag);
  console.log("Lecturas neutrales idénticas con dos cuentas, cartas permutadas y cuatro señas o silencio. Caché, acceso, frescura y cierre verificados.");
} finally { await pool.end(); }
