import {esCardId, pieza, rangoDe, type CardId} from "../../src/motor/cartas.ts";
import {compararCartas} from "../../src/motor/jerarquia.ts";
import {openAnchored, type AnchoredActor, type CycleFormat} from "../anchored/actor.ts";
import {signals, type ActionId, type Move, type Policy, type SeatObservation, type Signal} from "../contracts/index.ts";
import {duelCardOdds} from "./duel-card-odds.ts";

export const selfplayKind = "truco-residual-selfplay-v1";
export const duelOddsKind = "truco-residual-duel-card-odds-v1";
export const duelInteractionsKind = "truco-residual-duel-odds-interactions-v1";
type SelfplayKind = typeof selfplayKind | typeof duelOddsKind | typeof duelInteractionsKind;
export function isSelfplayKind(value: unknown): value is SelfplayKind {
  return value === selfplayKind || value === duelOddsKind || value === duelInteractionsKind;
}
const bids = ["flor","paso-flor","con-flor-envido","contraflor-al-resto","falta-envido","envido",
  "real-envido","truco","retruco","vale-cuatro","quiero","no-quiero"] as const;
const slots = 8, width = 32 * slots, gestureOffset = 3 + bids.length;
const length = (gestureOffset + 1 + signals.length) * width;
const firstTrickStates = 4, trucoLevels = 4;
const interactionWidth = firstTrickStates * trucoLevels * 2 * slots;
const interactionLength = gestureOffset * interactionWidth;
const bounded = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const slot = (row: number, bin: number) => slots * row + bounded(Math.floor(bin), 0, slots - 1);

export interface SelfplayActor {
  kind: SelfplayKind;
  format: CycleFormat;
  anchor: AnchoredActor;
  weights: number[];
  updates: number;
}
export interface LearnerState {
  actor: SelfplayActor;
  squaredGradient: number[];
  critic: number[];
}
export function createLearner(anchor: AnchoredActor): LearnerState {
  openAnchored(anchor);
  return {actor:{kind:selfplayKind, format:anchor.format, anchor:structuredClone(anchor),
    weights:Array(length).fill(0), updates:0}, squaredGradient:Array(length).fill(0), critic:Array(width).fill(0)};
}
export function exportSelfplay(learner: LearnerState): SelfplayActor { return structuredClone(learner.actor); }

const oddsStart = 29;
function oddsBin(probability: number) {
  // Reserve separate bins for impossible and certain events.
  return probability === 0 ? 0 : probability === 1 ? slots - 1 : Math.ceil(probability * (slots - 2));
}
const oddsSlot = (row: number, probability: number) => slot(row, oddsBin(probability));

/** Preserve the starter's policy while activating the three formerly unused feature rows. */
export function withDuelCardOdds(actor: SelfplayActor): SelfplayActor {
  validate(actor);
  if (actor.format !== "duel") throw new Error("Card counting requires a duel");
  const upgraded = structuredClone(actor);
  if (upgraded.kind === selfplayKind) {
    upgraded.kind = duelOddsKind;
    upgraded.weights = upgraded.weights.map((w, i) => i % width >= oddsStart * slots ? 0 : w);
  }
  return upgraded;
}

/** Keep the odds policy intact and append a zero-initialized table for duel moves. */
export function withDuelInteractions(actor: SelfplayActor): SelfplayActor {
  const upgraded = withDuelCardOdds(actor);
  if (upgraded.kind === duelOddsKind) {
    upgraded.kind = duelInteractionsKind;
    upgraded.weights = upgraded.weights.concat(Array(interactionLength).fill(0));
  }
  return upgraded;
}

function cardPower(card: CardId, muestra: CardId) {
  return compararCartas(card, muestra.startsWith("copas") ? "bastos-04" : "copas-04", muestra);
}
function honestCardSignal(card: CardId, sample: CardId): Signal | undefined {
  const effective = pieza(card, sample);
  if (effective !== null) return ({2:"cejas",4:"beso",5:"nariz",11:"ojo-derecho",10:"ojo-izquierdo"} as const)[effective];
  if (card==="espadas-01" || card==="bastos-01") return "labios-derecha";
  if (card==="espadas-07" || card==="oros-07") return "labios-izquierda";
  const rank = rangoDe(card);
  if (rank===3) return "labio-inferior";
  if (rank===2) return "boca";
  if (rank===1) return "lengua";
}
function pendingClass(id: string | undefined) {
  if (id === undefined) return 0;
  if (id.includes("flor")) return 1;
  if (id==="envido" || id==="real-envido") return 2;
  if (id==="falta-envido") return 3;
  if (id==="truco") return 4;
  if (id==="retruco") return 5;
  return 6;
}
function context(obs: SeatObservation) {
  const {view,score,target} = obs, seat = view.asiento, team = view.equipoPorAsiento[seat];
  const partner = obs.seats===4 ? obs.relativeSeats[2] : undefined;
  const cards = [...view.cartas].sort((a,b) => compararCartas(a,b,view.muestra));
  const powers = cards.map(c=>cardPower(c,view.muestra)), best = powers.at(-1) ?? 0;
  const plays = view.vueltaActual?.jugadas ?? [];
  const maxPower = (own: boolean) => plays.reduce((top,p) =>
    (view.equipoPorAsiento[p.asiento]===team) === own ? Math.max(top,cardPower(p.carta,view.muestra)) : top, -1);
  const allyHigh = maxPower(true), enemyHigh = maxPower(false);
  const first = view.vueltas[0]?.resultado;
  const firstTrick = first === undefined ? 0 : first.tipo === "parda" ? 1 : first.equipo === team ? 2 : 3;
  let lastBid = 0, mateCue: Signal | undefined, sentBefore = false;
  for (const turn of obs.history) {
    if (turn.action.tipo!=="carta") lastBid = pendingClass(turn.action.tipo);
    if (obs.format!=="pairs-private-senas") continue;
    if (turn.action.asiento===seat && turn.signal) sentBefore=true;
    if (turn.action.asiento===partner) {
      if (turn.signal) mateCue=turn.signal;
      if (turn.action.tipo==="carta" && honestCardSignal(turn.action.carta,view.muestra)===mateCue) mateCue=undefined;
    }
  }
  const cue = mateCue ? 1+signals.indexOf(mateCue) : 0;
  const features = [slot(0,0),slot(1,score[team]/6),slot(2,score[1-team]/6),slot(3,target-score[team]),slot(4,target-score[1-team]),
    slot(5,best/3),slot(6,(powers.at(-2)??0)/3),slot(7,view.tantosPropios.total/6),
    slot(8,(view.tantosPropios.total-24)/2),slot(9,pendingClass(view.pendiente?.tipo)),slot(10,view.valorTruco),
    slot(11,(obs.stakes.side?.accept??0)/5),slot(12,view.vueltas.length),slot(13,plays.length),
    slot(14,firstTrick),
    slot(15,allyHigh<0?0:allyHigh>enemyHigh?1:allyHigh===enemyHigh?2:3),
    slot(16,(seat-view.mano+obs.seats)%obs.seats),slot(17,enemyHigh<0?0:1+enemyHigh/3),
    slot(18,lastBid),slot(19,Math.floor(cue/2)),slot(20,cue%2),slot(21,powers.filter(p=>p>=10).length),
    slot(22,obs.score[1-team]+(obs.stakes.side?.decline??obs.stakes.truco?.decline??0)>=target?1:0),
    slot(23,rangoDe(view.muestra)/2),slot(24,Math.max(...score)/7)];
  return {features,cards,powers,allyHigh,enemyHigh,sentBefore,firstTrick};
}
type Context = ReturnType<typeof context>;
interface Alternative { index: number; features: number[]; probability: number; slope: number }
interface MoveOption { id: Move; move: Alternative; gestures: {id: ActionId; choice: Alternative}[] }
interface Decision { moves: MoveOption[]; features: number[]; distribution: number[] }
function alternative(row: number, features: number[]): Alternative {
  return {index:row*width, features, probability:0, slope:0};
}
function normalize(choices: Alternative[], preferred: number, weights: number[], training: boolean) {
  if (choices.length===1) {choices[0].probability=1;return;}
  const temperature = training ? 1 : 0.58;
  const logits = choices.map((choice,i)=>{
    let residual=0;
    for (const f of choice.features) residual+=weights[choice.index+f];
    const squashed=Math.tanh(residual/5);
    choice.slope=(1-squashed*squashed)/temperature;
    const prior = i===preferred ? Math.log(5*(choices.length-1)) : 0;
    return (prior+5*squashed)/temperature;
  });
  const top=Math.max(...logits);
  const exp=logits.map(x=>Math.exp(x-top)), sum=exp.reduce((a,b)=>a+b,0);
  choices.forEach((c,i)=>{c.probability=exp[i]/sum;});
}
function truthful(obs: SeatObservation, c: Context, move: Move): Signal[] {
  if (obs.format!=="pairs-private-senas" || c.sentBefore) return [];
  // The card advertised must still be held after committing a card and its gesture.
  const retained = c.cards.filter(card=>card!==move);
  const best=retained.at(-1);
  const options: Signal[]=[];
  if (best) {
    const cue=honestCardSignal(best,obs.view.muestra);
    if (cue) options.push(cue);
    else if (retained.every(card=>!honestCardSignal(card,obs.view.muestra))) options.push("ojos-cerrados");
  }
  if (obs.view.tantosPropios.modalidad==="flor") options.push("cachetes");
  else if (obs.view.tantosPropios.total>=30) options.push("labio-superior");
  return options;
}
/** Truco stake for this move. Side bets can interrupt a pending truco. */
function trucoStake(obs: SeatObservation, move: Move) {
  switch (move) {
    case "truco": return 2;
    case "retruco": return 3;
    case "vale-cuatro": return 4;
    case "quiero":
    case "no-quiero":
      if (!obs.stakes.side && obs.stakes.truco) return obs.stakes.truco.accept;
  }
  return obs.view.valorTruco;
}

function calculate(actor: SelfplayActor, anchor: Policy, obs: SeatObservation, legal: readonly ActionId[], training: boolean): Decision {
  if (obs.format!==actor.format) throw Error("Wrong residual actor format");
  if (!legal.length) return {moves:[],features:[],distribution:[]};
  const view = legal===obs.legalActions ? obs : {...obs,legalActions:legal};
  const anchored = anchor.decide(view,legal), preferred=legal[anchored.indexOf(1)];
  const [prefix,body]=preferred.split("/"), preferredMove=(body??prefix) as Move;
  const c=context(obs), moves:MoveOption[]=[];
  const odds = actor.kind !== selfplayKind ? duelCardOdds(obs) : undefined;
  const best = c.cards.at(-1);
  if (odds && best) c.features.push(oddsSlot(oddsStart + 2, odds.get(best)!.higher));
  const byId=new Map(legal.map((id,i)=>[id,i]));
  for (const action of legal) {
    if (action.includes("/")) continue;
    const id=action as Move, card=esCardId(id);
    const position=card?c.cards.indexOf(id):-1;
    const group=card?position:3+bids.indexOf(id === "con-flor-quiero" ? "quiero" : id as typeof bids[number]);
    if (group<0 || (!card && group===2)) throw Error("Unknown move");
    let f=c.features;
    if (card) {
      const power=c.powers[position];
      f=[...c.features,slot(25,power/3),slot(26,Math.sign(power-c.enemyHigh)+1),slot(27,Math.sign(power-c.allyHigh)+1),
        slot(28,pieza(id,obs.view.muestra)!==null?1:0)];
      if (odds) {
        const {higher, tiedBest} = odds.get(id)!;
        f.push(oddsSlot(oddsStart, higher), oddsSlot(oddsStart + 1, tiedBest));
      }
    }
    const gestures=[{id:action,choice:alternative(gestureOffset,c.features)}];
    for (const cue of truthful(obs,c,id)) {
      const signed=(cue+"/"+id) as ActionId;
      if (byId.has(signed)) gestures.push({id:signed,choice:alternative(gestureOffset+1+signals.indexOf(cue),f)});
    }
    // Preserve the anchor's gesture when it describes this remaining hand.
    const preferredGesture=gestures.findIndex(g=>g.id===preferred);
    normalize(gestures.map(g=>g.choice),Math.max(0,preferredGesture),actor.weights,training);
    const move = alternative(group, f);
    if (actor.kind === duelInteractionsKind && odds && best) {
      const {higher, tiedBest} = odds.get(card ? id : best)!;
      const situation = c.firstTrick * trucoLevels + trucoStake(obs, id) - 1;
      const table = length + group * interactionWidth + situation * 2 * slots;
      // The shared scorer and gradient both index features relative to this move's original row.
      const offset = table - move.index;
      move.features = [...f, offset + oddsBin(higher), offset + slots + oddsBin(tiedBest)];
    }
    moves.push({id,move,gestures});
  }
  const wanted=moves.findIndex(m=>m.id===preferredMove);
  if (wanted<0) throw Error("Missing anchored base move");
  normalize(moves.map(m=>m.move),wanted,actor.weights,training);
  const distribution=legal.map(()=>0);
  for (const m of moves) for(const g of m.gestures) distribution[byId.get(g.id)!]=m.move.probability*g.choice.probability;
  return {moves,features:c.features,distribution};
}
function validate(actor: SelfplayActor) {
  const expectedLength = actor.kind === duelInteractionsKind ? length + interactionLength : length;
  if (!isSelfplayKind(actor.kind) || (actor.kind!==selfplayKind && actor.format!=="duel")
      || actor.anchor?.format!==actor.format || !Number.isSafeInteger(actor.updates)
      || actor.updates<0 || !Array.isArray(actor.weights) || actor.weights.length!==expectedLength
      || !actor.weights.every(w=>Number.isFinite(w) && Math.abs(w)<=4)) throw Error("Invalid residual policy artifact");
}
/** Calibrate the card and betting parts of a frozen duel policy on training games. */
export function scaleDuelResidual(actor:SelfplayActor, band:string, cards:number, bets:number):SelfplayActor {
  validate(actor);
  if(actor.format!=="duel" || [cards,bets].some(n=>!Number.isFinite(n)||n<0||n>1))
    throw Error("Invalid duel calibration");
  const anchor:AnchoredActor={...actor.anchor,bands:[band,band,band]};
  openAnchored(anchor);
  return {...actor,anchor,weights:actor.weights.map((w,i)=>{
    const cardMove = i < length ? i < 3*width : i < length + 3*interactionWidth;
    return w * (cardMove ? cards : bets);
  })};
}

export function openSelfplay(actor: SelfplayActor): Policy {
  validate(actor);
  const snapshot=structuredClone(actor), anchor=openAnchored(snapshot.anchor);
  const unchanged=snapshot.updates===0 || snapshot.weights.every(w=>w===0);
  return {id:actor.kind+"-"+actor.format,decide(obs,legal) {
    if (unchanged) return anchor.decide(obs,legal);
    return calculate(snapshot,anchor,obs,legal,false).distribution;
  }};
}

interface Trace { total: number; predicted: number }
function add(map: Map<number,Trace>, key: number, gradient: number, value: number) {
  const entry=map.get(key);
  if (entry) {entry.total+=gradient;entry.predicted+=gradient*value;}
  else map.set(key,{total:gradient,predicted:gradient*value});
}
export function collect(learner: LearnerState) {
  if (learner.squaredGradient.length !== learner.actor.weights.length || learner.critic.length !== width)
    throw new Error("Incompatible training state for residual policy weights");
  const {actor,critic}=learner, anchor=openAnchored(actor.anchor);
  const actorTrace=new Map<number,Trace>(), criticTrace=new Map<number,Trace>();
  let closed=false, steps=0;
  let pending: {obs:SeatObservation; decision:Decision} | undefined;
  const policy: Policy={id:"selfplay-collect-"+actor.format,decide(obs,legal) {
    if (closed) throw Error("Completed trajectory");
    const decision=calculate(actor,anchor,obs,legal,true);
    pending={obs,decision};
    return decision.distribution;
  }};
  function record(obs: SeatObservation, action: ActionId) {
    if (!pending || pending.obs!==obs || closed) throw Error("Record the sampled decision exactly once");
    const d=pending.decision; pending=undefined;
    const chosen=d.moves.find(m=>m.gestures.some(g=>g.id===action));
    if (!chosen) throw Error("Cannot train on an unsampled or illegal action");
    let value=0;
    for (const f of d.features) value+=critic[f];
    value=Math.tanh(value);
    for (const f of d.features) add(criticTrace,f,1-value*value,value);
    function accumulate(choice: Alternative, selected: boolean) {
      const g=((selected?1:0)-choice.probability)*choice.slope;
      if (g!==0) for (const f of choice.features) add(actorTrace,choice.index+f,g,value);
    }
    for (const m of d.moves) accumulate(m.move,m===chosen);
    for (const g of chosen.gestures) accumulate(g.choice,g.id===action);
    steps++;
  }
  function finish(reward: 1|-1) {
    if (closed || pending || (reward!==1 && reward!==-1)) throw Error("Invalid full-chico return");
    closed=true;
    if (!steps) return;
    // REINFORCE with a state-value baseline. Natural unit is a full team chico.
    // Retain aggregated sufficient statistics only, never observation histories.
    for (const [i,t] of actorTrace) {
      const gradient=bounded((reward*t.total-t.predicted)/Math.sqrt(steps),-2,2);
      const second=learner.squaredGradient[i]=0.99*learner.squaredGradient[i]+0.01*gradient*gradient;
      const step=0.006*gradient/Math.sqrt(0.04+second);
      actor.weights[i]=bounded(actor.weights[i]+bounded(step,-0.04,0.04),-4,4);
    }
    for (const [i,t] of criticTrace) {
      const g=(reward*t.total-t.predicted)/steps;
      critic[i]=bounded(critic[i]+0.0015*g,-1,1);
    }
    actor.updates++;
    actorTrace.clear();criticTrace.clear();
  }
  return {policy,record,finish};
}
