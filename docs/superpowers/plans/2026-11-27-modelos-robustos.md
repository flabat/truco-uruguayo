# Computadoras robustas con autojuego regularizado · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entrenar en una jornada computadoras de duelo y de parejas al pie (y tercetos si alcanza) que pasen la puerta completa del campeonato, con informe.

**Architecture:** Simulador de chicos en TypeScript sobre `mesa-online` en `worker_threads` (CPU), con inferencia de un MLP en `Float32Array`. Aprendiz PPO en PyTorch (Metal) con penalización KL hacia una política ancla (R-NaD / MMD), crítico con información perfecta y liga de rivales. Exportación JSON servible por `api/actor-registry.ts`.

**Tech Stack:** Node 24 (TypeScript con strip-types), PyTorch 2.14.1 en `training/partners/python` (uv), Metal.

**Spec:** `docs/superpowers/specs/2026-11-27-modelos-robustos-design.md`

## Global Constraints

- Cada asiento decide solo con su vista (`VistaOnline` + historial público + memoria pública del chico + señas visibles a su equipo).
- Duelo de producción: `repartirOnline` con `reglaFlor: "inmediata-v2"`, `subidaFlor: "con-rival-posible"`, `respondenSinFlor` de las computadoras; la arena oficial usa el reparto V1 sin `reglaFlor`. Se entrena con ambos.
- Campeón de duelo: Ceibo `d2146e8dd1b79dd3ca50c38029b0f35f7377a0c627d4b3078a1475d2f9043ac3`. Campeón al pie: `pie-parejas-v2`.
- Puerta: límite inferior simultáneo del 95 % > 50 % contra el campeón; cambio por familia > −2 pp; fallback ≤ 0,5 % con plazo de 200 ms.
- Pesos y corridas en `runs/regularized/` (fuera de Git). Textos de issues, PR, commits y documentos en español rioplatense.

## Review Focus

- Una decisión con una sola acción legal: la red no debe fallar ni consumir datos de entrenamiento.
- Flor y respuestas sin flor de computadoras (`respondenSinFlor`): acciones `con-flor-quiero`, `paso-flor` y `contraflor-al-resto` deben mapear a ranuras válidas.
- `mazo` legal en la vista del pie pero mapeado a `carta` en `vistaParaPolitica`.
- Fuga de información: los rasgos del actor no pueden leer manos ajenas; solo el crítico.
- Chico que termina a mitad de una mano (cobro de envido que llega a 40).

---

### Task 1: Rasgos y acciones

**Files:** Create `training/regularized/features.ts`; Test `tests/unit/regularized-features.test.ts`

**Interfaces — Produces:**
- `actionSlots: readonly string[]` (3 cartas por fuerza original descendente + cantos fijos).
- `encode(ctx: DecisionContext): { x: Float32Array; mask: Uint8Array; slotOf(action: string): number; actionOf(slot: number): AccionOnline }`.
- `privileged(estado: EstadoOnline, asiento: Asiento): Float32Array` (solo crítico).
- `DecisionContext = { vista: VistaOnline; score: Score; target: number; memoria?: number[]; pie?: { vista: VistaPie; indicaciones: IndicacionPie[] } }`.

- [ ] Prueba: el vector no cambia al cambiar las manos rivales con la misma vista; la máscara coincide con `legales`; ida y vuelta acción↔ranura para cada legal en 2.000 decisiones aleatorias de duelo y parejas.
- [ ] Implementar y pasar.

### Task 2: Red, exportación y actor servible

**Files:** Create `training/regularized/network.ts`, `training/regularized/actor.ts`; Modify `api/actor-registry.ts`; Test `tests/unit/regularized-actor.test.ts`

**Interfaces — Produces:** `forward(net, x, mask) → {probabilities, value}`; `kind = "truco-regularized-v1"`; `openRegularized(artifact): Policy` que recibe `SeatObservation` (con `rivalCounts`, `memory: "opponent"`).

- [ ] Prueba: probabilidades finitas que suman 1 solo sobre legales; el actor abre por `openActor` para ambos asientos de duelo; misma salida que PyTorch para un lote fijo (tolerancia 1e-4).
- [ ] Implementar y pasar.

### Task 3: Simulador y rivales

**Files:** Create `training/regularized/env.ts`, `training/regularized/opponents.ts`, `training/regularized/worker.ts`

**Interfaces — Produces:** `playChico(spec, rng) → Trajectory[]` para duelo y parejas al pie; rivales por id: `self`, `snapshot:<n>`, `ceibo`, `v1`, estilos, `pie-clasico-v1`, `pie-parejas-v2`, `exploiter:<n>`.

- [ ] Prueba: 200 chicos con cada rival terminan en 40, con trayectorias alineadas (rasgos, máscara, acción, logp, recompensa terminal ±1).
- [ ] Implementar y pasar.

### Task 4: Aprendiz PPO regularizado

**Files:** Create `training/regularized/learner.py`, `training/regularized/run.ts`

- [ ] Clonación de comportamiento desde el campeón, luego PPO + KL al ancla + crítico privilegiado; instantáneas y reanudación.
- [ ] Corrida corta de humo en Metal que mejora contra V1.

### Task 5: Evaluación y puerta

**Files:** Create `training/regularized/evaluate.ts`; uso de `training/championship/event.ts` para duelo.

- [ ] Evaluación pareada contra cada familia y delta frente al campeón en los mismos repartos; contrajugador entrenado contra el candidato congelado.

### Task 6: Corridas largas, parejas al pie, tercetos, PR e informe

- [ ] Duelo largo; parejas al pie (entorno, campo espejo, corrida); tercetos si queda tiempo.
- [ ] Soporte de servicio, pruebas, `npm run check:rapido`, PR en borrador e informe en `docs/investigacion/` publicado como página.
