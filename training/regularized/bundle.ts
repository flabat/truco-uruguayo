import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { artifactPin } from "../../api/actor-registry.ts";
import { trainCounter } from "../league/counters.ts";
import { sha } from "../league/development.ts";

/**
 * Prepara la entrada del campeonato oficial de duelo (training/championship/event.ts) para un candidato regularizado:
 * copia candidato e independiente, entrena el contrajugador Monte Carlo oficial contra ese candidato exacto y escribe
 * bundle.json con los hashes y el recibo.
 *
 *   node training/regularized/bundle.ts --candidate runs/regularized/duelo/actor.json \
 *     --independent runs/regularized/champions/finalista-duel.json --out runs/regularized/campeonato-duelo --matches 1024
 *
 * `--independent-lineage` nombra el linaje del independiente si no es el finalista de la liga de noviembre.
 */
const { values: args } = parseArgs({ options: {
  candidate: { type: "string" }, independent: { type: "string" }, out: { type: "string" },
  matches: { type: "string", default: "1024" }, seed: { type: "string", default: "461027" },
  "independent-lineage": { type: "string", default: "league-130-finalist" },
} });
const out = resolve(args.out!);
mkdirSync(out, { recursive: true });
const candidateFile = join(out, "candidate.json");
const independentFile = join(out, "independent.json");
copyFileSync(resolve(args.candidate!), candidateFile);
copyFileSync(resolve(args.independent!), independentFile);
const seed = Number(args.seed);
const counterPath = await trainCounter("duel", candidateFile, join(out, "counter-training"), seed, "", Number(args.matches));
const counterFile = join(out, "counter.json");
copyFileSync(counterPath, counterFile);
const receiptFile = join(out, "counter-training", "training-receipt.json");
const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
const entry = (id: string, file: string, lineage: string, trainingSeed: number) =>
  ({ id, lineage, file: basename(file), sha256: sha(file), trainingSeed });
const pins = Object.fromEntries([["candidate", candidateFile], ["independent", independentFile], ["counter", counterFile]]
  .map(([id, file]) => [id, artifactPin(JSON.parse(readFileSync(file, "utf8")))]));
const bundle = {
  schema: "league-championship-input-v1", format: "duel", registryPins: pins,
  candidate: entry("candidate", candidateFile, "regularized-461", 461001),
  independent: entry("independent", independentFile, args["independent-lineage"]!, 461002),
  counter: { ...entry("counter", counterFile, "counter-461", seed), family: receipt.chosenFamily,
    trainedAgainstSha256: sha(candidateFile), trainingReceipt: "counter-training/training-receipt.json",
    trainingReceiptSha256: sha(receiptFile) },
};
writeFileSync(join(out, "bundle.json"), JSON.stringify(bundle, null, 2));
console.log(JSON.stringify({ bundle: join(out, "bundle.json"), pins }, null, 2));
