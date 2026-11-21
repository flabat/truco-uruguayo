import assert from "node:assert/strict";
import test from "node:test";
import { iniciarOnline, type RepartoOnline } from "../../src/motor/mesa-online.ts";
import { playMatch } from "../../training/arena/index.ts";
import type { SeatObservation } from "../../training/contracts/index.ts";
import { incumbent, observe } from "../../training/seat/index.ts";
import { commitTurn } from "../../training/signals/index.ts";
import { encode, sizes } from "../../training/transformer/features.ts";

test("el historial de la mano se agrega en orden sin cambiar el resumen ni el menú legal", () => {
  let observation: SeatObservation | undefined;
  playMatch({format:"duel", seed:27201, pair:0, leg:0, policies:() => incumbent, onDecision({observation:obs}) {
    if (obs.history.filter(turn => turn.action.tipo === "carta").length >= 2) observation ??= obs;
  }});
  assert.ok(observation);
  const full = encode(observation, true);
  const summary = encode(observation, false);
  assert.deepEqual({...full, history:[]}, summary);
  assert.equal(full.actions.length, observation.legalActions.length);
  assert.equal(new Set(full.actions.map(action => action.join(":"))).size, full.actions.length);
  assert.ok(full.summary.every(feature => feature > 0 && feature < sizes.features));
  const reverse = {...observation, history:[...observation.history].reverse()};
  assert.deepEqual(encode(reverse, true).history, [...full.history].reverse());
});

test("una seña privada equivale a silencio para ambos rivales aun con historial completo", () => {
  const deal: RepartoOnline = {
    versionReparto:"online-1", mano:0, dador:3, muestra:"oros-06",
    manos:[["oros-02","copas-07","bastos-03"], ["bastos-06","bastos-10","espadas-07"],
      ["espadas-01","espadas-02","espadas-03"], ["copas-04","copas-05","copas-06"]],
  };
  const state = iniciarOnline(deal);
  const silence = commitTurn(state, 0, "pairs-private-senas", "truco");
  const signal = commitTurn(state, 0, "pairs-private-senas", "cejas/truco");
  for (const seat of [0,1,2,3] as const) {
    const a = encode(observe(silence.state, seat, "pairs-private-senas", [silence.turn]), true);
    const b = encode(observe(signal.state, seat, "pairs-private-senas", [signal.turn]), true);
    if (seat % 2) assert.deepEqual(a, b);
    else {
      assert.equal(a.history[0][2], 0);
      assert.equal(b.history[0][2], 1);
    }
  }
});
