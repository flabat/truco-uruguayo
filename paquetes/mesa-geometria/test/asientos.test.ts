import { test } from "node:test";
import assert from "node:assert/strict";
import { asientoDeAbajo, formaDe, lugarDe, rivalDelDuelo, validar } from "../src/asientos.ts";
import type { EntradaMesa } from "../src/index.ts";

function entrada(cambios: Partial<EntradaMesa> = {}): EntradaMesa {
  return { ancho: 390, alto: 844, modalidad: "2v2", propio: 0, dador: 3, mano: 0, cartas: [3, 3, 3, 3], ...cambios };
}

const pico = (activos: readonly [number, number], cambios: Partial<EntradaMesa> = {}) =>
  entrada({ modalidad: "3v3", cartas: [3, 3, 3, 3, 3, 3], dador: 5, mano: 0, lance: { tipo: "pico", activos }, ...cambios });

test("en parejas los asientos siguen el sentido antihorario de Tapete", () => {
  assert.deepEqual([1, 2, 3].map(a => lugarDe(a, 0, 4)), ["derecha", "frente", "izquierda"]);
  assert.equal(lugarDe(0, 0, 4), "abajo");
  assert.equal(lugarDe(0, 1, 2), "frente");
});

test("en tercetos los rivales quedan a los costados y al frente, y los compañeros en las esquinas lejanas", () => {
  assert.equal(lugarDe(4, 3, 6), "cerca-derecha");
  assert.equal(lugarDe(2, 3, 6), "cerca-izquierda");
  for (let abajo = 0; abajo < 6; abajo++) {
    for (let a = 0; a < 6; a++) {
      if (a === abajo) continue;
      const lugar = lugarDe(a, abajo, 6);
      const rival = a % 2 !== abajo % 2;
      assert.equal(["cerca-derecha", "frente", "cerca-izquierda"].includes(lugar), rival, `${a} desde ${abajo}`);
    }
  }
});

test("en el pico a pico el rival activo va arriba y los inactivos son puntos", () => {
  const e = pico([1, 4]);
  assert.equal(rivalDelDuelo(e), 1);
  assert.deepEqual(formaDe(e, 4), { forma: "completo", activo: true });
  assert.deepEqual(formaDe(e, 1), { forma: "completo", activo: true });
  for (const a of [0, 2, 3, 5]) assert.deepEqual(formaDe(e, a), { forma: "punto", activo: false });
  assert.equal(rivalDelDuelo(pico([0, 3])), 3);
});

test("en la redondilla los demás son círculos y el de abajo queda completo", () => {
  const e = entrada({ modalidad: "3v3", cartas: [3, 3, 3, 3, 3, 3], dador: 5, mano: 0 });
  assert.deepEqual(formaDe(e, 0), { forma: "completo", activo: true });
  assert.deepEqual(formaDe(e, 3), { forma: "circulo", activo: true });
  assert.equal(rivalDelDuelo(e), null);
});

test("el espectador mira desde el asiento que pide, o desde el 0", () => {
  assert.equal(asientoDeAbajo(entrada({ propio: null, vistaDesde: 3 })), 3);
  assert.equal(asientoDeAbajo(entrada({ propio: null })), 0);
  assert.equal(asientoDeAbajo(entrada({ propio: 2 })), 2);
});

test("validar rechaza entradas imposibles", () => {
  assert.doesNotThrow(() => validar(entrada()));
  assert.doesNotThrow(() => validar(pico([1, 4])));
  assert.throws(() => validar(entrada({ cartas: [3, 3, 3] })), RangeError);
  assert.throws(() => validar(entrada({ cartas: [3, 3, 4, 3] })), RangeError);
  assert.throws(() => validar(pico([0, 2])), RangeError);
  assert.throws(() => validar(pico([1, 1])), RangeError);
  assert.throws(() => validar(entrada({ propio: 4 })), RangeError);
  assert.throws(() => validar(entrada({ modalidad: "1v1", cartas: [3, 3], dador: 1, lance: { tipo: "redondilla" } })), RangeError);
  assert.throws(() => validar(entrada({ ancho: 0 })), RangeError);
  assert.throws(() => validar(entrada({ alto: Number.NaN })), RangeError);
  assert.throws(() => validar(entrada({ hoja: { alto: -1 } })), RangeError);
  assert.throws(() => validar(entrada({ dador: 7 })), RangeError);
});
