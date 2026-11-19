import {appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import type {Format} from "../contracts/index.ts";

export const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export function save(path: string, value: unknown) {
  const temp = path + "." + process.pid + ".tmp";
  writeFileSync(temp, JSON.stringify(value) + "\n");
  renameSync(temp, path);
}
export function runIO(root: string, format: Format) {
  const dir = join(root, format);
  mkdirSync(dir, {recursive:true});
  mkdirSync(join(root, "events"), {recursive:true});
  const file = (name: string) => join(dir, name + ".json");
  return {dir, file, write: (name: string, v: unknown) => save(file(name), v),
    load: (name: string) => existsSync(file(name)) ? read(file(name)) : null,
    event(stage: string, message: string, fields: Record<string, unknown> = {}) {
      appendFileSync(join(root, "events", format + ".jsonl"), JSON.stringify({
        ts:new Date().toISOString(), stage, status:"running", message, ...fields
      }) + "\n");
    }};
}
export type Log = ReturnType<typeof runIO>;
export function dealSeed(master: string, ...names: (number|string)[]) {
  return createHash("sha256").update(JSON.stringify([master, ...names])).digest().readUInt32BE(0);
}
