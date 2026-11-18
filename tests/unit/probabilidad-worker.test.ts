import assert from "node:assert/strict";
import { on } from "node:events";
import { Worker as Hilo } from "node:worker_threads";
import test from "node:test";
import { calcularProbabilidades } from "../../src/probabilidad/calcular.ts";
import { crearClienteAnalisis, type EstadoConsulta } from "../../src/probabilidad/cliente.ts";
import type { PosicionPublicaV1 } from "../../src/probabilidad/informacion.ts";
import { aperturaEditorial, segundaEditorial, claveAnalisis, perfilAnalisis, referenciaEditorial } from "../../src/probabilidad/perfil.ts";
import type { Pedido, Mensaje } from "../../src/probabilidad/worker.ts";

class WorkerControlado {
  pedido!: Pedido;
  onmessage: ((evento: MessageEvent<Mensaje>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  cerrado = false;
  terminate() { this.cerrado = true; }
  postMessage(pedido: Pedido) { this.pedido = pedido; }
  responder(mensaje: Mensaje) { this.onmessage?.(new MessageEvent("message", { data: mensaje })); }
}

function banco() {
  const workers: WorkerControlado[] = [];
  const cliente = crearClienteAnalisis(() => {
    const worker = new WorkerControlado();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  const eventos: EstadoConsulta[] = [];
  const consultar = (posicion: PosicionPublicaV1) => cliente.consultar(posicion, estado => eventos.push(estado));
  return { workers, cliente, eventos, consultar };
}

test("el worker real devuelve el cálculo síncrono y rechaza una clave incompatible", { timeout: 10000 }, async () => {
  const ruta = new URL("../../src/probabilidad/worker.ts", import.meta.url).href;
  const puente = `
    import { parentPort } from "node:worker_threads";
    globalThis.self = { postMessage: dato => parentPort.postMessage(dato) };
    await import(${JSON.stringify(ruta)});
    parentPort.on("message", data => self.onmessage({data}));
  `;
  const hilo = new Hilo(new URL("data:text/javascript," + encodeURIComponent(puente)));
  try {
    const base = { clave: claveAnalisis(segundaEditorial), perfil: perfilAnalisis(segundaEditorial), posicion: segundaEditorial };
    hilo.postMessage({ ...base, requestId: 1 });
    for await (const [mensaje] of on(hilo, "message")) {
      assert.equal(mensaje.requestId, 1);
      assert.equal(mensaje.clave, base.clave);
      if (mensaje.tipo === "progreso") {
        assert.deepEqual(Object.keys(mensaje.avance).sort(), ["mundos", "propuestas"]);
        continue;
      }
      assert.equal(mensaje.tipo, "resultado");
      assert.deepEqual(mensaje.resultado, calcularProbabilidades(segundaEditorial));
      break;
    }
    hilo.postMessage({ ...base, requestId: 2, clave: "otra" });
    for await (const [mensaje] of on(hilo, "message")) {
      assert.deepEqual(mensaje, { tipo: "error", requestId: 2, clave: "otra" });
      break;
    }
  } finally {
    await hilo.terminate();
  }
});

test("nuevo turno y desmontaje terminan el proceso y silencian mensajes tardíos aun con la misma clave", () => {
  const { cliente, consultar, workers, eventos } = banco();
  consultar(segundaEditorial);
  const uno = workers[0];
  const tardio = uno.onmessage!;
  consultar(segundaEditorial);
  assert.ok(uno.cerrado);
  tardio(new MessageEvent("message", { data: { ...uno.pedido, tipo: "resultado", resultado: referenciaEditorial(segundaEditorial)! } }));
  const dos = workers[1];
  dos.responder({ ...uno.pedido, tipo: "error" });
  dos.responder({ ...dos.pedido, clave: "prefijo anterior", tipo: "error" });
  assert.deepEqual(eventos.map(evento => evento.tipo), ["calculando", "calculando"]);
  dos.responder({ ...dos.pedido, tipo: "progreso", avance: { mundos: 64, propuestas: 0 } });
  assert.deepEqual(eventos.at(-1), { tipo: "calculando", mundos: 64, propuestas: 0 });
  const tardeDos = dos.onmessage!;
  cliente.cancelar();
  assert.ok(dos.cerrado);
  tardeDos(new MessageEvent("message", { data: { ...dos.pedido, tipo: "error" } }));
  assert.equal(eventos.length, 3);
});

test("sólo se recupera una referencia verificada para la posición y el perfil solicitados", () => {
  const { consultar, workers, eventos } = banco();
  consultar(segundaEditorial);
  workers[0].responder({ ...workers[0].pedido, tipo: "resultado", resultado: referenciaEditorial(aperturaEditorial)! });
  assert.deepEqual(eventos.at(-1), { tipo: "resultado", origen: "referencia", resultado: referenciaEditorial(segundaEditorial) });
  assert.ok(workers[0].cerrado);
  consultar(segundaEditorial);
  workers[1].onmessageerror!();
  assert.equal(workers.length, 2);
  const nueva = { ...aperturaEditorial, muestra: "oros-06" as const };
  consultar(nueva);
  workers[2].onerror!();
  assert.deepEqual(eventos.at(-1), { tipo: "error" });
  consultar(nueva);
  const agotado = { tipo: "presupuesto-agotado", mundos: 32, propuestas: 65536 } as const;
  workers[3].responder({ ...workers[3].pedido, tipo: "resultado", resultado: agotado });
  assert.deepEqual(eventos.at(-1), { tipo: "resultado", resultado: agotado, origen: "calculo" });

  const bloqueado = crearClienteAnalisis(() => { throw new Error("Carga bloqueada"); });
  bloqueado.consultar(aperturaEditorial, e => eventos.push(e));
  assert.deepEqual(eventos.at(-1), { tipo: "resultado", origen: "referencia", resultado: referenciaEditorial(aperturaEditorial) });
});

test("la caché protege los resultados, actualiza el uso y conserva a lo sumo 16 entradas", () => {
  const { consultar, workers, eventos } = banco();
  const palos = ["copas", "oros"] as const;
  const rangos = ["01","03","04","06","07","10","11","12","02","05"] as const;
  const posiciones: PosicionPublicaV1[] = palos.flatMap(palo => rangos.map(rango => ({
    ...aperturaEditorial, muestra: `${palo}-${rango}` as const,
  }))).filter(p => !p.cartas.includes(p.muestra));
  function completar(posicion: PosicionPublicaV1) {
    consultar(posicion);
    const hilo = workers.at(-1)!;
    const resultado = { ...referenciaEditorial(aperturaEditorial)!, clave: hilo.pedido.clave, perfil: hilo.pedido.perfil };
    hilo.responder({ ...hilo.pedido, tipo: "resultado", resultado });
    assert.ok(hilo.cerrado);
    resultado.filas[0].victorias = -999;
  }
  posiciones.slice(0, 16).forEach(completar);
  consultar(posiciones[0]);
  const cacheado = eventos.at(-1)!;
  assert.ok(cacheado.tipo === "resultado" && cacheado.resultado.tipo === "completo");
  assert.ok(cacheado.resultado.filas[0].victorias >= 0);
  assert.equal(workers.length, 16);
  completar(posiciones[16]);
  consultar(posiciones[0]);
  assert.equal(workers.length, 17);
  completar(posiciones[1]);
  assert.equal(workers.length, 18);
});
