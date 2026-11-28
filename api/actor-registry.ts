import {teamTransferKind, openTeamTransfer, type TeamTransferActor} from "../training/selfplay/team-transfer.ts";
import {teamMixtureKind, openTeamMixture, type TeamMixtureActor} from "../training/selfplay/team-mixture.ts";
import {isSelfplayKind, openSelfplay, type SelfplayActor} from "../training/selfplay/learner.ts";
import {kind, openAnchored, type AnchoredActor} from "../training/anchored/actor.ts";
import {openRegularized, regularizedKind, type RegularizedArtifact} from "../training/regularized/actor.ts";
import {createHash} from "node:crypto";
import type { Asiento } from "@eltruco/motor/reparto.ts";
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
  if ("kind" in artifact && artifact.kind === teamTransferKind) return openTeamTransfer(artifact as TeamTransferActor);
  if ("kind" in artifact && artifact.kind === teamMixtureKind) return openTeamMixture(artifact as TeamMixtureActor);
  if ("kind" in artifact && isSelfplayKind(artifact.kind)) return openSelfplay(artifact as SelfplayActor);
  if ("kind" in artifact && artifact.kind === kind) return openAnchored(artifact as AnchoredActor);
  if ("kind" in artifact && artifact.kind === regularizedKind) return openRegularized(artifact as RegularizedArtifact);
  return format === "duel" ? asDuelActor(artifact as DuelExport) : loadPartnerPolicy(artifact as Actor, seat);
}
