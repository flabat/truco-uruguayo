import { esCardId } from "@eltruco/motor/cartas.ts";
import type { AccionOnline, VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { IndicacionPie, VistaPie } from "@eltruco/motor/senas-pie.ts";
import type { ActionId, Policy, SeatObservation } from "../contracts/index.ts";
import { actionOf, bidSlots, encode, type BidSlot } from "./features.ts";
import { decodeNetwork, policy, regularizedKind, sampleSlot, type RegularizedArtifact } from "./network.ts";

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

/**
 * Decisión al pie (parejas o tercetos) con la vista del asiento, sus señas y las palabras de la mano, igual que el bot
 * clásico en `bot-pendiente.ts`. Las indicaciones del pie siguen la regla clásica (`elegirIndicacionesPie`).
 */
export function openRegularizedPie(artifact: RegularizedArtifact) {
  if (artifact.format !== "pairs-private-senas" && artifact.format !== "triples") throw new TypeError("El actor no es al pie.");
  const net = decodeNetwork(artifact);
  return (vista: VistaOnline, pie: VistaPie | undefined, indicaciones: readonly IndicacionPie[],
      score: readonly [number, number], target: number, uniform: number): AccionOnline | null => {
    if (!vista.legales.length) return null;
    const { x, mask, cards } = encode({ vista, score, target, pie: { vista: pie, indicaciones } });
    return actionOf(sampleSlot(policy(net, x, mask), uniform), cards, vista.asiento);
  };
}
