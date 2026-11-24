import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { esCardId } from "@eltruco/motor/cartas.ts";

const cartas = ["copas-02", "bastos-03", "oros-05"];

function ejecutar(...args: string[]) {
  return spawnSync(process.execPath, ["scripts/estudios/salidas.ts", ...args], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8", timeout: 10_000,
  });
}

function salida(...args: string[]): string {
  const proceso = ejecutar(...args);
  assert.equal(proceso.status, 0, proceso.error?.message ?? proceso.stderr);
  return proceso.stdout;
}

test("el ejemplo auditable conserva cada reparto y reproduce los tres desenlaces por semilla", () => {
  const args = ["--semilla", "44", "--repartos", "3"];
  const json = salida(...args, "--detalle");
  assert.equal(salida(...args, "--detalle"), json);
  const { detalle, ...resumen } = JSON.parse(json);
  assert.deepEqual(JSON.parse(salida(...args)), resumen);
  assert.deepEqual(detalle[0].manos, [
    cartas, ["oros-06", "copas-11", "espadas-06"], ["espadas-04", "copas-03", "espadas-03"],
    ["oros-10", "oros-04", "copas-05"],
  ]);
  assert.deepEqual(detalle.map((fila: { ganaPareja02: boolean[] }) => fila.ganaPareja02), [
    [false, true, false], [false, false, false], [false, true, true],
  ]);
  assert.deepEqual(resumen.salidas, [
    { carta: cartas[0], victorias: 0, frecuencia: 0 },
    { carta: cartas[1], victorias: 2, frecuencia: 2 / 3 },
    { carta: cartas[2], victorias: 1, frecuencia: 1 / 3 },
  ]);
  // Con el 3 frente al 5, las tres diferencias son +1, 0 y 0.
  const par = resumen.comparaciones[2];
  assert.deepEqual([par.a, par.b, par.soloA, par.soloB], [cartas[1], cartas[2], 1, 0]);
  assert.equal(par.diferencia, 1 / 3);
  assert.equal(par.errorEstandar, 1 / 3);
  assert.deepEqual(par.intervalo95, [-1, 1]);
});

test("cada alternativa conserva las cartas visibles y recibe las mismas nueve cartas ocultas", () => {
  const informe = JSON.parse(salida("--semilla", "29", "--repartos", "128", "--detalle"));
  assert.equal(informe.mano, 0);
  assert.equal(informe.muestra, "copas-06");
  assert.equal(informe.detalle.length, 128);
  for (const [i, fila] of informe.detalle.entries()) {
    assert.equal(fila.semilla, 29 + i);
    assert.deepEqual(fila.manos[0], cartas);
    assert.equal(fila.manos.length, 4);
    for (const mano of fila.manos) assert.equal(mano.length, 3);
    const repartidas = [informe.muestra, ...fila.manos.flat()];
    assert.ok(repartidas.every(esCardId));
    assert.equal(new Set(repartidas).size, 13);
  }
  for (const par of informe.comparaciones) {
    const a = cartas.indexOf(par.a);
    const b = cartas.indexOf(par.b);
    const diferencias: number[] = [];
    for (const { ganaPareja02 } of informe.detalle) {
      diferencias.push(Number(ganaPareja02[a]) - Number(ganaPareja02[b]));
    }
    assert.equal(par.soloA, diferencias.filter(d => d === 1).length);
    assert.equal(par.soloB, diferencias.filter(d => d === -1).length);
    const n = diferencias.length;
    const media = diferencias.reduce((suma, d) => suma + d, 0) / n;
    assert.equal(par.diferencia, media);
    const varianza = diferencias.reduce((suma, d) => suma + (d - media) ** 2, 0) / (n - 1);
    assert.ok(Math.abs(par.errorEstandar - Math.sqrt(varianza / n)) < 1e-12);
    const margen = Math.sqrt(2 * Math.log(40) / n);
    assert.deepEqual(par.intervalo95, [media - margen, media + margen]);
  }
});

test("al pasar la semilla máxima se reproduce el reparto cero, incluso por separado", () => {
  const ultimo = JSON.parse(salida("--semilla", "4294967295", "--repartos", "2", "--detalle"));
  const cero = JSON.parse(salida("--semilla", "0", "--repartos", "1", "--detalle"));
  assert.equal(ultimo.detalle[0].semilla, 4294967295);
  assert.equal(cero.detalle[0].semilla, 0);
  assert.deepEqual(ultimo.detalle[1], cero.detalle[0]);
  for (const par of cero.comparaciones) {
    assert.equal(par.errorEstandar, null);
    assert.deepEqual(par.intervalo95, [-1, 1]);
  }
});

test("el comando rechaza cantidades vacías, fraccionarias o que repetirían una semilla", () => {
  for (const [campo, valor] of [
    ["semilla", "4294967296"], ["semilla", "-1"], ["semilla", ""],
    ["repartos", "0"], ["repartos", "1.5"], ["repartos", "4294967297"],
  ]) {
    const proceso = ejecutar(`--${campo}`, valor);
    assert.equal(proceso.status, 1);
    assert.equal(proceso.stdout, "");
    assert.match(proceso.stderr, new RegExp(campo));
  }
});
