// Desde el contenedor de la API y sobre la base descartable de check:stack.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://127.0.0.1:" + (process.env.PORT || 3001);
const origin = process.env.WEB_ORIGIN;
const hash = valor => createHash("sha256").update(valor).digest("hex");

async function jugador(nombre) {
  const { rows: [j] } = await pool.query(`INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('prueba-bajas',$1,$2) RETURNING id`,
    [randomUUID(), nombre]);
  return j.id;
}
async function sesion(id, tipo = "web") {
  const valor = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO juego.sesiones (clave,jugador,tipo) VALUES ($1,$2,$3)", [hash(valor), id, tipo]);
  return valor;
}
const pedir = (headers = {}) => fetch(base + "/api/cuenta/eliminar", { method: "POST", headers });
const jugadorCon = valor => fetch(base + "/api/jugador", { headers: { authorization: "Bearer " + valor } }).then(r => r.status);
const bajas = async id => (await pool.query("SELECT extract(epoch FROM vence - pedida) / 86400 AS dias FROM juego.bajas WHERE jugador=$1", [id])).rows;

try {
  // Con cookie y Origin del juego: cierra todas las sesiones, cede la mesa empezada y vence la cookie.
  const a = await jugador("Ana baja");
  const web = await sesion(a), app = await sesion(a, "app");
  const { rows: [m] } = await pool.query("INSERT INTO juego.mesas (modo,creador,invitacion,meta) VALUES ('1v1',$1,$2,12) RETURNING id", [a, randomUUID()]);
  await pool.query("INSERT INTO juego.asientos (mesa,asiento,jugador,computadora) VALUES ($1,0,$2,false),($1,1,NULL,true)", [m.id, a]);
  const partida = await fetch(base + "/api/mesas/" + m.id + "/partida", { headers: { cookie: "truco_sesion=" + web } });
  assert.equal(partida.status, 200);
  let r = await pedir({ cookie: "truco_sesion=" + web, origin });
  assert.equal(r.status, 200);
  const { vence } = await r.json();
  assert.ok(Math.abs(new Date(vence) - Date.now() - 30 * 86400_000) < 120_000, "vence en 30 días");
  assert.match(r.headers.get("set-cookie") ?? "", /truco_sesion=;.*Max-Age=0/);
  assert.equal(await jugadorCon(web), 401);
  assert.equal(await jugadorCon(app), 401);
  const filas = await bajas(a);
  assert.equal(filas.length, 1);
  assert.ok(Math.abs(filas[0].dias - 30) < 0.01);
  assert.equal((await pool.query("SELECT cedido FROM juego.asientos WHERE mesa=$1 AND asiento=0", [m.id])).rows[0].cedido, true);

  // Con encabezado no hace falta Origin; con cookie sin Origin, sí; sin sesión, 401.
  const b = await jugador("Bruno baja");
  assert.equal((await pedir({ authorization: "Bearer " + await sesion(b, "app") })).status, 200);
  assert.equal((await bajas(b)).length, 1);
  const c = await jugador("Clara baja");
  assert.equal((await pedir({ cookie: "truco_sesion=" + await sesion(c) })).status, 403);
  assert.equal((await bajas(c)).length, 0);
  assert.equal((await pedir({ origin })).status, 401);

  // Dos pedidos simultáneos desde la web y la app: una sola baja y el mismo vencimiento.
  const d = await jugador("Diego baja");
  const respuestas = await Promise.all([
    pedir({ cookie: "truco_sesion=" + await sesion(d), origin }),
    pedir({ authorization: "Bearer " + await sesion(d, "app") }),
  ]);
  const aceptadas = respuestas.filter(x => x.status === 200);
  assert.ok(aceptadas.length >= 1 && respuestas.every(x => x.status === 200 || x.status === 401), String(respuestas.map(x => x.status)));
  assert.equal(new Set(await Promise.all(aceptadas.map(async x => (await x.json()).vence))).size, 1);
  assert.equal((await bajas(d)).length, 1);
  console.log("Pedido de baja verificado · sesiones cerradas, asiento cedido, origen y pedidos simultáneos.");
} finally {
  await pool.end();
}
