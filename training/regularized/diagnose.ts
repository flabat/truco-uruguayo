import { playChico, rng, type Agent, type Mode } from "./env.ts";
import { makeAgent } from "./agents.ts";
/** Puntos por chico y por motivo (truco, envido, flor) de A contra B sobre repartos emparejados. */
const [a, b, pairsArg, modeArg] = process.argv.slice(2);
const mode = (modeArg ?? "duel-prod") as Mode;
const pairs = Number(pairsArg ?? 300);
const A = makeAgent(a, mode), B = makeAgent(b, mode);
const sum = { wins: 0, games: 0, hands: 0, mine: { truco: 0, envido: 0, flor: 0 }, theirs: { truco: 0, envido: 0, flor: 0 } };
for (let p = 0; p < pairs; p++) {
  for (const swap of [false, true]) {
    const agents: Agent[] = swap ? [B, A] : [A, B];
    const me = swap ? 1 : 0;
    const r = playChico(mode, agents, rng(p * 31 + (swap ? 7 : 0)), 40, (p % 2) as 0, rng(p * 977 + 13));
    sum.games++; sum.hands += r.hands; if (r.winner === me) sum.wins++;
    for (const k of ["truco", "envido", "flor"] as const) { sum.mine[k] += r.points[k][me]; sum.theirs[k] += r.points[k][1 - me]; }
  }
}
const per = (x: number) => (x / sum.games).toFixed(2);
console.log(`${a} vs ${b}: ${(100 * sum.wins / sum.games).toFixed(1)} %  manos/chico ${per(sum.hands)}  ` +
  ["truco", "envido", "flor"].map(k => `${k} +${per(sum.mine[k as "truco"])} -${per(sum.theirs[k as "truco"])}`).join("  "));
