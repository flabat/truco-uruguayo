import assert from "node:assert/strict";
import test from "node:test";
import { baraja, cartasPorId, extras } from "../../src/lib/cartas.ts";
import { cartaId, esCardId, mazo, paloDe, pieza, rangoDe } from "../../src/motor/cartas.ts";

test("el mazo canónico tiene 40 claves Tatú y la galería conserva sus 51 imágenes", () => {
  const esperado = ["oros", "copas", "espadas", "bastos"].flatMap((palo) =>
    ["01", "02", "03", "04", "05", "06", "07", "10", "11", "12"].map((n) => palo + "-" + n),
  );
  assert.deepEqual(mazo, esperado);
  assert.equal(new Set(mazo).size, 40);
  for (const carta of mazo) {
    assert.ok(cartasPorId.has(carta));
    assert.ok(esCardId(carta));
    assert.equal(cartaId(paloDe(carta), rangoDe(carta)), carta);
  }
  assert.equal(cartasPorId.size, 51);
  for (const { cartas } of baraja) {
    for (const { id } of cartas.slice(7, 9)) assert.equal(esCardId(id), false);
  }
  for (const { id } of extras) assert.equal(esCardId(id), false);
  for (const valor of [undefined, 2, "oros-2", "copas-13"]) assert.equal(esCardId(valor), false);
});

test("el rey reemplaza cada rango pieza de su palo", () => {
  for (const rango of [2, 4, 5, 11, 10] as const) {
    assert.equal(pieza(cartaId("copas", rango), "copas-06"), rango);
    assert.equal(pieza("copas-12", cartaId("copas", rango)), rango);
    assert.equal(pieza("oros-12", cartaId("copas", rango)), null);
  }
  assert.equal(pieza("copas-12", "copas-06"), null);
  assert.equal(pieza("oros-04", "copas-06"), null);
});

test("cada muestra deja cinco piezas distintas en las cartas restantes", () => {
  for (const muestra of mazo) {
    assert.equal(pieza(muestra, muestra), null);
    const efectivas = mazo.map((carta) => pieza(carta, muestra)).filter((r) => r !== null);
    assert.deepEqual(efectivas.sort((a, b) => a - b), [2, 4, 5, 10, 11]);
  }
});
