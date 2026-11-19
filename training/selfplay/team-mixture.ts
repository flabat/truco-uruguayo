import {esCardId, mazo} from "../../src/motor/cartas.ts";
import {compararCartas} from "../../src/motor/jerarquia.ts";
import {kind as anchoredKind, openAnchored, type AnchoredActor} from "../anchored/actor.ts";
import {partnerAction, partnerVariants} from "../anchored/partners.ts";
import type {ActionId, Move, Policy, SeatObservation} from "../contracts/index.ts";
import {selfplayKind, openSelfplay, type SelfplayActor} from "./learner.ts";

export const teamMixtureKind="team-context-mixture-v1";
export const teamContexts=["compulsory","large-side","small-side","truco",
  "opening","after-lead","first-trick","safe-trick","must-win","close-score"] as const;
export type TeamContext=typeof teamContexts[number];
export const specialists=["finalist","anchor","team"] as const;
export type Specialist=typeof specialists[number];
export type TeamFormat="pairs"|"pairs-private-senas";
export interface TeamMixtureActor {
  kind:typeof teamMixtureKind;
  format:TeamFormat;
  finalist:SelfplayActor;
  anchor:AnchoredActor;
  routes:Record<TeamContext,Specialist>;
}
export function initialTeamMixture(finalist:SelfplayActor,anchor:AnchoredActor):TeamMixtureActor {
  if (anchor.format==="duel" || finalist.format!==anchor.format || finalist.kind!==selfplayKind || anchor.kind!==anchoredKind)
    throw Error("Both experts must match the partnership rules.");
  const routes=Object.fromEntries(teamContexts.map(k=>[k,"finalist"])) as Record<TeamContext,Specialist>;
  return {kind:teamMixtureKind,format:anchor.format,anchor:structuredClone(anchor),finalist:structuredClone(finalist),routes};
}

export function teamContext(obs:SeatObservation):TeamContext {
  const v=obs.view, first=v.vueltas[0]?.resultado;
  if (v.legales.length===1 && (v.legales[0]==="flor" || v.legales[0]==="paso-flor")) return "compulsory";
  if (obs.stakes.side) return v.pendiente?.tipo==="falta-envido" || v.pendiente?.tipo==="contraflor-al-resto" ? "large-side" : "small-side";
  if (v.trucoPendiente) return "truco";
  if (Math.max(...obs.score)>=obs.target-4) return "close-score";
  if (v.legales.includes("envido")) return v.vueltaActual?.jugadas.length ? "after-lead":"opening";
  if (!first) return "first-trick";
  if (first.tipo==="ganada" && first.equipo===v.equipoPorAsiento[v.asiento]) return "safe-trick";
  return "must-win";
}

const signalConvention=partnerVariants("pairs-private-senas").find(v=>v.id==="v1-signals")!;
function tactical(obs:SeatObservation,base:Move):Move {
  const v=obs.view, mine=v.equipoPorAsiento[v.asiento], teamSeat=obs.relativeSeats[2];
  const lead=obs.score[mine]-obs.score[1-mine];
  const total=v.tantosPropios.total, wanted=obs.target-obs.score[1-mine];
  const legal=(id:Move)=>obs.legalActions.includes(id);
  // Only the teammate's declared offers and the acting seat's own tanto are evidence.
  const partnerOffered=obs.history.some(t=>t.action.asiento===teamSeat &&
    (t.action.tipo==="real-envido" || t.action.tipo==="falta-envido"));
  if (obs.stakes.side && !v.pendiente?.tipo.includes("flor") && legal("quiero")) {
    const {accept,decline}=obs.stakes.side;
    if (decline>=wanted) return "quiero";
    if (v.pendiente?.tipo==="falta-envido" && accept>=6 && legal("no-quiero")) {
      const threshold=partnerOffered ? 26 : accept>=15 ? 32 : 30;
      return total>=threshold ? "quiero":"no-quiero";
    }
    if (total>=34 && legal("falta-envido")) return "falta-envido";
  }
  if (!v.pendiente && legal("envido")) {
    if (total>=34 && legal("falta-envido")) return "falta-envido";
    if (total>=28 && legal("real-envido")) return "real-envido";
    if (total>=26 && (lead<=4 || v.mano===v.asiento)) return "envido";
  }
  if (!esCardId(base) || v.cartas.length<2) return base;
  const plays=v.vueltaActual?.jugadas??[], cards=[...v.cartas].sort((a,b)=>compararCartas(a,b,v.muestra));
  const partnerPlay=plays.find(j=>j.asiento===teamSeat);
  if (!partnerPlay || plays.length!==2) return base;
  // Estimate how many *unknown cards* can defeat or tie the current team high.
  // This is a count of outs, with no information from actual opponent or teammate hands.
  const rival=plays.find(j=>v.equipoPorAsiento[j.asiento]!==mine)!;
  if (compararCartas(partnerPlay.carta,rival.carta,v.muestra)<=0) return base;
  const known=new Set([v.muestra,...obs.originalCards,...obs.history.flatMap(t=>t.action.tipo==="carta"?[t.action.carta]:[])]);
  const unseen=mazo.filter(c=>!known.has(c));
  const tieFavorsUs=v.vueltas[0]?.resultado.tipo==="ganada" && v.vueltas[0].resultado.equipo===mine;
  const outs=(card:typeof base)=>unseen.filter(c=>compararCartas(c,card,v.muestra)>=(tieFavorsUs?1:0)).length;
  const risk=outs(partnerPlay.carta);
  if (risk<6) return cards[0];
  // Cover the teammate with the cheapest card that removes most of the closer's outs.
  return cards.find(c=>compararCartas(c,partnerPlay.carta,v.muestra)>0 && outs(c)*3<=risk)??base;
}

export function openTeamMixture(model:TeamMixtureActor):Policy {
  if (model.kind!==teamMixtureKind || !["pairs","pairs-private-senas"].includes(model.format) ||
      model.anchor.format!==model.format || model.finalist.format!==model.format ||
      !teamContexts.every(k=>specialists.includes(model.routes?.[k]))) throw Error("Invalid partnership router");
  const routes={...model.routes}, format=model.format;
  const finalist=openSelfplay(model.finalist), anchor=openAnchored(structuredClone(model.anchor));
  return {id:teamMixtureKind,decide(obs,legal) {
    if(obs.format!==format) throw Error("Wrong partnership format");
    if(!legal.length)return [];
    const selected=routes[teamContext(obs)];
    if(selected==="finalist")return finalist.decide(obs,legal);
    const base=anchor.decide(obs,legal);
    if(selected==="anchor")return base;
    const flat=legal[base.indexOf(1)].split("/").at(-1) as Move;
    const visible=legal===obs.legalActions?obs:{...obs,legalActions:legal};
    const move=tactical(visible,flat);
    const choice:ActionId=format==="pairs-private-senas"?partnerAction(visible,move,signalConvention):move;
    const index=legal.indexOf(choice);
    if(index<0)throw Error("Team expert selected an illegal action");
    return legal.map((_,i)=>Number(i===index));
  }};
}
