# Entrenamiento local de parejas

Node 24 reparte, ejecuta todas las decisiones del chico a 40 y verifica el actor exportado. PyTorch actualiza cuatro redes independientes con retornos de equipo de +1 o −1. Cada red reconstruye seis unidades recurrentes a partir del historial visible para su asiento, suma las puntuaciones de jugada y gesto, y normaliza solo sobre las acciones legales del asiento. Durante el entrenamiento un crítico central accede al tanteador, la apuesta y los tantos privados de los cuatro jugadores. El archivo del actor contiene únicamente las matrices necesarias para jugar.

En paralelo se estima el retorno Monte Carlo por acción en tablas independientes. El comparador usa la misma cantidad de chicos completos y el mismo calendario de repartos. Cada bloque de cuatro encuentros alterna dos de autojuego y dos contra el incumbente con cambio de equipo. El optimizador usa SGD con momento 0,7, norma máxima 1 y máscaras por asiento. El entrenamiento y el desarrollo usan dominios de semilla separados.

Prepará las dependencias desde la raíz del checkout.

```sh
npm ci
uv sync --frozen --project training/partners/python
node --test tests/unit/training-partners.test.ts
```

Entrená ambas variantes. Para contrastar compañeros, cambiá la semilla y el directorio de la segunda corrida.

```sh
node training/partners/cli.ts --format pairs --config training/configs/pairs-local.json --run runs/pairs-a
node training/partners/cli.ts --format pairs-private-senas --config training/configs/pairs-private-senas-local.json --run runs/senas-a
node training/partners/cli.ts --format pairs --config training/configs/pairs-local.json --run runs/pairs-b --seed 420702
node training/partners/cli.ts --format pairs-private-senas --config training/configs/pairs-private-senas-local.json --run runs/senas-b --seed 420702
node training/partners/cli.ts --resume runs/senas-a/checkpoint
node training/partners/cli.ts --run runs/pairs-a --crossplay --partner runs/pairs-b/actor.json --pairs 8
node training/partners/cli.ts --run runs/senas-a --crossplay --partner runs/senas-b/actor.json --pairs 8
```

`--matches` fija el presupuesto de cada algoritmo. `--until` permite interrumpir tras un lote entero. Un checkpoint incluye los pesos, el crítico, la velocidad del optimizador, las tablas, la semilla y el próximo índice de reparto. Se confirma por reemplazo atómico. Tras una interrupción el lote incompleto se vuelve a generar. `actor.json` y `mc-actor.json` se cargan con `loadPartnerPolicy(artifact, seat)`. `training.json` identifica las versiones, la configuración y los hashes SHA-256 del JSON compacto de cada artefacto. El informe `development.json` retiene los resultados de ambas mangas por pareja de repartos frente a V1, Monte Carlo y el actor independiente. En señas, el cruce repite los mismos repartos ocultando gestos pasados y permitiendo solo silencio a todos los participantes. El oráculo resuelve un final reducido a 39–39 mediante las dieciséis prescripciones comunes y compara el valor de las jugadas del actor.

### Medir CPU y Metal

Generá dos lotes legales de los mismos formatos y corré el benchmark en el host con PyTorch MPS disponible.

```sh
node training/partners/cli.ts --format pairs --config training/configs/pairs-local.json --run runs/bench-p --benchmarkData runs/bench-p/data.json
node training/partners/cli.ts --format pairs-private-senas --config training/configs/pairs-private-senas-local.json --run runs/bench-s --benchmarkData runs/bench-s/data.json
training/partners/python/.venv/bin/python -B training/partners/python/benchmark.py runs/bench-p/data.json runs/bench-s/data.json --output runs/bench-p/backend.json
```

La comparación usa 256 decisiones por variante, los mismos pesos y lotes en cada dispositivo, tres pasos de calentamiento y ocho pasos medidos con sincronización. Alterna ambos formatos en cada iteración y registra la pérdida, ejemplos por segundo, RSS máximo y memoria Metal. Para medir el entrenamiento completo en un dispositivo se puede pasar `--device cpu` o `--device mps` al crear un run. El actor y los informes de desarrollo quedan disponibles localmente.

Para comprobar la continuidad del optimizador en el entorno fijado, ejecutá `node training/partners/verify.ts`. Compara todos los bytes del checkpoint y de ambos actores tras ocho chicos por aprendiz en una sola corrida y en una corrida interrumpida al cuarto chico y reanudada desde disco, por separado en ambos formatos. El escritor mantiene un lock local que el sistema operativo libera si el proceso se interrumpe.

Para entrenar una contraestrategia específica, agregá `--opponent runs/senas-a/actor.json` al crear una corrida del mismo formato. Ambos aprendices entrenan contra ese equipo congelado, alternando el lado en cada chico. El checkpoint conserva el artefacto rival y su hash se publica en `training.json`. Los campos `artifactFileSha256` identifican los bytes completos de los tres archivos. Los hashes de política y checkpoint también se registran por contenido canónico.
