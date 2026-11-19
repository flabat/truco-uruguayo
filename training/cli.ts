import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { trainDuel } from "./duel/cli.ts";
import { main as trainPartners } from "./partners/cli.ts";

const args = process.argv.slice(2);
const {values} = parseArgs({args,strict:false,options:{format:{type:"string"},resume:{type:"string"}}});
let format = values.format;
if (typeof values.resume === "string") {
  const {state} = JSON.parse(readFileSync(values.resume,"utf8"));
  const saved = state.schema === "duel-checkpoint-v1" ? "duel" : state.format;
  if (format && format !== saved) throw new Error("El formato solicitado difiere del checkpoint.");
  format = saved;
}
if (format === "duel") {
  const result = trainDuel(args);
  console.log(JSON.stringify({actor:result.actor, iteration:result.iteration, artifacts:result.artifacts}));
} else if (format === "pairs" || format === "pairs-senas") {
  await trainPartners(args);
} else throw new Error("Elegí --format duel, pairs o pairs-senas, o un checkpoint con --resume.");
