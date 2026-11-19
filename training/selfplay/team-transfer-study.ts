import assert from "node:assert/strict";
import {appendFileSync, existsSync, mkdirSync} from "node:fs";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {artifactPin, openActor} from "../../api/actor-registry.ts";
import {read, save} from "../anchored/io.ts";
import {playMatch} from "../arena/index.ts";
import {baseline} from "../baselines/index.ts";
import type {Policy} from "../contracts/index.ts";
import {incumbent} from "../seat/index.ts";
import type {TeamFormat} from "./team-mixture.ts";
import {silentTransfer, type TeamTransferActor} from "./team-transfer.ts";

const arms = ["transfer", "native", "anchor", "finalist"] as const;
const fixtures = ["strong-cards", "champion", "finalist", "V1", "caller", "strong-cards/V1-teammate", "native"] as const;
type Arm = typeof arms[number];
const score = (mask:number) => ((mask & 1) + (mask >> 1)) / 2;
function interval(xs:number[], z:number) {
  const mean = xs.reduce((sum,x) => sum + x, 0) / xs.length;
  const radius = z * Math.sqrt(xs.reduce((sum,x) => sum + (x-mean)**2, 0) / (xs.length * (xs.length-1)));
  return {mean, lower:mean-radius, upper:mean+radius};
}

/** Run from the preregistered directory containing protocol.json and both opposite-format transfer.json files. */
export function runTransferStudy(area:string, format:TeamFormat) {
  const protocol = read(join(area, "protocol.json"));
  assert.equal(protocol.computerOnly, true);
  assert.equal(protocol.rules, "senas-equipo-v1");
  assert.deepEqual(protocol.fixtures, fixtures);
  assert.deepEqual(protocol.controls, arms.slice(1));
  const formats = ["pairs", "pairs-private-senas"] as const;
  assert.ok(formats.includes(format));
  const opposite = formats.find(f => f !== format)!;
  const seeds = formats.flatMap(f => [protocol.seeds[f].train, protocol.seeds[f].dev]);
  assert.ok(seeds.every(n => Number.isSafeInteger(n) && n >= 0) && new Set(seeds).size === seeds.length);
  const load = (f:TeamFormat):TeamTransferActor => {
    const model = read(join(area, f, "transfer.json"));
    assert.equal(model.format, f);
    assert.equal(artifactPin(model), protocol.pins[f]);
    assert.equal(artifactPin(model.source), protocol.inputs[model.source.format]);
    assert.deepEqual(model, silentTransfer(model.source), "Regeneration from frozen source must reproduce the artifact");
    return model;
  };
  const transfer = load(format), native = load(opposite).source;
  const candidates = {
    transfer:openActor(transfer, format, 0), native:openActor(native, format, 0),
    anchor:openActor(native.anchor, format, 0), finalist:openActor(native.finalist, format, 0),
  };
  const opponents:Record<string,Policy> = {
    champion:candidates.anchor, finalist:candidates.finalist, native:candidates.native,
    V1:incumbent, caller:baseline("caller"), "strong-cards":baseline("strong-cards"),
  };
  const signature = artifactPin(protocol);
  const dir = join(area, format);
  const results = [];
  for (const stage of ["train", "dev"] as const) {
    const n = protocol.pairs[stage], seed = protocol.seeds[format][stage];
    assert.ok(Number.isSafeInteger(n) && n >= 2);
    const receiptDir = join(dir, stage);
    mkdirSync(receiptDir, {recursive:true});
    const stageResults = [];
    for (const fixture of fixtures) {
      const [name, guest] = fixture.split("/");
      const opponent = opponents[name];
      const receipt = join(receiptDir, fixture.replace("/", "-")+".json");
      let outcomes:Record<Arm, number[]>;
      if (existsSync(receipt)) {
        const saved = read(receipt);
        assert.equal(saved.signature, signature);
        assert.equal(saved.format, format); assert.equal(saved.fixture, fixture); assert.equal(saved.stage, stage);
        assert.ok(arms.every(a => saved.outcomes[a]?.length===n && saved.outcomes[a].every((m:number) => Number.isInteger(m) && m>=0 && m<=3)));
        assert.equal(saved.transferSignals, 0);
        outcomes = saved.outcomes;
      } else {
        outcomes = {transfer:[], native:[], anchor:[], finalist:[]};
        let transferSignals = 0;
        for (const arm of arms) {
          for (let pair=0; pair<n; pair++) {
            let mask = 0;
            for (const leg of [0,1] as const) {
              const isGuest = (s:number) => Boolean(guest) && Math.floor(s/2) === pair%2;
              const game = playMatch({format, seed, pair, leg, policies: seat =>
                seat%2!==leg ? opponent : isGuest(seat) ? incumbent : candidates[arm]});
              if (game.winner===leg) mask |= 1 << leg;
              if (arm==="transfer") {
                for (const hand of game.hands) for (const {signal,action} of hand.turns) {
                  if (signal && action.asiento%2===leg && !isGuest(action.asiento)) transferSignals++;
                }
              }
            }
            outcomes[arm].push(mask);
          }
        }
        assert.equal(transferSignals, 0, "The transferred actor must stay silent in both formats");
        save(receipt, {signature, format, stage, fixture, seed, outcomes, transferSignals});
        appendFileSync(join(area, "progress.jsonl"), JSON.stringify({ts:new Date().toISOString(), format, stage, fixture, games:n*arms.length*2})+"\n");
      }
      const rates = Object.fromEntries(arms.map(a => [a, interval(outcomes[a].map(score), 1.96)]));
      const level = fixture==="strong-cards" ? 0.975 : 0.95;
      const deltas = Object.fromEntries(arms.slice(1).map(a => [a, interval(outcomes.transfer.map((x,i) =>
        score(x)-score(outcomes[a][i])), level===0.975 ? 2.241403 : 1.96)]));
      stageResults.push({fixture, rates, pairedDifferences:deltas, pairedConfidence:level});
    }
    const strong = stageResults.find(r => r.fixture==="strong-cards")!;
    const head = stageResults.find(r => r.fixture==="champion")!;
    const targeted = strong.pairedDifferences.native.lower>0 && strong.pairedDifferences.anchor.lower>0 && head.rates.transfer.lower>0.5;
    const summary = {format, stage, seed, signature, pin:protocol.pins[format], pairs:n, games:n*arms.length*2*fixtures.length,
      fixtures:stageResults, meetsResearchThreshold:targeted};
    save(join(dir,stage+".json"), summary);
    results.push(summary);
  }
  return results;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [area, format] = process.argv.slice(2);
  if (!area || !format) throw Error("team-transfer-study AREA DESTINATION_FORMAT");
  const result = runTransferStudy(resolve(area), format as TeamFormat);
  console.log(JSON.stringify(result.map(({format,stage,games,meetsResearchThreshold}) => ({format,stage,games,meetsResearchThreshold}))));
}
