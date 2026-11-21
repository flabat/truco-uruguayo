import assert from "node:assert/strict";
import test from "node:test";
import { iniciarOnline } from "../../src/motor/mesa-online.ts";
import type { RepartoOnline } from "../../src/motor/reparto.ts";
import { evaluator, hiddenUnits, learn, newNetwork, widenNetwork } from "../../training/alphazero/model.ts";
import { search } from "../../training/alphazero/search.ts";
import { matchesClue, moveView, rankClue, signedRank, visibleTurn } from "../../training/alphazero/rank-signals.ts";
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

test("en parejas los asientos 2 y 3 reciben tanteador de equipo y la búsqueda no ve las otras manos", () => {
  const hands: RepartoOnline["manos"] = [
    ["espadas-03","oros-06","bastos-02"], ["oros-07","oros-11","bastos-03"],
    ["copas-03","copas-07","espadas-02"], ["bastos-04","oros-01","espadas-05"],
  ];
  const cards: RepartoOnline = {...deal, dador:1, mano:2, manos:hands};
  const other: RepartoOnline = {...cards, manos:[hands[3],hands[0],hands[2],hands[1]]};
  const views = [cards,other].map(candidate=>seatView(iniciarOnline(candidate,[29,14]),2,"pairs",[]));
  assert.deepEqual(views[0],views[1]);
  const net = newNetwork(31);
  const startValue = evaluator(net,incumbent)(views[0]).value;
  assert.ok(Number.isFinite(startValue) && startValue>0);
  const rival = seatView(iniciarOnline(cards,[29,14]),3,"pairs",[]);
  assert.ok(evaluator(net,incumbent)(rival).value<0);
  const table = fitContinuation("pairs",()=>incumbent,19,8);
  const policy = search(net,{field:()=>incumbent,table,seed:44,simulations:12});
  assert.deepEqual(policy(views[0],true),policy(views[1],true));
});


test("la red ancha conserva la política inicial y permite entrenar nuevos parámetros", () => {
  const obs = seatView(iniciarOnline(deal),0,"duel",[]);
  const net = newNetwork(41);
  const starting = evaluator(net,incumbent)(obs);
  const visits = starting.probabilities.map((_,i)=>Number(i===0));
  const example = {position:starting.position,visits,outcome:1};
  for(let i=0;i<5;i++) learn(net,[example],.08);
  const wide = widenNetwork(net,256,81);
  assert.equal(hiddenUnits(wide),256);
  const before = evaluator(net,incumbent)(obs);
  const widened = evaluator(wide,incumbent)(obs);
  assert.deepEqual(widened.probabilities,before.probabilities);
  assert.equal(widened.value,before.value);
  learn(wide,[example],.08);
  assert.notEqual(evaluator(wide,incumbent)(obs).value,before.value);
});


test("una seña rankea una carta retenida y la búsqueda rival recibe exactamente silencio", () => {
  const cards: RepartoOnline = {...deal, dador:3, manos:[...deal.manos,
    ["copas-03","copas-07","espadas-02"], ["bastos-04","oros-01","espadas-05"]]};
  const state = iniciarOnline(cards);
  const format = "pairs-private-senas";
  const opening = seatView(state,0,format,[]);
  assert.equal(signedRank(opening,"truco"),"cejas/truco");
  assert.equal(signedRank(opening,"bastos-02"),"labio-inferior/bastos-02");
  const signed = commitTurn(state,0,format,"cejas/truco");
  const silent = commitTurn(state,0,format,"truco");
  const partner = seatView(signed.state,2,format,[signed.turn]);
  const clue = rankClue(partner)!;
  assert.deepEqual(clue,{seat:0,cards:["bastos-02"]});
  assert.ok(matchesClue(cards,clue));
  assert.equal(rankClue(moveView(partner,false)),undefined);
  const spent = {action:{tipo:"carta" as const,carta:"bastos-02" as const,asiento:0 as const},awards:[]};
  assert.equal(rankClue({...partner,history:[...partner.history,spent]}),undefined);
  for (const rival of [1,3] as const) {
    assert.deepEqual(visibleTurn(signed.turn,format,rival),silent.turn);
    assert.deepEqual(seatView(signed.state,rival,format,[signed.turn]),seatView(silent.state,rival,format,[silent.turn]));
  }
  assert.deepEqual(visibleTurn(signed.turn,format,2),signed.turn);
  const table = fitContinuation(format,()=>incumbent,14,8);
  const decide = search(newNetwork(11),{field:()=>incumbent,table,seed:13,simulations:4});
  const rival = (turn: typeof signed) => seatView(turn.state,1,format,[turn.turn]);
  assert.deepEqual(decide(rival(signed)),decide(rival(silent)));
  const prob = decide(opening).probabilities;
  assert.ok(prob.every((weight,i)=>weight===0 || opening.legalActions[i].includes("/")));
  const ablated = search(newNetwork(11),{field:()=>incumbent,table,seed:13,simulations:4,signals:false});
  assert.ok(ablated(opening).probabilities.every((weight,i)=>weight===0 || !opening.legalActions[i].includes("/")));
});

test("una seña ambigua conserva los dos ases bravos compatibles y respeta cartas propias", () => {
  const cards: RepartoOnline = {...deal,dador:3,muestra:"copas-06",manos:[
    ["espadas-01","oros-06","bastos-02"],deal.manos[1],
    ["copas-03","copas-07","espadas-02"],["bastos-01","oros-01","espadas-05"]]};
  const turn = commitTurn(iniciarOnline(cards),0,"pairs-private-senas","labios-derecha/truco");
  const obs = seatView(turn.state,2,"pairs-private-senas",[turn.turn]);
  assert.deepEqual([...rankClue(obs)!.cards].sort(),["bastos-01","espadas-01"]);
  assert.deepEqual(rankClue({...obs,originalCards:[...obs.originalCards,"bastos-01"]})?.cards,["espadas-01"]);
});
