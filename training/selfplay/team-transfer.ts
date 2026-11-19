import type {ActionId, Move, Policy} from "../contracts/index.ts";
import {openTeamMixture, type TeamFormat, type TeamMixtureActor} from "./team-mixture.ts";

export const teamTransferKind = "team-format-transfer-v1";

export interface TeamTransferActor {
  kind: typeof teamTransferKind;
  format: TeamFormat;
  source: TeamMixtureActor;
}

export function silentTransfer(source: TeamMixtureActor): TeamTransferActor {
  const format = source.format === "pairs" ? "pairs-private-senas" : "pairs";
  const actor = {kind: teamTransferKind, format, source: structuredClone(source)} as const;
  openTeamTransfer(actor);
  return actor;
}

const isSilent = (action: ActionId): action is Move => !action.includes("/");

export function openTeamTransfer(actor: TeamTransferActor): Policy {
  const {format, source} = actor;
  if (actor.kind !== teamTransferKind || !["pairs", "pairs-private-senas"].includes(format)
      || source.format === format) throw Error("Transfer requires opposite partnership formats.");
  const policy = openTeamMixture(source);
  const sourceFormat = source.format;
  return {id: teamTransferKind, decide(obs, legal) {
    if (obs.format !== format || obs.seats !== 4) throw Error("Wrong partnership format for transfer.");
    if (!legal.length) return [];
    const moves = legal.filter(isSilent);
    if (!moves.length) throw Error("The silent format requires at least one ordinary move.");
    // Project a seat observation, never the omniscient state. Every cue, even the
    // acting player's own earlier gesture, disappears before source inference.
    const history = obs.history.map(({action, awards}) => ({action, awards}));
    const observation = {...obs, format: sourceFormat, history, legalActions: moves};
    const probabilities = policy.decide(observation, moves);
    if (moves.length === legal.length) return probabilities;
    let index = 0;
    return legal.map(id => isSilent(id) ? probabilities[index++] : 0);
  }};
}
