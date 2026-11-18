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
try {
  for (const [emisor, audiencia, esperado] of [
    [issuer.href, "truco-web", 303],
    [issuer.href + "-otro", "truco-web", 401],
    [issuer.href, "otra-aplicacion", 401],
  ]) {
    const login = await fetch(new URL("/api/auth/login", app.url), { redirect: "manual" });
    const params = new URL(login.headers.get("location")).searchParams;
    const now = Math.floor(Date.now() / 1000);
    claims = { iss: emisor, aud: audiencia, sub: "local-fixture", nonce: params.get("nonce"), iat: now, exp: now + 60 };
    const callback = new URL("/api/auth/callback", app.url);
    callback.search = new URLSearchParams({ code: "codigo-local", state: params.get("state") });
    const result = await fetch(callback, { redirect: "manual", headers: {
      cookie: login.headers.getSetCookie()[0].split(";")[0],
    } });
    assert.equal(result.status, esperado);
    assert.equal(result.headers.getSetCookie().some(c => c.startsWith("truco_sesion=")), esperado === 303);
  }
  console.log("Solo el emisor y la audiencia acordados obtuvieron una sesión.");
} finally {
  await pool.end();
  app.server.close();
  provider.server.close();
}
