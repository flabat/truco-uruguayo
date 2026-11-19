// Pesos pequeños entrenados mediante el recorrido normal para el stack descartable.
import { duelStep, exportDuel, newDuel } from "../training/duel/train.ts";
import { exportActor, initialize, trainingBatch } from "../training/partners/train.ts";

const format = process.argv[2];
if (format === "duel") {
  const state = newDuel({seed: 7, iterations: 2, buckets: 32, expandDepth: 1, exploration: .08, referenceSteps: 2, saveEvery: 1});
  for (let i = 0; i < 2; i++) duelStep(state);
  console.log(JSON.stringify(exportDuel(state)));
} else if (format === "pairs" || format === "pairs-senas") {
  const state = initialize(format, 7, 2, .01, 2, "cpu");
  trainingBatch(state, 2);
  console.log(JSON.stringify(exportActor(state, true)));
} else throw new Error("Formato desconocido.");
