import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactPin, openActor } from "../../api/actor-registry.ts";
import { createServing, type ServingDecision } from "../../api/serving.ts";
import { baseline, styles } from "../baselines/index.ts";
import { playMatchAsync, replayMatch, sample, type MatchRecord } from "../arena/index.ts";
import type { Asiento } from "../../src/motor/reparto.ts";
import { formats, seatsFor, versions, type Format, type SeatObservation } from "../contracts/index.ts";
import { incumbent, challenger } from "../seat/index.ts";

export const deadlineMs = 200;
export const fallbackLimit = 0.005;
export const root = fileURLToPath(new URL("../../",import.meta.url));
export const sha = (v:string|Buffer) => createHash("sha256").update(v).digest("hex");
export interface Entry {id:string; lineage:string; file:string; sha256:string; trainingSeed:number;
  trainedAgainstSha256?:string; trainingReceipt?:string; trainingReceiptSha256?:string}
export interface Bundle {schema:string; registryPins:Record<string,string>; format:Format; candidate:Entry; independent:Entry; counter:Entry; partner?:Entry}
export interface Registered extends Entry {pin:string}
export interface Field {
  format:Format; candidate:Registered; independent:Registered; counter:Registered; partner?:Registered;
  builtinHash:string; build:string; deadlineMs:number; fallbackLimit:number; versions:typeof versions;
}
export function buildId() {
  const paths=execFileSync("git",["ls-files","-z","src/motor","api","training"],{cwd:root}).toString()
    .split("\0").filter(p=>/\.(ts|sql|py)$/.test(p)).sort();
  return sha(JSON.stringify(paths.map(p=>[p,sha(readFileSync(join(root,p)))])));
}
export function checkArtifact(raw:Buffer, format:Format, expectedHash:string) {
  assert.equal(sha(raw),expectedHash,"Hash externo del artefacto incorrecto.");
  const model=JSON.parse(raw.toString());
  for (let seat=0; seat<seatsFor(format); seat++) openActor(model,format,seat as Asiento);
  return {model, pin:artifactPin(model)};
}
export function prepare(bundlePath:string) {
  const b:Bundle=JSON.parse(readFileSync(bundlePath,"utf8"));
  assert.equal(b.schema,"league-championship-input-v1");
  assert.ok(formats.includes(b.format));
  const artifacts = new Map<string, Buffer>();
  function register(e:Entry):Registered {
    assert.ok(e.id && e.lineage && e.file && Number.isSafeInteger(e.trainingSeed));
    const raw=readFileSync(resolve(dirname(bundlePath),e.file));
    const {pin}=checkArtifact(raw,b.format,e.sha256);
    assert.equal(b.registryPins[e.id],pin,"El pin del registro difiere del artefacto.");
    const file=pin+".json";
    artifacts.set(file,raw);
    return {...e,file,pin};
  }
  const candidate=register(b.candidate), independent=register(b.independent), counter=register(b.counter);
  assert.ok(independent.pin !== candidate.pin && counter.pin !== candidate.pin);
  assert.equal(counter.trainedAgainstSha256,candidate.sha256,"El contrajugador debe entrenarse contra este candidato.");
  assert.ok(b.counter.trainingReceipt && b.counter.trainingReceiptSha256);
  const receipt=readFileSync(resolve(dirname(bundlePath),b.counter.trainingReceipt));
  assert.equal(sha(receipt),b.counter.trainingReceiptSha256);
  const proof=JSON.parse(receipt.toString());
  assert.equal(proof.format,b.format);
  assert.equal(proof.trainingSeed,counter.trainingSeed);
  assert.ok(Number.isSafeInteger(proof.completedMatches) && proof.completedMatches>0);
  assert.equal(proof.trainedAgainstSha256,candidate.sha256);
  assert.equal(proof.chosen,counter.sha256);
  counter.trainingReceipt="counter-training.json";
  artifacts.set(counter.trainingReceipt,receipt);
  if(b.format !== "duel") assert.ok(b.partner,"Falta el compañero no visto.");
  const partner=b.partner && register(b.partner);
  const entrants=[candidate,independent,counter,...(partner?[partner]:[])];
  assert.equal(new Set(entrants.map(e=>e.pin)).size,entrants.length,"El campo requiere artefactos distintos.");
  assert.equal(new Set(entrants.map(e=>e.lineage)).size,entrants.length,"El campo requiere linajes identificados por separado.");
  assert.equal(new Set(entrants.map(e=>e.trainingSeed)).size,entrants.length,"Se requieren semillas de entrenamiento distintas.");
  const field:Field={format:b.format,candidate,independent,counter,partner,deadlineMs,fallbackLimit,versions,
    build:buildId(),builtinHash:sha(readFileSync(join(root,"training/baselines/index.ts")))};
  return {field,artifacts};
}
export function families(field:Field) {
  const opponents=[incumbent.id,...(field.format==="duel"?[challenger.id]:[]),...styles,"independent","counter"];
  return opponents.flatMap(opponent=>(field.format==="duel"?["fixed"]:["fixed","unseen"]).map(lineup=>({
    id:opponent+"/"+lineup,opponent,lineup,
  })));
}
export type Family=ReturnType<typeof families>[number];
export interface RoleDiagnostics { decisions:number; fallbacks:Record<string,number>; }
export type Role = "tested"|"teammate"|"opponent";
export interface Receipt {
  arm:"candidate"|"incumbent"; match:MatchRecord;
  // Only actions by the designated player(s) in the tested arm, excluding frozen teammates and opponents.
  latencyUs:number[]; roles:Record<Role,RoleDiagnostics>;
}
export function roleAt(seat:number, leg:number, pair:number, lineup:string):Role {
  if(seat % 2 !== leg) return "opponent";
  return lineup==="unseen" && Math.floor(seat/2)===pair%2 ? "teammate" : "tested";
}
export function referee(field:Field, load:(file:string)=>Buffer) {
  const entries=[field.candidate,field.independent,field.counter,...(field.partner?[field.partner]:[])];
  const models=new Map<string,unknown>();
  for(const e of entries) {
    assert.equal(e.file,e.pin+".json");
    const {model,pin}=checkArtifact(load(e.file),field.format,e.sha256);
    assert.equal(pin,e.pin);
    models.set(pin,model);
  }
  const service=createServing({deadlineMs:field.deadlineMs,async loadArtifact(pin){return models.get(pin);}});
  async function play(f:Family,seed:number,pair:number) {
    const results:Receipt[]=[];
    const oppositePin=f.opponent==="independent"?field.independent.pin:f.opponent==="counter"?field.counter.pin:null;
    const opposite=oppositePin ? undefined : baseline(f.opponent);
    for(const arm of ["candidate","incumbent"] as const) for(const leg of [0,1] as const) {
      const latencyUs:number[]=[];
      const roles:Record<Role,RoleDiagnostics>={tested:{decisions:0,fallbacks:{}},teammate:{decisions:0,fallbacks:{}},opponent:{decisions:0,fallbacks:{}}};
      const tested=arm==="candidate"?field.candidate.pin:incumbent.id;
      const match=await playMatchAsync({format:field.format,seed,pair,leg,responders(seat) {
        const roleName=roleAt(seat,leg,pair,f.lineup);
        const onTeam=roleName!=="opponent", teammate=roleName==="teammate";
        return async (obs:SeatObservation,u:number) => {
          const role=roles[roleName];
          role.decisions++;
          let result:ServingDecision;
          if(!onTeam && !oppositePin && f.opponent!==incumbent.id) {
            const p=opposite!.decide(obs,obs.legalActions);
            return obs.legalActions[sample(p,p.length,u)];
          }
          const pin=onTeam?(teammate?field.partner!.pin:tested):(oppositePin??incumbent.id);
          result=await service.decide(pin,obs,u);
          if(result.fallback) role.fallbacks[result.fallback]=(role.fallbacks[result.fallback]??0)+1;
          if(onTeam && !teammate) latencyUs.push(Math.round(result.latencyMs*1000));
          return result.action;
        };
      }});
      replayMatch(match,seed);
      results.push({arm,match,latencyUs,roles});
    }
    return results;
  }
  return {play,close:service.close};
}
