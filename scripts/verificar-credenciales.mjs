// Se ejecuta en la API del proyecto Compose descartable, con su propio emisor de prueba.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { generateKeyPairSync, sign } from "node:crypto";
import pg from "pg";
import { crearAuth } from "./auth.ts";

async function servir(listener) {
  const server = createServer(listener).listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, url: new URL("http://127.0.0.1:" + server.address().port) };
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
let claims;
const provider = await servir((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url.endsWith("/certs")) return res.end(JSON.stringify({ keys: [jwk] }));
  const payload = encode({ alg: jwk.alg, kid: jwk.kid }) + "." + encode(claims);
  const signature = sign("sha256", Buffer.from(payload), privateKey).toString("base64url");
  res.end(JSON.stringify({ token_type: "Bearer", access_token: "fixture", id_token: payload + "." + signature }));
});
const issuer = new URL("/realm", provider.url);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let auth;
const app = await servir((req, res) => auth(req, res));
auth = crearAuth(pool, {
  web: app.url, callback: new URL("/api/auth/callback", app.url), issuer, backend: issuer, local: true,
});
async function iniciar(volver) {
  const url = new URL("/api/auth/login", app.url);
  if (volver) url.searchParams.set("volver", volver);
  const login = await fetch(url, { redirect: "manual" });
  return { params: new URL(login.headers.get("location")).searchParams, cookie: login.headers.getSetCookie()[0].split(";")[0] };
}
async function completar(params, cookies, emisor = issuer.href, audiencia = "truco-web", perfil = {}) {
  const now = Math.floor(Date.now() / 1000);
  claims = { ...perfil, iss: emisor, aud: audiencia, sub: "local-fixture", nonce: params.get("nonce"), iat: now, exp: now + 60 };
  const callback = new URL("/api/auth/callback", app.url);
  callback.search = new URLSearchParams({ code: "codigo-local", state: params.get("state") });
  return fetch(callback, { redirect: "manual", headers: { cookie: cookies } });
}
try {
  for (const [emisor, audiencia, esperado] of [
    [issuer.href, "truco-web", 303],
    [issuer.href + "-otro", "truco-web", 401],
    [issuer.href, "otra-aplicacion", 401],
  ]) {
    const { params, cookie } = await iniciar();
    const result = await completar(params, cookie, emisor, audiencia);
    assert.equal(result.status, esperado);
    assert.equal(result.headers.getSetCookie().some(c => c.startsWith("truco_sesion=")), esperado === 303);
  }
  console.log("Solo el emisor y la audiencia acordados obtuvieron una sesión.");

  let jugadorId;
  for (const [perfil, nombre] of [
    [{ given_name: "Luz", preferred_username: "privado@example.test" }, "Luz"],
    [{ preferred_username: "LuzLocal" }, "LuzLocal"],
    [{ preferred_username: "privado@example.test" }, "Jugador"],
  ]) {
    const { params, cookie } = await iniciar();
    const respuesta = await completar(params, cookie, issuer.href, "truco-web", perfil);
    assert.equal(respuesta.status, 303);
    const sesion = respuesta.headers.getSetCookie().find(c => c.startsWith("truco_sesion=")).split(";")[0];
    const me = await fetch(new URL("/api/jugador", app.url), { headers: { cookie: sesion } });
    assert.equal(me.status, 200);
    const jugador = await me.json();
    assert.equal(jugador.nombre, nombre);
    if (jugadorId) assert.equal(jugador.id, jugadorId);
    jugadorId = jugador.id;
  }

  const destinos = ["/jugar/?invitacion=primera", "/jugar/?mesa=segunda", "https://example.org/"];
  const intentos = await Promise.all(destinos.map(iniciar));
  const cookies = intentos.map(i => i.cookie).join("; ");
  for (const i of [1, 0, 2]) {
    const result = await completar(intentos[i].params, cookies);
    assert.equal(result.status, 303);
    assert.equal(result.headers.get("location"), new URL(i === 2 ? "/#jugador" : destinos[i], app.url).href);
  }
  console.log("Dos ingresos en pestañas independientes recuperaron su destino y el regreso externo se descartó.");
} finally {
  await pool.end();
  app.server.close();
  provider.server.close();
}
