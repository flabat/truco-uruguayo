import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { aDecidir, aplicarOnline, iniciarOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { seatsFor, versions, type RefereeHand } from "../../training/contracts/index.ts";

const bytes = readFileSync(new URL("../../training/contracts/fixtures.json", import.meta.url));
interface Checkpoint {
  after: number;
  actor: 0 | 1 | null;
  baseActions: string[];
  ownTotal?: number;
  score: number[];
  pending: string | null;
}
const cases: { id: string; referee: RefereeHand; expected: Checkpoint[] }[] = JSON.parse(bytes.toString());

test("el pack de campeonato fija una transcripción por formato", () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "5a6f1926b367d14bb68336a5a4381c7e5fa93e66605f8ed92f947d2e894cca28");
  assert.deepEqual(cases.map(c => c.referee.format), ["duel", "pairs", "pairs-senas"]);
});

for (const { id, referee, expected } of cases) {
  test(id + " se reproduce por el motor y se puede leer como historial público", () => {
    const { deal, format, turns, startScore } = referee;
    assert.equal(referee.schema, versions.replay);
    assert.equal(deal.manos.length, seatsFor(format));
    let state = iniciarOnline(deal, startScore);
    const score = [...startScore];
    for (let index = 0; index <= turns.length; index++) {
      const expectedView = expected.find(checkpoint => checkpoint.after === index);
      if (expectedView) {
        const actor = aDecidir(state)[0] ?? null;
        const view = vistaOnline(state, actor ?? 0);
        assert.equal(actor, expectedView.actor);
        const baseActions = view.legales.flatMap(action => action === "carta" ? [...view.cartas] : [action]);
        assert.deepEqual(baseActions, expectedView.baseActions);
        assert.equal(view.pendiente?.tipo ?? null, expectedView.pending);
        if (actor !== null) assert.equal(view.tantosPropios.total, expectedView.ownTotal);
        assert.deepEqual(score, expectedView.score);
      }
      if (index === turns.length) break;
      const turn = turns[index];
      const before = state.cobros.length;
      assert.equal(turn.action.asiento, aDecidir(state)[0]);
      const next = aplicarOnline(state, turn.action);
      assert.ok(next.ok);
      state = next.estado;
      assert.deepEqual(state.cobros.slice(before), turn.awards);
      assert.ok(!turn.signal || format === "pairs-senas");
      // A second consumer, with the public transcript alone, can reconstruct the score.
      for (const award of turn.awards) score[award.equipo] = Math.min(40, score[award.equipo] + award.tantos);
    }
    assert.deepEqual(score, referee.endScore);
    assert.equal(state.resultado?.motivo, "envido");
  });
}
