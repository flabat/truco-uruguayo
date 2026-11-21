import { randomInt } from "node:crypto";
import { Worker } from "node:worker_threads";
import { hasSignals, signals, type ActionId, type SeatObservation } from "../training/contracts/index.ts";
import { incumbent } from "../training/seat/index.ts";
export { artifactPin } from "./actor-registry.ts";

export const exampleSignalPin = "fixture-senas-v1";
export const defaultDeadlineMs = 200;
export interface ServingDecision {
  action: ActionId;
  policy: string;
  fallback: string | null;
  latencyMs: number;
}
interface Options { loadArtifact(pin: string): Promise<unknown>; deadlineMs?: number }

function draw(weights: readonly number[], actions: readonly ActionId[], uniform: number) {
  if (weights.length !== actions.length || !weights.length || weights.some(x => !Number.isFinite(x) || x < 0)) throw new Error("probabilities");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error("probabilities");
  let cumulative = 0, last = -1;
  for (const [i, p] of weights.entries()) {
    if (p > 0) last = i;
    cumulative += p;
    if (uniform * sum < cumulative) return actions[i];
  }
  return actions[last];
}

export function createServing(options: Options) {
  const deadlineMs = options.deadlineMs ?? defaultDeadlineMs;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new Error("Plazo de inferencia inválido.");
  let worker: Worker | null = null, sequence = 0, closed = false;
  let startup: Promise<void> | undefined;
  let finishStartup: (()=>void) | undefined;
  const ready = new Set<string>();
  const pending = new Map<number, {resolve: (v: number[]) => void; reject: (e: Error) => void}>();
  function abandon() {
    const previous = worker;
    worker = null; ready.clear();
    finishStartup?.();
    startup = undefined;
    finishStartup = undefined;
    for (const request of pending.values()) request.reject(new Error("restart"));
    pending.clear();
    return previous?.terminate();
  }
  function ensureWorker() {
    if (closed) throw new Error("closed");
    if (worker) return worker;
    const next = new Worker(new URL("./serving-worker.ts", import.meta.url), {env: {}, execArgv: []});
    startup = new Promise<void>(resolve=>{finishStartup = resolve;});
    next.on("message", msg => {
      if (msg.ready) {
        if (worker===next) finishStartup?.();
        return;
      }
      const request = pending.get(msg.id);
      if (!request) return;
      pending.delete(msg.id);
      if (msg.error) request.reject(new Error("incompatible"));
      else request.resolve(msg.probabilities);
    });
    const lost = () => { if (worker === next) void abandon(); };
    next.on("error", lost); next.on("exit", lost);
    worker = next;
    return next;
  }
  async function decide(pin: string, observation: SeatObservation, uniform = randomInt(0x100000000) / 0x100000000): Promise<ServingDecision> {
    const start = performance.now();
    if (!(uniform >= 0 && uniform < 1) || !observation.legalActions.length) throw new RangeError("Decisión sin turno o muestra inválida.");
    let policy = pin, fallback = null, action: ActionId;
    const base = () => draw(incumbent.decide(observation, observation.legalActions), observation.legalActions, uniform);
    if (pin === incumbent.id) action = base();
    else if (pin === exampleSignalPin && hasSignals(observation.format)) {
      action = `${signals[observation.history.length % signals.length]}/${base()}` as ActionId;
      if (!observation.legalActions.includes(action)) throw new Error("Falta la máscara de señas.");
    } else {
      let timer: ReturnType<typeof setTimeout> | undefined, expired = false, posted = false;
      const id = ++sequence;
      const inference = async () => {
        const thread = ensureWorker();
        const load = !ready.has(pin);
        const warming = startup;
        const artifact = load ? await options.loadArtifact(pin) : undefined;
        if (expired || closed || thread !== worker) throw new Error("restart");
        if (load && !artifact) throw new Error("missing");
        await warming;
        if (expired || closed || thread !== worker) throw new Error("restart");
        const weights = await new Promise<number[]>((resolve, reject) => {
          pending.set(id, {resolve, reject}); posted = true;
          thread.postMessage({id, pin, obs: observation, ...(load && {artifact})});
        });
        ready.add(pin);
        return draw(weights, observation.legalActions, uniform);
      };
      try {
        action = await Promise.race([inference(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => { expired = true; reject(new Error("timeout")); }, deadlineMs);
        })]);
        if (performance.now() - start > deadlineMs) throw new Error("timeout");
      } catch (error) {
        const reason = error instanceof Error ? error.message : "";
        fallback = ["missing","timeout","restart","incompatible","probabilities"].includes(reason) ? reason : "unavailable";
        if (fallback === "timeout" && posted && pending.has(id)) void abandon();
        policy = incumbent.id;
        action = base();
      } finally {
        clearTimeout(timer); pending.delete(id);
      }
    }
    return {action, policy, fallback, latencyMs: performance.now() - start};
  }
  return {decide, warm() {ensureWorker(); return startup!;}, async close() { closed = true; await abandon(); }};
}
