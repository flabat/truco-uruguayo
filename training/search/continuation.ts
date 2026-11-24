import type { Asiento } from "@eltruco/motor/reparto.ts";
import { playMatch } from "../arena/index.ts";
import { seatsFor, type Format, type Policy, type Score } from "../contracts/index.ts";

export type Field = (seat: Asiento) => Policy;
interface Count { wins: number; hands: number }
export interface Continuation {
  schema: "score-continuation-v1";
  format: Format;
  field: readonly string[];
  seed: number;
  matches: number;
  exact: Record<string, Count>;
  bands: Record<string, Count>;
}
const exactKey = (s: Score, d: number) => [s[0], s[1], d].join("/");
const bandKey = (s: Score, d: number) => [Math.floor(s[0] / 8), Math.floor(s[1] / 8), d].join("/");
function record(rows: Record<string, Count>, key: string, win: boolean) {
  const cell = rows[key] ??= { wins: 0, hands: 0 };
  cell.hands++;
  cell.wins += Number(win);
}

export function fitContinuation(format: Format, field: Field, seed: number, matches: number): Continuation {
  if (!Number.isSafeInteger(matches) || matches < 1) throw new RangeError("Se requiere al menos un chico.");
  const table: Continuation = { schema: "score-continuation-v1", format, seed, matches,
    field: Array.from({ length: seatsFor(format) }, (_, i) => field(i as Asiento).id), exact: {}, bands: {} };
  for (let pair = 0; pair < matches; pair++) {
    const recordMatch = playMatch({ format, policies: field, seed, pair, leg: 0 });
    for (const h of recordMatch.hands) {
      record(table.exact, exactKey(h.startScore, h.deal.dador), recordMatch.winner === 0);
      record(table.bands, bandKey(h.startScore, h.deal.dador), recordMatch.winner === 0);
    }
  }
  return table;
}

export function continuation(table: Continuation, score: Score, nextDealer: Asiento) {
  if (!score.every(x => Number.isSafeInteger(x) && x >= 0 && x <= 40) || score.every(x => x === 40)
      || nextDealer < 0 || nextDealer >= seatsFor(table.format)) throw new RangeError("Estado de continuación inválido.");
  if (score[0] === 40) return 1;
  if (score[1] === 40) return 0;
  const prior = (40 - score[1]) / (80 - score[0] - score[1]);
  const band = table.bands[bandKey(score, nextDealer)];
  const exact = table.exact[exactKey(score, nextDealer)];
  // La banda sin la celda exacta evita contar dos veces sus mismos resultados.
  const bandWins = (band?.wins ?? 0) - (exact?.wins ?? 0);
  const bandHands = (band?.hands ?? 0) - (exact?.hands ?? 0);
  const coarse = (bandWins + 4 * prior) / (bandHands + 4);
  return ((exact?.wins ?? 0) + 4 * coarse) / ((exact?.hands ?? 0) + 4);
}

export function calibrate(table: Continuation, field: Field, seed: number, matches: number) {
  if (seed === table.seed || !Number.isSafeInteger(matches) || matches < 1) throw new Error("Use una muestra de validación independiente.");
  if (!table.field.every((id, seat) => field(seat as Asiento).id === id)) throw new Error("El campo congelado cambió.");
  const bands = Array.from({ length: 3 }, () => ({ hands: 0, observed: 0, predicted: 0, brier: 0 }));
  for (let pair = 0; pair < matches; pair++) {
    const match = playMatch({ format: table.format, policies: field, seed, pair, leg: 0 });
    const win = Number(match.winner === 0);
    for (const h of match.hands) {
      const b = bands[Math.floor(Math.max(...h.startScore) / 14)];
      const p = continuation(table, h.startScore, h.deal.dador);
      b.hands++; b.observed += win; b.predicted += p; b.brier += (p - win) ** 2;
    }
  }
  return bands.map((b, i) => ({ leaderFrom: i * 14, hands: b.hands, observed: b.hands ? b.observed / b.hands : null,
    predicted: b.hands ? b.predicted / b.hands : null, brier: b.hands ? b.brier / b.hands : null }));
}
