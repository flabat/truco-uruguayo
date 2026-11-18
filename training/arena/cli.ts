import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { formats, type Format } from "../contracts/index.ts";
import { newRun, run, verify } from "./runs.ts";

const [command, ...args] = process.argv.slice(2);
async function dispatch() {
  if (command === "evaluate") {
    const evaluator = await import("../eval/cli.ts");
    await evaluator.main(args);
    return;
  }
  const {values} = parseArgs({args, strict: true, options: {
    formats: {type: "string"}, seed: {type: "string"}, pairs: {type: "string"},
    output: {type: "string"}, resume: {type: "string"}, manifest: {type: "string"},
    match: {type: "string"}, "limit-matches": {type: "string"},
  }});

  if (command === "verify" || command === "replay") {
    if (!values.manifest || (command === "replay" && !values.match)) throw new Error("Se requiere --manifest y, para replay, --match.");
    console.log(JSON.stringify(verify(values.manifest, {}, command === "replay" ? values.match : undefined)));
  } else if (command === "smoke" || command === "tournament") {
    const limit = values["limit-matches"] === undefined ? Infinity : Number(values["limit-matches"]);
    if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) throw new RangeError("Límite inválido.");
    const directory = resolve(values.resume ?? values.output ?? join("runs", "arena-" + Date.now()));
    if (values.resume) {
      if (values.formats || values.seed || values.pairs || values.output) throw new Error("--resume usa los parámetros del plan guardado.");
    } else {
      const selected = !values.formats || values.formats === "all" ? [...formats] : values.formats.split(",") as Format[];
      newRun(directory, selected, Number(values.pairs ?? 1), Number(values.seed ?? 42));
    }
    console.log(JSON.stringify({directory, ...run(directory, limit)}));
  } else {
    throw new Error("Uso: arena smoke|tournament [--formats all|duel,pairs --pairs N --seed S --output directorio | --resume directorio], replay|verify --manifest archivo [--match ID].");
  }
}
try {
  await dispatch();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
