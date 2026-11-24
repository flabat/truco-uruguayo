import { createHash } from "node:crypto";
import { playMatch, replayMatch, type MatchRecord } from "../arena/index.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import type { Format, Policy } from "../contracts/index.ts";
import type { PairOutcome } from "./statistics.ts";

export type Team = (seat: Asiento) => Policy;
export const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** The referee fixes both sides; actors receive only the ordinary per-seat interface. */
export function runPair(format: Format, seed: number, pair: number, candidate: Team, old: Team, opponent: Team,
  keep: (arm: "candidate" | "incumbent", record: MatchRecord) => void) {
  const result: PairOutcome = {pair, candidate:[0,0], incumbent:[0,0]};
  for (const arm of ["candidate", "incumbent"] as const) {
    const team = arm === "candidate" ? candidate : old;
    for (const leg of [0,1] as const) {
      const record = playMatch({format, seed, pair, leg, policies:seat => (seat % 2 === leg ? team : opponent)(seat)});
      replayMatch(record, seed);
      keep(arm, record);
      result[arm][leg] = Number(record.winner === leg);
    }
  }
  return result;
}
