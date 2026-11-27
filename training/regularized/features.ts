import { esCardId, pieza, rangoDe, type CardId } from "@eltruco/motor/cartas.ts";
import { compararCartas, matas } from "@eltruco/motor/jerarquia.ts";
import type { AccionOnline, EstadoOnline, TipoAccionOnline, VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";
import { evaluarTantos } from "@eltruco/motor/tantos.ts";
import { catalogoGestosPie, gestoDeCarta, type GestoPie, type IndicacionPie, type VistaPie } from "@eltruco/motor/senas-pie.ts";

/** Versión del codificador. Cambia si cambia cualquier rasgo o ranura. */
export const featureVersion = "regularized-features-v1";

/** Tres ranuras de carta, ordenadas por fuerza de la mano original, y una por cada canto. */
export const bidSlots = ["truco", "retruco", "vale-cuatro", "envido", "real-envido", "falta-envido", "flor",
  "con-flor-envido", "contraflor-al-resto", "con-flor-quiero", "quiero", "no-quiero", "paso-flor", "mazo"] as const;
export type BidSlot = typeof bidSlots[number];
export const slotCount = 3 + bidSlots.length;
const actionTypes = ["carta", ...bidSlots] as const;
const maxSeats = 6;
const historyLength = 10;
const gestures = Object.keys(catalogoGestosPie) as GestoPie[];
const phrases = ["veni", "juga", "voy-a-vos"] as const;

/** Lo que ve el asiento que decide. Nada de esto depende de las manos ajenas. */
export interface DecisionContext {
  vista: VistaOnline;
  /** Tanteador público por equipo al momento de decidir, ya limitado a la meta. */
  score: readonly [number, number];
  target: number;
  /** Doce contadores públicos de `countPublicHand` para el rival, solo en duelo. */
  rivalCounts?: readonly number[];
  /** Señas al pie del equipo y palabras públicas de la mano. */
  pie?: { vista?: VistaPie; indicaciones: readonly IndicacionPie[] };
}

const strengthCache = new Map<CardId, Map<CardId, number>>();
/** 1 para la pieza mayor, 0 para el cuatro común. Los comunes del mismo número empatan. */
export function strength(card: CardId, muestra: CardId): number {
  let table = strengthCache.get(muestra);
  if (!table) { table = new Map(); strengthCache.set(muestra, table); }
  let value = table.get(card);
  if (value === undefined) {
    // El cuatro de otro palo que la muestra siempre es la carta más baja del mazo.
    const lowest = (muestra.startsWith("copas") ? "bastos-04" : "copas-04") as CardId;
    value = compararCartas(card, lowest, muestra) / 18;
    table.set(card, value);
  }
  return value;
}

function cardEnvido(card: CardId, muestra: CardId): number {
  const p = pieza(card, muestra);
  if (p !== null) return { 2: 30, 4: 29, 5: 28, 11: 27, 10: 27 }[p] / 30;
  const r = rangoDe(card);
  return r <= 7 ? r / 30 : 0;
}

/** Cartas de la mano original del asiento: las que conserva más las que ya jugó en esta mano. */
export function originalCards(vista: VistaOnline): CardId[] {
  const played = vista.acciones.flatMap(a => a.tipo === "carta" && a.asiento === vista.asiento ? [a.carta] : []);
  const cards = [...vista.cartas, ...played];
  return cards.sort((a, b) => compararCartas(b, a, vista.muestra) || a.localeCompare(b));
}

export interface Encoded {
  x: Float32Array;
  mask: Uint8Array;
  /** Carta de cada ranura de carta, en orden de fuerza original. */
  cards: readonly CardId[];
}

export function slotOf(action: { tipo: TipoAccionOnline; carta?: CardId }, cards: readonly CardId[]): number {
  if (action.tipo === "carta") {
    const i = cards.indexOf(action.carta!);
    if (i < 0) throw new Error("La carta no está en la mano original.");
    return i;
  }
  const i = bidSlots.indexOf(action.tipo as BidSlot);
  if (i < 0) throw new Error("Canto sin ranura: " + action.tipo);
  return 3 + i;
}

export function actionOf(slot: number, cards: readonly CardId[], asiento: Asiento): AccionOnline {
  if (slot < 3) return { tipo: "carta", asiento, carta: cards[slot] };
  return { tipo: bidSlots[slot - 3], asiento } as AccionOnline;
}

class Writer {
  readonly x: Float32Array;
  i = 0;
  constructor(size: number) { this.x = new Float32Array(size); }
  push(v: number) { this.x[this.i++] = v; }
  flag(v: boolean) { this.x[this.i++] = v ? 1 : 0; }
  oneHot(index: number, size: number) { if (index >= 0 && index < size) this.x[this.i + index] = 1; this.i += size; }
}

let inputSize = 0;
export function featureSize(): number {
  if (!inputSize) inputSize = encodeInto(null).i;
  return inputSize;
}

/** Vector de rasgos y máscara de ranuras legales. */
export function encode(ctx: DecisionContext): Encoded {
  const size = featureSize();
  const w = encodeInto(ctx);
  if (w.i !== size) throw new Error("Tamaño de rasgos inesperado.");
  const cards = originalCards(ctx.vista);
  const mask = new Uint8Array(slotCount);
  for (const tipo of ctx.vista.legales) {
    if (tipo === "carta") for (const c of ctx.vista.cartas) mask[cards.indexOf(c)] = 1;
    else mask[3 + bidSlots.indexOf(tipo as BidSlot)] = 1;
  }
  return { x: w.x, mask, cards };
}

function encodeInto(ctx: DecisionContext | null): Writer {
  const w = new Writer(inputSize || 4096);
  const v = ctx?.vista;
  const n = v ? v.equipoPorAsiento.length : 2;
  const me = v?.asiento ?? 0;
  const rel = (seat: number) => (seat - me + n) % n;
  const team = v ? v.equipoPorAsiento[me] : 0;
  const mine = (seat: number) => v!.equipoPorAsiento[seat] === team;
  const muestra = v?.muestra ?? ("oros-01" as CardId);
  const s = (c: CardId) => strength(c, muestra);

  // Formato y posición.
  w.flag(n === 2); w.flag(n === 4); w.flag(n === 6);
  w.oneHot(v ? rel(v.mano) : -1, maxSeats);
  w.oneHot(v ? rel(v.dador) : -1, maxSeats);

  // Mano original, por fuerza.
  const cards = v ? originalCards(v) : [];
  for (let i = 0; i < 3; i++) {
    const c = cards[i];
    w.push(c ? s(c) : 0);
    w.flag(!!c && pieza(c, muestra) !== null);
    w.flag(!!c && matas.includes(c));
    w.push(c ? cardEnvido(c, muestra) : 0);
    w.flag(!!c && v!.cartas.includes(c));
    w.flag(!!c && rangoDe(c) === 3);
  }
  const tantos = v ? v.tantosPropios : { total: 0, modalidad: "envido" };
  w.push(tantos.total / 40); w.flag(tantos.modalidad === "flor");
  w.push(cards.filter(c => pieza(c, muestra) !== null).length / 3);
  w.push(cards.filter(c => s(c) >= strength("oros-03" as CardId, muestra)).length / 3);
  w.push(v ? v.cartas.length / 3 : 0);

  // Vueltas cerradas y vuelta actual.
  const tricks = v ? [...v.vueltas, ...(v.vueltaActual ? [v.vueltaActual] : [])] : [];
  for (let t = 0; t < 3; t++) {
    const trick = tricks[t];
    const played = new Array(maxSeats).fill(0);
    for (const j of trick?.jugadas ?? []) played[rel(j.asiento)] = 0.1 + 0.9 * s(j.carta);
    for (const p of played) w.push(p);
    const result = trick && "resultado" in trick ? trick.resultado : undefined;
    w.flag(result?.tipo === "ganada" && result.equipo === team);
    w.flag(result?.tipo === "ganada" && result.equipo !== team);
    w.flag(result?.tipo === "parda");
    w.oneHot(trick ? rel(trick.salida) : -1, maxSeats);
  }
  const current = v?.vueltaActual?.jugadas ?? [];
  const rivalsOnTable = current.filter(j => !mine(j.asiento)).map(j => s(j.carta));
  const partnersOnTable = current.filter(j => mine(j.asiento)).map(j => s(j.carta));
  w.push(rivalsOnTable.length ? Math.max(...rivalsOnTable) : -0.1);
  w.push(partnersOnTable.length ? Math.max(...partnersOnTable) : -0.1);
  w.push(current.length / n);
  w.flag(!!v && current.length === n - 1);
  w.push(v ? v.vueltas.length / 3 : 0);

  // Apuestas.
  w.push(v ? v.valorTruco / 4 : 0);
  const truco = v?.trucoPendiente;
  w.oneHot(truco ? ["truco", "retruco", "vale-cuatro"].indexOf(truco.tipo) : -1, 3);
  w.flag(!!truco && mine(truco.asiento));
  const pending = v?.pendiente;
  const lateral = ["envido", "real-envido", "falta-envido", "flor", "con-flor-envido", "contraflor-al-resto"];
  w.oneHot(pending ? lateral.indexOf(pending.tipo) : -1, lateral.length);
  w.flag(!!pending && mine(pending.asiento));
  w.flag(v?.apuesta === "querido");
  const actions = v?.acciones ?? [];
  for (const type of ["truco", "retruco", "vale-cuatro", "envido", "real-envido", "falta-envido", "flor", "quiero", "no-quiero"]) {
    w.push(actions.filter(a => a.tipo === type && mine(a.asiento)).length / 2);
    w.push(actions.filter(a => a.tipo === type && !mine(a.asiento)).length / 2);
  }

  // Tantos revelados y cobros de esta mano.
  const revealed = new Array(maxSeats).fill(-0.1);
  for (const cobro of v?.cobros ?? []) {
    for (const p of cobro.comparacionEnvido?.participantes ?? []) if (p.total !== null) revealed[rel(p.asiento)] = p.total / 40;
    for (const p of cobro.comparacionFlor?.participantes ?? []) revealed[rel(p.asiento)] = p.total / 40;
  }
  for (const r of revealed) w.push(r);
  let wonHere = 0, lostHere = 0;
  for (const c of v?.cobros ?? []) if (c.equipo === team) wonHere += c.tantos; else lostHere += c.tantos;
  w.push(wonHere / 10); w.push(lostHere / 10);

  // Tanteador.
  const target = ctx?.target ?? 40;
  const own = ctx ? ctx.score[team] : 0, foe = ctx ? ctx.score[1 - team] : 0;
  w.push(own / target); w.push(foe / target); w.push((target - own) / 40); w.push((target - foe) / 40);
  w.push((own - foe) / target); w.push(target / 40);
  w.flag(own >= target / 2); w.flag(foe >= target / 2);

  // Historial reciente de la mano, del más nuevo al más viejo.
  for (let k = 0; k < historyLength; k++) {
    const a = actions[actions.length - 1 - k];
    w.oneHot(a ? rel(a.asiento) : -1, maxSeats);
    w.oneHot(a ? actionTypes.indexOf(a.tipo as typeof actionTypes[number]) : -1, actionTypes.length);
    w.push(a?.tipo === "carta" ? s(a.carta) : 0);
  }

  // Memoria pública del rival en el chico (duelo).
  const m = ctx?.rivalCounts;
  const ratio = (a: number, b: number) => m && m[b] > 0 ? m[a] / m[b] : 0;
  w.flag(!!m);
  w.push(m ? Math.min(m[0], 30) / 30 : 0);
  w.push(ratio(1, 0));
  for (const g of [2, 5, 8]) { w.push(ratio(g + 1, g)); w.push(ratio(g + 2, g)); w.push(m ? Math.min(m[g], 20) / 20 : 0); }

  // Señas al pie: gestos visibles al asiento y palabras de la vuelta.
  const pie = ctx?.pie;
  w.flag(!!pie);
  w.flag(!!pie?.vista && pie.vista.pie === me);
  const seen = new Set(pie?.vista?.grupos.filter(g => g.emisor !== me).flatMap(g => g.gestos) ?? []);
  for (const g of gestures) w.flag(seen.has(g));
  const round = v ? v.vueltas.length + 1 : 0;
  const words = (pie?.indicaciones ?? []).filter(i => i.vuelta === round);
  const toMe = words.find(i => i.destinatario === me);
  w.oneHot(toMe ? phrases.indexOf(toMe.frase) : -1, 3);
  const asked = toMe?.carta;
  for (let i = 0; i < 3; i++) {
    const c = cards[i];
    w.flag(!!asked && !!c && gesturesOf(c, muestra) === asked);
  }
  w.flag(words.some(i => i.emisor === me && i.frase === "voy-a-vos"));
  w.flag(words.some(i => !mine(i.emisor) && i.frase !== "veni"));
  w.flag(words.some(i => !mine(i.emisor) && i.frase === "veni"));

  // Máscara legal como rasgo.
  const legal = new Set(v?.legales ?? []);
  w.flag(legal.has("carta"));
  for (const b of bidSlots) w.flag(legal.has(b));
  return w;
}

function gesturesOf(card: CardId, muestra: CardId) { return gestoDeCarta(card, muestra); }

/** Rasgos del crítico: las manos de todos los asientos. Nunca llegan al actor. */
export const privilegedSize = maxSeats * 3 * 3 + maxSeats * 2;
export function privileged(estado: EstadoOnline, asiento: Asiento): Float32Array {
  const out = new Float32Array(privilegedSize);
  const { manos, muestra } = estado.mano.reparto;
  const n = manos.length;
  for (let r = 0; r < n; r++) {
    const seat = (asiento + r) % n;
    const hand = [...manos[seat]].sort((a, b) => compararCartas(b, a, muestra));
    const remaining = estado.mano.restantes[seat];
    hand.forEach((c, i) => {
      const o = (r * 3 + i) * 3;
      out[o] = strength(c, muestra); out[o + 1] = pieza(c, muestra) !== null ? 1 : 0; out[o + 2] = remaining.includes(c) ? 1 : 0;
    });
    const t = evaluarTantos(manos[seat], muestra);
    out[maxSeats * 9 + r * 2] = t.total / 40;
    out[maxSeats * 9 + r * 2 + 1] = t.modalidad === "flor" ? 1 : 0;
  }
  return out;
}

export function isCard(x: unknown): x is CardId { return esCardId(x); }
