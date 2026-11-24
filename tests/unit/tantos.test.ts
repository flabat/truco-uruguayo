import assert from "node:assert/strict";
import test from "node:test";
import { cartaId, type CardId, type RangoPieza } from "@eltruco/motor/cartas.ts";
import { evaluarTantos, type Aporte, type ResultadoTantos } from "@eltruco/motor/tantos.ts";

function aporte(carta: CardId, tantos: number, pieza: RangoPieza | null = null): Aporte {
  return { carta, tantos, pieza };
}

function comprobar(
  resultado: ResultadoTantos, modalidad: ResultadoTantos["modalidad"], forma: ResultadoTantos["forma"],
  total: number, base: number, selecciones: Aporte[][],
) {
  assert.equal(resultado.modalidad, modalidad);
  assert.equal(resultado.forma, forma);
  assert.equal(resultado.total, total);
  assert.equal(resultado.desgloses.length, selecciones.length);
  for (const desglose of resultado.desgloses) {
    assert.equal(desglose.base, base);
    assert.equal(desglose.aportes.reduce<number>((n, a) => n + a.tantos, desglose.base), total);
  }
  // Al corregir cuentan las identidades de las cartas, en cualquier orden.
  assert.deepEqual(
    new Set(resultado.desgloses.map(({ aportes }) => new Set(aportes))),
    new Set(selecciones.map((seleccion) => new Set(seleccion))),
  );
}

test("las cuatro formas de flor de la guía cuentan las tres cartas y una sola base", () => {
  const muestra = "bastos-06";
  comprobar(evaluarTantos(["copas-07", "copas-06", "copas-12"], muestra),
    "flor", "tres-del-mismo-palo", 33, 20, [
      [aporte("copas-07", 7), aporte("copas-06", 6), aporte("copas-12", 0)],
    ]);
  comprobar(evaluarTantos(["bastos-05", "oros-07", "oros-06"], muestra),
    "flor", "una-pieza-y-dos-del-mismo-palo", 41, 20, [
      [aporte("bastos-05", 8, 5), aporte("oros-07", 7), aporte("oros-06", 6)],
    ]);
  comprobar(evaluarTantos(["bastos-04", "bastos-11", "espadas-06"], muestra),
    "flor", "dos-piezas", 42, 20, [
      [aporte("bastos-04", 9, 4), aporte("bastos-11", 7, 11), aporte("espadas-06", 6)],
    ]);
  comprobar(evaluarTantos(["bastos-02", "bastos-04", "bastos-05"], muestra),
    "flor", "tres-piezas", 47, 20, [
      [aporte("bastos-02", 10, 2), aporte("bastos-04", 9, 4), aporte("bastos-05", 8, 5)],
    ]);
});

test("las tres clases de envido de la guía seleccionan las cartas que se cuentan", () => {
  const muestra = "oros-06";
  comprobar(evaluarTantos(["oros-02", "copas-07", "bastos-03"], muestra),
    "envido", "una-pieza", 37, 0, [[aporte("oros-02", 30, 2), aporte("copas-07", 7)]]);
  comprobar(evaluarTantos(["bastos-06", "bastos-10", "espadas-07"], muestra),
    "envido", "dos-del-mismo-palo", 26, 20, [[aporte("bastos-06", 6), aporte("bastos-10", 0)]]);
  comprobar(evaluarTantos(["copas-11", "espadas-05", "oros-03"], muestra),
    "envido", "tres-palos-distintos", 5, 0, [[aporte("espadas-05", 5)]]);
});

test("el 2, la perica y un rey común suman 37 de flor según la escala de la guía (#5)", () => {
  comprobar(evaluarTantos(["oros-02", "oros-10", "copas-12"], "oros-06"),
    "flor", "dos-piezas", 37, 20, [
      [aporte("oros-02", 10, 2), aporte("oros-10", 7, 10), aporte("copas-12", 0)],
    ]);
});

test("el rey sustituto conserva su identidad y aporta los tantos de la pieza de muestra", () => {
  for (const [rango, valor] of [[2, 30], [4, 29], [5, 28], [11, 27], [10, 27]] as const) {
    const muestra = cartaId("oros", rango);
    comprobar(evaluarTantos(["oros-12", "oros-03", "copas-07"], muestra),
      "envido", "una-pieza", valor + 7, 0, [[aporte("oros-12", valor, rango), aporte("copas-07", 7)]]);
  }
  comprobar(evaluarTantos(["oros-12", "oros-07", "oros-03"], "oros-04"),
    "flor", "una-pieza-y-dos-del-mismo-palo", 39, 20, [
      [aporte("oros-12", 9, 4), aporte("oros-07", 7), aporte("oros-03", 3)],
    ]);
});

test("el envido con pieza acepta cada acompañante empatado, incluso si aporta cero", () => {
  const cartas = Object.freeze(["copas-11", "bastos-04", "espadas-12"] as const);
  for (const mano of [cartas, cartas.toReversed()]) {
    comprobar(evaluarTantos(mano, "bastos-06"), "envido", "una-pieza", 29, 0, [
      [aporte("bastos-04", 29, 4), aporte("copas-11", 0)],
      [aporte("bastos-04", 29, 4), aporte("espadas-12", 0)],
    ]);
  }
});

test("con tres palos y sin pieza se aceptan todas las mejores cartas, una por selección", () => {
  comprobar(evaluarTantos(["oros-07", "bastos-07", "copas-01"], "espadas-05"),
    "envido", "tres-palos-distintos", 7, 0, [[aporte("oros-07", 7)], [aporte("bastos-07", 7)]]);
  comprobar(evaluarTantos(["oros-10", "bastos-11", "copas-12"], "espadas-05"),
    "envido", "tres-palos-distintos", 0, 0, [
      [aporte("oros-10", 0)], [aporte("bastos-11", 0)], [aporte("copas-12", 0)],
    ]);
});

test("se requieren tres cartas del mazo y una muestra, todas distintas", () => {
  const invalidas: CardId[][] = [
    [], ["oros-02", "oros-02", "copas-07"], ["oros-06", "copas-07", "espadas-01"],
    ["bastos-08" as CardId, "copas-07", "espadas-01"],
    ["oros-02", "copas-07", "espadas-01", "bastos-03"],
  ];
  for (const mano of invalidas) assert.throws(() => evaluarTantos(mano, "oros-06"), RangeError);
  assert.throws(() => evaluarTantos(["oros-02", "copas-07", "bastos-03"], "oros-08" as CardId), RangeError);
});
