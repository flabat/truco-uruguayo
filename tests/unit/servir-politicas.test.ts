import assert from "node:assert/strict";
import test from "node:test";
import { restaurar } from "../../api/turnos.ts";
import { artifactPin, createServing } from "../../api/serving.ts";
import { playMatch, playMatchAsync, replayMatch, sample } from "../../training/arena/index.ts";
import { initialize, exportActor } from "../../training/partners/train.ts";
import { newDuel, exportDuel } from "../../training/duel/train.ts";
import { formats, signalVersionFor, type SeatObservation } from "../../training/contracts/index.ts";
import { incumbent } from "../../training/seat/index.ts";

test("los lectores exportados sirven chicos completos desde la misma vista y simulan fallos con respaldo legal", async () => {
  assert.equal(artifactPin({z:[1],a:2}), artifactPin({a:2,z:[1]}));
  let opening: SeatObservation | undefined;
  for (const format of formats) {
    const actor = format === "duel" ? exportDuel(newDuel({seed:1,iterations:1,buckets:16,expandDepth:1,
      exploration:.1,referenceSteps:1,saveEvery:1})) : exportActor(initialize(format,7,1,.01,1,"cpu"));
    const pin = artifactPin(actor);
    let loaded = 0;
    let seatView: SeatObservation | undefined;
    let saved: Awaited<ReturnType<typeof playMatchAsync>>;
    const serving = createServing({loadArtifact:async () => { loaded++; return actor; },deadlineMs:3000});
    try {
      const game = await playMatchAsync({format,seed:42,pair:1,leg:0, responders: seat => async(obs, uniform) => {
        opening ??= obs;
        seatView ??= obs;
        assert.equal(obs.view.asiento,seat);
        const move = await serving.decide(pin, obs, uniform);
        assert.equal(move.fallback,null);
        assert.equal(move.policy,pin);
        return move.action;
      }});
      saved = JSON.parse(JSON.stringify(game));
      assert.deepEqual(replayMatch(game,42),game.score);
      assert.equal(loaded,1);
    } finally { await serving.close(); }
    // Un proceso nuevo ya no dispone del modelo original. La relectura de
    // las filas del servidor reproduce exactamente las decisiones confirmadas.
    const reemplazo = createServing({loadArtifact:async () => ({format, modelo:"distinto"}),deadlineMs:3000});
    try {
      const h = saved!.hands[0];
      const acciones = h.turns.map(t => t.signal ? {...t.action, sena:t.signal} : t.action);
      const restored = restaurar({numero:1,version:acciones.length + 1,version_reglas:1,
        version_senas:signalVersionFor(format),reparto:h.deal,
        puntos_inicio:[...h.startScore],acciones},format);
      assert.deepEqual(restored.turnos,h.turns);
      const stale = await reemplazo.decide(pin,seatView!,.5);
      assert.equal(stale.fallback,"incompatible");
      assert.deepEqual(replayMatch(saved!,42),saved!.score);
    } finally { await reemplazo.close(); }
    const fixed = {format, seed:43, pair:2, leg:0 as const};
    assert.deepEqual(await playMatchAsync({...fixed, responders: () => (obs, u) =>
      obs.legalActions[sample(incumbent.decide(obs,obs.legalActions),obs.legalActions.length,u)]}),
    playMatch({...fixed,policies:()=>incumbent}));
  }
  assert.ok(opening);
  const invalid = {format:"duel",schema:"bad"};
  for (const [pin,load,deadline,fallback] of [
    ["missing",async()=>null,500,"missing"],
    [artifactPin(invalid),async()=>invalid,3000,"incompatible"],
    ["timeout",()=>new Promise(resolve=>setTimeout(resolve,20)),1,"timeout"],
  ] as const) {
    const service=createServing({loadArtifact:load,deadlineMs:deadline});
    try {
      const result=await service.decide(pin,opening,.5);
      assert.equal(result.fallback,fallback);
      assert.equal(result.policy,incumbent.id);
      assert.ok(opening.legalActions.includes(result.action));
    } finally { await service.close(); }
  }
});

test("un plazo vencido mientras arranca el worker no deja el resto del chico en el respaldo", async () => {
  const actor = exportActor(initialize("pairs",7,1,.01,1,"cpu"));
  const pin = artifactPin(actor);
  async function chico(loadGraceMs?: number) {
    // El plazo cubre una inferencia caliente (cerca de 1 ms en reposo), pero no el arranque del hilo ni la
    // carga del artefacto (de 30 a 90 ms en reposo). Un plazo más largo dejaría arrancar a tiempo un worker
    // reiniciado y la prueba ya no distinguiría la falta de margen.
    const serving = createServing({loadArtifact:async () => actor,deadlineMs:10,loadGraceMs});
    const fallbacks: (string | null)[] = [];
    try {
      await playMatchAsync({format:"pairs",seed:5,pair:1,leg:0,responders: () => async(obs, uniform) => {
        const move = await serving.decide(pin, obs, uniform);
        fallbacks.push(move.fallback);
        return move.action;
      }});
    } finally { await serving.close(); }
    assert.ok(fallbacks.length > 20);
    assert.ok(fallbacks.every(f => f === null || f === "timeout"));
    return fallbacks;
  }
  // Con margen, el worker que arranca sobrevive y el chico vuelve a usar la política. Con la máquina cargada,
  // muchas inferencias calientes vencen igual y cada una reinicia el worker: no se puede exigir una mayoría,
  // pero sí que alguna decisión use la política.
  const conMargen = await chico();
  assert.ok(conMargen.includes(null), JSON.stringify(conMargen));
  // Sin margen, cada vencimiento termina el worker que arranca y el chico entero queda en el respaldo.
  assert.ok((await chico(0)).every(f => f === "timeout"));
});
