import assert from "node:assert/strict";
import test from "node:test";
import { crearCliente, ErrorMesa, idComando, mensajeDe } from "@eltruco/cliente/cliente.ts";

type Llamada = { url: string; init: RequestInit };

function fetchFalso(respuesta: { status?: number; cuerpo?: unknown } = {}) {
  const llamadas: Llamada[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const status = respuesta.status ?? 200;
    return new Response(JSON.stringify(respuesta.cuerpo ?? { ok: true }), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, llamadas };
}

class SocketFalso {
  static abiertos: SocketFalso[] = [];
  url: string;
  protocolos: string | string[];
  opciones?: { headers: Record<string, string> };
  constructor(url: string, protocolos: string | string[], opciones?: { headers: Record<string, string> }) {
    this.url = url;
    this.protocolos = protocolos;
    this.opciones = opciones;
    SocketFalso.abiertos.push(this);
  }
}
const WebSocket = SocketFalso as unknown as NonNullable<Parameters<typeof crearCliente>[0]>["WebSocket"];

const encabezados = (l: Llamada) => new Headers(l.init.headers);

test("en la web pide la ruta relativa con la cookie y sin encabezado de sesión", async () => {
  const { fetch, llamadas } = fetchFalso({ cuerpo: { id: "m1" } });
  const cliente = crearCliente({ fetch });
  assert.deepEqual(await cliente.pedir("/api/mesas/m1"), { id: "m1" });
  assert.equal(llamadas[0].url, "/api/mesas/m1");
  assert.equal(llamadas[0].init.method, "GET");
  assert.equal(llamadas[0].init.cache, "no-store");
  assert.equal(encabezados(llamadas[0]).get("Authorization"), null);
});

test("en la app usa la base y Authorization: Bearer", async () => {
  const { fetch, llamadas } = fetchFalso();
  const cliente = crearCliente({ base: "https://eltru.co/", sesion: () => "abc", fetch });
  await cliente.pedir("/api/mesas", { modo: "1v1" });
  assert.equal(llamadas[0].url, "https://eltru.co/api/mesas");
  assert.equal(llamadas[0].init.method, "POST");
  assert.equal(llamadas[0].init.body, JSON.stringify({ modo: "1v1" }));
  assert.equal(encabezados(llamadas[0]).get("Content-Type"), "application/json");
  assert.equal(encabezados(llamadas[0]).get("Authorization"), "Bearer abc");
});

test("una sesión vacía no manda un encabezado vacío", async () => {
  for (const sesion of [null, undefined, ""]) {
    const { fetch, llamadas } = fetchFalso();
    await crearCliente({ base: "https://eltru.co", sesion: () => sesion, fetch }).pedir("/api/perfil");
    assert.equal(encabezados(llamadas[0]).get("Authorization"), null);
  }
});

test("un error HTTP conserva el estado y el mensaje del servidor", async () => {
  const conMensaje = crearCliente({ fetch: fetchFalso({ status: 404, cuerpo: { error: "La mesa no existe." } }).fetch });
  const error = await conMensaje.pedir("/api/mesas/x").catch(e => e);
  assert.ok(error instanceof ErrorMesa);
  assert.equal(error.status, 404);
  assert.equal(mensajeDe(error), "La mesa no existe.");
  const sinMensaje = crearCliente({ fetch: fetchFalso({ status: 500, cuerpo: {} }).fetch });
  assert.equal((await sinMensaje.pedir("/api/mesas/x").catch(e => e)).message, "No se pudo abrir la mesa.");
  assert.equal(mensajeDe(new TypeError("red")), "No se pudo contactar con el servidor. Revisá tu conexión.");
});

test("el vivo usa wss o ws según la base, truco.v1 y el encabezado solo con sesión", () => {
  SocketFalso.abiertos = [];
  crearCliente({ base: "https://eltru.co/", sesion: () => "abc", WebSocket }).vivo("/api/mesas/m1/vivo");
  crearCliente({ base: "http://localhost:4321/sub", WebSocket }).vivo("/api/mesas/m1/vivo");
  const [app, local] = SocketFalso.abiertos;
  assert.equal(app.url, "wss://eltru.co/api/mesas/m1/vivo");
  assert.equal(app.protocolos, "truco.v1");
  assert.deepEqual(app.opciones, { headers: { Authorization: "Bearer abc" } });
  assert.equal(local.url, "ws://localhost:4321/sub/api/mesas/m1/vivo");
  assert.equal(local.opciones, undefined);
});

test("sin base usa la dirección de la página y sin ella avisa", () => {
  SocketFalso.abiertos = [];
  assert.equal("location" in globalThis, false);
  assert.throws(() => crearCliente({ WebSocket }).vivo("/api/mesas/m1/vivo"), /base/);
  Object.defineProperty(globalThis, "location", { value: new URL("https://eltru.co/jugar/?mesa=m1"), configurable: true });
  try {
    crearCliente({ WebSocket }).vivo("/api/mesas/m1/vivo");
    assert.equal(SocketFalso.abiertos[0].url, "wss://eltru.co/api/mesas/m1/vivo");
  } finally {
    delete (globalThis as { location?: unknown }).location;
  }
});

test("idComando genera un UUID v4", () => {
  const id = idComando();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(id, idComando());
});

test("el paquete solo importa sus archivos, el motor o React, y no toca el DOM", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const carpeta = new URL("../../paquetes/cliente/src/", import.meta.url);
  const archivos = (await readdir(carpeta)).filter(n => n.endsWith(".ts"));
  assert.ok(archivos.length >= 10, "faltan los archivos del paquete");
  for (const nombre of archivos) {
    const texto = await readFile(new URL(nombre, carpeta), "utf8");
    for (const [, ruta] of texto.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
      assert.match(ruta, /^(?:\.\/[a-z0-9-]+\.ts|@eltruco\/motor\/[a-z0-9-]+\.ts|react)$/, `${nombre} importa ${ruta}`);
    }
    const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(sinComentarios.replace(/globalThis as \{ location\?/g, ""),
      /\b(?:window|document|HTMLElement|HTMLImageElement)\b|(?<!\.)\blocation\b/, nombre);
  }
});
