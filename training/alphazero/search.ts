import { createHash } from "node:crypto";
import { aDecidir, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import { crearAzar, equipoDelAsiento, type Asiento, type RepartoOnline } from "../../src/motor/reparto.ts";
import { sample } from "../arena/index.ts";
import { seatsFor, type ActionId, type PublicTurn, type SeatObservation } from "../contracts/index.ts";
import { drawDeal, inferWorld, posterior, seatView, type World } from "../search/belief.ts";
import { continuation, type Continuation, type Field } from "../search/continuation.ts";
import { commitTurn } from "../signals/index.ts";
import { evaluator, type Network } from "./model.ts";
import { liftMoves, matchesClue, moveView, rankClue, signedRank, visibleTurn } from "./rank-signals.ts";

interface Options {field: Field; table: Continuation; simulations: number; seed: number; signals?: boolean}
interface Node {legal: readonly ActionId[]; prior: number[]; counts: number[]; values: number[]}
export interface SearchStats {decisions: number; fallbacks: number; milliseconds: number; rankClues?:number; rankSignals?:number}
const depthLimit = 8;
const exploration = 1.25;

export function search(net: Network, options: Options, stats?: SearchStats) {
  const format = options.table.format;
  if (format!=="duel" && format!=="pairs" && format!=="pairs-private-senas") throw new Error("Formato experimental no compatible.");
  const signalMode = format==="pairs-private-senas";
  const listen = signalMode && options.signals!==false;
  const seats = seatsFor(format);
  const evaluate = Array.from({length:seats},(_,seat) => evaluator(net,options.field(seat as Asiento)));
  const belief = (seat: Asiento) => {
    const policy = options.field(seat);
    return {id:policy.id, decide(obs: SeatObservation, legal: readonly ActionId[]) {
      // Keep a compatible hand possible even when Ceibo rarely makes the observed play with it.
      const reduced = moveView(obs,listen);
      const choices = policy.decide(reduced,reduced.legalActions);
      const distribution = signalMode ? liftMoves(obs,reduced.legalActions,choices,listen,.15) : choices;
      return distribution.map(p => .85*p+.15/legal.length);
    }};
  };
  function endValue(state: EstadoOnline, own: Asiento) {
    const score: [number,number] = [...state.puntosInicio];
    for (const award of state.cobros) score[award.equipo] = Math.min(40,score[award.equipo]+award.tantos);
    const nextDealer = ((state.mano.reparto.dador+1)%seats) as Asiento;
    const win = continuation(options.table,score,nextDealer);
    return (equipoDelAsiento(own)===0 ? win : 1-win)*2-1;
  }
  function expand(obs: SeatObservation): Node {
    const prior = evaluate[obs.view.asiento](obs).probabilities;
    return {legal:obs.legalActions,prior,counts:prior.map(()=>0),values:prior.map(()=>0)};
  }
  function pick(node: Node) {
    const total = node.counts.reduce((sum,count)=>sum+count,0);
    let best = -Infinity, index = 0;
    for (let i=0; i<node.legal.length; i++) {
      const n = node.counts[i];
      const q = n ? node.values[i]/n : 0;
      const score = q+exploration*node.prior[i]*Math.sqrt(total+1)/(1+n);
      if (score>best) {best=score; index=i;}
    }
    return index;
  }
  function frozenMove(obs: SeatObservation, seat: Asiento, random: () => number) {
    const view = moveView(obs,listen);
    const legal = view.legalActions;
    const probability = options.field(seat).decide(view,legal);
    return legal[sample(probability,legal.length,random())];
  }
  function rollout(state: EstadoOnline, history: PublicTurn[], own: Asiento, random: () => number) {
    while (!state.resultado) {
      const seat = aDecidir(state)[0];
      const view = seatView(state,seat,format,history);
      const move = frozenMove(view,seat,random);
      const step = commitTurn(state,seat,format,listen?signedRank(view,move):move);
      history.push(step.turn);
      state = step.state;
    }
    return endValue(state,own);
  }

  return (actual: SeatObservation, training = false) => {
    const obs = moveView(actual,listen);
    if (obs.format !== format || !obs.legalActions.length) throw new Error("Se requiere un turno legal del formato planificado.");
    const start = performance.now(), own = obs.view.asiento;
    const clue = rankClue(obs);
    if (stats && clue) stats.rankClues = (stats.rankClues??0)+1;
    const prediction = evaluate[own](obs);
    const raw = prediction.probabilities;
    const finish = (visits: number[], fallback = false) => {
      if (stats && raw.length>1) {
        stats.decisions++;
        stats.fallbacks += Number(fallback);
        stats.milliseconds += performance.now()-start;
      }
      const moves = training ? visits : visits.map((v,i) => .8*v+.2*raw[i]);
      return {position:prediction.position,visits,probabilities:liftMoves(actual,obs.legalActions,moves,listen)};
    };
    if (raw.length===1) return finish([1]);
    const random = crearAzar(createHash("sha256").update(JSON.stringify([
      options.seed,obs.startScore,own,obs.view.muestra,obs.originalCards,obs.history,
    ])).digest().readUInt32BE());
    const worlds: World[] = [];
    const alternatives: RepartoOnline[] = [];
    for (let i=0; i<(clue?8:2)*options.simulations; i++) {
      const deal = drawDeal(obs,random);
      if (clue && !matchesClue(deal,clue)) {
        if (alternatives.length<options.simulations) alternatives.push(deal);
        continue;
      }
      const candidate = inferWorld(obs,deal,belief);
      if (candidate) worlds.push(candidate);
      if (worlds.length>=options.simulations) break;
    }
    if (!worlds.length) {
      for (const deal of alternatives) {
        const compatible = inferWorld(obs,deal,belief);
        if (compatible) worlds.push(compatible);
      }
    }
    if (!worlds.length) return finish(raw,true);
    const probabilities = posterior(worlds).probabilities;
    const rootPrior = training ? raw.map(p => .9*p+.1/raw.length) : raw;
    const root: Node = {legal:obs.legalActions,prior:rootPrior,counts:raw.map(()=>0),values:raw.map(()=>0)};
    // Search branches at the acting seat. Each other seat uses a frozen policy
    // and sees only its own simulated hand and the public history.
    const tree = new Map<string,Node>();
    for (let i=0; i<options.simulations; i++) {
      const {state:world} = worlds[sample(probabilities,worlds.length,random())];
      let state = world, value: number | undefined, depth=0;
      const history = [...obs.history], suffix: PublicTurn[] = [];
      const trail: {node: Node; index: number}[] = [];
      while (!state.resultado && depth<depthLimit) {
        const seat = aDecidir(state)[0];
        const view = depth===0 ? obs : moveView(seatView(state,seat,format,history),listen);
        let action: ActionId;
        if (seat===own) {
          const key = JSON.stringify(suffix);
          const node = depth===0 ? root : tree.get(key);
          if (!node) {
            tree.set(key,expand(view));
            value = .25*evaluate[own](view).value+.75*rollout(state,history,own,random);
            break;
          }
          const index = pick(node);
          trail.push({node,index});
          action = node.legal[index];
        } else {
          action = frozenMove(view,seat,random);
        }
        const step = commitTurn(state,seat,format,listen?signedRank(view,action):action);
        history.push(step.turn);
        suffix.push(visibleTurn(step.turn,format,own));
        state = step.state;
        depth++;
      }
      value ??= rollout(state,history,own,random);
      for (const {node,index} of trail) {
        node.counts[index]++;
        node.values[index] += value;
      }
    }
    return finish(root.counts.map(n => n/options.simulations));
  };
}
