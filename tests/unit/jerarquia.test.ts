import assert from "node:assert/strict";
import test from "node:test";
import { mazo, type CardId } from "../../src/motor/cartas.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";

test("con el 6 de copas de muestra se respeta cada puesto y cada empate de la guía", () => {
  const muestra = "copas-06";
  const escala: CardId[][] = [
    ["copas-02"], ["copas-04"], ["copas-05"], ["copas-11"], ["copas-10"],
    ["espadas-01"], ["bastos-01"], ["espadas-07"], ["oros-07"],
    ["oros-03", "copas-03", "espadas-03", "bastos-03"],
    ["oros-02", "espadas-02", "bastos-02"],
    ["copas-01", "oros-01"],
    ["oros-12", "copas-12", "espadas-12", "bastos-12"],
    ["oros-11", "espadas-11", "bastos-11"],
    ["oros-10", "espadas-10", "bastos-10"],
    ["copas-07", "bastos-07"],
    ["oros-06", "espadas-06", "bastos-06"],
    ["oros-05", "espadas-05", "bastos-05"],
    ["oros-04", "espadas-04", "bastos-04"],
  ];

  for (const [puesto, grupo] of escala.entries()) {
    const [primera, ...iguales] = grupo;
    for (const otra of iguales) assert.equal(compararCartas(primera, otra, muestra), 0);
    if (puesto > 0) {
      const superior = escala[puesto - 1][0];
      assert.ok(compararCartas(superior, primera, muestra) > 0, `${superior} vence a ${primera}`);
    }
  }
});

test("el rey de copas toma el puesto del 4 de muestra y vuelve a ser común con el 6", () => {
  assert.ok(compararCartas("copas-12", "copas-05", "copas-04") > 0);
  assert.ok(compararCartas("copas-12", "copas-02", "copas-04") < 0);
  assert.equal(compararCartas("copas-12", "oros-12", "copas-06"), 0);
});

test("con cada muestra las 39 cartas tienen un orden coherente en ambos sentidos", () => {
  for (const muestra of mazo) {
    const jugables = mazo.filter((carta) => carta !== muestra);
    const escala = jugables.map((carta) => ({
      carta,
      superadas: jugables.filter((otra) => compararCartas(carta, otra, muestra) > 0).length,
    }));

    // En un orden transitivo dos cartas empatan si superan a la misma cantidad de cartas.
    for (const a of escala) {
      for (const b of escala) {
        assert.equal(
          Math.sign(compararCartas(a.carta, b.carta, muestra)),
          Math.sign(a.superadas - b.superadas),
          `${a.carta} contra ${b.carta} con muestra ${muestra}`,
        );
      }
    }
  }
});
