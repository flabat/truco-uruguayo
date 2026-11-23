import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { artifactPin, openActor } from "../../api/actor-registry.ts";
import { crearAzar, type Asiento } from "../../src/motor/reparto.ts";
import { activeFormats, seatsFor, type Policy } from "../contracts/index.ts";
import { playMatch } from "../arena/index.ts";
import { baseline, styles } from "../baselines/index.ts";
import { incumbent } from "../seat/index.ts";
import { kind, openAnchored, type AnchoredActor, type CycleFormat } from "../anchored/actor.ts";
import { dealSeed, read, save } from "../anchored/io.ts";
import { silence } from "../anchored/matches.ts";
import { collect, createLearner, duelInteractionsKind, duelOddsKind, isSelfplayKind, openSelfplay, selfplayKind,
  withDuelCardOdds, withDuelInteractions, type LearnerState, type SelfplayActor } from "./learner.ts";

type Lineage = "a" | "b";
type Artifact = { format: string; kind?: string };
type Team = readonly Policy[];
interface Snapshot { name: string; model: Artifact }
interface Context { champion: Snapshot; previous: Snapshot; peers: Snapshot[]; archivePins: Record<string,string> }
interface RecordWL { wins: number; games: number }
interface PairedGap { pairs:number; mean:number }
interface Contrast { target:string; ordinal:number; rows:Record<string,PairedGap> }
interface LastGame { opponent: string; teammate: string; action: string; score: readonly number[]; specialist: boolean }
interface Checkpoint {
  schema: 1; format: CycleFormat; lineage: Lineage; starterPin: string; seed: number; rng: number;
  epoch: number; trainingSeconds: number; totalTrainingSeconds: number;
  games: number; hands: number; decisions: number; learningDecisions: number; learnerUpdates: number;
  counterGames: number; counterWins: number; counterUpdates: number; counterTarget: string;
  targetCounterGames: number; targetCounterWins: number;
  learner: LearnerState; specialist: LearnerState;
  contrast?: Contrast;
  record: Record<string,RecordWL>; history: Snapshot[]; last: LastGame | null;
}
interface Choice { name: string; team: Team }

export function openTrainingTeam(model: Artifact, format: CycleFormat): Team {
  const silentGuest = format === "pairs-private-senas" && model.format === "pairs";
  if (!silentGuest && model.format !== format) throw new Error("Incompatible training artifact: " + model.format);
  const source = silentGuest ? "pairs" : format;
  if (isSelfplayKind(model.kind) || model.kind === kind) {
    const policy = model.kind === kind ? openAnchored(model as AnchoredActor) : openSelfplay(model as SelfplayActor);
    return Array(seatsFor(format)).fill(silentGuest ? silence(policy, source) : policy);
  }
  return Array.from({length: seatsFor(format)}, (_, s) => {
    const policy = openActor(model, source, s as Asiento);
    return silentGuest ? silence(policy, source) : policy;
  });
}

type Starter = AnchoredActor | SelfplayActor;

function initialize(format: CycleFormat, lineage: Lineage, seed: number, starter: Starter, targetKind: SelfplayActor["kind"]): Checkpoint {
  if (starter.format !== format || (starter.kind !== kind && !isSelfplayKind(starter.kind))) {
    throw new Error("Invalid frozen starting model");
  }
  const learner = createLearner(starter.kind === kind ? starter : starter.anchor);
  if (starter.kind !== kind) {
    openSelfplay(starter);
    learner.actor = structuredClone(starter);
  }
  if (learner.actor.kind !== targetKind) {
    learner.actor = targetKind === duelInteractionsKind ? withDuelInteractions(learner.actor) : withDuelCardOdds(learner.actor);
  }
  if (learner.squaredGradient.length !== learner.actor.weights.length)
    learner.squaredGradient = Array(learner.actor.weights.length).fill(0);
  return {schema:1, format, lineage, starterPin:artifactPin(starter), seed, rng:seed,
    epoch:0, trainingSeconds:0, totalTrainingSeconds:0, games:0, hands:0, decisions:0, learningDecisions:0,
    learnerUpdates:0, counterGames:0, counterWins:0, counterUpdates:0, counterTarget:"",
    targetCounterGames:0, targetCounterWins:0,
    learner, specialist:structuredClone(learner), record:{}, history:[], last:null};
}

function nextUniform(state: Checkpoint) {
  const sample = crearAzar(state.rng)();
  state.rng = (state.rng + 0x9e3779b9) >>> 0;
  return sample;
}

function pick<T>(state: Checkpoint, choices: T[]) {
  assert.ok(choices.length);
  return choices[Math.floor(nextUniform(state) * choices.length)];
}

function pickHard(state: Checkpoint, pool: Choice[]) {
  const weights = pool.map(choice => {
    const row = state.record[choice.name] ?? {wins:0, games:0};
    const loss = 1 - (row.wins + 2) / (row.games + 4);
    return 1 + 6 * loss * loss;
  });
  let draw = nextUniform(state) * weights.reduce((a,b) => a+b, 0);
  return pool[weights.findIndex((weight,i) => (draw -= weight) < 0 || i === weights.length - 1)];
}

function loadArchive(path: string) {
  const snapshots: Snapshot[] = [];
  if (existsSync(path)) for (const file of readdirSync(path).sort()) {
    if (file.endsWith(".json")) snapshots.push({name:"archive:" + basename(file, ".json"), model:read(join(path,file))});
  }
  return snapshots;
}

function freezeContext(root: string, state: Checkpoint, epoch: number, archived: Snapshot[]): Context {
  const {format, lineage} = state;
  const dir = join(root,format,lineage,"epochs");
  mkdirSync(dir,{recursive:true});
  const file = join(dir, epoch + ".json");
  const archivePins = Object.fromEntries(archived.map(s => [s.name, artifactPin(s.model)]));
  if (existsSync(file)) {
    const saved: Context = read(file);
    assert.deepEqual(saved.archivePins, archivePins, "Frozen training archive changed");
    return saved;
  }
  const model = read(join(root,format,"champion.json"));
  const champion = {name:"champion:" + artifactPin(model).slice(0,16), model};
  let previous = {name:"initial-V1", model:read(join(root,"input",format,"anchor-v1.json"))};
  if (state.epoch) {
    const old: Context = read(join(dir, state.epoch + ".json"));
    previous = old.champion.name === champion.name ? old.previous : old.champion;
  }
  const peerDir = join(root,format,lineage === "a" ? "b" : "a","archive");
  const peers: Snapshot[] = [];
  for (let earlier = epoch - 1; earlier >= Math.max(1,epoch - 4); earlier--) {
    const file = join(peerDir, earlier + "-candidate.json");
    if (existsSync(file)) { peers.push({name:"peer:epoch-" + earlier,model:read(file)}); break; }
  }
  return {champion,previous,peers,archivePins};
}

// A positive gap means the incumbent does better on the same deals. The prior
// shrinks small samples toward equal weight. Bound the ratio to retain coverage.
export function regressionWeight(row?:PairedGap) {
  const gap = row ? row.mean * row.pairs / (row.pairs + 8) : 0;
  return Math.exp(Math.max(-2,Math.min(3,12*gap)));
}

function league(state: Checkpoint, context: Context, frozen: Snapshot[], seedModel: Starter, paired:boolean) {
  const repeated = (policy: Policy): Team => Array(seatsFor(state.format)).fill(policy);
  const choice = (s: Snapshot): Choice => ({name:s.name,team:openTrainingTeam(s.model,state.format)});
  const champion = choice(context.champion), previous = choice(context.previous);
  const guest = [...context.peers,...frozen].map(choice);
  const starter = choice({name:"frozen-starter",model:seedModel});
  const scripted = [incumbent.id,...styles].map(name => ({name,team:repeated(baseline(name))}));
  const historical = [...guest,starter];
  const trainingPartners = [...guest,previous,...scripted.filter(s => s.name === "strong-cards" || s.name === incumbent.id)];
  const hardPool = [champion,...scripted,...historical];
  const contrast = paired ? (state.contrast ??= {target:champion.name,ordinal:0,rows:{}}) : undefined;
  if (contrast && contrast.target!==champion.name) {
    contrast.target=champion.name;
    contrast.rows={};
  }
  // One condition means two copies of the actor; the other substitutes a
  // frozen teammate in exactly the same seat for both compared policies.
  const conditions = hardPool.flatMap(opponent =>
    (state.format==="duel" ? [false] : [false,true]).map(guestMate => ({
      opponent, guestMate, id:opponent.name+(guestMate?"/guest":"/own")
    }))
  );
  const probeSeed = dealSeed(String(state.seed),"paired-training-probe");
  function probe(c:Contrast) {
    const pair=c.ordinal++, item=conditions[pair%conditions.length];
    const guest=item.guestMate ? trainingPartners[Math.floor(pair/conditions.length)%trainingPartners.length] : null;
    const trained=openSelfplay(state.learner.actor);
    let difference=0;
    for (const leg of [0,1] as const) {
      const guestHalf=Math.floor(pair/conditions.length)%2;
      for (const isReference of [false,true]) {
        const game=playMatch({format:state.format,seed:probeSeed,pair,leg,policies(seat) {
          if (seat%2!==leg) return item.opponent.team[seat];
          if (guest && Math.floor(seat/2)===guestHalf) return guest.team[seat];
          return isReference ? champion.team[seat] : trained;
        }});
        difference+=(isReference?1:-1)*Number(game.winner===leg)/2;
      }
    }
    const row=c.rows[item.id] ??= {pairs:0,mean:0};
    row.pairs++;
    row.mean+=(difference-row.mean)/Math.min(128,row.pairs);
  }
  function drawCondition(c:Contrast) {
    const weights=conditions.map(item=>regressionWeight(c.rows[item.id]));
    let ticket=nextUniform(state)*weights.reduce((sum,w)=>sum+w,0);
    return conditions[weights.findIndex((w,i)=>(ticket-=w)<0 || i===weights.length-1)];
  }
  function step() {
    const specialist = state.games % 5 === 4;
    const n = state.games - state.counterGames;
    const team = (state.games % 2) as 0|1;
    const learner = specialist ? state.specialist : state.learner;
    const collector = collect(learner);
    let opponent: Choice;
    let guestCondition:boolean|undefined;
    if (contrast && !specialist && n%16===0) probe(contrast);
    if (specialist) opponent = champion;
    else if (contrast && (n%9===2 || n%9===7 || n%9===4)) {
      const item=drawCondition(contrast);
      opponent=item.opponent; guestCondition=item.guestMate;
    } else if (contrast && state.format!=="duel" && n%9===3) {
      opponent=scripted.find(s=>s.name==="strong-cards")!;
      guestCondition=Math.floor(n/9)%4===3;
    } else switch (n % 9) {
      case 0: opponent = {name:"latest-self",team:repeated(openSelfplay(state.learner.actor))}; break;
      case 1: opponent = champion; break;
      case 2: case 7: opponent = pickHard(state,hardPool); break;
      case 3: opponent = pick(state,scripted); break;
      case 4: opponent = state.history.length ? choice(pick(state,state.history)) : pick(state,historical); break;
      case 5: opponent = {name:"best-response",team:repeated(openSelfplay(state.specialist.actor))}; break;
      case 6: opponent = previous; break;
      default: opponent = pick(state,historical);
    }
    // Alternate seats within the candidate's team. When paired with a frozen
    // teammate, only the seat controlled by the learner contributes gradients.
    const singleSeat = team + 2 * (Math.floor(state.games / 2) % 2);
    const useGuest = guestCondition ?? (state.format !== "duel" && state.games % 3 !== 0);
    const mate = useGuest ? pick(state,trainingPartners) : null;
    const isLearner = (s: Asiento) => s % 2 === team && (!mate || s === singleSeat);
    let total = 0, trained = 0, action = "";
    const game = playMatch({format:state.format, seed:state.seed, pair:state.games, leg:team,
      policies:seat => isLearner(seat) ? collector.policy : seat % 2 === team ? mate!.team[seat] : opponent.team[seat],
      onDecision(d) {
        total++;
        if (isLearner(d.seat)) { collector.record(d.observation,d.action); trained++; }
        // The public monitor gets the committed move only. Private cues and
        // unseen cards never enter the event stream.
        const base = d.action.includes("/") ? d.action.slice(d.action.indexOf("/") + 1) : d.action;
        const score = d.observation.score;
        action = "Seat " + (d.seat+1) + " · " + base + " · hand " + (d.hand+1) + " · " + score.join("–");
      }});
    const won = game.winner === team;
    const previousUpdates = learner.actor.updates;
    collector.finish(won ? 1 : -1);
    const updates = learner.actor.updates - previousUpdates;
    state.games++; state.decisions+=total; state.hands+=game.hands.length; state.learningDecisions+=trained;
    if (specialist) {
      state.counterGames++; state.counterWins+=Number(won); state.counterUpdates+=updates;
      state.targetCounterGames++; state.targetCounterWins+=Number(won);
    } else {
      state.learnerUpdates+=updates;
      const row = state.record[opponent.name] ??= {wins:0,games:0};
      row.wins+=Number(won); row.games++;
      if ((n+1) % 128 === 0) {
        state.history.push({name:"lineage:" + state.lineage + ":game-" + state.games,model:structuredClone(learner.actor)});
        state.history = state.history.slice(-3);
      }
    }
    state.last={opponent:opponent.name,teammate:mate?.name ?? (state.format === "duel" ? "solo" : "self"),action,
      score:game.score,specialist};
  }
  return step;
}

export function withWriter<T>(dir: string, work: () => T) {
  // flock owns the shared open file description. The Node process keeps it
  // after Python exits; the kernel releases it even on an unclean shutdown.
  const fd = openSync(join(dir,"writer.lock"),"a");
  try {
    const lock = spawnSync("python3",["-c","import fcntl; fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)"],
      {stdio:["ignore","ignore","pipe",fd]});
    if (lock.error) throw lock.error;
    if (lock.status !== 0) throw new Error("Another process owns this training lineage: " + dir);
    return work();
  } finally { closeSync(fd); }
}

function cleanHistory(dir: string, keepAfter: number) {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    const match = /^(\d+)(?:-(?:candidate|counter))?\.json$/.exec(file);
    if (match && Number(match[1]) < keepAfter) unlinkSync(join(dir,file));
  }
}

interface Slice {epoch:number; seconds:number; games?:number; lane?:string}
export function runSlice(root: string, format: CycleFormat, lineage: Lineage, slice: Slice) {
  if (!activeFormats.includes(format) || !["a","b"].includes(lineage)) throw new Error("Unsupported training lineage");
  const {epoch, seconds, games} = slice;
  if (!Number.isSafeInteger(epoch) || epoch < 1 || !Number.isFinite(seconds) || seconds < 0 ||
       (games !== undefined && (!Number.isSafeInteger(games) || games < 0))) throw new Error("Invalid training budget");
  const dir = join(root,format,lineage), input = join(root,"input",format);
  const lane = slice.lane ?? (format === "duel" ? format+"-"+lineage : format);
  if (!/^[a-z0-9-]+$/.test(lane)) throw new Error("Invalid telemetry lane");
  mkdirSync(dir,{recursive:true}); mkdirSync(join(root,"events"),{recursive:true});
  mkdirSync(join(dir,"archive"),{recursive:true});
  return withWriter(dir,() => {
    const starter = read(join(input,"starter.json"));
    const protocol = read(join(root,"protocol.json"));
    const master = protocol.seed;
    if ((typeof master !== "string" || !master.length) && !Number.isSafeInteger(master)) throw new Error("Missing run seed");
    const seed = dealSeed(String(master),"residual-selfplay-training",format,lineage);
    const file = join(dir,"checkpoint.json");
    let targetKind = isSelfplayKind(starter.kind) ? starter.kind : selfplayKind;
    if (format === "duel" && protocol.duelInteractions === true) targetKind = duelInteractionsKind;
    else if (format === "duel" && protocol.duelCardOdds === true && targetKind === selfplayKind) targetKind = duelOddsKind;
    const state: Checkpoint = existsSync(file) ? read(file) : initialize(format,lineage,seed,starter,targetKind);
    assert.ok(state.schema===1 && state.format===format && state.lineage===lineage && state.seed===seed &&
      state.starterPin===artifactPin(starter) && epoch>=state.epoch &&
      [state.learner, state.specialist].every(learner => learner.actor.kind === targetKind &&
        learner.squaredGradient.length === learner.actor.weights.length), "Changed training input or obsolete epoch");
    const inputs = loadArchive(join(input,"archive"));
    const ctx = freezeContext(root,state,epoch,inputs);
    if (epoch>state.epoch) { state.epoch=epoch; state.trainingSeconds=0; state.last=null; }
    if (state.counterTarget!==ctx.champion.name) {
      state.counterTarget=ctx.champion.name; state.targetCounterGames=0; state.targetCounterWins=0;
    }
    const step = league(state,ctx,inputs,starter,protocol.sampler==="paired-regression-v1");
    const contextFile = join(dir,"epochs",epoch+".json");
    if (!existsSync(contextFile)) save(contextFile,ctx);
    function persist(status: string) {
      // Checkpoint is authoritative. A retry regenerates exports if it died
      // between successive atomic file replacements.
      save(file,state);
      save(join(dir,"candidate.json"),state.learner.actor);
      save(join(dir,"counter.json"),state.specialist.actor);
      if (status === "complete") {
        save(join(dir,"archive",epoch+"-candidate.json"),state.learner.actor);
        save(join(dir,"archive",epoch+"-counter.json"),state.specialist.actor);
        cleanHistory(join(dir,"archive"),epoch-3); cleanHistory(join(dir,"epochs"),epoch-3);
      }
      const ts = new Date().toISOString();
      const progress = {ts,format,lineage,epoch,status,stage:"self-play",targetSeconds:seconds,trainingSeconds:state.trainingSeconds,
        totalTrainingSeconds:state.totalTrainingSeconds,games:state.games,hands:state.hands,decisions:state.decisions,
        learningDecisions:state.learningDecisions,learnerUpdates:state.learnerUpdates,counterGames:state.counterGames,
        counterWins:state.counterWins,counterUpdates:state.counterUpdates,counterTarget:state.counterTarget,
        targetCounterGames:state.targetCounterGames,targetCounterWins:state.targetCounterWins,
        ...(state.contrast ? {probeGames:4*state.contrast.ordinal} : {}),
        ...state.last,message:"Epoch " + epoch + " · " + state.games + " completed computer chicos · " + state.learnerUpdates + " policy updates"};
      save(join(dir,"progress.json"),progress);
      appendFileSync(join(root,"events",lane+".jsonl"),JSON.stringify(progress)+"\n");
    }
    persist("running");
    let lastCommit = performance.now();
    while (games !== undefined ? state.games < games : state.trainingSeconds < seconds) {
      const start = performance.now(); step();
      const elapsed=(performance.now()-start)/1000;
      state.trainingSeconds+=elapsed; state.totalTrainingSeconds+=elapsed;
      if (performance.now()-lastCommit >= 5000) { persist("running"); lastCommit=performance.now(); }
    }
    persist("complete");
    return state;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root,format,lineage,flag,budget,...extra]=process.argv.slice(2);
  if (!root || !format || !lineage || flag!=="--seconds" || !budget || extra.length)
    throw new Error("Usage: node training/selfplay/train.ts RUN FORMAT LINEAGE --seconds N");
  runSlice(root,format as CycleFormat,lineage as Lineage,{seconds:Number(budget),
    epoch:Number(process.env.TRUCO_EPOCH ?? 1),lane:process.env.TRUCO_LANE});
}
