import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {artifactPin,openActor} from "../../api/actor-registry.ts";
import {activeFormats,teamSignalsVersion} from "../contracts/index.ts";
import {read} from "../anchored/io.ts";

// Prepare one prospective confirmation with a single immutable policy in each
// format. Run evaluate.ts RUN FORMAT final independently for the three formats.
export function prepareConfirmation(root:string,parent:string,paths:readonly string[]) {
  const plan=read(join(root,"plan.json")), source=read(join(parent,"protocol.json"));
  assert.equal(paths.length,activeFormats.length);
  assert(!existsSync(join(root,"protocol.json")),"Confirmation already registered");
  assert(source.computerOnly===true && source.signals===teamSignalsVersion);
  assert(typeof plan.seed==="string" && plan.seed.length>=16 && plan.seed!==source.seed);
  assert(Number.isSafeInteger(plan.finalPairs) && plan.finalPairs>=2);
  assert(Number.isSafeInteger(plan.resamples) && plan.resamples>=1000);
  assert(plan.familyError>0 && plan.familyError<=0.05);
  assert(plan.gates.directLowerAbove===0.5 && plan.gates.everyFamilyDeltaLowerAbove===-0.02);
  const files:Record<string,string>={}, challengers:Record<string,string>={}, counters:Record<string,string>={};
  const hash=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
  function copy(path:string,data:Buffer) {
    const dest=join(root,path);
    mkdirSync(dirname(dest),{recursive:true});
    if (existsSync(dest)) assert(readFileSync(dest).equals(data),"Conflicting frozen input "+path);
    else writeFileSync(dest,data,{flag:"wx"});
    files[path]=hash(data);
  }
  for(const [path,pin] of Object.entries(source.files)) {
    assert(/^(input|evaluation-input)\/[a-z0-9/-]+\.json$/.test(path));
    const data=readFileSync(join(parent,path));
    assert.equal(hash(data),pin,"Changed parent input "+path);
    copy(path,data);
  }
  for(const [i,format] of activeFormats.entries()) {
    const bytes=readFileSync(paths[i]), actor=JSON.parse(bytes.toString());
    openActor(actor,format,0); challengers[format]=artifactPin(actor);
    const incumbent=readFileSync(join(root,"input",format,"champion-at-start.json"));
    assert.notEqual(challengers[format],artifactPin(JSON.parse(incumbent.toString())));
    copy(join(format,"champion.json"),incumbent);
    copy(join(format,"a","candidate.json"),bytes);
    const counter=readFileSync(join(root,"input",format,"archive","last-counter.json"));
    counters[format]=artifactPin(JSON.parse(counter.toString()));
    copy(join(format,"a","counter.json"),counter);
  }
  const protocol={schema:"fixed-league-confirmation-v1",registeredAt:new Date().toISOString(),
    computerOnly:true,signals:teamSignalsVersion,formats:activeFormats,seed:plan.seed,
    parentProtocol:hash(readFileSync(join(parent,"protocol.json"))),planHash:hash(readFileSync(join(root,"plan.json"))),
    files,challengers,counters,screeningPairs:48,finalPairs:plan.finalPairs,finalResamples:plan.resamples,familyError:plan.familyError,
    directLowerBound:plan.gates.directLowerAbove,familyDeltaLowerBound:plan.gates.everyFamilyDeltaLowerAbove};
  mkdirSync(join(root,"events"),{recursive:true});
  writeFileSync(join(root,"protocol.json"),JSON.stringify(protocol)+"\n",{flag:"wx"});
  return protocol;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [root,parent,...paths]=process.argv.slice(2);
  assert(root && parent && paths.length===3,"confirm.ts RUN PARENT DUEL PLAIN_PAIRS PRIVATE_PAIRS");
  console.log(prepareConfirmation(resolve(root),resolve(parent),paths).challengers);
}
