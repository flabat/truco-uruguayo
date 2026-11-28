import { playChico, rng, seatsOf, type Agent, type Mode } from "./env.ts";
import { makeAgent } from "./agents.ts";
/** Puntos por chico y por motivo (truco, envido, flor) del equipo de A contra el de B sobre repartos emparejados. */
const [a, b, pairsArg, modeArg] = process.argv.slice(2);
const mode = (modeArg ?? "duel-prod") as Mode;
const pairs = Number(pairsArg ?? 300);
const A = makeAgent(a, mode), B = makeAgent(b, mode);
const sum = { wins: 0, games: 0, hands: 0, mine: { truco: 0, envido: 0, flor: 0 }, theirs: { truco: 0, envido: 0, flor: 0 } };
for (let p = 0; p < pairs; p++) {
  for (const swap of [false, true]) {
    // Los asientos pares son un equipo y los impares el otro.
    const agents: Agent[] = Array.from({ length: seatsOf(mode) }, (_, i) => (i % 2 === 0) !== swap ? A : B);
    const me = swap ? 1 : 0;
    const r = playChico(mode, agents, rng(p * 31 + (swap ? 7 : 0)), mode === "tercetos" ? 50 : 40, (p % 2) as 0, rng(p * 977 + 13));
    sum.games++; sum.hands += r.hands; if (r.winner === me) sum.wins++;
    for (const k of ["truco", "envido", "flor"] as const) { sum.mine[k] += r.points[k][me]; sum.theirs[k] += r.points[k][1 - me]; }
  }
}
const per = (x: number) => (x / sum.games).toFixed(2);
console.log(`${a} vs ${b}: ${(100 * sum.wins / sum.games).toFixed(1)} %  manos/chico ${per(sum.hands)}  ` +
  ["truco", "envido", "flor"].map(k => `${k} +${per(sum.mine[k as "truco"])} -${per(sum.theirs[k as "truco"])}`).join("  "));
