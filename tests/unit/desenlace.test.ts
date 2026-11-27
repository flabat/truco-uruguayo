import assert from "node:assert/strict";
import test from "node:test";
import { desenlaceSeguro, jugadasGanadoras } from "@eltruco/motor/desenlace.ts";
import { iniciarOnline, repartirOnline } from "@eltruco/motor/mesa-online.ts";
import { restaurar } from "../../api/turnos.ts";
import { dueloMazo, dueloVale, hasta, primeraParda } from "../fixtures/duelo-mazo.ts";

const conDos = ["bastos-01", "espadas-06", "oros-02"] as const;

test("#460: con el vale cuatro pendiente y solo el as de espadas contra el 4 de oros, la mano está perdida", () => {
  assert.equal(desenlaceSeguro(restaurar(dueloVale, "duel").estado, 1), "perdida");
});

test("con el 2 de la muestra como última carta frente a una carta oculta, la mano está ganada", () => {
  // Truco de A0 pendiente, antes de que salga el 4 de oros.
  assert.equal(desenlaceSeguro(hasta(7, conDos).estado, 1), "ganada");
});

test("con una carta oculta que puede ganar o perder, el desenlace no es seguro", () => {
  assert.equal(desenlaceSeguro(hasta(7).estado, 1), null);
});

test("la carta oculta del rival no cambia el análisis", () => {
  // El 4 de oros le gana al as de espadas; el 4 de bastos pierde. A1 no puede distinguirlos.
  const otra = hasta(7, undefined, ["bastos-07", "bastos-12", "bastos-04"]);
  assert.equal(desenlaceSeguro(otra.estado, 1), desenlaceSeguro(hasta(7).estado, 1));
  const conDosOtra = hasta(7, conDos, ["bastos-07", "bastos-12", "bastos-04"]);
  assert.equal(desenlaceSeguro(conDosOtra.estado, 1), "ganada");
});

test("tras la primera parda, si las dos cartas pierden la segunda, la mano está perdida", () => {
  assert.equal(desenlaceSeguro(restaurar(primeraParda, "duel").estado, 1), "perdida");
});

test("en 2v2 el análisis no se aplica", () => {
  assert.equal(desenlaceSeguro(iniciarOnline(repartirOnline(4)), 0), null);
});

test("en un reparto recién hecho termina en menos de 250 ms y no decide", () => {
  const inicio = performance.now();
  assert.equal(desenlaceSeguro(iniciarOnline(dueloMazo.reparto), 1), null);
  assert.ok(performance.now() - inicio < 250, `tardó ${performance.now() - inicio} ms`);
});

test("las jugadas ganadoras son las cartas propias que conservan la mano ganada", () => {
  // Tras el 4 de oros, con el 2 de la muestra, A1 gana con su única carta.
  assert.deepEqual(jugadasGanadoras(hasta(9, conDos).estado, 1), ["oros-02"]);
  // Sin desenlace ganado no hay jugadas ganadoras.
  assert.deepEqual(jugadasGanadoras(hasta(9).estado, 1), []);
});
