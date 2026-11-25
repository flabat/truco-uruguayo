import assert from "node:assert/strict";
import test from "node:test";
import type { Guardado } from "../../app/src/ingreso/almacen.ts";
import { claveSonido, crearReproductor, type MotorAudio, type Recursos } from "../../app/src/sonido/reproductor.ts";

const recursos: Recursos = {
  voces: {
    0: { truco: 100, quiero: 101, "envido-33": 102, "pie-veni": 103 },
    1: { truco: 200, quiero: 201, "envido-33": 202, "pie-veni": 203 },
  },
  efectos: { naipe: 1, reparto: 2, ficha: 3, festejo: 4 },
};

/** Motor falso: anota qué suena y deja terminar cada clip a mano. */
function motorFalso() {
  const sonados: { pista: string; fuente: number; volumen: number }[] = [];
  const pendientes = new Map<string, () => void>();
  const detenidas: string[] = [];
  const precargadas: number[] = [];
  const motor: MotorAudio = {
    pista: nombre => ({
      reproducir(fuente, volumen) {
        sonados.push({ pista: nombre, fuente, volumen });
        return new Promise(listo => pendientes.set(nombre, listo));
      },
      detener() {
        detenidas.push(nombre);
        pendientes.get(nombre)?.();
        pendientes.delete(nombre);
      },
    }),
    async precargar(fuentes) { precargadas.push(...fuentes); },
  };
  const terminar = async (nombre: string) => {
    pendientes.get(nombre)?.();
    pendientes.delete(nombre);
    await new Promise(r => setImmediate(r));
  };
  return { motor, sonados, detenidas, precargadas, terminar };
}

function guardadoEnMemoria(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  const guardado: Guardado = {
    leer: async c => datos.get(c) ?? null,
    guardar: async (c, v) => { datos.set(c, v); },
    borrar: async c => { datos.delete(c); },
  };
  return { guardado, datos };
}

const nativo = (m: MotorAudio, g = guardadoEnMemoria().guardado) => crearReproductor(m, { recursos, guardado: g, esWeb: false });

test("cada asiento usa su propia voz y su clip", () => {
  const f = motorFalso();
  const r = nativo(f.motor);
  r.reproducirVoz(1, { tipo: "canto", canto: "truco" });
  r.reproducirVoz(0, { tipo: "tantos", motivo: "envido", total: 33 });
  r.reproducirVoz(0, { tipo: "pie", frase: "veni" });
  assert.deepEqual(f.sonados.map(s => [s.pista, s.fuente]), [["voz-1", 200], ["voz-0", 102]]);
});

test("dos voces del mismo asiento se encolan en orden", async () => {
  const f = motorFalso();
  const r = nativo(f.motor);
  r.reproducirVoz(0, { tipo: "canto", canto: "truco" });
  r.reproducirVoz(0, { tipo: "canto", canto: "quiero" });
  assert.deepEqual(f.sonados.map(s => s.fuente), [100]);
  await f.terminar("voz-0");
  assert.deepEqual(f.sonados.map(s => s.fuente), [100, 101]);
});

test("una frase sin clip no suena ni lanza", () => {
  const f = motorFalso();
  const r = nativo(f.motor);
  r.reproducirVoz(0, { tipo: "tantos", motivo: "envido", total: 15 });
  r.reproducirVoz(4, { tipo: "canto", canto: "truco" });
  assert.equal(f.sonados.length, 0);
});

test("los efectos suenan con el volumen pedido", () => {
  const f = motorFalso();
  const r = nativo(f.motor);
  r.reproducirEfecto("naipe", { volumen: 0.5 });
  r.reproducirEfecto("festejo");
  assert.deepEqual(f.sonados, [
    { pista: "efecto-naipe", fuente: 1, volumen: 0.5 },
    { pista: "efecto-festejo", fuente: 4, volumen: 1 },
  ]);
});

test("apagar corta lo que suena, vacía las colas y se recuerda", async () => {
  const f = motorFalso();
  const g = guardadoEnMemoria();
  const r = nativo(f.motor, g.guardado);
  r.reproducirVoz(0, { tipo: "canto", canto: "truco" });
  r.reproducirVoz(0, { tipo: "canto", canto: "quiero" });
  await r.cambiar(false);
  assert.ok(f.detenidas.includes("voz-0"));
  assert.equal(g.datos.get(claveSonido), "0");
  await f.terminar("voz-0");
  r.reproducirEfecto("ficha");
  r.reproducirVoz(1, { tipo: "canto", canto: "truco" });
  assert.deepEqual(f.sonados.map(s => s.fuente), [100]);
  await r.cambiar(true);
  r.reproducirVoz(0, { tipo: "canto", canto: "quiero" });
  assert.deepEqual(f.sonados.map(s => s.fuente), [100, 101]);
});

test("la preferencia guardada se aplica al cargar y avisa a quien escucha", async () => {
  const f = motorFalso();
  const r = nativo(f.motor, guardadoEnMemoria({ [claveSonido]: "0" }).guardado);
  let avisos = 0;
  r.suscribir(() => avisos++);
  assert.equal(r.activado(), true);
  await r.cargarPreferencia();
  assert.equal(r.activado(), false);
  assert.equal(avisos, 1);
  r.reproducirEfecto("naipe");
  assert.equal(f.sonados.length, 0);
});

test("en la web nada suena antes del primer gesto y lo anterior se descarta", () => {
  const f = motorFalso();
  let gesto = () => {};
  const r = crearReproductor(f.motor, {
    recursos, guardado: guardadoEnMemoria().guardado, esWeb: true, escucharPrimerGesto: alGesto => { gesto = alGesto; },
  });
  r.reproducirVoz(0, { tipo: "canto", canto: "truco" });
  r.reproducirEfecto("naipe");
  assert.equal(f.sonados.length, 0);
  gesto();
  assert.equal(f.sonados.length, 0);
  r.reproducirEfecto("naipe");
  assert.deepEqual(f.sonados.map(s => s.pista), ["efecto-naipe"]);
});

test("la precarga trae los efectos y las voces de los asientos de la mesa", async () => {
  const f = motorFalso();
  await nativo(f.motor).precargar([1]);
  assert.deepEqual([...f.precargadas].sort((a, b) => a - b), [1, 2, 3, 4, 200, 201, 202, 203]);
});
