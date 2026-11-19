# Entrenamiento local de Truco Oriental

La arena juega chicos a 40 usando el mismo reductor que el servidor. Cada asiento decide a partir de su mano y de los hechos públicos. Hay tres formatos independientes, `duel`, `pairs` y `pairs-senas`. Todos los participantes en entrenamiento y evaluación son computadoras.

## Primera corrida desde un checkout nuevo

Usá Node 24 y npm. Los dos entrenadores de parejas requieren uv y el entorno del proyecto con Python 3.12.14 y PyTorch 2.14.1. Estos comandos fijan las dependencias y crean corridas cortas:

```sh
npm ci
uv sync --frozen --project training/partners/python
npm run arena -- smoke --formats all --seed 42 --output runs/primer-torneo
npm run arena -- replay --manifest runs/primer-torneo/manifest.json --match pairs-senas-0-0
npm run arena -- verify --manifest runs/primer-torneo/manifest.json
node --test tests/unit/training-seat.test.ts
node training/eval/legacy.ts

npm run train -- --format duel --config training/configs/duel-local.json --run runs/primer-duelo --iterations 8
npm run train -- --resume runs/primer-duelo/checkpoint --iterations 16
npm run train -- --format pairs --config training/configs/pairs-local.json --run runs/primer-parejas --matches 8 --until 4
npm run train -- --resume runs/primer-parejas/checkpoint
npm run train -- --format pairs-senas --config training/configs/pairs-senas-local.json --run runs/primer-senas --matches 8 --until 4
npm run train -- --resume runs/primer-senas/checkpoint
```

El checkpoint es privado y contiene el estado de entrenamiento. `actor.json` es la exportación que puede cargar el servicio. Los checkpoints de parejas también producen `mc-actor.json` con el comparador de retornos Monte Carlo. Las interrupciones se retoman desde el último checkpoint completo. Cada formato y semilla usa su propio directorio.

## Del torneo al campeonato

El siguiente ejemplo registra un plan de desarrollo, ejecuta los chicos especificados y vuelve a calcular los intervalos a partir de los registros.

```sh
npm run arena -- evaluate --format duel --pairs 16 --output runs/dev-plan
npm run arena -- evaluate --plan runs/dev-plan/plan.json --output runs/dev-games
npm run arena -- evaluate --plan runs/dev-plan/plan.json --output runs/dev-games --verify
```

La liga local reúne tres semillas por formato. El campeonato fija los pesos de candidato, adversarios y compañeros, el número de pares y el plazo del servicio antes de abrir los repartos finales. La decisión de fuerza corresponde a cada formato y al campo de computadoras registrado. Una decisión fallida o inconclusa conserva V1. Los archivos en `runs/` pertenecen al operador local. Los replays del árbitro incluyen manos privadas y las claves de evaluación quedan en sus directorios de plan.

- [Contratos, reglas y fixtures](contracts/README.md)
- [Arena, azar, reanudación y replay](arena/README.md)
- [MCCFR de duelo y referencia exacta](duel/README.md)
- [Entrenadores de parejas y medición CPU/MPS](partners/README.md)
- [Evaluación independiente y perfiles de regresión](eval/README.md)
- [Continuación por tanteador y búsqueda](search/README.md)
- [Campeonato y puerta de promoción](championship/README.md)
- [Registro, activación y reversión local](../api/README-politicas.md)
- [Registro de coordinación y pruebas por paquete](https://github.com/flabat/truco-uruguayo/issues/118)
