import type { Asiento } from "@eltruco/motor/reparto.ts";
import { playMatch } from "../arena/index.ts";
import { hasSignals, type Policy } from "../contracts/index.ts";
import { incumbent } from "../seat/index.ts";
import { digest, domainSeed, type Actor } from "./policy.ts";
import { seatPolicies } from "./train.ts";

function mask(policy: Policy): Policy {
  return { id: policy.id + "-silencio", decide(obs, legal) {
    const silent = legal.filter(id => !id.includes("/"));
    const history = obs.history.map(({action, awards}) => ({action, awards}));
    const p = policy.decide({ ...obs, history, legalActions: silent }, silent);
    const distribution = new Map(silent.map((key, i) => [key, p[i]]));
    return legal.map(key => distribution.get(key) ?? 0);
  } };
}
export function crossplay(candidate: Actor, reference: Actor, comparator: Actor, seed: number, pairs: number) {
  if (candidate.format !== reference.format || comparator.format !== candidate.format || digest(reference) === digest(candidate)) {
    throw new Error("Se necesita otro actor compatible entrenado por separado.");
  }
  const own = seatPolicies(candidate), other = seatPolicies(reference), mc = seatPolicies(comparator);
  const reports = [];
  for (const partner of ["self", "incumbent", "independent"] as const) {
    for (const opponent of ["incumbent", "monte-carlo", "independent"] as const) {
      for (const gestures of (hasSignals(candidate.format) ? [true, false] : [false])) {
        const outcomes = [];
        for (let pair = 0; pair < pairs; pair++) {
          const scores = [];
          for (const leg of [0, 1] as const) {
            const candidateSeat = (pair * 2 + leg) % 4;
            const match = playMatch({ format: candidate.format, seed: domainSeed(seed, "development-crossplay"),
              pair, leg,
              policies(seat: Asiento) {
                let policy: Policy;
                if (seat === candidateSeat || seat % 2 === leg && partner === "self") policy = own[seat];
                else if (seat % 2 === leg) policy = partner === "incumbent" ? incumbent : other[seat];
                else policy = opponent === "incumbent" ? incumbent : opponent === "monte-carlo" ? mc[seat] : other[seat];
                return hasSignals(candidate.format) && !gestures ? mask(policy) : policy;
              },
            });
            scores.push(Number(match.winner === leg));
          }
          outcomes.push(scores);
        }
        const wins = outcomes.flat().reduce((a,b) => a+b,0);
        reports.push({ partner, opponent, gestures, wins, games: pairs * 2, outcomes });
      }
    }
  }
  const deltas = reports.filter(r => r.gestures).map(r => {
    const ablation = reports.find(s => !s.gestures && r.partner === s.partner && r.opponent === s.opponent)!;
    return { partner: r.partner, opponent: r.opponent, winRateChangeWhenMasked: (ablation.wins - r.wins) / r.games };
  });
  return { purpose: "development", format: candidate.format, seed, pairs, candidate: digest(candidate),
    independentPartner: digest(reference), mc: digest(comparator), reports, deltas };
}
