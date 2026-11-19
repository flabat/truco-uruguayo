// Se ejecuta dentro de la API descartable. Node verifica tanto HTTPS como WSS con la CA del ensayo.
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const origin = process.env.WEB_ORIGIN;
const cookies = new Map();
async function visitar(path, options = {}) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin);
  const response = await fetch(url, {
    ...options, redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: {cookie: [...cookies.values()].join("; "), origin, ...options.headers},
  });
  for (const line of response.headers.getSetCookie()) {
    const cookie = line.split(";")[0];
    cookies.set(cookie.split("=")[0], cookie);
  }
  return response;
}
async function api(path, data) {
  const r = await visitar(path, data && {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(data),
  });
  assert.ok(r.ok, path + " HTTP " + r.status);
  return r.json();
}

const redirect = await fetch(origin.replace("https:", "http:"), {redirect: "manual"});
assert.equal(redirect.status, 308);
assert.equal(redirect.headers.get("location"), origin + "/");
assert.equal((await visitar("/")).status, 200);
assert.equal((await visitar("/admin/")).status, 404);
assert.equal((await visitar("/realms/master/.well-known/openid-configuration")).status, 404);
const discovery = await api("/realms/mesa/.well-known/openid-configuration");
assert.equal(discovery.issuer, origin + "/realms/mesa");
const login = await visitar("/api/auth/login?volver=%2Fjugar%2F");
assert.equal(login.status, 303);
const form = await visitar(login.headers.get("location"));
const action = (await form.text()).match(/<form[^>]*\saction="([^"]+)"/i)?.[1].replaceAll("&amp;", "&");
assert.ok(action);
const result = await visitar(action, {method: "POST", body: new URLSearchParams({
  username: "ensayo", password: process.env.TEST_PLAYER_PASSWORD,
})});
assert.ok([302,303].includes(result.status), "Ingreso de la cuenta de prueba: HTTP " + result.status);
const callback = await visitar(result.headers.get("location"));
assert.equal(callback.status, 303);
const session = callback.headers.getSetCookie().find(s => s.startsWith("truco_sesion="));
for (const attr of ["Secure", "HttpOnly", "SameSite=Lax"]) assert.ok(session?.includes(attr));
const player = await api("/api/jugador");
const saved = process.env.TEST_SAVED ? JSON.parse(process.env.TEST_SAVED) : null;
let id;
if (saved) {
  assert.equal(player.id, saved.player);
  id = saved.id;
} else {
  const table = await api("/api/mesas", {modo: "1v1"});
  id = table.id;
  await api("/api/mesas/" + id + "/computadoras", {asiento: 1});
}
const root = "/api/mesas/" + id;
const before = await api(root + "/partida");
if (saved) assert.deepEqual(before, saved.match);
const ws = new WebSocket(origin.replace("https:", "wss:") + root + "/vivo", "truco.v1", {
  origin, headers: {cookie: cookies.get("truco_sesion")}, handshakeTimeout: 10000,
});
const receive = async () => JSON.parse((await once(ws, "message", {signal: AbortSignal.timeout(10000)}))[0].toString());
try {
  assert.equal((await receive()).tipo, "actualizar");
  const notified = receive();
  const cmd = {id: randomUUID(), version: before.version};
  if (!before.vista.resultado) {
    const tipo = ["flor","paso-flor","quiero","carta","no-quiero"].find(t => before.vista.legales.includes(t));
    assert.ok(tipo);
    cmd.accion = tipo === "carta" ? {tipo, carta: before.vista.cartas[0]} : {tipo};
  }
  const [update, after] = await Promise.all([notified, api(root + (cmd.accion ? "/acciones" : "/siguiente"), cmd)]);
  assert.equal(update.tipo, "actualizar");
  assert.equal(after.version, before.version + 1);
  if (!saved) console.log(JSON.stringify({player: player.id, id, match: after}));
} finally {
  ws.close();
}
