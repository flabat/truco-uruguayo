import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {openActor} from "../../api/actor-registry.ts";
import {baseline} from "../baselines/index.ts";
import {playMatch} from "../arena/index.ts";
import type {Policy, Format} from "../contracts/index.ts";
import {incumbent} from "../seat/index.ts";
import {type CycleFormat, type AnchoredActor} from "./actor.ts";

type Team = Policy[];
export interface Fixture {id:string; opponent:string; partner:string; silent?:boolean}
export const direct: Fixture = {id:"V1", opponent:incumbent.id, partner:"self"};
export function field(format: CycleFormat): Fixture[] {
  const fixtures: Fixture[] = [direct];
  for (const opponent of ["caller", "strong-cards", "frequent-bluff", "rare-bluff", "folder", "independent"]) {
    fixtures.push({id:opponent, opponent, partner:"self"});
  }
  if (format === "duel") fixtures.push({id:"opening-falta", opponent:"duel-direct-falta-35-v1", partner:"self"});
  else {
    for (const opponent of [incumbent.id, "strong-cards", "independent"])
      fixtures.push({id:opponent + "/unseen-teammate", opponent, partner:"partner"});
    if (format === "pairs-private-senas") fixtures.push({...direct, id:"V1/signals-masked", silent:true});
  }
  return fixtures;
}

// A frozen no-signals actor gets the same legal information as in its original format.
export function silence(policy: Policy, asFormat?: Format): Policy {
  return {id: policy.id, decide(obs, legal) {
    const moves = legal.filter(a => !a.includes("/"));
    const history = obs.history.map(({action, awards}) => ({action, awards}));
    const p = policy.decide({...obs, format:asFormat ?? obs.format, legalActions:moves, history}, moves);
    const weights = new Map(moves.map((a,i) => [a, p[i]]));
    return legal.map(a => weights.get(a) ?? 0);
  }};
}
export function arena(root: string, format: CycleFormat, hashes: Record<string,string>) {
  const frozen = new Map<string, Team>();
  function other(name: string): Team {
    const found = frozen.get(name);
    if (found) return found;
    let team: Team;
    if (hashes[name]) {
      const bytes = readFileSync(join(root, "field", format, name + ".json"));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), hashes[name]);
      const artifact = JSON.parse(bytes.toString());
      const plain = format === "pairs-private-senas";
      assert.equal(artifact.format, plain ? "pairs" : format);
      team = ([0,1,2,3] as const).map(s => {
        const actor = openActor(artifact, artifact.format, s);
        return plain ? silence(actor, "pairs") : actor;
      });
    } else team = Array(4).fill(baseline(name));
    frozen.set(name, team);
    return team;
  }
  const cache = new Map<string, Policy>();
  return function pair(model: AnchoredActor, fixture: Fixture, seed: number, index: number, sample = false) {
    const key = model.bands.join("|");
    let tested = cache.get(key);
    if (!tested) { tested = openActor(model, format, 0); cache.set(key, tested); }
    const opponent = other(fixture.opponent);
    const partner = fixture.partner === "self" ? null : other(fixture.partner);
    let action = "", signalCount = 0;
    const wins = [0, 0] as [number, number];
    for (const leg of [0,1] as const) {
      const game = playMatch({format, seed, pair:index, leg, policies(seat) {
        const isMate = !!partner && Math.floor(seat/2) === index % 2;
        const actor = seat % 2 !== leg ? opponent[seat] : isMate ? partner![seat] : tested!;
        return fixture.silent ? silence(actor) : actor;
      }, onDecision: sample || format === "pairs-private-senas" ? d => {
        if (d.seat % 2 !== leg) return;
        if (d.action.includes("/")) signalCount++;
        if (sample && (!action || d.observation.stakes.side || d.observation.stakes.truco))
          action = "Seat " + (d.seat+1) + " played " + d.action.split("/").at(-1);
      } : undefined});
      wins[leg] = Number(game.winner === leg);
    }
    return {wins, action, signalCount};
  };
}

export function trainingFixtures(format: CycleFormat): Fixture[] {
  const target = format === "duel" ? "caller" : "strong-cards";
  const opponents = [incumbent.id, target, "frequent-bluff", "folder", "rare-bluff", "candidate"];
  const partners = format === "duel" ? ["self"] : ["self", incumbent.id, "strong-cards"];
  return partners.flatMap(partner => opponents.map(opponent => ({id: opponent + "/" + partner, partner, opponent})));
}
