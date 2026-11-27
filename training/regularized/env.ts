import { mazo, type CardId } from "@eltruco/motor/cartas.ts";
import { aDecidir, anticiparAnteFlor, aplicarOnline, iniciarOnline, segundaPerdidaEnDuelo, vistaOnline, vistaParaPolitica,
  type AccionOnline, type EstadoOnline } from "@eltruco/motor/mesa-online.ts";
import type { Asiento, RepartoOnline, TresCartas } from "@eltruco/motor/reparto.ts";
import { crearIndicacionPie, vistaDelPie, type IndicacionPie, type VistaPie } from "@eltruco/motor/senas-pie.ts";
import { elegirIndicacionesPie } from "@eltruco/motor/bot-pie.ts";
import { countPublicHand } from "../contracts/duel-memory.ts";
import type { PublicTurn } from "../contracts/index.ts";
import { encode, privileged, slotCount, slotOf, actionOf, type DecisionContext } from "./features.ts";
import { policy, sampleSlot, type Network } from "./network.ts";

/**
 * duel-prod: reglas de las mesas de la API (flor inmediata, subida con rival posible, respuestas sin flor).
 * duel-arena: reparto V1 de la arena y del campeonato. pie: parejas con señas al pie, como crea la app.
 */
export type Mode = "duel-prod" | "duel-arena" | "pie" | "tercetos";
export const seatsOf = (mode: Mode) => mode === "tercetos" ? 6 : mode === "pie" ? 4 : 2;
/** Modalidades con señas al pie: parejas y tercetos, como crea la app. */
export const withPie = (mode: Mode) => mode === "pie" || mode === "tercetos";

export function rng(seed: number): () => number {
  let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88 ^ seed, d = 0xb7e15162;
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function deal(mode: Mode, random: () => number, mano: Asiento): RepartoOnline {
  const n = seatsOf(mode);
  const cards = [...mazo];
  for (let i = 0; i <= n * 3; i++) {
    const j = i + Math.floor(random() * (cards.length - i));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const manos = Array.from({ length: n }, (_, s): TresCartas => {
    const i = (s - mano + n) % n;
    return [cards[i], cards[i + n], cards[i + 2 * n]] as TresCartas;
  });
  const base = { versionReparto: (n === 6 ? "online-2" : "online-1") as "online-1", mano, dador: ((mano + n - 1) % n) as Asiento, manos, muestra: cards[n * 3] as CardId };
  if (mode === "duel-arena") return base;
  const seats = Array.from({ length: n }, (_, i) => i as Asiento);
  return { ...base, reglaFlor: "inmediata-v2", subidaFlor: "con-rival-posible", respondenSinFlor: seats, respuestaSinFlor: "antes-de-actuar" };
}

/** Todo lo que un agente puede necesitar. Cada agente toma solo la proyección de su asiento. */
export interface Situation {
  mode: Mode;
  estado: EstadoOnline;
  seat: Asiento;
  score: [number, number];
  target: number;
  turns: readonly PublicTurn[];
  /** Contadores públicos por asiento en duelo (countPublicHand). */
  counts: number[][];
  indicaciones: readonly IndicacionPie[];
  uniform: number;
}

export interface StepRecord {
  x: Float32Array;
  priv: Float32Array;
  mask: Uint8Array;
  slot: number;
  logp: number;
  /** Distribución del maestro, solo en clonación. */
  target?: Float64Array;
  /** Recompensa moldeada por potencial que se acredita al cerrar la mano. */
  reward?: number;
}
/** Valor del tanteador para un equipo, en [-1, 1]: Φ(propios, ajenos) = 2·P(ganar el chico) − 1. */
export type Potential = (own: number, foe: number) => number;
export interface Agent {
  id: string;
  act(s: Situation): { action: AccionOnline; record?: StepRecord };
}

export function contextOf(s: Situation): DecisionContext {
  const { estado, seat, mode } = s;
  if (withPie(mode)) {
    return { vista: vistaOnline(estado, seat), score: s.score, target: s.target,
      pie: { vista: vistaDelPie(estado, seat, s.indicaciones), indicaciones: s.indicaciones } };
  }
  return { vista: vistaParaPolitica(estado, seat), score: s.score, target: s.target, rivalCounts: s.counts[1 - seat] };
}

/** Agente de red. Registra la decisión si hay más de una ranura legal. */
export function netAgent(id: string, net: Network, learn: boolean): Agent {
  return { id, act(s) {
    const ctx = contextOf(s);
    const { x, mask, cards } = encode(ctx);
    const p = policy(net, x, mask);
    const slot = sampleSlot(p, s.uniform);
    const action = actionOf(slot, cards, s.seat);
    let legalCount = 0;
    for (let i = 0; i < slotCount; i++) legalCount += mask[i];
    const record = learn && legalCount > 1
      ? { x, priv: privileged(s.estado, s.seat), mask, slot, logp: Math.log(p[slot]) } : undefined;
    return { action, record };
  } };
}

/** Envuelve a un agente de reglas y registra su elección como objetivo de clonación. */
export function teacherAgent(inner: Agent, probabilities?: (s: Situation) => Float64Array | undefined): Agent {
  return { id: "teacher:" + inner.id, act(s) {
    const { action } = inner.act(s);
    const ctx = contextOf(s);
    const { x, mask, cards } = encode(ctx);
    let legalCount = 0;
    for (let i = 0; i < slotCount; i++) legalCount += mask[i];
    if (legalCount <= 1) return { action };
    const target = probabilities?.(s) ?? (() => { const t = new Float64Array(slotCount); t[slotOf(action, cards)] = 1; return t; })();
    const slot = slotOf(action, cards);
    return { action, record: { x, priv: privileged(s.estado, s.seat), mask, slot, logp: 0, target } };
  } };
}

export interface ChicoResult {
  winner: 0 | 1;
  score: [number, number];
  hands: number;
  /** Decisiones registradas por asiento, en orden. */
  records: StepRecord[][];
  points: { truco: [number, number]; envido: [number, number]; flor: [number, number] };
  /** Si las recompensas ya vienen moldeadas por mano (y suman el resultado final). */
  shaped: boolean;
  /** Tanteador al empezar cada reparto. */
  starts: [number, number][];
}

function scoreOf(state: EstadoOnline): [number, number] {
  const p: [number, number] = [...state.puntosInicio];
  for (const c of state.cobros) p[c.equipo] += c.tantos;
  return [Math.min(p[0], state.meta), Math.min(p[1], state.meta)];
}

/** Pie de cada equipo: da sus indicaciones con la regla clásica al abrir cada vuelta. */
function pieIndications(estado: EstadoOnline, indicaciones: IndicacionPie[]) {
  for (let seat = 0; seat < estado.mano.reparto.manos.length; seat++) {
    const asiento = seat as Asiento;
    let pie: VistaPie | undefined;
    try { pie = vistaDelPie(estado, asiento, indicaciones); } catch { pie = undefined; }
    if (!pie || pie.pie !== asiento || !pie.opciones.length) continue;
    const vista = vistaOnline(estado, asiento);
    for (const p of elegirIndicacionesPie(vista, pie)) {
      const frase = crearIndicacionPie(estado, asiento, p.destinatario, p.frase, pie.vuelta, indicaciones, p.carta);
      if (frase) indicaciones.push(frase);
    }
  }
}

/** `dealRandom` separa el azar de los repartos del de las decisiones, para emparejar chicos con los mismos repartos. */
export function playChico(mode: Mode, agents: readonly Agent[], random: () => number, target = 40, firstMano?: Asiento,
    dealRandom: () => number = random, potential?: Potential): ChicoResult {
  const n = seatsOf(mode);
  if (agents.length !== n) throw new Error("Cantidad de agentes incorrecta.");
  let score: [number, number] = [0, 0];
  let mano = (firstMano ?? Math.floor(random() * n)) as Asiento;
  const records: StepRecord[][] = Array.from({ length: n }, () => []);
  const counts = [Array(12).fill(0), Array(12).fill(0)];
  const points = { truco: [0, 0] as [number, number], envido: [0, 0] as [number, number], flor: [0, 0] as [number, number] };
  let hands = 0;
  // Moldeado por potencial (Ng et al., 1999): al cerrar cada mano, cada asiento recibe Φ(después) − Φ(antes) de su equipo.
  // La suma telescópica es el resultado final menos Φ(0, 0), así que la política óptima no cambia.
  const pending = new Array(n).fill(0);
  const starts: [number, number][] = [];
  const phi = (team: number, s: readonly [number, number]) =>
    s[team] >= target ? 1 : s[1 - team] >= target ? -1 : potential!(s[team], s[1 - team]);
  while (Math.max(...score) < target) {
    if (hands > 200) throw new Error("El chico no avanzó.");
    let estado = iniciarOnline(deal(mode, dealRandom, mano), score, target, hands + 1);
    const before = score;
    starts.push([score[0], score[1]]);
    const firstRecord = records.map(r => r.length);
    const turns: PublicTurn[] = [];
    const indicaciones: IndicacionPie[] = [];
    let round = 0;
    let steps = 0;
    while (!estado.resultado) {
      if (++steps > 240) throw new Error("La mano no avanzó.");
      if (withPie(mode)) {
        // En tercetos cada lance abre su propia mano: la vuelta se identifica junto con el lance.
        const r = (estado.historialLances?.length ?? 0) * 4 + estado.mano.vueltas.length + 1;
        if (r !== round) { round = r; pieIndications(estado, indicaciones); }
      }
      const seat = aDecidir(estado)[0];
      const live = scoreOf(estado);
      const { action, record } = agents[seat].act({ mode, estado, seat, score: live, target, turns, counts,
        indicaciones, uniform: random() });
      if (record) records[seat].push(record);
      // Como confirmarComputadora en la API: una carta elegida cuando solo cabe entregar es irse al mazo.
      const entregar = !withPie(mode) && action.tipo === "carta" && estado.mano.restantes[seat].includes(action.carta)
        && (estado.antesDeSalida === seat || segundaPerdidaEnDuelo(estado, seat));
      const step = aplicarOnline(estado, entregar ? { tipo: "mazo", asiento: seat } : action);
      if (!step.ok) throw new Error(`Acción rechazada (${agents[seat].id}): ${step.error} ${JSON.stringify(action)}`);
      const applied = step.estado.acciones.at(-1) ?? action;
      turns.push({ action: applied as PublicTurn["action"], awards: step.estado.cobros.slice(estado.cobros.length) });
      estado = mode === "duel-arena" || n !== 2 ? step.estado : anticiparAnteFlor(step.estado, []);
    }
    for (const c of estado.cobros) points[c.motivo][c.equipo] += c.tantos;
    if (n === 2) countPublicHand(counts, turns.map(t => t.action));
    score = scoreOf(estado);
    if (potential) {
      for (let seat = 0; seat < n; seat++) {
        const team = seat % 2;
        pending[seat] += phi(team, score) - phi(team, before);
        if (records[seat].length > firstRecord[seat]) {
          const last = records[seat][records[seat].length - 1];
          last.reward = (last.reward ?? 0) + pending[seat];
          pending[seat] = 0;
        }
      }
    }
    mano = ((mano + 1) % n) as Asiento;
    hands++;
  }
  if (potential) {
    for (let seat = 0; seat < n; seat++) {
      const last = records[seat].at(-1);
      if (last && pending[seat]) last.reward = (last.reward ?? 0) + pending[seat];
    }
  }
  return { winner: score[0] >= target ? 0 : 1, score, hands, records, points, shaped: !!potential, starts };
}
