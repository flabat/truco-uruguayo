import assert from "node:assert/strict";
import test from "node:test";
import { aDecidir, aplicarOnline, iniciarOnline } from "../../src/motor/mesa-online.ts";
import type { TresCartas } from "../../src/motor/reparto.ts";
import { duelAction, duelVariants } from "../../training/anchored/duel.ts";
import type { Move, PublicTurn, Score } from "../../training/contracts/index.ts";
import { decodeMove, incumbent, observe } from "../../training/seat/index.ts";

function table(hands: [TresCartas, TresCartas], moves: Move[] = [], score: Score = [0, 0]) {
  const history: PublicTurn[] = [];
  let state = iniciarOnline({ versionReparto: "online-1", dador: 1, mano: 0, muestra: "oros-06", manos: hands }, score);
  for (const move of moves) {
    const action = decodeMove(move, aDecidir(state)[0]);
    const next = aplicarOnline(state, action);
    assert.ok(next.ok, move);
    history.push({ action, awards: next.estado.cobros.slice(state.cobros.length) });
    state = next.estado;
  }
  const obs = observe(state, aDecidir(state)[0], "duel", history);
  const legal = obs.legalActions;
  const base = legal[incumbent.decide(obs, legal).indexOf(1)];
  const action = (id: string) => duelAction(obs, base, { id });
  for (const variant of duelVariants()) assert.ok(legal.includes(action(variant.id)), variant.id);
  assert.equal(action("v1"), base);
  return { obs, base, action };
}

const lead: TresCartas = ["bastos-10", "bastos-04", "espadas-07"];
const thirtyOne: TresCartas = ["copas-05", "copas-06", "espadas-06"];

test("la defensa de falta distingue una falta grande, un precio bajo y una entrega que cerraría el chico", () => {
  const duel = table([lead, thirtyOne], ["falta-envido"]);
  assert.equal(duel.base, "quiero");
  assert.equal(duel.action("falta-defense"), "no-quiero");
  assert.equal(table([lead, thirtyOne], ["falta-envido"], [34, 20]).action("falta-defense"), "quiero");
  const last = table([lead, ["copas-04", "bastos-07", "espadas-05"]], ["falta-envido"], [39, 0]);
  assert.equal(last.base, "no-quiero");
  assert.equal(last.action("falta-defense"), "quiero");
  assert.throws(() => duel.action("apuesta-inexistente"));
});

test("la respuesta a envites respeta la declaración obligatoria de flor", () => {
  const duel = table([lead, ["copas-01", "copas-05", "copas-06"]], ["falta-envido"]);
  assert.deepEqual(duel.obs.legalActions, ["flor"]);
  assert.equal(duel.action("balanced"), "flor");
});

test("la oferta directa por valor y la lectura de un pase son propuestas distintas", () => {
  const strong: TresCartas = ["copas-06", "copas-07", "espadas-04"];
  assert.equal(table([strong, lead]).action("value-33"), "falta-envido");
  assert.equal(table([thirtyOne, lead]).action("after-pass"), "real-envido");
  const acted = table([lead, thirtyOne], ["bastos-10"]);
  assert.equal(acted.action("after-pass"), "falta-envido");
  assert.equal(acted.action("value-33"), "real-envido");
  const otherHiddenHand: TresCartas = ["bastos-10", "copas-03", "espadas-01"];
  const other = table([otherHiddenHand, thirtyOne], ["bastos-10"]);
  assert.deepEqual(acted.obs, other.obs);
  for (const { id } of duelVariants()) assert.equal(acted.action(id), other.action(id));
});

test("el precio de una resubida cuenta los tantos que entrega el no quiero", () => {
  const twentyNine: TresCartas = ["copas-04", "copas-05", "espadas-10"];
  const moves: Move[] = ["envido", "real-envido"];
  assert.equal(table([twentyNine, lead], moves).action("priced-envido"), "no-quiero");
  assert.equal(table([twentyNine, lead], moves, [10, 38]).action("priced-envido"), "quiero");
});

test("sube el truco cuando puede cerrar tras una primera parda y respeta el empate de segunda", () => {
  const moves: Move[] = ["bastos-10", "copas-10", "bastos-04"];
  const canWin = table([lead, ["copas-10", "copas-05", "espadas-04"]], moves);
  assert.equal(canWin.base, "copas-05");
  assert.equal(canWin.action("closed-trick"), "truco");
  const canTie = table([lead, ["copas-10", "copas-04", "espadas-04"]], moves);
  assert.equal(canTie.action("closed-trick"), canTie.base);
});
