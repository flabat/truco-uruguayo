import type {ActionId, Policy, SeatObservation} from "../contracts/index.ts";
import {incumbent} from "../seat/index.ts";
import {duelAction, duelVariants} from "./duel.ts";
import {partnerAction, partnerVariants} from "./partners.ts";

export const cycleFormats = ["duel", "pairs", "pairs-private-senas"] as const;
export type CycleFormat = typeof cycleFormats[number];
export const kind = "v1-anchored-score-bands-v1";
export interface AnchoredActor {
  kind: typeof kind;
  format: CycleFormat;
  // Early, middle and endgame, measured by the team closest to 40.
  bands: [string, string, string];
}
export function variants(format: CycleFormat): string[] {
  return (format === "duel" ? duelVariants() : partnerVariants(format)).map(v => v.id);
}
export function initial(format: CycleFormat): AnchoredActor {
  return {kind, format, bands: ["v1", "v1", "v1"]};
}
export function openAnchored(actor: AnchoredActor): Policy {
  if (actor.kind !== kind || !Array.isArray(actor.bands) || actor.bands.length !== 3)
    throw new Error("Invalid anchored policy");
  if (!cycleFormats.includes(actor.format)) throw new Error("Unknown anchored format");
  type Adjust = (obs: SeatObservation, base: ActionId) => ActionId;
  const settings = actor.bands.map((id): Adjust => {
    if (actor.format === "duel") {
      const variant = duelVariants().find(v => v.id === id);
      if (!variant) throw new Error("Unknown duel adjustment: " + id);
      return (obs, base) => duelAction(obs, base, variant);
    }
    const variant = partnerVariants(actor.format).find(v => v.id === id);
    if (!variant) throw new Error("Unknown partner adjustment: " + id);
    return (obs, base) => partnerAction(obs, base, variant);
  });
  return {id: [actor.kind, actor.format, ...actor.bands].join(":"), decide(obs, legal) {
    if (obs.format !== actor.format) throw new Error("Wrong observation format");
    const base = incumbent.decide(obs, legal);
    const leading = Math.max(...obs.score);
    const band = leading < 15 ? 0 : leading < 30 ? 1 : 2;
    if (!legal.length || actor.bands[band] === "v1") return base;
    const action = settings[band](obs, legal[base.indexOf(1)]);
    const index = legal.indexOf(action);
    if (index < 0) throw new Error("Illegal policy adjustment");
    return legal.map((_, i) => Number(i === index));
  }};
}
