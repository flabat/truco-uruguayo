import assert from "node:assert/strict";
import test from "node:test";
import casos from "../fixtures/reglas-tercetos-v2.json" with { type: "json" };
import { faltaDelGanador, restoQuerido, tantosAcreditados, tipoDeReparto, type TipoLance } from "@eltruco/motor/reglas-tercetos.ts";

test("la falta usa la cuenta inicial de quien gana el lance", () => {
  for (const { meta, puntos, ganador, tantos } of casos.falta) {
    assert.equal(faltaDelGanador(puntos[ganador], meta), tantos);
  }
});

test("el resto incluye las flores y conserva el valor pactado si llega al tope", () => {
  for (const { meta, tipo, inicio, valor, final } of casos.resto) {
    assert.equal(restoQuerido(tipo as TipoLance, inicio, meta), valor);
    assert.equal(inicio + tantosAcreditados(valor, inicio, meta), final);
  }
});

test("se alterna desde la primera redondilla mientras ambos estén en malas", () => {
  for (const meta of [26, 50]) {
    const mitad = meta / 2;
    assert.equal(tipoDeReparto(1, [0, 0], meta), "redondilla");
    assert.equal(tipoDeReparto(2, [mitad - 1, mitad - 1], meta), "pico-a-pico");
    assert.equal(tipoDeReparto(3, [0, 2], meta), "redondilla");
    assert.equal(tipoDeReparto(4, [mitad, 1], meta), "redondilla");
    assert.equal(tipoDeReparto(4, [0, mitad], meta), "redondilla");
  }
});
