import type {Asiento} from "../src/motor/reparto.ts";
import {seatsFor, type Format, type Policy} from "../training/contracts/index.ts";
import {validNetwork, type Network} from "../training/alphazero/model.ts";
import {search} from "../training/alphazero/search.ts";
import type {Continuation} from "../training/search/continuation.ts";

export const alphaZeroKind = "truco-alphazero-serving-v1";
export const alphaZeroBases = {
  duel:"d2146e8dd1b79dd3ca50c38029b0f35f7377a0c627d4b3078a1475d2f9043ac3",
  pairs:"6167e85c55fad708de425839d3ff51ca05eb7af5c5f9ae94252bb5513071d2e2",
  "pairs-private-senas":"d2b2293d4d8c9ee4f067ee74c1d6d5983eb5c8ad3a4ebce57bbdb561f946b78b",
} as const;
type AlphaFormat = keyof typeof alphaZeroBases;
interface Actor {
  kind: typeof alphaZeroKind;
  format: AlphaFormat;
  base: unknown;
  net: Network;
  continuation: Continuation;
  simulations: number;
  seed: number;
}

function checkContinuation(table: Continuation, format: AlphaFormat) {
  if (table?.schema !== "score-continuation-v1" || table.format !== format ||
      !table.exact || !table.bands || typeof table.exact !== "object" || typeof table.bands !== "object" ||
      Array.isArray(table.exact) || Array.isArray(table.bands)) throw new Error("Tabla de continuación inválida.");
  const seats = seatsFor(format);
  const sums = new Map<string,{hands:number;wins:number}>();
  const validCount = (cell: {hands:number;wins:number}) =>
    cell && Number.isSafeInteger(cell.hands) && cell.hands>0 && cell.hands<=100_000_000 &&
    Number.isSafeInteger(cell.wins) && cell.wins>=0 && cell.wins<=cell.hands;
  for (const [key,cell] of Object.entries(table.exact)) {
    const [a,b,seat] = key.split("/").map(Number);
    if (key!==[a,b,seat].join("/") || ![a,b,seat].every(Number.isInteger) ||
        a<0 || a>=40 || b<0 || b>=40 || seat<0 || seat>=seats || !validCount(cell)) {
      throw new Error("Celda de continuación inválida.");
    }
    const band = [Math.floor(a/8),Math.floor(b/8),seat].join("/");
    const sum = sums.get(band) ?? {hands:0,wins:0};
    sums.set(band,{hands:sum.hands+cell.hands,wins:sum.wins+cell.wins});
  }
  if (sums.size!==Object.keys(table.bands).length || [...sums].some(([k,v]) =>
    table.bands[k]?.hands!==v.hands || table.bands[k]?.wins!==v.wins)) throw new Error("Bandas de continuación inconsistentes.");
}

export function openAlphaZero(raw: unknown, format: Format, seat: Asiento,
                              pin: (value:unknown)=>string, base: (value:unknown, seat:Asiento)=>Policy): Policy {
  const actor = raw as Actor;
  if (!Object.hasOwn(alphaZeroBases,format) || actor.kind!==alphaZeroKind || actor.format!==format ||
      seat<0 || seat>=seatsFor(format) || !validNetwork(actor.net) ||
      !Number.isSafeInteger(actor.simulations) || actor.simulations<2 || actor.simulations>48 ||
      !Number.isSafeInteger(actor.seed) || actor.seed<0 || actor.seed>0xffffffff) throw new Error("Actor AlphaZero inválido.");
  if (pin(actor.base)!==alphaZeroBases[actor.format]) throw new Error("Actor Ceibo base distinto del publicado.");
  checkContinuation(actor.continuation,actor.format);
  const fields = Array.from({length:seatsFor(format)},(_,i)=>base(actor.base,i as Asiento));
  const decide = search(structuredClone(actor.net),{
    field:id=>fields[id],table:structuredClone(actor.continuation),simulations:actor.simulations,seed:actor.seed,live:true,
  });
  return {id:alphaZeroKind,decide(obs,legal) {
    if (obs.view.asiento!==seat || obs.format!==format) throw new Error("Observación de otro asiento o formato.");
    if (!legal.length) return [];
    return obs.target===40 ? decide({...obs,legalActions:legal}).probabilities : fields[seat].decide(obs,legal);
  }};
}
