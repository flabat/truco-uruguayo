// Desde el contenedor de la API, después de `npm run auth:api`: completa bajas vencidas en Keycloak, Apple y la base.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID, verify } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { cifrar, completarBaja, crearServiciosBaja, procesarBajas } from "./bajas.ts";
import { leerMesa } from "./mesas.ts";
import { crearPartidas } from "./partidas.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const web = new URL(process.env.WEB_ORIGIN);
const backend = new URL(process.env.OIDC_BACKEND);
const realm = backend.pathname.split("/").filter(Boolean).at(-1);
const admin = `${backend.origin}/admin/realms/${realm}`;

async function tokenServicio() {
  const r = await fetch(backend.href.replace(/\/$/, "") + "/protocol/openid-connect/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: "truco-api", client_secret: process.env.KEYCLOAK_API_CLIENT_SECRET }),
  });
  assert.equal(r.status, 200, "el cliente de servicio truco-api obtiene su token");
  return (await r.json()).access_token;
}
const token = await tokenServicio();
const usuarioKeycloak = async () => {
  const nombre = "baja-" + randomUUID();
  const r = await fetch(admin + "/users", { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ username: nombre, email: nombre + "@example.invalid", emailVerified: true, firstName: "Prueba", lastName: "Baja", enabled: true }) });
  assert.equal(r.status, 201);
  return r.headers.get("location").split("/").at(-1);
};
const existeEnKeycloak = async sujeto => (await fetch(admin + "/users/" + sujeto, { headers: { authorization: "Bearer " + token } })).status;

async function jugador(nombre, sujeto = randomUUID()) {
  const { rows: [j] } = await pool.query("INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ($1,$2,$3) RETURNING id",
    [process.env.OIDC_ISSUER, sujeto, nombre]);
  return { id: j.id, sujeto };
}
const vencer = id => pool.query("INSERT INTO juego.bajas (jugador,pedida,vence) VALUES ($1, now() - interval '31 days', now() - interval '1 minute')", [id]);
const fila = async id => (await pool.query("SELECT emisor, sujeto, nombre FROM juego.jugadores WHERE id=$1", [id])).rows[0];
const quedan = async (tabla, id) => Number((await pool.query(`SELECT count(*) FROM juego.${tabla} WHERE jugador=$1`, [id])).rows[0].count);

// Apple falso: registra cada revocación.
const revocaciones = [];
const apple = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", parte => { cuerpo += parte; });
  req.on("end", () => { revocaciones.push({ ruta: req.url, metodo: req.method, datos: new URLSearchParams(cuerpo) }); res.writeHead(200).end(); });
}).listen(0, "127.0.0.1");
await new Promise(r => apple.once("listening", r));
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const claveTokens = randomBytes(32);
const env = { ...process.env, APPLE_CLIENT_ID: "co.eltru.prueba", APPLE_TEAM_ID: "EQUIPO1234", APPLE_KEY_ID: "CLAVE12345",
  APPLE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  APPLE_REVOKE_URL: `http://127.0.0.1:${apple.address().port}/auth/revoke`, APPLE_TOKENS_KEY: claveTokens.toString("base64") };
const servicios = crearServiciosBaja(env, pool);
assert.ok(servicios, "con el secreto del cliente de servicio hay servicios de baja");

try {
  // Una baja vencida con Apple: revoca, borra en Keycloak y deja un marcador anónimo.
  const a = await jugador("Lucía", await usuarioKeycloak());
  const b = await jugador("Mateo");
  const { rows: [m] } = await pool.query("INSERT INTO juego.mesas (modo,creador,invitacion,meta) VALUES ('1v1',$1,$2,12) RETURNING id", [b.id, randomUUID()]);
  await pool.query("INSERT INTO juego.asientos (mesa,asiento,jugador,computadora) VALUES ($1,0,$2,false),($1,1,$3,false)", [m.id, a.id, b.id]);
  await crearPartidas(pool, web).leer(m.id, b.id);
  await pool.query("INSERT INTO juego.tokens_apple (jugador, token) VALUES ($1,$2)", [a.id, cifrar("r.apple-prueba", claveTokens)]);
  await pool.query("INSERT INTO juego.sesiones (clave,jugador) VALUES ($1,$2)", [randomUUID(), a.id]);
  await pool.query("INSERT INTO juego.reporteros (jugador) VALUES ($1)", [a.id]);
  await vencer(a.id);
  assert.equal(await completarBaja(pool, a.id, servicios), true);
  assert.equal(revocaciones.length, 1);
  const [revocacion] = revocaciones;
  assert.equal(revocacion.metodo, "POST");
  assert.equal(revocacion.datos.get("client_id"), "co.eltru.prueba");
  assert.equal(revocacion.datos.get("token"), "r.apple-prueba");
  assert.equal(revocacion.datos.get("token_type_hint"), "refresh_token");
  const [cabecera, cuerpo, firma] = revocacion.datos.get("client_secret").split(".");
  assert.ok(verify("sha256", Buffer.from(cabecera + "." + cuerpo), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(firma, "base64url")));
  assert.equal(await existeEnKeycloak(a.sujeto), 404);
  const anonimo = await fila(a.id);
  assert.equal(anonimo.nombre, "Jugador");
  assert.equal(anonimo.emisor, "eliminado");
  assert.notEqual(anonimo.sujeto, a.sujeto);
  for (const tabla of ["bajas", "sesiones", "reporteros", "tokens_apple"]) assert.equal(await quedan(tabla, a.id), 0, tabla);
  // El historial del otro jugador sigue entero, con «Jugador» en lugar del nombre.
  const vista = await leerMesa(pool, m.id, b.id, web);
  assert.equal(vista.asientos[0].nombre, "Jugador");
  // Repetir no falla ni vuelve a revocar.
  assert.equal(await completarBaja(pool, a.id, servicios), true);
  assert.equal(revocaciones.length, 1);

  // Si Keycloak no responde, la baja queda pendiente y no se anonimiza nada.
  const c = await jugador("Sofía", await usuarioKeycloak());
  await vencer(c.id);
  const caido = crearServiciosBaja({ ...env, KEYCLOAK_ADMIN_URL: "http://127.0.0.1:9", OIDC_BACKEND: "http://127.0.0.1:9/realms/" + realm }, pool);
  assert.equal(await completarBaja(pool, c.id, caido), false);
  assert.equal((await fila(c.id)).nombre, "Sofía");
  assert.equal(await quedan("bajas", c.id), 1);
  assert.equal(await existeEnKeycloak(c.sujeto), 200);

  // La tarea periódica completa las bajas vencidas, y solo esas.
  const d = await jugador("Tomás", await usuarioKeycloak());
  await pool.query("INSERT INTO juego.bajas (jugador) VALUES ($1)", [d.id]);
  const detener = procesarBajas(pool, servicios, 200);
  const fin = Date.now() + 15000;
  while (await quedan("bajas", c.id) && Date.now() < fin) await new Promise(r => setTimeout(r, 200));
  detener();
  assert.equal(await quedan("bajas", c.id), 0, "la tarea completa la baja vencida");
  assert.equal(await existeEnKeycloak(c.sujeto), 404);
  assert.equal(await quedan("bajas", d.id), 1, "una baja en gracia no se toca");
  assert.equal((await fila(d.id)).nombre, "Tomás");
  console.log("Bajas vencidas verificadas · Apple revocado, Keycloak borrado, marcador anónimo, reintento y tarea periódica.");
} finally {
  apple.close();
  await pool.end();
}
