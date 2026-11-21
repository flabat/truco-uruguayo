import { esCardId, pieza, type CardId } from "../../src/motor/cartas.ts";
import { compararCartas } from "../../src/motor/jerarquia.ts";
import { crearAzar } from "../../src/motor/reparto.ts";
import type { ActionId, Policy, SeatObservation } from "../contracts/index.ts";

const bids = ["flor","paso-flor","con-flor-envido","contraflor-al-resto","falta-envido","envido",
  "real-envido","truco","retruco","vale-cuatro","quiero","no-quiero","con-flor-quiero","mazo"] as const;
const defaultHidden = 24;
const inputs = 20 + bids.length;
const outputs = 4 + bids.length;
export const hiddenUnits = (net: Network) => net.weights.length/(inputs+outputs);
export const networkShape = (net: Network) => [hiddenUnits(net),inputs] as const;
export const validHidden = (hidden: number) => Number.isSafeInteger(hidden) && hidden>=24 && hidden<=512 && hidden%8===0;
function dot(a: readonly number[], b: readonly number[], offset: number) {
  let sum = 0;
  for (let i=0; i<a.length; i++) sum += a[i]*b[offset+i];
  return sum;
}

export interface Network {weights: number[]}
export function validNetwork(value: unknown): value is Network {
  if (!value || typeof value !== "object" || !("weights" in value)) return false;
  return Array.isArray(value.weights) && validHidden(value.weights.length/(inputs+outputs)) && value.weights.every(Number.isFinite);
}
interface Position {x: number[]; slots: number[]; logPrior: number[]; valuePrior: number}
export interface Example {position: Position; visits: readonly number[]; outcome: number}

export function newNetwork(seed: number, hidden = defaultHidden): Network {
  if (!validHidden(hidden)) throw new Error("El ancho debe ser múltiplo de ocho, entre 24 y 512.");
  const random = crearAzar(seed);
  return {weights:Array.from({length:hidden*(inputs+outputs)}, (_,i) => i < hidden*inputs ? (random()-.5)*.5 : 0)};
}
export function widenNetwork(source: Network, hidden: number, seed: number): Network {
  const from = hiddenUnits(source);
  if (hidden===from) return structuredClone(source);
  if (hidden<from) throw new Error("No se puede reducir una política de partida.");
  const result = newNetwork(seed,hidden);
  const oldTrunk = from*inputs, newTrunk = hidden*inputs;
  for (let i=0;i<oldTrunk;i++) result.weights[i] = source.weights[i];
  for (let row=0;row<outputs;row++) {
    for (let column=0;column<from;column++) {
      result.weights[newTrunk+row*hidden+column] = source.weights[oldTrunk+row*from+column];
    }
  }
  return result;
}
export function features(obs: SeatObservation, legal: readonly ActionId[], prior: readonly number[]): Position {
  const {view, score, stakes, target} = obs;
  if (obs.format !== "duel" && obs.format !== "pairs") throw new Error("La red admite duelo o parejas sin señas.");
  const own = view.asiento, team = view.equipoPorAsiento[own], foe = 1-team;
  const cards = [...view.cartas].sort((a,b) => compararCartas(a,b,view.muestra) || a.localeCompare(b));
  const weak = view.muestra.startsWith("copas") ? "bastos-04" : "copas-04";
  const strength = (card?: CardId) => card ? (compararCartas(card,weak,view.muestra)+1)/19 : 0;
  const first = view.vueltas[0]?.resultado;
  const enemy = (seat: number) => view.equipoPorAsiento[seat]===foe;
  const enemyCards = obs.history.flatMap(({action}) => action.tipo === "carta" && enemy(action.asiento) ? [action.carta] : []);
  const enemyLead = Math.max(0,...(view.vueltaActual?.jugadas ?? []).filter(turn => enemy(turn.asiento)).map(turn => strength(turn.carta)));
  const before = obs.history.filter(turn => enemy(turn.action.asiento) && turn.action.tipo !== "carta");
  const lead = (score[team]-score[foe])/target;
  const x = [1, score[team]/target, score[foe]/target, lead, Number(own === view.mano), view.tantosPropios.total/40,
    view.valorTruco/4, (stakes.side?.accept??0)/target, (stakes.side?.decline??0)/target,
    (stakes.truco?.accept??0)/4, view.vueltas.length/3, first?.tipo === "ganada" ? first.equipo === team ? 1 : -1 : 0,
    strength(cards[0]),strength(cards[1]),strength(cards[2]),enemyLead,
    enemyCards.length/3, Math.max(0,...enemyCards.map(strength)), cards.filter(card => pieza(card,view.muestra)!==null).length/3,
    before.length/8, ...bids.map(bid => Number(bid === view.pendiente?.tipo))];
  const slots = legal.map(action => esCardId(action) ? cards.indexOf(action) : bids.includes(action as typeof bids[number]) ? 3+bids.indexOf(action as typeof bids[number]) : -1);
  if (slots.some(slot => slot<0 || slot>=outputs-1) || new Set(slots).size !== slots.length) throw new Error("Jugada inválida para la red.");
  const valuePrior = Math.atanh(Math.max(-.99, Math.min(.99, (score[team]-score[foe])/(2*target-score[team]-score[foe]))));
  return {x,slots,logPrior:prior.map(p => Math.log(.90*p+.10/legal.length)),valuePrior};
}

function forward(net: Network, p: Position) {
  const hidden = hiddenUnits(net), trunk = hidden*inputs, length = net.weights.length;
  const h = Array.from({length:hidden}, (_,i) => Math.tanh(dot(p.x,net.weights,i*inputs)));
  const logits = p.slots.map((slot,i) => p.logPrior[i]+dot(h,net.weights,trunk+slot*hidden));
  const max = Math.max(...logits);
  const mass = logits.map(logit => Math.exp(logit-max));
  const sum = mass.reduce((a,b) => a+b,0);
  const value = Math.tanh(p.valuePrior+dot(h,net.weights,length-hidden));
  return {h,probabilities:mass.map(p => p/sum),value};
}

export function evaluator(net: Network, teacher: Policy) {
  return (obs: SeatObservation, legal = obs.legalActions) => {
    const position = features(obs,legal,teacher.decide(obs,legal));
    return {...forward(net,position),position};
  };
}

export function learn(net: Network, examples: readonly Example[], rate: number) {
  const hidden = hiddenUnits(net), trunk = hidden*inputs, length = net.weights.length;
  const snapshot = {weights:[...net.weights]};
  let policyLoss = 0, valueLoss = 0;
  for (const {position,visits,outcome} of examples) {
    const {h,probabilities,value} = forward(snapshot,position);
    const valueError = value-outcome;
    const errors = probabilities.map((p,i) => p-visits[i]);
    const valueGradient = .5*valueError*(1-value*value);
    policyLoss -= visits.reduce((loss,v,i) => loss+v*Math.log(Math.max(1e-12,probabilities[i])),0);
    valueLoss += valueError**2;
    for (let i=0; i<hidden; i++) {
      let gradient = valueGradient * snapshot.weights[length-hidden+i];
      net.weights[length-hidden+i] -= rate*valueGradient*h[i];
      for (const [j,slot] of position.slots.entries()) {
        const idx = trunk+slot*hidden+i;
        gradient += errors[j]*snapshot.weights[idx];
        net.weights[idx] -= rate*errors[j]*h[i];
      }
      const adjust = rate*gradient*(1-h[i]*h[i]);
      for (let j=0; j<inputs; j++) net.weights[i*inputs+j] -= adjust*position.x[j];
    }
  }
  return {policyLoss:policyLoss/examples.length,valueLoss:valueLoss/examples.length};
}
