// Synthetic filesystem protocol for supervisor tests. It runs no game or learning algorithm.
import assert from "node:assert/strict";
import {appendFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
const [root,format,argument]=process.argv.slice(2);
const read=p=>JSON.parse(readFileSync(p,"utf8"));
const write=(p,x)=>writeFileSync(p,JSON.stringify(x)+"\n");
const emit=(lane,x)=>appendFileSync(join(root,"events",lane+".jsonl"),JSON.stringify({ts:new Date().toISOString(),...x})+"\n");
const epoch=process.env.TRUCO_EPOCH==="final"?"final":Number(process.env.TRUCO_EPOCH);
const lane=process.env.TRUCO_LANE;
const dir=join(root,format);
const pin="a".repeat(64);
if(process.argv[1].endsWith("train.ts")) {
    const lineage=argument;
    assert.ok(lineage==="a"||lineage==="b");
    assert.equal(process.argv[5],"--seconds");
    const target=Number(process.argv[6]);
    const output=join(dir,lineage), archive=join(output,"archive");
    mkdirSync(archive,{recursive:true});
    const file=join(output,"checkpoint.json");
    const prior=existsSync(file)?read(file):{};
    const initial=prior.epoch===epoch?prior.trainingSeconds:0;
    const fail=lane==="duel-b"&&epoch===1&&initial===0;
    const trainingSeconds=fail?target/2:target;
    const state={format,lineage,epoch,trainingSeconds,totalTrainingSeconds:(prior.totalTrainingSeconds??0)+trainingSeconds-initial,games:(prior.games??0)+1,decisions:(prior.decisions??0)+1,learnerUpdates:(prior.learnerUpdates??0)+1,counterGames:1};
    const event={...state,status:fail?"retrying":"complete",stage:"test epoch",action:"cejas/espadas-01"};
    write(file,state);write(join(output,"progress.json"),event);emit(lane,event);
    if(fail)process.exit(75);
    for(const kind of ["candidate","counter"]){
        write(join(output,kind+".json"),{format,kind,epoch});
        write(join(archive,epoch+"-"+kind+".json"),{format,kind,epoch});
    }
} else {
    assert.equal(String(epoch),argument);
    for(const worker of ["duel-a","duel-b","pairs","pairs-private-senas"]) {
        const n=epoch==="final"?2:epoch;
        const id="e"+String(n).padStart(2,"0")+"-train-"+worker;
        assert.equal(read(join(root,"ops","tasks",id+".json")).state,"done");
    }
    const ref=read(join(root,"input",format,"champion-at-start.json"));
    const stage=join(dir,"assessments",String(epoch));
    mkdirSync(stage,{recursive:true});write(join(stage,"reference.json"),ref);
    const ids=["champion","V1","independent","trained-counter",...(format==="duel"?[]:["unfamiliar-teammate"]),...(format==="pairs-private-senas"?["signaling-teammate","signaling-teammate/masked"]:[])];
    const direct={estimate:0.5,lower:0.45,upper:0.55};
    const families=ids.map(id=>({id,winRate:0.5,delta:{estimate:0,lower:-0.01,upper:0.01}}));
    write(join(dir,"eval-"+epoch+".json"),{format,epoch,games:8*ids.length,evaluation:{direct,pairs:2,families},pin,counter:pin,reference:pin,improved:false,worst:ids[0],unfamiliarPartner:format==="duel"?null:0.5});
    emit(lane,{status:"complete",stage:"test evaluation",epoch,message:"Synthetic evaluation receipt saved."});
}
