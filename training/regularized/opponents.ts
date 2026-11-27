import { readFileSync } from "node:fs";
import { compararCartas } from "@eltruco/motor/jerarquia.ts";
import { elegirAccionOnline, vistaOnline, vistaParaPolitica, type AccionOnline, type VistaOnline } from "@eltruco/motor/mesa-online.ts";
import { elegirAccionConPie, politicaPie } from "@eltruco/motor/bot-pie.ts";
import { elegirAccionModeloPie, modeloPieParejas, politicaPieParejas } from "@eltruco/motor/modelo-pie.ts";
import { vistaDelPie } from "@eltruco/motor/senas-pie.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import { openActor } from "../../api/actor-registry.ts";
import { baseline, styles } from "../baselines/index.ts";
import { sample } from "../arena/index.ts";
import type { Policy } from "../contracts/index.ts";
import { challenger, decodeMove, observe } from "../seat/index.ts";
import type { Agent, Situation } from "./env.ts";

export const duelStyles = styles;
export type PieStyle = typeof styles[number];

/** Agente que usa una política del contrato de asiento (Ceibo, V1, estilos, retador). */
export function policyAgent(id: string, make: (seat: Asiento) => Policy): Agent {
  const cache = new Map<number, Policy>();
  return { id, act(s: Situation) {
    let p = cache.get(s.seat);
    if (!p) { p = make(s.seat); cache.set(s.seat, p); }
    const base = observe(s.estado, s.seat, "duel", s.turns, vistaParaPolitica);
    const obs = { ...base, rivalCounts: s.counts[1 - s.seat].slice() };
    const legal = obs.legalActions;
    const probs = p.decide(obs, legal);
    const move = legal[sample(probs, legal.length, s.uniform)];
    return { action: decodeMove(move as never, s.seat) as AccionOnline };
  } };
}

/** V1 directo sobre la vista de política, sin construir la observación completa. */
export const v1Duel: Agent = { id: "v1", act(s) {
  const action = elegirAccionOnline(vistaParaPolitica(s.estado, s.seat));
  if (!action) throw new Error("V1 sin acción.");
  return { action };
} };

export function ceiboAgent(path: string): Agent {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  return policyAgent("ceibo", seat => openActor(artifact, "duel", seat));
}

export function duelBaseline(id: string): Agent {
  if (id === "v1") return v1Duel;
  if (id === "challenger") return policyAgent(id, () => challenger);
  return policyAgent(id, () => baseline(id));
}

type PieRule = (vista: VistaOnline, s: Situation) => AccionOnline | null;
function pieAgent(id: string, rule: PieRule): Agent {
  return { id, act(s) {
    const vista = vistaOnline(s.estado, s.seat);
    const action = rule(vista, s);
    if (!action) throw new Error(id + " sin acción.");
    return { action };
  } };
}
const pieOf = (s: Situation) => vistaDelPie(s.estado, s.seat, s.indicaciones);
export const pieClassic = pieAgent(politicaPie, (v, s) => elegirAccionConPie(v, pieOf(s), s.indicaciones));
export const pieChampion = pieAgent(politicaPieParejas, (v, s) => elegirAccionModeloPie(modeloPieParejas, v, pieOf(s), s.indicaciones));

/** Los cinco estilos del campo oficial, aplicados sobre el bot clásico al pie como se aplican sobre V1 en duelo. */
export function pieStyle(style: PieStyle): Agent {
  return pieAgent("pie-" + style, (v, s) => {
    const usual = elegirAccionConPie(v, pieOf(s), s.indicaciones);
    const { legales, asiento } = v;
    if (style === "caller" && legales.includes("quiero")) return { tipo: "quiero", asiento };
    if (style === "folder" && legales.includes("no-quiero")) return { tipo: "no-quiero", asiento };
    if ((style === "frequent-bluff" || style === "rare-bluff") && !v.acciones.length
        && legales.includes("falta-envido") && v.tantosPropios.total < 35) {
      const chance = style === "frequent-bluff" ? 0.65 : 0.08;
      // El uniforme del árbitro decide el farol; la parte restante reescala a la jugada habitual.
      if (s.uniform < chance) return { tipo: "falta-envido", asiento };
    }
    if (style === "strong-cards" && legales.includes("carta") && v.cartas.length) {
      const best = v.cartas.reduce((a, b) => compararCartas(a, b, v.muestra) >= 0 ? a : b);
      return { tipo: "carta", asiento, carta: best };
    }
    return usual;
  });
}

export function pieBaseline(id: string): Agent {
  if (id === politicaPie || id === "v1") return pieClassic;
  if (id === politicaPieParejas || id === "champion") return pieChampion;
  if (id.startsWith("pie-") && styles.includes(id.slice(4) as PieStyle)) return pieStyle(id.slice(4) as PieStyle);
  throw new Error("Rival al pie desconocido: " + id);
}
