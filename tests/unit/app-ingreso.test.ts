import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { esDesafio, verificadorCorresponde } from "../../api/sesion.ts";
import { crearAlmacenSesion, type Guardado } from "../../app/src/ingreso/almacen.ts";
import { base64url, crearPar } from "../../app/src/ingreso/pkce.ts";
import { codigoDeRetorno } from "../../app/src/ingreso/retorno.ts";
import { ErrorMesa } from "@eltruco/cliente/cliente.ts";
import { crearClienteApp as crearCliente } from "../../app/src/api/cliente.ts";
import { cargarJugador, cerrarSesion, completarIngreso, eliminarCuenta } from "../../app/src/ingreso/sesion.ts";

const sha256 = async (texto: string) => new Uint8Array(createHash("sha256").update(texto).digest());
// Apéndice B de RFC 7636.
const bytesRfc = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186,
  22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];
const codigo = "a".repeat(40) + "_-Z";

test("base64url no lleva relleno ni + ni /", () => {
  assert.equal(base64url(new Uint8Array([0xfb, 0xff])), "-_8");
  assert.equal(base64url(new Uint8Array([])), "");
});

test("crearPar reproduce el ejemplo de RFC 7636 y la API lo acepta", async () => {
  const pedidos: number[] = [];
  const par = await crearPar(n => { pedidos.push(n); return new Uint8Array(bytesRfc); }, sha256);
  assert.deepEqual(pedidos, [32]);
  assert.equal(par.verificador, "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  assert.equal(par.desafio, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(verificadorCorresponde(par.verificador, par.desafio), true);
});

test("crearPar con azar real da un desafío que la API acepta", async () => {
  const par = await crearPar(n => new Uint8Array(randomBytes(n)), sha256);
  assert.equal(par.verificador.length, 43);
  assert.equal(esDesafio(par.desafio), true);
  assert.equal(verificadorCorresponde(par.verificador, par.desafio), true);
});

test("codigoDeRetorno solo acepta eltruco://ingreso con un código de canje", () => {
  assert.equal(codigoDeRetorno("eltruco://ingreso?codigo=" + codigo), codigo);
  for (const ajeno of [
    "otraapp://ingreso?codigo=" + codigo,
    "eltruco://otra?codigo=" + codigo,
    "eltruco://ingreso",
    "eltruco://ingreso?codigo=corto",
    "eltruco://ingreso?codigo=" + codigo + "%2B",
    "https://eltru.co/ingreso?codigo=" + codigo,
    "no es una url",
    "",
  ]) assert.equal(codigoDeRetorno(ajeno), null, ajeno);
});

function guardadoEnMemoria() {
  const datos = new Map<string, string>();
  const guardado: Guardado = {
    leer: async clave => datos.get(clave) ?? null,
    guardar: async (clave, valor) => { datos.set(clave, valor); },
    borrar: async clave => { datos.delete(clave); },
  };
  return { datos, guardado };
}

test("crearAlmacenSesion guarda, lee y borra la sesión en truco.sesion", async () => {
  const { datos, guardado } = guardadoEnMemoria();
  const almacen = crearAlmacenSesion(guardado);
  assert.equal(await almacen.leer(), null);
  await almacen.guardar("sesion-secreta");
  assert.deepEqual([...datos], [["truco.sesion", "sesion-secreta"]]);
  assert.equal(almacen.actual(), "sesion-secreta");
  assert.equal(await almacen.leer(), "sesion-secreta");
  await almacen.borrar();
  assert.equal(datos.size, 0);
  assert.equal(almacen.actual(), null);
  assert.equal(await almacen.leer(), null);
});

test("almacen.actual entrega en forma sincrónica la sesión leída al arrancar", async () => {
  const { datos, guardado } = guardadoEnMemoria();
  datos.set("truco.sesion", "guardada");
  const almacen = crearAlmacenSesion(guardado);
  assert.equal(almacen.actual(), null);
  assert.equal(await almacen.leer(), "guardada");
  assert.equal(almacen.actual(), "guardada");
});

interface Pedido { url: string; init: RequestInit }

function fetchFalso(respuestas: Record<string, () => Response>) {
  const pedidos: Pedido[] = [];
  const pedir = (async (url: string | URL, init: RequestInit = {}) => {
    pedidos.push({ url: String(url), init });
    const responder = respuestas[(init.method ?? "GET") + " " + new URL(String(url)).pathname];
    if (!responder) throw new TypeError("Sin red");
    return responder();
  }) as typeof fetch;
  return { pedidos, pedir };
}

const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
const ana = { id: "11111111-2222-3333-4444-555555555555", nombre: "Ana" };
const encabezados = (p: Pedido) => new Headers(p.init.headers);

test("el cliente manda la sesión guardada como Bearer", async () => {
  const { pedidos, pedir } = fetchFalso({ "GET /api/jugador": () => json(200, { ...ana, salonHabilitado: true }) });
  const cliente = crearCliente({ base: "https://eltru.co", sesion: () => "abc_-1", fetch: pedir });
  assert.deepEqual(await cliente.jugador(), ana);
  assert.equal(pedidos[0].url, "https://eltru.co/api/jugador");
  assert.equal(encabezados(pedidos[0]).get("authorization"), "Bearer abc_-1");
});

test("sin sesión guardada el cliente usa la cookie del mismo origen", async () => {
  const { pedidos, pedir } = fetchFalso({ "GET /api/jugador": () => json(401, null) });
  const cliente = crearCliente({ base: "http://localhost:8081", sesion: () => null, fetch: pedir });
  assert.equal(await cliente.jugador(), null);
  assert.equal(encabezados(pedidos[0]).get("authorization"), null);
});

test("el canje envía el código y el verificador", async () => {
  const { pedidos, pedir } = fetchFalso({
    "POST /api/auth/canje": () => json(200, { sesion: "nueva", jugador: ana, bajaCancelada: false }),
  });
  const cliente = crearCliente({ base: "https://eltru.co", sesion: () => null, fetch: pedir });
  assert.deepEqual(await cliente.canjear(codigo, "verificador"), { sesion: "nueva", jugador: ana, bajaCancelada: false });
  assert.deepEqual(JSON.parse(String(pedidos[0].init.body)), { codigo, verificador: "verificador" });
  assert.equal(encabezados(pedidos[0]).get("content-type"), "application/json");
});

test("un canje vencido es un ErrorMesa 401", async () => {
  const { pedir } = fetchFalso({ "POST /api/auth/canje": () => json(401, { error: "El ingreso venció. Volvé a ingresar." }) });
  const cliente = crearCliente({ base: "https://eltru.co", sesion: () => null, fetch: pedir });
  await assert.rejects(cliente.canjear(codigo, "x"), (error: unknown) =>
    error instanceof ErrorMesa && error.status === 401 && error.message === "El ingreso venció. Volvé a ingresar.");
});

test("el socket lleva la sesión en el encabezado y usa ws o wss según la base", async () => {
  const abiertos: unknown[][] = [];
  class SocketFalso { constructor(...args: unknown[]) { abiertos.push(args); } }
  const cliente = crearCliente({ base: "https://eltru.co", sesion: () => "s1", WebSocket: SocketFalso as never });
  cliente.vivo("/api/vivo");
  assert.deepEqual(abiertos[0], ["wss://eltru.co/api/vivo", "truco.v1", { headers: { Authorization: "Bearer s1" } }]);
  const web = crearCliente({ base: "http://localhost:8081", sesion: () => null, WebSocket: SocketFalso as never });
  web.vivo("/api/vivo");
  assert.deepEqual(abiertos[1], ["ws://localhost:8081/api/vivo", "truco.v1"]);
});

/** Como al arrancar la app: la sesión guardada ya se leyó del almacenamiento seguro. */
async function sesionEnMemoria(inicial: string | null) {
  const { datos, guardado } = guardadoEnMemoria();
  if (inicial) datos.set("truco.sesion", inicial);
  const almacen = crearAlmacenSesion(guardado);
  await almacen.leer();
  return { datos, almacen };
}

test("completarIngreso no canjea si el navegador se cerró o el retorno es ajeno", async () => {
  const { pedidos, pedir } = fetchFalso({});
  const { datos, almacen } = await sesionEnMemoria(null);
  const cliente = crearCliente({ base: "https://eltru.co", sesion: almacen.actual, fetch: pedir });
  for (const resultado of [{ type: "cancel" }, { type: "dismiss" }, { type: "success", url: "otraapp://ingreso?codigo=" + codigo }]) {
    assert.equal(await completarIngreso({ resultado, verificador: "v", cliente, almacen }), null);
  }
  assert.equal(pedidos.length, 0);
  assert.equal(datos.size, 0);
});

test("completarIngreso canjea el código y guarda la sesión", async () => {
  const { pedidos, pedir } = fetchFalso({
    "POST /api/auth/canje": () => json(200, { sesion: "nueva", jugador: ana, bajaCancelada: true }),
  });
  const { datos, almacen } = await sesionEnMemoria(null);
  const cliente = crearCliente({ base: "https://eltru.co", sesion: almacen.actual, fetch: pedir });
  const resultado = { type: "success", url: "eltruco://ingreso?codigo=" + codigo };
  assert.deepEqual(await completarIngreso({ resultado, verificador: "v", cliente, almacen }), { jugador: ana, bajaCancelada: true });
  assert.equal(JSON.parse(String(pedidos[0].init.body)).codigo, codigo);
  assert.equal(datos.get("truco.sesion"), "nueva");
});

test("cargarJugador borra una sesión vencida", async () => {
  const { pedir } = fetchFalso({ "GET /api/jugador": () => json(401, null) });
  const { datos, almacen } = await sesionEnMemoria("vieja");
  const cliente = crearCliente({ base: "https://eltru.co", sesion: almacen.actual, fetch: pedir });
  assert.equal(await cargarJugador({ cliente, almacen }), null);
  assert.equal(datos.size, 0);
});

test("cargarJugador conserva la sesión si falla la red", async () => {
  const { pedir } = fetchFalso({});
  const { datos, almacen } = await sesionEnMemoria("vigente");
  const cliente = crearCliente({ base: "https://eltru.co", sesion: almacen.actual, fetch: pedir });
  await assert.rejects(cargarJugador({ cliente, almacen }), TypeError);
  assert.equal(datos.get("truco.sesion"), "vigente");
});

test("cerrarSesion borra la sesión local aunque falle la red", async () => {
  const { pedidos, pedir } = fetchFalso({});
  const { datos, almacen } = await sesionEnMemoria("vigente");
  const cliente = crearCliente({ base: "https://eltru.co", sesion: almacen.actual, fetch: pedir });
  await cerrarSesion({ cliente, almacen });
  assert.equal(pedidos[0].url, "https://eltru.co/api/auth/logout");
  assert.equal(pedidos[0].init.method, "POST");
  assert.equal(encabezados(pedidos[0]).get("authorization"), "Bearer vigente");
  assert.equal(datos.size, 0);
});

test("eliminarCuenta pide la baja y borra la sesión local", async () => {
  const vence = "2026-12-24T12:00:00.000Z";
  const { pedidos, pedir } = fetchFalso({ "POST /api/cuenta/eliminar": () => json(200, { vence }) });
  const { datos, almacen } = await sesionEnMemoria("vigente");
  const cliente = crearCliente({ base: "https://eltru.co", sesion: almacen.actual, fetch: pedir });
  assert.deepEqual(await eliminarCuenta({ cliente, almacen }), { vence });
  assert.equal(encabezados(pedidos[0]).get("authorization"), "Bearer vigente");
  assert.equal(datos.size, 0);
});

test("eliminarCuenta conserva la sesión si la API la rechaza", async () => {
  const { pedir } = fetchFalso({ "POST /api/cuenta/eliminar": () => json(500, { error: "Falló" }) });
  const { datos, almacen } = await sesionEnMemoria("vigente");
  const cliente = crearCliente({ base: "https://eltru.co", sesion: almacen.actual, fetch: pedir });
  await assert.rejects(eliminarCuenta({ cliente, almacen }), ErrorMesa);
  assert.equal(datos.get("truco.sesion"), "vigente");
});

test("cerrarSesion acepta la respuesta sin cuerpo de la app y la redirección de la web", async () => {
  for (const respuesta of [() => new Response(null, { status: 204 }), () => new Response("<!doctype html>", { status: 200 })]) {
    const { pedir } = fetchFalso({ "POST /api/auth/logout": respuesta });
    const cliente = crearCliente({ base: "https://eltru.co", sesion: () => "s", fetch: pedir });
    await cliente.cerrarSesion();
  }
});

test("cerrarSesion del cliente propaga un rechazo de la API", async () => {
  const { pedir } = fetchFalso({ "POST /api/auth/logout": () => json(403, null) });
  const cliente = crearCliente({ base: "https://eltru.co", sesion: () => "s", fetch: pedir });
  await assert.rejects(cliente.cerrarSesion(), ErrorMesa);
});
