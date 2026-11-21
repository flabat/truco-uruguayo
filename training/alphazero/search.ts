import { createHash } from "node:crypto";
import { aDecidir, type EstadoOnline } from "../../src/motor/mesa-online.ts";
import { crearAzar, type Asiento } from "../../src/motor/reparto.ts";
import { sample } from "../arena/index.ts";
import type { ActionId, PublicTurn, SeatObservation } from "../contracts/index.ts";
import { drawDeal, inferWorld, posterior, seatView, type World } from "../search/belief.ts";
import { continuation, type Continuation, type Field } from "../search/continuation.ts";
import { commitTurn } from "../signals/index.ts";
import { evaluator, type Network } from "./model.ts";

interface Options {field: Field; table: Continuation; simulations: number; seed: number}
interface Node {legal: readonly ActionId[]; prior: number[]; counts: number[]; values: number[]}
export interface SearchStats {decisions: number; fallbacks: number; milliseconds: number}
const depthLimit = 8;
const exploration = 1.25;

export function search(net: Network, options: Options, stats?: SearchStats) {
  const evaluate = [evaluator(net,options.field(0)), evaluator(net,options.field(1))];
  const belief = (seat: Asiento) => {
    const policy = options.field(seat);
    return {id:policy.id, decide(obs: SeatObservation, legal: readonly ActionId[]) {
      // Keep a compatible hand possible even when Ceibo rarely makes the observed play with it.
      return policy.decide(obs,legal).map(p => .85*p+.15/legal.length);
    }};
  };
  function endValue(state: EstadoOnline, own: Asiento) {
    const score: [number,number] = [...state.puntosInicio];
    for (const award of state.cobros) score[award.equipo] = Math.min(40,score[award.equipo]+award.tantos);
    const win = continuation(options.table,score,(1-state.mano.reparto.dador) as Asiento);
    return (own===0 ? win : 1-win)*2-1;
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
  function rollout(state: EstadoOnline, history: PublicTurn[], own: Asiento, random: () => number) {
    while (!state.resultado) {
      const seat = aDecidir(state)[0];
      const view = seatView(state,seat,"duel",history);
      const legal = view.legalActions;
      const probability = options.field(seat).decide(view,legal);
      const step = commitTurn(state,seat,"duel",legal[sample(probability,legal.length,random())]);
      history.push(step.turn);
      state = step.state;
    }
    return endValue(state,own);
  }

  return (obs: SeatObservation, training = false) => {
    if (obs.format !== "duel" || !obs.legalActions.length) throw new Error("Se requiere un turno legal de duelo.");
    const start = performance.now(), own = obs.view.asiento;
    const prediction = evaluate[own](obs);
    const raw = prediction.probabilities;
    const finish = (visits: number[], fallback = false) => {
      if (stats && raw.length>1) {
        stats.decisions++;
        stats.fallbacks += Number(fallback);
        stats.milliseconds += performance.now()-start;
      }
      return {position:prediction.position,visits,
        probabilities:training ? visits : visits.map((v,i) => .8*v+.2*raw[i])};
    };
    if (raw.length===1) return finish([1]);
    const random = crearAzar(createHash("sha256").update(JSON.stringify([
      options.seed,obs.startScore,own,obs.view.muestra,obs.originalCards,obs.history,
    ])).digest().readUInt32BE());
    const worlds: World[] = [];
    for (let i=0; i<2*options.simulations; i++) {
      const candidate = inferWorld(obs,drawDeal(obs,random),belief);
      if (candidate) worlds.push(candidate);
      if (worlds.length>=options.simulations) break;
    }
    if (!worlds.length) return finish(raw,true);
    const probabilities = posterior(worlds).probabilities;
    const rootPrior = training ? raw.map(p => .9*p+.1/raw.length) : raw;
    const root: Node = {legal:obs.legalActions,prior:rootPrior,counts:raw.map(()=>0),values:raw.map(()=>0)};
    // This tree belongs to the real acting seat. The opponent's frozen policy is
    // evaluated at its own simulated seat; it never receives the root's private cards.
    const tree = new Map<string,Node>();
    for (let i=0; i<options.simulations; i++) {
      const {state:world} = worlds[sample(probabilities,worlds.length,random())];
      let state = world, value: number | undefined, depth=0;
      const history = [...obs.history], suffix: PublicTurn[] = [];
      const trail: {node: Node; index: number}[] = [];
      while (!state.resultado && depth<depthLimit) {
        const seat = aDecidir(state)[0];
        const view = depth===0 ? obs : seatView(state,seat,"duel",history);
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
          const legal = view.legalActions;
          action = legal[sample(options.field(seat).decide(view,legal),legal.length,random())];
        }
        const step = commitTurn(state,seat,"duel",action);
        history.push(step.turn);
        suffix.push(step.turn);
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
