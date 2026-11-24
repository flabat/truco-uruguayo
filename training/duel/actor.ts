import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { esCardId, mazo, paloDe, pieza, rangoDe } from "@eltruco/motor/cartas.ts";
import { compararCartas } from "@eltruco/motor/jerarquia.ts";
import { versions, type ActionId, type Policy, type SeatObservation } from "../contracts/index.ts";
import { incumbent } from "../seat/index.ts";
import { normalized } from "./math.ts";

const bids = ["truco", "retruco", "vale-cuatro", "envido", "real-envido", "falta-envido", "flor",
  "con-flor-envido", "contraflor-al-resto", "quiero", "no-quiero", "paso-flor"];
export const width = bids.length + 3;
export const duelSchema = "duel-external-local-v1";
export interface DuelExport {
  schema: typeof duelSchema;
  actor: typeof versions.actor;
  observation: typeof versions.observation;
  actions: typeof versions.actions;
  rules: typeof versions.rules;
  format: "duel";
  buckets: number;
  id: string;
  average: Record<string, number[]>;
}

// FNV-1a agrupa observaciones; las cartas conservan su orden relativo de fuerza.
// La capacidad fija limita la memoria y puede producir colisiones intencionales.
export function coordinates(observation: SeatObservation, legal: readonly ActionId[], buckets: number) {
  const { view } = observation;
  const cards = [...view.cartas].sort((a, b) => compararCartas(a, b, view.muestra) || mazo.indexOf(a) - mazo.indexOf(b));
  const slots = legal.map(id => {
    const idx = esCardId(id) ? bids.length + cards.indexOf(id) : bids.indexOf(id === "con-flor-quiero" ? "quiero" : id);
    if (idx < 0 || (esCardId(id) && !cards.includes(id))) throw new TypeError("Acción ajena al actor de duelo.");
    return idx;
  });
  const relative = (seat: number) => (seat + 2 - view.asiento) % 2;
  const suit = paloDe(view.muestra);
  const strength = (card: typeof view.muestra) => compararCartas(card, "oros-03", view.muestra);
  const hand = [...observation.originalCards].sort().map(c => [strength(c), paloDe(c), pieza(c, view.muestra)]);
  const history = observation.history.map(({ action: a, awards }) => [
    relative(a.asiento), a.tipo === "carta" ? [strength(a.carta), paloDe(a.carta)] : a.tipo,
    awards.map(c => [c.motivo, relative(c.equipo), c.tantos, c.asiento == null ? null : relative(c.asiento), c.tantoGanador]),
  ]);
  const info = JSON.stringify([relative(view.mano), observation.startScore[view.asiento], observation.startScore[1 - view.asiento],
    observation.score[view.asiento], observation.score[1 - view.asiento], suit, rangoDe(view.muestra),
    hand, view.tantosPropios.total, history, observation.stakes, [...slots].sort((a, b) => a - b)]);
  let hash = 2166136261;
  for (let i = 0; i < info.length; i++) hash = Math.imul(hash ^ info.charCodeAt(i), 16777619);
  return { bucket: String((hash >>> 0) % buckets), slots };
}

export function duelActorId(buckets: number, average: DuelExport["average"]) {
  return "duel-" + createHash("sha256").update(JSON.stringify([buckets, average])).digest("hex");
}

export function asDuelActor(artifact: DuelExport): Policy {
  if (artifact.schema !== duelSchema || artifact.format !== "duel" || artifact.actor !== versions.actor
      || artifact.rules !== versions.rules || artifact.observation !== versions.observation || artifact.actions !== versions.actions
      || !Number.isSafeInteger(artifact.buckets) || artifact.buckets < 1 || !artifact.id
      || !artifact.average || typeof artifact.average !== "object" || Array.isArray(artifact.average)) {
    throw new TypeError("Exportación de duelo incompatible.");
  }
  for (const [key, row] of Object.entries(artifact.average)) {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= artifact.buckets || !Array.isArray(row) || row.length !== width
        || !row.every(v => Number.isFinite(v) && v >= 0)) throw new Error("Fila de actor inválida.");
  }
  if (artifact.id !== duelActorId(artifact.buckets, artifact.average)) throw new Error("La identidad del actor no coincide con sus pesos.");
  return { id: artifact.id, decide(obs, legal) {
    if (obs.format !== "duel") throw new Error("El actor de duelo requiere formato duel.");
    if (!legal.length) return [];
    const { bucket, slots } = coordinates(obs, legal, artifact.buckets);
    const weights = slots.map(i => artifact.average[bucket]?.[i] ?? 0);
    return weights.some(p => p > 0) ? normalized(weights) : incumbent.decide(obs, legal);
  } };
}

export function loadDuelActor(path: string): Policy {
  return asDuelActor(JSON.parse(readFileSync(path, "utf8")));
}
