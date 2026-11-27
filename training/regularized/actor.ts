import { esCardId } from "@eltruco/motor/cartas.ts";
import type { ActionId, Policy, SeatObservation } from "../contracts/index.ts";
import { bidSlots, encode, type BidSlot } from "./features.ts";
import { decodeNetwork, policy, regularizedKind, type RegularizedArtifact } from "./network.ts";

export { regularizedKind, type RegularizedArtifact };

/**
 * Actor servible por `api/actor-registry.ts`. Recibe la observación ordinaria del asiento (la misma que la arena y la API)
 * y, si el artefacto declara `memory: "opponent"`, los contadores públicos del rival en el chico.
 */
export function openRegularized(artifact: RegularizedArtifact): Policy {
  const net = decodeNetwork(artifact);
  return {
    id: regularizedKind + ":" + artifact.format,
    decide(observation: SeatObservation, legalActions: readonly ActionId[]) {
      if (observation.format !== artifact.format) throw new Error("Formato de observación incompatible.");
      if (!legalActions.length) return [];
      const { x, mask, cards } = encode({ vista: observation.view, score: observation.score, target: observation.target,
        rivalCounts: artifact.memory === "opponent" ? observation.rivalCounts : undefined });
      const p = policy(net, x, mask);
      const out = legalActions.map(action => {
        if (action.includes("/")) throw new Error("El actor regularizado no emite señas.");
        const slot = esCardId(action) ? cards.indexOf(action) : 3 + bidSlots.indexOf(action as BidSlot);
        if (slot < 0 || !mask[slot]) throw new Error("Jugada legal sin ranura: " + action);
        return p[slot];
      });
      const sum = out.reduce((a, b) => a + b, 0);
      return out.map(v => v / sum);
    },
  };
}
