import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { esCardId, mazo } from "../../src/motor/cartas.ts";
import { crearAzar, equipoPorAsiento, esRepartoV1, repartir } from "../../src/motor/reparto.ts";
import vector from "../fixtures/reparto-v1.json" with { type: "json" };

test("el vector V1 se reproduce en procesos nuevos", () => {
  assert.deepEqual(repartir(vector.semilla, vector.dador), vector);
  const modulo = new URL("../../src/motor/reparto.ts", import.meta.url);
  const programa = `
    import { repartir } from ${JSON.stringify(modulo.href)};
    console.log(JSON.stringify(repartir(${vector.semilla}, ${vector.dador})));
  `;
  for (let intento = 0; intento < 2; intento++) {
    const salida = execFileSync(process.execPath, ["--input-type=module", "-e", programa], {
      encoding: "utf8",
    });
    assert.deepEqual(JSON.parse(salida), vector);
  }
});

test("la secuencia de azar V1 es local a cada generador", () => {
  const primero = crearAzar(0);
  const segundo = crearAzar(0);
  const palabras = [2462723854, 1020716019, 454327756, 1275600319];
  for (const palabra of palabras) assert.equal(primero(), palabra / 2 ** 32);
  repartir(0, 1);
  for (const palabra of palabras) assert.equal(segundo(), palabra / 2 ** 32);
});

test("cada dador cede la primera carta a su derecha y recibe la cuarta de cada vuelta", () => {
  assert.deepEqual(equipoPorAsiento, [0, 1, 0, 1]);
  // Con el dador 2 del vector, reciben 3, 0, 1 y 2 en las tres vueltas.
  const enOrden = [vector.manos[3], vector.manos[0], vector.manos[1], vector.manos[2]];
  for (const dador of [0, 1, 2, 3]) {
    const reparto = repartir(vector.semilla, dador);
    assert.equal(reparto.dador, dador);
    assert.equal(reparto.mano, (dador + 1) % 4);
    for (const [turno, cartas] of enOrden.entries()) {
      assert.deepEqual(reparto.manos[(reparto.mano + turno) % 4], cartas);
    }
    assert.equal(reparto.muestra, vector.muestra);
  }
});

test("el barrido entrega tres cartas por asiento y una muestra entre trece cartas distintas", () => {
  const canonico = [...mazo];
  const semillas = [...Array.from({ length: 256 }, (_, i) => i), 2 ** 31, 0xffffffff];
  for (const semilla of semillas) {
    for (const dador of [0, 1, 2, 3]) {
      const reparto = repartir(semilla, dador);
      assert.equal(reparto.semilla, semilla);
      assert.deepEqual(reparto.manos.map((mano) => mano.length), [3, 3, 3, 3]);
      const cartas = [...reparto.manos.flat(), reparto.muestra];
      assert.ok(cartas.every(esCardId));
      assert.equal(new Set(cartas).size, 13);
      assert.ok(esRepartoV1(reparto));
    }
  }
  assert.deepEqual(mazo, canonico);
  assert.notDeepEqual(repartir(1, 2).manos, vector.manos);
});

test("se rechazan semillas fuera de uint32 y dadores fuera de la mesa", () => {
  for (const semilla of [-1, 0.5, NaN, Infinity, 2 ** 32]) {
    assert.throws(() => crearAzar(semilla), RangeError);
    assert.throws(() => repartir(semilla, 0), RangeError);
  }
  for (const dador of [-1, 0.5, NaN, Infinity, 4]) {
    assert.throws(() => repartir(0, dador), RangeError);
  }
});

test("la validación comprueba versión, asientos, ternas y cartas antes de aceptar un reparto", () => {
  assert.ok(esRepartoV1(vector));
  for (const valor of [
    null, {}, { ...vector, versionReparto: 2 }, { ...vector, semilla: "0" },
    { ...vector, dador: 4 }, { ...vector, mano: 2 }, { ...vector, manos: vector.manos.slice(1) },
    { ...vector, manos: [[], ...vector.manos.slice(1)] },
    { ...vector, manos: [vector.manos[1], ...vector.manos.slice(1)] },
    { ...vector, muestra: "copas-08" }, { ...vector, muestra: vector.manos[0][0] },
  ]) {
    assert.equal(esRepartoV1(valor), false);
  }
});
