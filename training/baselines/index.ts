import { esCardId, type CardId } from "@eltruco/motor/cartas.ts";
import { compararCartas } from "@eltruco/motor/jerarquia.ts";
import { challenger, incumbent } from "../seat/index.ts";
import type { ActionId, Policy } from "../contracts/index.ts";

export const styles = ["caller", "folder", "frequent-bluff", "rare-bluff", "strong-cards"] as const;
export type Style = typeof styles[number];

function choose(id: ActionId, legal: readonly ActionId[]) {
  if (!legal.includes(id)) throw new Error("El adversario eligió una jugada ilegal.");
  return legal.map(action => Number(action === id));
}

export function baseline(id: string): Policy {
  if (id === incumbent.id) return incumbent;
  if (id === challenger.id) return challenger;
  if (!styles.includes(id as Style)) throw new Error("Adversario desconocido: " + id);
  return { id, decide(observation, legal) {
    const usual = incumbent.decide(observation, legal);
    if (!legal.length) return usual;
    if (id === "caller" && legal.includes("quiero")) return choose("quiero", legal);
    if (id === "folder" && legal.includes("no-quiero")) return choose("no-quiero", legal);
    const { view } = observation;
    if ((id === "frequent-bluff" || id === "rare-bluff") && !view.acciones.length
        && legal.includes("falta-envido") && view.tantosPropios.total < 35) {
      const chance = id === "frequent-bluff" ? 0.65 : 0.08;
      return usual.map((p, i) => (1 - chance) * p + Number(legal[i] === "falta-envido") * chance);
    }
    if (id === "strong-cards") {
      const cards = legal.filter((action): action is CardId => esCardId(action));
      if (cards.length) {
        const best = cards.reduce((a, b) => compararCartas(a, b, view.muestra) >= 0 ? a : b);
        return choose(best, legal);
      }
    }
    return usual;
  }};
}
