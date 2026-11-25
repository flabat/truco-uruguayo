import assert from "node:assert/strict";
import test from "node:test";
import { ErrorMesa, type Cliente } from "@eltruco/cliente/cliente.ts";
import { crearEnvio } from "../../app/src/mesa/useJugadas.ts";

type Pedido = { ruta: string; datos?: object };

/** Un `pedir` falso que responde con lo que diga cada llamada, en orden. */
function pedirFalso(respuestas: (() => Promise<unknown>)[]) {
  const pedidos: Pedido[] = [];
  const pedir = ((ruta: string, datos?: object) => {
    pedidos.push({ ruta, datos });
    const responder = respuestas.shift() ?? (() => Promise.resolve({}));
    return responder();
  }) as Cliente["pedir"];
  return { pedir, pedidos };
}

const ruta = "/api/mesas/m1";
const jugada = { id: "c-1", version: 7, accion: { tipo: "carta", carta: "oros-01" } };

test("dos envíos seguidos hacen un solo pedido", async () => {
  let responder!: () => void;
  const { pedir, pedidos } = pedirFalso([() => new Promise<void>(r => { responder = r; })]);
  const enviar = crearEnvio(pedir, ruta);
  const primero = enviar("/acciones", jugada);
  const segundo = await enviar("/acciones", { ...jugada, id: "c-2" });
  assert.equal(segundo, null);
  responder();
  assert.equal(await primero, null);
  assert.deepEqual(pedidos, [{ ruta: ruta + "/acciones", datos: jugada }]);
  // Terminado el primero, se puede enviar otra jugada.
  await enviar("/siguiente", { id: "c-3", version: 8 });
  assert.equal(pedidos.length, 2);
});

test("ante un error de red reintenta una vez con la misma clave", async () => {
  const { pedir, pedidos } = pedirFalso([() => Promise.reject(new TypeError("Network request failed"))]);
  const resultado = await crearEnvio(pedir, ruta)("/acciones", jugada);
  assert.equal(resultado, null);
  assert.equal(pedidos.length, 2);
  assert.deepEqual(pedidos[1], pedidos[0]);
});

test("si el reintento también falla, avisa que no hay conexión", async () => {
  const red = () => Promise.reject(new TypeError("Network request failed"));
  const { pedir, pedidos } = pedirFalso([red, red]);
  const resultado = await crearEnvio(pedir, ruta)("/indicaciones", { id: "i-1", version: 3, indicacion: {} });
  assert.equal(resultado, "No se pudo contactar con el servidor. Revisá tu conexión.");
  assert.equal(pedidos.length, 2);
});

test("un rechazo del servidor devuelve su mensaje sin reintentar", async () => {
  const { pedir, pedidos } = pedirFalso([() => Promise.reject(new ErrorMesa(400, "No es tu turno."))]);
  const resultado = await crearEnvio(pedir, ruta)("/acciones", jugada);
  assert.equal(resultado, "No es tu turno.");
  assert.equal(pedidos.length, 1);
});

test("una versión vieja (409) no se muestra y avisa para devolver la carta", async () => {
  const { pedir, pedidos } = pedirFalso([() => Promise.reject(new ErrorMesa(409, "La mesa cambió."))]);
  let viejas = 0;
  const resultado = await crearEnvio(pedir, ruta, () => viejas++)("/acciones", jugada);
  assert.equal(resultado, null);
  assert.equal(viejas, 1);
  assert.equal(pedidos.length, 1);
});
