import assert from "node:assert/strict";
import test from "node:test";
import { iniciarOnline } from "@eltruco/motor/mesa-online.ts";
import type { Asiento, RepartoOnline } from "@eltruco/motor/reparto.ts";
import { partnerAction, partnerVariants } from "../../training/anchored/partners.ts";
import { playMatch, replayMatch } from "../../training/arena/index.ts";
import { publicReplay } from "../../training/arena/runs.ts";
import type { ActionId, Move, PublicTurn, Score } from "../../training/contracts/index.ts";
import { header, loadPartnerPolicy, monteCarloId } from "../../training/partners/policy.ts";
import type { Partnership } from "../../training/partners/policy.ts";
import { incumbent, observe } from "../../training/seat/index.ts";
import { commitTurn, signalRules } from "../../training/signals/index.ts";

const deal: RepartoOnline = {
  versionReparto: "online-1", muestra: "copas-04", mano: 0, dador: 3,
  manos: [
    ["oros-05", "copas-12", "bastos-03"],
    ["bastos-04", "espadas-07", "oros-01"],
    ["oros-02", "espadas-05", "bastos-01"],
    ["copas-02", "espadas-12", "oros-06"],
  ],
};
function view(format: Partnership, seat: Asiento, script: [Asiento, ActionId][] = [],
    score: Score = [0, 0], distribution = deal) {
  let state = iniciarOnline(distribution, score);
  const history: PublicTurn[] = [];
  for (const [actor, action] of script) {
    const turn = commitTurn(state, actor, format, action);
    history.push(turn.turn);
    state = turn.state;
  }
  const obs = observe(state, seat, format, history);
  return format === "pairs" ? obs : { ...obs, legalActions: signalRules.legalActions(obs.legalActions as Move[]) };
}
function variant(format: Partnership, id: string) {
  const value = partnerVariants(format).find(v => v.id === id);
  assert.ok(value);
  return value;
}

for (const format of ["pairs", "pairs-private-senas"] as const) {
  test(format + " arranca en V1 y decide igual con cartas rivales indistinguibles", () => {
    const variants = partnerVariants(format);
    assert.equal(variants[0].id, "v1");
    assert.equal(new Set(variants.map(v => v.id)).size, variants.length);
    const obs = view(format, 0);
    const [a, b, c, d] = deal.manos;
    const other = view(format, 0, [], [0, 0], { ...deal, manos: [a, d, c, b] });
    const base = obs.legalActions[incumbent.decide(obs, obs.legalActions).indexOf(1)];
    assert.equal(partnerAction(obs, base, variants[0]), base);
    for (const v of variants) {
      const action = partnerAction(obs, base, v);
      assert.ok(obs.legalActions.includes(action));
      assert.equal(action, partnerAction(other, base, JSON.parse(JSON.stringify(v))));
    }
  });
}

test("el tercero puede cubrir al compañero antes de que cierre el rival", () => {
  const obs = view("pairs", 2, [[0, "oros-05"], [1, "bastos-04"]]);
  assert.equal(partnerAction(obs, "espadas-05", variant("pairs", "v1")), "espadas-05");
  assert.equal(partnerAction(obs, "espadas-05", variant("pairs", "cover")), "bastos-01");
});

test("el tanteador evita entregar un chico por un rechazo de truco", () => {
  const script: [Asiento, ActionId][] = [[0, "truco"]];
  const start = view("pairs", 1, script);
  const final = view("pairs", 1, script, [39, 23]);
  const stakes = variant("pairs", "v1-stakes");
  assert.equal(partnerAction(start, "no-quiero", stakes), "no-quiero");
  assert.equal(partnerAction(final, "no-quiero", stakes), "quiero");
});

test("un gesto describe una carta que aún puede jugarse y la máscara conserva el silencio", () => {
  const obs = view("pairs-private-senas", 0);
  const policy = variant("pairs-private-senas", "v1-signals");
  // El rey sustituye al cuatro que salió de muestra. La señal es de equipo y
  // acompaña a la carta baja; después de tirar el rey ya no se promete el cuatro.
  assert.equal(partnerAction(obs, "oros-05", policy), "beso/oros-05");
  assert.equal(partnerAction(obs, "copas-12", policy), "copas-12");
  const silent = obs.legalActions.filter(move => !move.includes("/"));
  assert.equal(partnerAction({ ...obs, legalActions: silent }, "oros-05", policy), "oros-05");
  assert.equal(partnerAction(view("pairs", 0), "oros-05", policy), "oros-05");
});

test("se puede dejar pasar al pie usando su gesto, jamás el gesto de un rival", () => {
  const policy = variant("pairs-private-senas", "v1-signals");
  const before: [Asiento, ActionId][] = [[0, "envido"], [1, "quiero"], [2, "paso-flor"]];
  const revealed = view("pairs-private-senas", 1, [...before, [3, "cejas/paso-flor"], [0, "oros-05"]]);
  const rival = view("pairs-private-senas", 1, [...before, [3, "paso-flor"], [0, "cejas/oros-05"]]);
  assert.equal(signalRules.decode(partnerAction(revealed, "oros-01", policy)).move, "bastos-04");
  assert.equal(signalRules.decode(partnerAction(rival, "oros-01", policy)).move, "oros-01");
});

test("el historial completo de los rivales es idéntico con seña, otra seña y silencio", () => {
  for (const sender of [0, 1, 2, 3] as const) {
    const rotated = { ...deal, mano: sender, dador: (sender + 3) % 4 as Asiento };
    for (const observer of [0, 1, 2, 3] as const) {
      const projected = (action: ActionId) => view("pairs-private-senas", observer, [[sender, action]], [0, 0], rotated);
      const a = projected("cejas/envido"), b = projected("beso/envido"), silent = projected("envido");
      if (sender % 2 === observer % 2) {
        assert.equal(a.history[0].signal, "cejas");
        assert.equal(b.history[0].signal, "beso");
      } else {
        assert.deepEqual(a, silent);
        assert.deepEqual(b, silent);
        assert.equal(Object.hasOwn(a.history[0], "signal"), false);
      }
    }
  }
});

test("el árbitro reproduce señas de equipo y su replay público solo contiene jugadas y cobros", () => {
  const format = "pairs-private-senas";
  const match = playMatch({ format, seed: 166, pair: 0, leg: 1, policies: () => ({
    id: "prueba-privada", decide(obs, legal) {
      for (const turn of obs.history) {
        assert.equal(!!turn.signal, turn.action.asiento % 2 === obs.view.asiento % 2);
      }
      const base = legal[incumbent.decide(obs, legal).indexOf(1)];
      return legal.map(id => Number(id === "cejas/" + base));
    },
  }) });
  assert.ok(match.hands.every(h => h.turns.every(t => t.signal === "cejas")));
  assert.deepEqual(replayMatch(match, 166), match.score);
  const published = publicReplay(match);
  assert.ok(published.hands.every(h => h.turns.every(t => !Object.hasOwn(t, "signal"))));
  assert.equal(JSON.stringify(published).includes("cejas"), false);
  assert.deepEqual(published.hands.map(h => h.turns.length), match.hands.map(h => h.turns.length));
});

test("un actor de señas históricas no acepta la cabecera o la observación del nuevo juego", () => {
  const old = { ...header("pairs-senas"), kind: monteCarloId, seats: [{}, {}, {}, {}] } as const;
  assert.throws(() => loadPartnerPolicy({ ...old, seats: [...old.seats], format: "pairs-private-senas" }, 0));
  const policy = loadPartnerPolicy({ ...old, seats: [...old.seats] }, 0);
  const obs = view("pairs-private-senas", 0);
  assert.throws(() => policy.decide(obs, obs.legalActions));
});
