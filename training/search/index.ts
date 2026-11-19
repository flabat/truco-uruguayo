import { createHash } from "node:crypto";
import { aDecidir, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import { crearAzar, type Asiento } from "../../src/motor/reparto.ts";
import { sample } from "../arena/index.ts";
import { seatsFor, type ActionId, type Policy, type SeatObservation } from "../contracts/index.ts";
import { commitTurn } from "../signals/index.ts";
import { drawDeal, inferWorld, posterior, seatView, type World } from "./belief.ts";
import { continuation, type Continuation, type Field } from "./continuation.ts";

export interface SearchOptions {
  field: Field;
  table: Continuation;
  worlds: number;
  proposals: number;
  deadlineMs: number;
  // Tolerancia de pérdida por mano privada rival, en probabilidad de ganar el chico.
  duelRisk: number;
}
export interface Diagnostics {
  result: "searched" | "forced" | "timeout" | "no-worlds";
  proposals: number;
  worlds: number;
  zeroLikelihood: boolean;
}
const overBudget = Symbol("timeout");
function winChance(state: EstadoOnline, table: Continuation, seat: Asiento) {
  const score: [number, number] = [...state.puntosInicio];
  for (const award of state.cobros) score[award.equipo] = Math.min(40, score[award.equipo] + award.tantos);
  const next = ((state.mano.reparto.dador + 1) % seatsFor(table.format)) as Asiento;
  const win = continuation(table, score, next);
  return seat % 2 === 0 ? win : 1 - win;
}
function afterAction(world: World, obs: SeatObservation, action: ActionId, options: SearchOptions, seed: number, check: () => void) {
  const { field, table } = options;
  const first = commitTurn(world.state, obs.view.asiento, obs.format, action);
  let state = first.state;
  const history = [...obs.history, first.turn];
  // Al comparar opciones, cada asiento empieza con el mismo flujo de muestreo.
  const streams = Array.from({ length: obs.seats }, (_, s) => crearAzar((seed ^ Math.imul(0x9e3779b9, s + 1)) >>> 0));
  while (!state.resultado) {
    check();
    const seat = aDecidir(state)[0];
    const view = seatView(state, seat, obs.format, history);
    const legal = view.legalActions;
    const p = field(seat).decide(view, legal);
    const chosen = legal[sample(p, legal.length, streams[seat]())];
    const next = commitTurn(state, seat, obs.format, chosen);
    history.push(next.turn);
    state = next.state;
  }
  return winChance(state, table, obs.view.asiento);
}

// Subjuego local restringido: la política rival de continuación está congelada.
// Para cada tenencia rival se estima el valor contrafáctico de la mezcla base.
// Una desviación mezcla menos peso si revela una pérdida excesiva en esa fila.
export function refine(prior: readonly number[], rows: readonly number[][], weights: readonly number[], duelRisk: number | null) {
  const anchor = rows.map(row => row.reduce((v, x, i) => v + x * prior[i], 0));
  let best = [...prior], bestGain = 0;
  for (let a = 0; a < prior.length; a++) {
    let fraction = 1, gain = 0;
    for (let j = 0; j < rows.length; j++) {
      if (weights[j] === 0) continue;
      const change = rows[j][a] - anchor[j];
      if (duelRisk !== null && change < -duelRisk) fraction = Math.min(fraction, duelRisk / -change);
      gain += weights[j] * change;
    }
    if (fraction * gain > bestGain + 1e-10) {
      bestGain = fraction * gain;
      best = prior.map((p, i) => (1 - fraction) * p + (i === a ? fraction : 0));
    }
  }
  return best;
}
export function boundedSearch(options: SearchOptions, report?: (d: Diagnostics) => void, now = performance.now.bind(performance)): Policy {
  const { table, field, worlds, proposals, deadlineMs, duelRisk } = options;
  if (!Number.isSafeInteger(worlds) || worlds < 1 || !Number.isSafeInteger(proposals) || proposals < worlds
      || !Number.isFinite(deadlineMs) || deadlineMs < 0 || !Number.isFinite(duelRisk) || duelRisk < 0 || duelRisk > 1
      || !table.field.every((id, s) => id === field(s as Asiento).id)) throw new RangeError("Configuración de búsqueda inválida.");
  const model = createHash("sha256").update(JSON.stringify([table, worlds, proposals, deadlineMs, duelRisk])).digest("hex");
  return { id: "bounded-search-v1-" + model, decide(obs, legal) {
    if (obs.format !== table.format || legal.length !== obs.legalActions.length || legal.some((a, i) => a !== obs.legalActions[i])) {
      throw new Error("Formato o acciones incompatibles con la búsqueda.");
    }
    const deadline = now() + deadlineMs;
    const check = () => { if (now() >= deadline) throw overBudget; };
    const prior = field(obs.view.asiento).decide(obs, legal);
    const diag: Diagnostics = { result: "forced", worlds: 0, proposals: 0, zeroLikelihood: false };
    if (legal.length < 2) { report?.(diag); return prior; }
    let result = prior;
    try {
      check();
      // La semilla depende exclusivamente de la observación legal del asiento.
      const seed = createHash("sha256").update("search-worlds-v1/" + JSON.stringify(obs)).digest().readUInt32BE();
      const random = crearAzar(seed);
      const compatible: World[] = [];
      while (compatible.length < worlds && diag.proposals < proposals) {
        check();
        diag.proposals++;
        const w = inferWorld(obs, drawDeal(obs, random), field);
        if (w) compatible.push(w);
      }
      diag.worlds = compatible.length;
      if (!compatible.length) {
        diag.result = "no-worlds";
      } else {
        const { probabilities, uniformFallback } = posterior(compatible);
        diag.zeroLikelihood = uniformFallback;
        const rows = compatible.map((w, i) => legal.map(a => {
          check();
          return afterAction(w, obs, a, options, (seed ^ Math.imul(0x85ebca6b, i + 1)) >>> 0, check);
        }));
        const improved = refine(prior, rows, probabilities, obs.format === "duel" ? duelRisk : null);
        check();
        result = improved;
        diag.result = "searched";
      }
    } catch (e) {
      if (e !== overBudget) throw e;
      diag.result = "timeout";
    }
    report?.(diag);
    return result;
  } };
}
