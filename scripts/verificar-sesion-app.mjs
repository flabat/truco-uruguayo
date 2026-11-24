// Desde el contenedor de la API y sobre la base descartable de check:stack.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";
import { WebSocket } from "ws";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const puerto = process.env.PORT || 3001;
const base = "http://127.0.0.1:" + puerto;
const hash = valor => createHash("sha256").update(valor).digest("hex");

async function jugador(nombre, tipo = "web") {
  const sesion = randomBytes(32).toString("base64url");
  const { rows: [j] } = await pool.query(`
    INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ('prueba-sesion-app',$1,$1)
    ON CONFLICT (emisor,sujeto) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id
  `, [nombre]);
  await pool.query("INSERT INTO juego.sesiones (clave,jugador,tipo,vence) VALUES ($1,$2,$3,now() + $4::interval)",
    [hash(sesion), j.id, tipo, tipo === "app" ? "30 days" : "7 days"]);
  return { id: j.id, sesion, clave: hash(sesion) };
}

async function pedir(metodo, ruta, headers = {}, datos) {
  if (datos) headers["content-type"] = "application/json";
  const r = await fetch(base + ruta, { method: metodo, headers, body: datos ? JSON.stringify(datos) : undefined, redirect: "manual" });
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch {}
  return { estado: r.status, datos: cuerpo, r };
}
const bearer = p => ({ authorization: "Bearer " + p.sesion });
const cookie = p => ({ cookie: "truco_sesion=" + p.sesion });

function conectar(mesa, headers) {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}/api/mesas/${mesa}/vivo`, "truco.v1", { headers });
    ws.once("open", () => resolve({ ws, abierto: true }));
    ws.once("unexpected-response", (_req, res) => resolve({ abierto: false, estado: res.statusCode }));
    ws.once("error", () => resolve({ abierto: false, estado: 0 }));
  });
}

try {
  const a = await jugador("app-a", "app");
  const b = await jugador("app-b", "app");
  const web = await jugador("web-c");

  // El encabezado alcanza sin cookie ni Origin, y gana sobre una cookie de otra persona.
  let r = await pedir("GET", "/api/jugador", bearer(a));
  assert.equal(r.estado, 200);
  assert.equal(r.datos.id, a.id);
  r = await pedir("GET", "/api/jugador", { ...cookie(web), ...bearer(b) });
  assert.equal(r.datos.id, b.id);

  // Las acciones con encabezado no exigen Origin; con cookie, sí.
  r = await pedir("POST", "/api/mesas", bearer(a), { modo: "1v1" });
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  const mesa = r.datos.id;
  r = await pedir("POST", "/api/mesas", cookie(web), { modo: "1v1" });
  assert.equal(r.estado, 403);

  // El WebSocket acepta el encabezado sin Origin y rechaza la cookie sin Origin.
  const conexion = await conectar(mesa, bearer(a));
  assert.ok(conexion.abierto);
  const sinOrigen = await conectar(mesa, cookie(web));
  assert.equal(sinOrigen.abierto, false);
  assert.equal(sinOrigen.estado, 403);

  // La sesión de la app se extiende solo cuando le quedan menos de 15 días. La web nunca.
  const vence = async p => (await pool.query("SELECT extract(epoch FROM vence - now()) / 86400 AS dias FROM juego.sesiones WHERE clave=$1", [p.clave])).rows[0].dias;
  await pool.query("UPDATE juego.sesiones SET vence = now() + interval '10 days' WHERE clave=$1", [b.clave]);
  await pedir("GET", "/api/jugador", bearer(b));
  assert.ok(await vence(b) > 29.9, "la sesión de la app se renueva");
  await pool.query("UPDATE juego.sesiones SET vence = now() + interval '20 days' WHERE clave=$1", [b.clave]);
  await pedir("GET", "/api/jugador", bearer(b));
  const dias = await vence(b);
  assert.ok(dias > 19.9 && dias < 20.1, "sin renovar con más de 15 días");
  await pool.query("UPDATE juego.sesiones SET vence = now() + interval '2 days' WHERE clave=$1", [web.clave]);
  await pedir("GET", "/api/jugador", cookie(web));
  assert.ok(await vence(web) < 2.1, "la sesión web no se renueva");

  // Cerrar sesión con encabezado la revoca y cierra sus conexiones en vivo.
  const cierre = new Promise(resolve => conexion.ws.once("close", codigo => resolve(codigo)));
  r = await pedir("POST", "/api/auth/logout", bearer(a));
  assert.equal(r.estado, 204);
  assert.equal(r.r.headers.get("set-cookie"), null);
  assert.equal(await cierre, 1008);
  assert.equal((await pedir("GET", "/api/jugador", bearer(a))).estado, 401);

  // Un encabezado mal formado no cae a la cookie.
  assert.equal((await pedir("GET", "/api/jugador", { ...cookie(web), authorization: "Basic x" })).estado, 401);
  console.log("Sesión de la app verificada · encabezado, origen, WebSocket, renovación y cierre.");
} finally {
  await pool.end();
}
