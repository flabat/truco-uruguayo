// Desde el contenedor de la API, después de `npm run auth:api` y con los proveedores google y apple en Keycloak:
// cada notificación de Apple, firmada con una clave propia, sobre la base y el Keycloak descartables de check:stack.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import pg from "pg";
import { cifrar } from "./bajas.ts";
import { crearInicioBaja } from "./cuenta.ts";
import { crearNotificacionesApple } from "./notificaciones-apple.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const backend = new URL(process.env.OIDC_BACKEND);
const admin = `${backend.origin}/admin/realms/${backend.pathname.split("/").filter(Boolean).at(-1)}`;
const endpointToken = backend.href.replace(/\/$/, "") + "/protocol/openid-connect/token";

async function tokenServicio() {
  const r = await fetch(endpointToken, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: "truco-api", client_secret: process.env.KEYCLOAK_API_CLIENT_SECRET }),
  });
  assert.equal(r.status, 200, "el cliente de servicio truco-api obtiene su token");
  return (await r.json()).access_token;
}
const token = await tokenServicio();
const kc = (ruta, opciones = {}) => fetch(admin + ruta, {
  ...opciones, headers: { authorization: "Bearer " + token, "content-type": "application/json" },
});
const leerKc = async ruta => (await kc(ruta)).json();

/** Un usuario de Keycloak vinculado a Apple; con Google o con contraseña si se pide. */
async function usuario({ google = false, clave = false } = {}) {
  const sub = `001.${randomBytes(16).toString("hex")}.0468`;
  // El realm usa el correo como nombre de usuario.
  const correo = `aviso-${randomUUID()}@example.invalid`;
  const alta = await kc("/users", { method: "POST", body: JSON.stringify({
    username: correo, email: correo, emailVerified: true, firstName: "Prueba", lastName: "Aviso", enabled: true,
  }) });
  assert.equal(alta.status, 201);
  const id = alta.headers.get("location").split("/").at(-1);
  const vincular = async (proveedor, userId) => assert.equal((await kc(`/users/${id}/federated-identity/${proveedor}`, {
    method: "POST", body: JSON.stringify({ identityProvider: proveedor, userId, userName: userId }),
  })).status, 204, "vincula " + proveedor);
  await vincular("apple", sub);
  if (google) await vincular("google", "google-" + randomUUID());
  const contrasena = clave ? `Clave-${randomBytes(9).toString("base64url")}-468!` : null;
  if (contrasena) {
    assert.equal((await kc(`/users/${id}/reset-password`, { method: "PUT",
      body: JSON.stringify({ type: "password", value: contrasena, temporary: false }) })).status, 204);
  }
  return { id, sub, correo, contrasena };
}
const vinculos = async id => (await leerKc(`/users/${id}/federated-identity`)).map(v => v.identityProvider).sort();
const sesionesKeycloak = async id => (await leerKc(`/users/${id}/sessions`)).length;
async function abrirSesionKeycloak({ correo, contrasena }) {
  const r = await fetch(endpointToken, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: correo, password: contrasena, scope: "openid" }) });
  assert.equal(r.status, 200, "la contraseña abre una sesión de Keycloak");
}

// El jugador se guarda con el emisor tal como lo registra el ingreso; la API lo normaliza con new URL.
const claveTokens = randomBytes(32);
async function jugador(nombre, sujeto) {
  const { rows: [j] } = await pool.query("INSERT INTO juego.jugadores (emisor,sujeto,nombre) VALUES ($1,$2,$3) RETURNING id",
    [process.env.OIDC_ISSUER, sujeto, nombre]);
  return j.id;
}
/** Dos sesiones (web y app), un canje y el token de Apple: lo que deja un ingreso. */
async function ingresar(id) {
  await pool.query("INSERT INTO juego.sesiones (clave,jugador,tipo) VALUES ($1,$3,'web'),($2,$3,'app')", [randomUUID(), randomUUID(), id]);
  await pool.query("INSERT INTO juego.canjes (clave,jugador,desafio) VALUES ($1,$2,'desafio')", [randomUUID(), id]);
  await pool.query(`INSERT INTO juego.tokens_apple (jugador, token) VALUES ($1,$2)
    ON CONFLICT (jugador) DO UPDATE SET token = EXCLUDED.token`, [id, cifrar("r.apple-prueba", claveTokens)]);
}
const contar = async (tabla, id) => Number((await pool.query(`SELECT count(*) FROM juego.${tabla} WHERE jugador=$1`, [id])).rows[0].count);
const estado = async id => ({
  sesiones: await contar("sesiones", id), canjes: await contar("canjes", id),
  tokens: await contar("tokens_apple", id), bajas: await contar("bajas", id),
});
const ingresado = { sesiones: 2, canjes: 1, tokens: 1, bajas: 0 };
const cerrado = { sesiones: 0, canjes: 0, tokens: 0, bajas: 0 };

// Apple de prueba: un JWKS propio y el endpoint servido con APPLE_KEYS_URL apuntando a él.
const apple = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ajena = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = createServer((_, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
  keys: [{ ...apple.publicKey.export({ format: "jwk" }), kid: "prueba-468", alg: "RS256", use: "sig" }],
}))).listen(0, "127.0.0.1");
await once(jwks, "listening");
const cerradas = [], cambiadas = [], resultados = [];
const env = { ...process.env, APPLE_CLIENT_ID: "co.eltru.prueba", APPLE_KEYS_URL: `http://127.0.0.1:${jwks.address().port}/auth/keys` };
const atender = crearNotificacionesApple(pool, env, {
  emisor: new URL(process.env.OIDC_ISSUER).href,
  iniciarBaja: crearInicioBaja(pool, j => cerradas.push(j), mesa => cambiadas.push(mesa)),
  cerrarConexiones: j => cerradas.push(j),
  alAplicar: resultado => resultados.push(resultado),
});
const endpoint = createServer((req, res) => atender(req, res).catch(error => {
  console.error(error);
  res.writeHead(503).end();
})).listen(0, "127.0.0.1");
await once(endpoint, "listening");
const url = `http://127.0.0.1:${endpoint.address().port}/api/auth/apple/notificaciones`;

const parte = valor => Buffer.from(JSON.stringify(valor)).toString("base64url");
let avisos = 0;
function aviso(type, sub, { event_time = Date.now(), aud = "co.eltru.prueba", clave = apple.privateKey } = {}) {
  const datos = parte({ alg: "RS256", kid: "prueba-468" }) + "." + parte({
    iss: "https://appleid.apple.com", aud, iat: Math.floor(Date.now() / 1000), jti: "aviso-" + ++avisos,
    events: JSON.stringify({ type, sub, event_time }),
  });
  return datos + "." + sign("sha256", Buffer.from(datos), clave).toString("base64url");
}
async function notificar(payload, esperado, resultado) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
  assert.equal(r.status, esperado);
  if (resultado) assert.equal(resultados.at(-1), resultado);
}

try {
  // consent-revoked: cierra las sesiones de la API y de Keycloak y borra el token, pero conserva el vínculo.
  const kA = await usuario({ clave: true });
  const a = await jugador("Ana aviso", kA.id);
  await ingresar(a);
  await abrirSesionKeycloak(kA);
  assert.equal(await sesionesKeycloak(kA.id), 1);
  const momentoA = Date.now();
  const revocado = aviso("consent-revoked", kA.sub, { event_time: momentoA });
  await notificar(revocado, 200, "consentimiento-revocado");
  assert.deepEqual(await estado(a), cerrado);
  assert.equal(await sesionesKeycloak(kA.id), 0);
  assert.deepEqual(await vinculos(kA.id), ["apple"]);
  assert.ok(cerradas.includes(a), "cierra sus conexiones en vivo");
  // Vuelve a entrar con Apple. El mismo aviso, reenviado o en otro JWS, no cierra lo nuevo.
  await ingresar(a);
  await notificar(revocado, 200, "repetido");
  await notificar(aviso("consent-revoked", kA.sub, { event_time: momentoA, aud: "co.eltru.app" }), 200, "repetido");
  assert.deepEqual(await estado(a), ingresado);

  // account-delete con Google vinculado: quita Apple y la cuenta sigue.
  const kB = await usuario({ google: true });
  const b = await jugador("Bruno aviso", kB.id);
  await ingresar(b);
  const borradoB = aviso("account-delete", kB.sub);
  await notificar(borradoB, 200, "apple-desvinculado");
  assert.deepEqual(await vinculos(kB.id), ["google"]);
  assert.deepEqual(await estado(b), cerrado);
  assert.equal((await pool.query("SELECT nombre FROM juego.jugadores WHERE id=$1", [b])).rows[0].nombre, "Bruno aviso");
  await notificar(borradoB, 200, "sin-jugador");
  assert.deepEqual(await vinculos(kB.id), ["google"]);

  // account-deleted (el nombre de la documentación actual de Apple) con contraseña: lo mismo, y cierra la sesión de Keycloak.
  const kC = await usuario({ clave: true });
  const c = await jugador("Clara aviso", kC.id);
  await ingresar(c);
  await abrirSesionKeycloak(kC);
  await notificar(aviso("account-deleted", kC.sub), 200, "apple-desvinculado");
  assert.deepEqual(await vinculos(kC.id), []);
  assert.equal(await sesionesKeycloak(kC.id), 0);
  assert.deepEqual(await estado(c), cerrado);

  // account-delete solo con Apple: la misma baja de 30 días que «Eliminar mi cuenta», y deja su mesa.
  const kD = await usuario();
  const d = await jugador("Diego aviso", kD.id);
  await ingresar(d);
  const { rows: [mesa] } = await pool.query("INSERT INTO juego.mesas (modo,creador,invitacion,meta) VALUES ('1v1',$1,$2,12) RETURNING id",
    [b, randomUUID()]);
  await pool.query("INSERT INTO juego.asientos (mesa,asiento,jugador,computadora) VALUES ($1,0,$2,false),($1,1,$3,false)", [mesa.id, b, d]);
  const borradoD = aviso("account-delete", kD.sub);
  await notificar(borradoD, 200, "baja-iniciada");
  assert.deepEqual(await estado(d), { ...cerrado, bajas: 1 });
  const vence = async () => (await pool.query("SELECT vence, extract(epoch FROM vence - pedida) / 86400 AS dias FROM juego.bajas WHERE jugador=$1", [d])).rows[0];
  const baja = await vence();
  assert.ok(Math.abs(baja.dias - 30) < 0.01, "vence a los 30 días");
  assert.equal(await contar("asientos", d), 0, "deja la mesa sin repartir");
  assert.ok(cambiadas.includes(mesa.id) && cerradas.includes(d));
  assert.deepEqual(await vinculos(kD.id), ["apple"], "el usuario sigue hasta que vence la baja");
  await notificar(borradoD, 200, "repetido");
  await notificar(aviso("account-delete", kD.sub), 200, "baja-iniciada");
  assert.deepEqual((await vence()).vence, baja.vence, "repetir conserva el vencimiento");

  // email-disabled y email-enabled: se registran y no cambian nada.
  const kE = await usuario();
  const e = await jugador("Elena aviso", kE.id);
  await ingresar(e);
  await notificar(aviso("email-disabled", kE.sub), 200, "sin-cambios");
  await notificar(aviso("email-enabled", kE.sub), 200, "sin-cambios");
  assert.deepEqual(await estado(e), ingresado);
  assert.deepEqual(await vinculos(kE.id), ["apple"]);

  // Sin jugador, 200; con una firma ajena, 400.
  await notificar(aviso("consent-revoked", "001.desconocido.0468"), 200, "sin-jugador");
  const antes = resultados.length;
  await notificar(aviso("account-delete", kE.sub, { clave: ajena.privateKey }), 400);
  assert.equal(resultados.length, antes);
  assert.deepEqual(await estado(e), ingresado);

  // La API de la pila corre sin APPLE_CLIENT_ID: el endpoint no existe.
  const real = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/auth/apple/notificaciones`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: aviso("consent-revoked", kE.sub) }),
  });
  assert.equal(real.status, 404);
  console.log("Notificaciones de Apple verificadas · consent-revoked, account-delete con y sin otro ingreso, avisos de correo, repetición y 404 sin APPLE_CLIENT_ID.");
} finally {
  jwks.close();
  endpoint.close();
  await pool.end();
}
