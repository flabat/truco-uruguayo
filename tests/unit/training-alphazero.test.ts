import assert from "node:assert/strict";
import test from "node:test";
import { iniciarOnline } from "../../src/motor/mesa-online.ts";
import type { RepartoOnline } from "../../src/motor/reparto.ts";
import { evaluator, learn, newNetwork } from "../../training/alphazero/model.ts";
import { search } from "../../training/alphazero/search.ts";
import { seatView } from "../../training/search/belief.ts";
import { fitContinuation } from "../../training/search/continuation.ts";
import { incumbent } from "../../training/seat/index.ts";
import { commitTurn } from "../../training/signals/index.ts";

const deal: RepartoOnline = {versionReparto:"online-1",mano:0,dador:1,muestra:"bastos-01",
  manos:[["espadas-03","oros-06","bastos-02"],["oros-07","oros-11","bastos-03"]]};

test("las visitas se comparten entre manos rivales indistinguibles desde el asiento que decide", () => {
  const other: RepartoOnline = {...deal,manos:[["copas-03","oros-01","bastos-04"],deal.manos[1]]};
  const observations = [deal,other].map(cards => {
    const step = commitTurn(iniciarOnline(cards),0,"duel","truco");
    return seatView(step.state,1,"duel",[step.turn]);
  });
  assert.deepEqual(observations[0],observations[1]);
  const table = fitContinuation("duel",()=>incumbent,17,8);
  const stats = {decisions:0,fallbacks:0,milliseconds:0};
  const policy = search(newNetwork(31),{field:()=>incumbent,table,seed:44,simulations:12},stats);
  const [first,second] = observations.map(obs=>policy(obs,true));
  assert.deepEqual(first,second);
  assert.equal(stats.decisions,2);
  assert.equal(stats.fallbacks,0);
  assert.equal(first.visits.length,observations[0].legalActions.length);
  assert.ok(first.visits.every(x=>x>=0 && Math.abs(x*12-Math.round(x*12))<1e-10));
  assert.ok(Math.abs(first.visits.reduce((a,b)=>a+b,0)-1)<1e-10);
});

test("la política aprende las visitas legales y el valor aprende el resultado del chico", () => {
  const obs = seatView(iniciarOnline(deal),0,"duel",[]);
  const net = newNetwork(11);
  const predict = evaluator(net,incumbent);
  const before = predict(obs);
  const index = before.probabilities.indexOf(Math.min(...before.probabilities));
  const visits = before.probabilities.map((_,i)=>Number(index===i));
  for (let step=0; step<20; step++) learn(net,[{position:before.position,visits,outcome:1}],.08);
  const after = predict(obs);
  assert.ok(after.value>before.value);
  assert.ok(after.probabilities[index]>before.probabilities[index]);
  assert.ok(Math.abs(after.probabilities.reduce((a,b)=>a+b,0)-1)<1e-10);
});
