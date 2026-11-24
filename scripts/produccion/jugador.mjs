// Se ejecuta dentro de la API descartable. Node verifica tanto HTTPS como WSS con la CA del ensayo.
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";
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
assert.equal((await visitar("/gestion/")).status, 200);
assert.equal((await visitar("/api/gestion/vivo")).status, 401);
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
assert.equal((await visitar("/api/gestion/jugadores")).status, 403);
const saved = process.env.TEST_SAVED ? JSON.parse(process.env.TEST_SAVED) : null;
assert.equal(player.salonHabilitado, true);
if (!saved) {
  // El primer ingreso público al stack de producción encuentra el objetivo sin jugadores sentados.
  let exhibiciones = [];
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    const { mesas } = await api("/api/salon/mesas");
    exhibiciones = mesas.filter(m => m.origen === "exhibicion");
    if (exhibiciones.length === 6) break;
    await esperar(1_000);
  }
  assert.equal(exhibiciones.length, 6, "El directorio debe llegar a seis exhibiciones en dos minutos.");
  assert.equal(exhibiciones.filter(m => m.modo === "1v1").length, 3);
  assert.equal(exhibiciones.filter(m => m.modo === "2v2").length, 3);
  for (const mesa of exhibiciones) {
    assert.equal(mesa.humanos, 0);
    assert.equal(mesa.computadoras, mesa.modo === "1v1" ? 2 : 4);
  }
  const ruta = "/api/salon/mesas/" + exhibiciones[0].id;
  const detalle = await api(ruta);
  assert.equal(detalle.estado, "en-juego");
  assert.ok(detalle.tablero.muestra);
  assert.equal(detalle.vozDisponible, false);
  const voz = await visitar(ruta + "/voz", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.equal(voz.status, 503);
}
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
    const tipo = ["flor","paso-flor","carta","no-quiero","quiero"].find(t => before.vista.legales.includes(t));
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
