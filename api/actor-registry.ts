import {createHash} from "node:crypto";
import type { Asiento } from "../src/motor/reparto.ts";
import type { Format, Policy } from "../training/contracts/index.ts";
import { asDuelActor, type DuelExport } from "../training/duel/actor.ts";
import { loadPartnerPolicy, type Actor } from "../training/partners/policy.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
  throw new TypeError("El actor debe ser JSON finito.");
}

export const artifactPin = (artifact: unknown) => createHash("sha256").update(canonical(artifact)).digest("hex");
export function openActor(artifact: unknown, format: Format, seat: Asiento): Policy {
  if (!artifact || typeof artifact !== "object" || !("format" in artifact) || artifact.format !== format) {
    throw new TypeError("Formato de actor incompatible.");
  }
  return format === "duel" ? asDuelActor(artifact as DuelExport) : loadPartnerPolicy(artifact as Actor, seat);
}
