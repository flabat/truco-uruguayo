import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {alphaZeroBases,alphaZeroKind} from "../api/alphazero-actor.ts";
import {artifactPin,openActor} from "../api/actor-registry.ts";
import type {Asiento} from "../src/motor/reparto.ts";
import {seatsFor} from "../training/contracts/index.ts";

const [directory] = process.argv.slice(2);
if (!directory || process.argv.length!==3) throw new Error("Uso: node scripts/exportar-alphazero.ts DIRECTORIO > actor.json");
const read = (name:string) => JSON.parse(readFileSync(join(directory,name+".json"),"utf8"));
const plan = read("plan"), policy = read("policy"), result = read("result"), base = read("ceibo");
const format = plan.format as keyof typeof alphaZeroBases;
if (!Object.hasOwn(alphaZeroBases,format) || plan.pin!==alphaZeroBases[format] ||
    policy.schema!=="truco-alphazero-policy-v1" || policy.plan!==artifactPin(plan) ||
    policy.ceibo!==plan.pin || result.policy!==artifactPin(policy) || result.simulations!==plan.simulations ||
    result.pairedDeals!==plan.evalPairs || result.format!==format) throw new Error("Evaluación o procedencia incompatibles.");
const seed = createHash("sha256").update(`${plan.seed}:search-evaluation`).digest().readUInt32BE();
const actor = {kind:alphaZeroKind,format,base,net:policy.net,continuation:policy.continuation,simulations:plan.simulations,seed};
for (let i=0;i<seatsFor(format);i++) openActor(actor,format,i as Asiento);
console.log(JSON.stringify(actor));
