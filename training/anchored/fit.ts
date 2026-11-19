import assert from "node:assert/strict";
import {artifactPin} from "../../api/actor-registry.ts";
import {type PairOutcome, summarize} from "../eval/statistics.ts";
import {initial, type AnchoredActor, type CycleFormat, variants} from "./actor.ts";
import {arena, direct, field, trainingFixtures} from "./matches.ts";
import {dealSeed, type Log} from "./io.ts";

interface Protocol {
  seed:string; inputs:Record<CycleFormat, Record<string,string>>;
  trainPairs:number[]; devPairs:number; finalPairs:number; maxFitHours:number; plateauRounds:number;
}
export function propose(champion: AnchoredActor) {
  const unique = new Map<string, AnchoredActor>();
  function insert(bands: string[]) {
    unique.set(bands.join("|"), {...champion, bands:bands as AnchoredActor["bands"]});
  }
  insert(champion.bands);
  for (const id of variants(champion.format)) {
    insert([id,id,id]);
    for (let i=0; i<3; i++) insert(champion.bands.map((previous,j) => i===j ? id : previous));
  }
  return [...unique.values()];
}
const average = (xs:number[]) => xs.reduce((a,b)=>a+b,0)/xs.length;
function interval(xs:number[]) {
  const estimate = average(xs);
  const radius = 1.96*Math.sqrt(xs.reduce((sum,x)=>sum+(x-estimate)**2,0)/(xs.length*(xs.length-1)));
  return {estimate, lower:estimate-radius, upper:estimate+radius};
}

export async function fit(root:string, format:CycleFormat, log:Log, protocol:Protocol) {
  const play = arena(root, format, protocol.inputs[format]);
  const fixtures = trainingFixtures(format);
  const empty = initial(format);
  let state = log.load("checkpoint") ?? {round:0, champion:empty, rejected:0, games:0, start:Date.now(), rounds:[]};
  const deadline = state.start + protocol.maxFitHours*3600000;
  for (let r=state.round; r<protocol.trainPairs.length && state.rejected<protocol.plateauRounds && Date.now()<deadline; r++) {
    const proposals = propose(state.champion);
    const pairs = protocol.trainPairs[r];
    const seed = dealSeed(protocol.seed, format, "fit", r);
    const scores: {model:AnchoredActor; wins:number; games:number}[] = log.load("round-" + r + "-proposals") ?? [];
    const first = scores.length;
    for (let k=first; k<proposals.length; k++) {
      if (Date.now()>=deadline) break;
      const model = proposals[k];
      let wins = 0;
      for (let i=0;i<pairs;i++) {
        const fixture = fixtures[(i+r)%fixtures.length];
        const report = play(model, fixture, seed, i, i%64===0 || i===pairs-1);
        wins += report.wins[0]+report.wins[1];
        if (report.action) log.event("fitting", "Round " + (r+1) + " · " + model.bands.join(" / "), {
          opponent:fixture.opponent, partner:format==="duel" ? undefined : fixture.partner,
          completed:2*(k*pairs+i+1), total:2*pairs*proposals.length, unit:"chicos", action:report.action
        });
      }
      scores.push({model,wins,games:2*pairs});
      log.write("round-" + r + "-proposals", scores);
    }
    if (scores.length!==proposals.length) break;
    const best = scores.reduce((a,b)=>b.wins>a.wins?b:a);
    const devSeed = dealSeed(protocol.seed,format,"validation",r);
    const gains:number[]=[], directWins:number[]=[];
    for (let i=0;i<protocol.devPairs;i++) {
      const fixture = fixtures[(i+r)%fixtures.length];
      const trial = play(best.model,fixture,devSeed,i);
      const old = play(state.champion,fixture,devSeed,i);
      gains.push(average(trial.wins)-average(old.wins));
      const head = play(best.model,direct,devSeed,i,(i+1)%64===0);
      directWins.push(average(head.wins));
      if (head.action) log.event("validation","Validating fitted proposal on fresh deals.",{
        opponent:direct.opponent, partner:format==="duel"?undefined:"self", action:head.action, completed:i+1,
        total:protocol.devPairs, unit:"deal pairs", metrics:{round:r+1}
      });
    }
    const gain = interval(gains), directWinRate=average(directWins);
    const accepted = gain.lower>0 && directWinRate>=0.48;
    const round = {round:r+1, proposed:best.model.bands, gain, directWinRate, accepted,
      fitPairsPerProposal:pairs, proposals:scores.length, devPairs:protocol.devPairs};
    state = {...state, round:r+1, rejected:accepted?0:state.rejected+1, champion:accepted?best.model:state.champion,
      games:state.games+scores.length*pairs*2+6*protocol.devPairs, rounds:[...state.rounds,round]};
    log.write("checkpoint",state);
    log.event("selection",accepted?"Accepted the proposal after independent development deals.":"Retained the previous candidate after development checks.", {
      metrics:{round:r+1, deltaPP:Math.round(gain.estimate*10000)/100, directWinPercent:100*directWinRate},
      games:state.games
    });
  }
  const model:AnchoredActor = state.champion;
  const pin = artifactPin(model), seed = dealSeed(protocol.seed,format,"final");
  log.write("candidate",model);
  const fixturesFinal = field(format), n=protocol.finalPairs;
  const families = [];
  let emitted=0;
  for (const [index,fixture] of fixturesFinal.entries()) {
    const name = "final-family-" + index;
    const saved = log.load(name);
    if (saved) {
      assert(saved.pin===pin && saved.seed===seed && saved.family===fixture.id && saved.rows.length===n);
      families.push({id:fixture.id, pairs:saved.rows as PairOutcome[]}); emitted+=saved.signals;
      continue;
    }
    const rows:PairOutcome[]=[];
    let signals=0;
    for (let i=0;i<n;i++) {
      const candidate=play(model,fixture,seed,i,(i+1)%64===0);
      const baseline=play(empty,fixture,seed,i);
      signals+=candidate.signalCount;
      rows.push({pair:i,candidate:candidate.wins,incumbent:baseline.wins});
      if (candidate.action) log.event("held-out evaluation", "Testing " + fixture.id + " on fresh, seat-swapped deals.",{
        opponent:fixture.opponent, partner:format==="duel"?undefined:fixture.partner, action:candidate.action,
        completed:4*(index*n+i+1), total:4*n*fixturesFinal.length, unit:"chicos"
      });
    }
    emitted+=signals;
    log.write(name,{pin,seed,family:fixture.id,signals,rows});
    families.push({id:fixture.id, pairs:rows});
  }
  const evaluation=summarize(families,"V1");
  let gestureAblation;
  if (format==="pairs-private-senas") {
    const on=families.find(f=>f.id==="V1")!.pairs, off=families.find(f=>f.id==="V1/signals-masked")!.pairs;
    gestureAblation=interval(on.map((x,i)=>average(x.candidate)-average(off[i].candidate)));
  }
  const games=4*n*families.length;
  log.write("result",{format,model,pin,games,seed,trainingAndValidationGames:state.games,rounds:state.rounds,
    stop:state.rejected>=protocol.plateauRounds?"two validation rounds without accepted improvement":
      Date.now()>=deadline?"six-hour fitting budget":"completed registered schedule", evaluation,
    ...(gestureAblation && {gestureAblation,teamSignalsSent:emitted}),
    release:"Research evaluation only. Deployment requires the separate serving championship."});
  log.event("held-out evaluation","Finished computer-only evaluation of the frozen candidate.",{status:"complete",games,
    completed:games,total:games, unit:"chicos",metrics:{directWinPercent:100*evaluation.direct.estimate, rounds:state.round}});
}
