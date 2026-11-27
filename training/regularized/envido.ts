/**
 * Cómo abre y cómo responde el envido cada lado, por franja de tanto propio, sobre repartos emparejados:
 *   node training/regularized/envido.ts <A> <B> [pares] [modo]
 */
import { playChico, rng, seatsOf, type Agent, type Mode } from "./env.ts";
import { makeAgent } from "./agents.ts";
import { tantosPropios } from "@eltruco/motor/cantos-online.ts";

const [a, b, pairsArg, modeArg] = process.argv.slice(2);
const mode = (modeArg ?? "duel-prod") as Mode;
const pairs = Number(pairsArg ?? 100);
const envidos = new Set(["envido", "real-envido", "falta-envido"]);
type Stats = { open: Record<string, number[]>; respond: Record<string, Record<string, number>> };
const stats: Record<string, Stats> = {};
const band = (t: number) => t < 24 ? "<24" : t < 28 ? "24-27" : t < 31 ? "28-30" : "31+";
function wrap(agent: Agent, label: string): Agent {
  stats[label] ??= { open: {}, respond: {} };
  const st = stats[label];
  return { id: agent.id, act(s) {
    const out = agent.act(s);
    const tipo: string = out.action.tipo;
    const tanto = tantosPropios(s.estado, s.seat).total;
    const pend = s.estado.lateral;
    if (pend && envidos.has(pend.tipo) && pend.asiento % 2 !== s.seat % 2) {
      const key = `${pend.tipo} ${band(tanto)}`;
      st.respond[key] ??= {};
      st.respond[key][tipo] = (st.respond[key][tipo] ?? 0) + 1;
    } else if (envidos.has(tipo) && !pend) {
      (st.open[tipo] ??= []).push(tanto);
    }
    return out;
  } };
}
const A = wrap(makeAgent(a, mode), "A"), B = wrap(makeAgent(b, mode), "B");
for (let p = 0; p < pairs; p++) for (const swap of [false, true]) {
  const agents = Array.from({ length: seatsOf(mode) }, (_, i) => (i % 2 === 0) !== swap ? A : B);
  playChico(mode, agents, rng(p * 31 + (swap ? 7 : 0)), mode === "tercetos" ? 50 : 40, (p % 2) as 0, rng(p * 977 + 13));
}
for (const [label, st] of Object.entries(stats)) {
  console.log(`== ${label} = ${label === "A" ? a : b}`.replace(/\S*\//g, ""));
  for (const [t, xs] of Object.entries(st.open)) {
    const bands: Record<string, number> = {};
    for (const x of xs) bands[band(x)] = (bands[band(x)] ?? 0) + 1;
    console.log(`  abre ${t}: ${xs.length}  por tanto ${JSON.stringify(bands)}`);
  }
  for (const k of Object.keys(st.respond).sort()) {
    const r = st.respond[k]; const n = Object.values(r).reduce((x, y) => x + y, 0);
    console.log(`  responde a ${k}: n=${n}  ` + Object.entries(r).map(([t, c]) => `${t} ${(100 * c / n).toFixed(0)}%`).join("  "));
  }
}
