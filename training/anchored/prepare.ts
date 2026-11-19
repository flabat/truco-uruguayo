import {createHash, randomBytes} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve, join} from "node:path";
import {cycleFormats} from "./actor.ts";
import {teamSignalsVersion} from "../contracts/index.ts";

const [out, source, masterSeed] = process.argv.slice(2);
if (!out || !source) throw new Error("Usage: node training/anchored/prepare.ts NEW_RUN FROZEN_FIELD [SEED]");
const root = resolve(out);
const inputs: Record<string, Record<string,string>> = {};
// Fail if this run already exists, including runs with partial preparation.
mkdirSync(root);
for (const format of cycleFormats) {
  const dir = join(root, "field", format);
  mkdirSync(dir,{recursive:true});
  inputs[format] = {};
  const sourceFormat = format === "pairs-private-senas" ? "pairs" : format;
  for (const name of format === "duel" ? ["candidate","independent"] : ["candidate","independent","partner"]) {
    const bytes = readFileSync(join(source,sourceFormat,name+".json"));
    if (JSON.parse(bytes.toString()).format !== sourceFormat) throw new Error("Unexpected opponent format");
    writeFileSync(join(dir,name+".json"),bytes,{flag:"wx"});
    inputs[format][name] = createHash("sha256").update(bytes).digest("hex");
  }
}
writeFileSync(join(root,"protocol.json"),JSON.stringify({
  schema:1, registered:new Date().toISOString(), seed:masterSeed ?? randomBytes(24).toString("hex"),
  formats:cycleFormats, signals:teamSignalsVersion, computerOnly:true, parityPairs:512,
  trainPairs:[48,96,192,384,768,1536], devPairs:384, finalPairs:1024,
  maxFitHours:6, plateauRounds:2, inputs
},null,2)+"\n",{flag:"wx"});
