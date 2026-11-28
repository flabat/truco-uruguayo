import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { loadNet } from "./agents.ts";
import { featureVersion } from "./features.ts";
import { encodeNetwork, regularizedKind, type RegularizedArtifact } from "./network.ts";

/**
 * Convierte una instantánea de una corrida (`snapshots/iter-N.bin`) en un artefacto servible, igual al `actor.json` que la
 * corrida escribe al terminar. Sirve para llevar al campeonato una instantánea que no es la última.
 *
 *   node training/regularized/export.ts runs/regularized/duelo/snapshots/iter-3600.bin runs/regularized/duelo/config.json salida.json
 */
const [snapshot, configPath, out] = process.argv.slice(2);
if (!snapshot || !configPath || !out) throw new Error("Uso: export.ts <instantánea.bin> <config.json> <salida.json>");
const config = JSON.parse(readFileSync(configPath, "utf8")) as { format: "duel" | "pie" | "tercetos" };
const iteration = Number(/iter-(\d+)\.bin$/.exec(basename(snapshot))?.[1] ?? NaN);
const artifact: RegularizedArtifact = {
  kind: regularizedKind,
  format: config.format === "duel" ? "duel" : config.format === "pie" ? "pairs-private-senas" : "triples",
  features: featureVersion,
  ...(config.format === "duel" && { memory: "opponent" as const }),
  ...encodeNetwork(loadNet(snapshot)),
  meta: { iteration, snapshot: basename(snapshot), run: config },
};
writeFileSync(out, JSON.stringify(artifact));
console.log(JSON.stringify({ out, format: artifact.format, iteration }));
