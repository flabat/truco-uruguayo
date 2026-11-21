import assert from "node:assert/strict";
import test from "node:test";
import {alphaZeroBases,alphaZeroKind,openAlphaZero} from "../../api/alphazero-actor.ts";
import {openActor} from "../../api/actor-registry.ts";
import {iniciarOnline} from "../../src/motor/mesa-online.ts";
import type {RepartoOnline} from "../../src/motor/reparto.ts";
import {newNetwork} from "../../training/alphazero/model.ts";
import {scheduledDeal} from "../../training/arena/index.ts";
import {seatView} from "../../training/search/belief.ts";
import {incumbent} from "../../training/seat/index.ts";
import {commitTurn} from "../../training/signals/index.ts";

const format = "pairs-private-senas";
const artifact = {kind:alphaZeroKind,format,seed:7,simulations:4,net:newNetwork(10),base:{},
  continuation:{schema:"score-continuation-v1",format,exact:{},bands:{}}};
const pin = () => alphaZeroBases[format];
const field = () => incumbent;
test("el registro rechaza una base incorrecta y claves o presupuestos incompatibles", () => {
  assert.throws(()=>openActor(artifact,format,0),/Ceibo base/);
  assert.throws(()=>openAlphaZero({...artifact,simulations:49},format,0,pin,field),/inválido/);
  assert.throws(()=>openAlphaZero({...artifact,net:{weights:[0]}},format,0,pin,field),/inválido/);
  assert.throws(()=>openAlphaZero({...artifact,continuation:{...artifact.continuation,
    exact:{"0/0/0":{hands:1,wins:1}}}},format,0,pin,field),/inconsistentes/);
  assert.throws(()=>openAlphaZero(artifact,"pairs",0,pin,field),/inválido/);
});

test("AlphaZero servido respeta el asiento, la máscara y el silencio para cada rival", () => {
  const deal: RepartoOnline = {...scheduledDeal(format,231,0,0),mano:0,dador:3,
    muestra:"bastos-01",manos:[["espadas-03","oros-06","bastos-02"],["oros-07","oros-11","bastos-03"],
      ["copas-03","copas-07","espadas-02"],["bastos-04","oros-01","espadas-05"]]};
  const state = iniciarOnline(deal);
  const signed = commitTurn(state,0,format,"cejas/truco"), silent = commitTurn(state,0,format,"truco");
  for (const seat of [1,3] as const) {
    const model = openAlphaZero(artifact,format,seat,pin,field);
    const [a,b] = [signed,silent].map(played=>seatView(played.state,seat,format,[played.turn]));
    const probs = model.decide(a,a.legalActions);
    assert.deepEqual(probs,model.decide(b,b.legalActions));
    if (a.legalActions.length) assert.ok(Math.abs(probs.reduce((x,y)=>x+y,0)-1)<1e-9);
    assert.deepEqual(model.decide({...a,target:30},a.legalActions),incumbent.decide(a,a.legalActions));
    assert.throws(()=>model.decide({...a,view:{...a.view,asiento:2}},a.legalActions),/asiento/);
  }
});
