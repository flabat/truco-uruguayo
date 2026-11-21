import {readFileSync} from "node:fs";
import {alphaZeroBases, alphaZeroKind} from "../api/alphazero-actor.ts";
import {artifactPin, createServing, defaultDeadlineMs} from "../api/serving.ts";
import {confirmarComputadora, prepararTurno} from "../api/turnos.ts";
import {aDecidir, iniciarOnline, vistaParaPolitica} from "../src/motor/mesa-online.ts";
import {crearAzar, equipoDelAsiento} from "../src/motor/reparto.ts";
import {scheduledDeal} from "../training/arena/index.ts";
import {hasSignals, type Move} from "../training/contracts/index.ts";
import {summarize, type PairOutcome} from "../training/eval/statistics.ts";
import {observe} from "../training/seat/index.ts";
import {signalRules} from "../training/signals/index.ts";

const [path,rawPairs="128",rawSeed="2981007"] = process.argv.slice(2);
const pairs = Number(rawPairs), seed = Number(rawSeed);
if (!path || !Number.isSafeInteger(pairs) || pairs<2 || !Number.isSafeInteger(seed) || seed<0 || seed>0xffffffff) {
  throw new Error("Uso: node scripts/medir-alphazero-en-mesa.ts ACTOR [PARES] [SEMILLA]");
}
const actor = JSON.parse(readFileSync(path,"utf8"));
const format = actor.format as keyof typeof alphaZeroBases;
if (actor.kind!==alphaZeroKind || !Object.hasOwn(alphaZeroBases,format)) throw new Error("Se requiere un actor AlphaZero");
const pin = artifactPin(actor);
const ceibo = alphaZeroBases[format];
if (artifactPin(actor.base)!==ceibo) throw new Error("Ceibo base inconsistente");
const server = createServing({loadArtifact:async key=>key===pin?actor:key===ceibo?actor.base:null});
const latency: number[] = [];
const fallbacks: Record<string,number> = {};
let opponentFallbacks = 0;

async function leg(pair: number, side: 0|1) {
  const random = crearAzar((seed^Math.imul(1+2*pair+side,0x9e3779b9))>>>0);
  const score: [number,number] = [0,0];
  for (let hand=0;hand<79;hand++) {
    let game = prepararTurno({estado:iniciarOnline(scheduledDeal(format,seed,pair,hand),score,40),turnos:[]},[]);
    while (!game.estado.resultado) {
      if (game.turnos.length>=64) throw new Error("La mano no avanzó");
      const seat = aDecidir(game.estado)[0];
      const view = observe(game.estado,seat,format,game.turnos,vistaParaPolitica);
      const obs = hasSignals(format) ? {...view,legalActions:signalRules.legalActions(view.legalActions as Move[])} : view;
      const candidate = equipoDelAsiento(seat)===side;
      const decision = await server.decide(candidate?pin:ceibo,obs,random());
      if (candidate) {
        latency.push(decision.latencyMs);
        if (decision.fallback) fallbacks[decision.fallback]=(fallbacks[decision.fallback]??0)+1;
      } else opponentFallbacks+=Number(decision.fallback!==null);
      game = prepararTurno(confirmarComputadora(game,format,seat,decision.action),[]);
    }
    for (const award of game.estado.cobros) score[award.equipo]=Math.min(40,score[award.equipo]+award.tantos);
    if (score[0]===40 || score[1]===40) return Number(score[side]===40);
  }
  throw new Error("El chico no avanzó");
}

const outcomes: PairOutcome[] = [];
try {
  await server.warm();
  for (let pair=0;pair<pairs;pair++) {
    const candidate: [number,number] = [await leg(pair,0),await leg(pair,1)];
    outcomes.push({pair,candidate,incumbent:[1-candidate[0],1-candidate[1]]});
  }
} finally {
  await server.close();
}
const {direct} = summarize([{id:"ceibo",pairs:outcomes}],"ceibo",10000,.10);
const coldMs=latency[0];
latency.sort((a,b)=>a-b);
const p = (q:number)=>latency[Math.ceil(q*latency.length)-1];
console.log(JSON.stringify({format,pin,ceibo,seed,pairs,...direct,deadlineMs:defaultDeadlineMs,decisions:latency.length,
  coldMs,p50:p(.5),p95:p(.95),p99:p(.99),fallbacks,opponentFallbacks}));
