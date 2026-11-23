export interface PublicMove {asiento: number; tipo: string}

/** Accumulate only publicly played moves from a completed duel hand. */
export function countPublicHand(counts: number[][], hand: readonly PublicMove[]) {
  for (const [index, action] of hand.entries()) {
    const row = counts[action.asiento];
    if (index === 0) {
      row[0]++;
      if (action.tipo === "envido") row[1]++;
      continue;
    }
    const prior = hand[index - 1];
    if (prior.asiento === action.asiento) continue;
    const group = groups.get(prior.tipo);
    if (group === undefined) continue;
    row[group]++;
    if (action.tipo === "no-quiero") row[group + 1]++;
    if (action.tipo === "quiero") row[group + 2]++;
  }
}
const groups = new Map<string,number>([["envido",2],["real-envido",2],["falta-envido",5],
  ["truco",8],["retruco",8],["vale-cuatro",8]]);
