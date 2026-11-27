# Autojuego regularizado

Entrenador de computadoras para duelo, parejas con señas al pie y tercetos al pie. Juega solo entre computadoras, con el mismo `mesa-online` del servidor. Cada asiento decide con su vista. El [informe de la primera jornada](../../docs/investigacion/computadoras-regularizadas/README.md) explica el método y los resultados.

## Preparar

Con Node 24 y uv, desde la raíz del checkout:

```sh
npm ci
uv sync --frozen --project training/partners/python
mkdir -p runs/regularized/champions
cp RUTA/A/ceibo.json runs/regularized/champions/ceibo-duel.json
cp RUTA/A/finalista.json runs/regularized/champions/finalista-duel.json
node training/regularized/potential.ts duel 40000
node training/regularized/potential.ts pie 12000
node training/regularized/potential.ts tercetos 12000
```

`ceibo-duel.json` es el artefacto del pin `d2146e8dd1b7…`. En la Mac del proyecto está en `runs/alphazero-eod-mixed-duel/ceibo.json`, y el finalista de la liga de noviembre en `runs/alphazero-eod-mixed-duel/training-league.json`. Las tablas de potencial estiman la probabilidad de ganar el chico según el tanteador por autojuego de V1 o del bot clásico al pie.

## Entrenar

```sh
node training/regularized/run.ts --format duel --run runs/regularized/duelo --hours 6 --workers 6
node training/regularized/run.ts --format pie --run runs/regularized/parejas --hours 6 --workers 3
node training/regularized/run.ts --format tercetos --run runs/regularized/tercetos --hours 6 --workers 2
```

La primera orden clona al campeón del formato (Ceibo, `pie-parejas-v2` o `pie-clasico-v1`) y después entrena con PPO, KL hacia la política ancla y crítico con todas las manos. Para reanudar, repetí la orden con el mismo `--run`; se pueden cambiar `--hours`, `--workers`, `--shaping on|off`, `--entropy`, `--eta` y las proporciones de la liga (`--self-share`, `--snap-share`, `--fixed-share`). `progress.jsonl` registra cada iteración y las evaluaciones periódicas. Al terminar quedan `actor.json`, servible por `api/actor-registry.ts`, y `checkpoint.pt`.

Un contrajugador se entrena contra un actor congelado, desde sus mismos pesos y sin ancla:

```sh
node training/regularized/run.ts --format duel --run runs/regularized/contra --exploit runs/regularized/duelo/actor.json \
  --init runs/regularized/duelo/checkpoint.pt --hours 1
```

## Medir

`evaluate.ts` aplica la puerta del campeonato sobre los mismos repartos: cruce directo contra el campeón y cambio por familia frente a lo que logra el campeón, con bootstrap por pares y Bonferroni.

```sh
node training/regularized/evaluate.ts --format duel --candidate net:runs/regularized/duelo/actor.json \
  --family independiente=actor:runs/regularized/champions/finalista-duel.json \
  --family contra=net:runs/regularized/contra/actor.json --pairs 1024 --out runs/regularized/puerta-duelo.json
```

Los rivales se nombran así: `net:<archivo>` para una red de este entrenador, `actor:<archivo>` para cualquier actor de duelo del registro, `ceibo`, `v1`, `challenger`, los estilos (`caller`, `folder`, `frequent-bluff`, `rare-bluff`, `strong-cards`), y al pie `pie-clasico-v1`, `pie-parejas-v2` y `pie-<estilo>`. `diagnose.ts` desglosa los tantos por truco, envido y flor entre dos rivales.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `features.ts` | 404 rasgos del asiento y 17 ranuras de acción. Rasgos del crítico con todas las manos. |
| `network.ts`, `actor.ts` | MLP en TypeScript, artefacto `truco-regularized-v1`, actor del registro y decisión al pie. |
| `env.ts` | Chicos de duelo (reglas de la API y de la arena), parejas y tercetos al pie. Moldeado por potencial. |
| `opponents.ts`, `agents.ts` | Rivales fijos, estilos sobre V1 o sobre el bot clásico al pie, y filas de entrenamiento. |
| `worker.ts`, `pool.ts` | Hilos que juegan y evalúan; proceso de Python. |
| `learner.py` | Clonación, PPO regularizado y crítico, en Metal. |
| `run.ts` | Liga, canalización, instantáneas, reanudación y exportación. |
| `evaluate.ts`, `potential.ts`, `diagnose.ts` | Puerta espejo, tablas de potencial y desglose de tantos. |
