import { requireTrainingFormat, type activeFormats } from "../training/contracts/index.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkArtifact } from "../training/championship/field.ts";
// Pesos pequeños entrenados mediante el recorrido normal para el stack descartable.
import { duelStep, exportDuel, newDuel } from "../training/duel/train.ts";
import { exportActor, initialize, trainingBatch } from "../training/partners/train.ts";
import { randomArtifact } from "../training/regularized/network.ts";

const format = process.argv[2];
const championship = process.env.TEST_CHAMPIONSHIP_ROOT;
function actorDeFormato(format: typeof activeFormats[number]) {
  if (championship) {
    const dir = join(championship, format);
    const { field } = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"));
    if (field.format !== format || field.candidate.file !== field.candidate.pin + ".json") {
      throw Error("Plan de formato incompatible.");
    }
    const raw = readFileSync(join(dir, field.candidate.file));
    const { pin } = checkArtifact(raw, format, field.candidate.sha256);
    if (pin !== field.candidate.pin) throw Error("El pin del candidato difiere del plan congelado.");
    process.stdout.write(raw);
  } else if (format === "duel") {
    const state = newDuel({
      seed: 7,
      iterations: 2,
      buckets: 32,
      expandDepth: 1,
      exploration: .08,
      referenceSteps: 2,
      saveEvery: 1,
    });
    for (let i = 0; i < 2; i++) duelStep(state);
    console.log(JSON.stringify(exportDuel(state)));
  } else {
    const state = initialize(format, 7, 2, .01, 2, "cpu");
    trainingBatch(state, 2);
    console.log(JSON.stringify(exportActor(state, true)));
  }
}

if (format === "pairs-pie" || format === "triples-pie") {
  // Actor aprendido al pie con pesos chicos al azar: alcanza para recorrer el camino de registro, activación y mesa.
  console.log(JSON.stringify(randomArtifact(format === "pairs-pie" ? "pairs-private-senas" : "triples")));
} else {
  requireTrainingFormat(format);
  actorDeFormato(format);
}
