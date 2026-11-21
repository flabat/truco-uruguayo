import { parentPort } from "node:worker_threads";
import type { SeatObservation, Policy } from "../training/contracts/index.ts";
import { artifactPin, openActor } from "./actor-registry.ts";

const actors = new Map<string, Policy>();
const artifacts = new Map<string, unknown>();
parentPort!.on("message", (request: {id: number; pin: string; artifact?: unknown; obs: SeatObservation}) => {
  try {
    const {id, pin, obs} = request;
    if ("artifact" in request && !artifacts.has(pin)) {
      if (artifactPin(request.artifact) !== pin) throw new Error("hash");
      artifacts.set(pin, request.artifact);
    }
    const key = pin + "-" + obs.format + "-" + obs.view.asiento;
    let actor = actors.get(key);
    if (!actor) {
      actor = openActor(artifacts.get(pin), obs.format, obs.view.asiento);
      actors.set(key, actor);
    }
    const probabilities = actor.decide(obs, obs.legalActions);
    parentPort!.postMessage({id, probabilities});
  } catch {
    parentPort!.postMessage({id: request.id, error: "incompatible"});
  }
});
parentPort!.postMessage({ready:true});
