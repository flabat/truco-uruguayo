# Entrenar y evaluar Transformers de Truco

El aprendiz juega chicos a 40 con el motor de la arena. Primero aprende de Ceibo y después ajusta sus pesos con el resultado de cada chico contra Ceibo, estilos fijos y sí mismo. El modelo con historial ve la secuencia de la mano desde su propio asiento. Con `--arms both` se entrena también un modelo con los rasgos resumidos de Ceibo. Ambos empiezan con los mismos pesos y reciben el mismo presupuesto de partidas. Los participantes son computadoras y la variante con señas usa exclusivamente `pairs-private-senas`.

| Tamaño | Pesos por modelo | Capas | Ancho | Cabezas | Dispositivo por defecto |
| --- | ---: | ---: | ---: | ---: | --- |
| `small` | 14.906 | 1 | 24 | 2 | CPU |
| `medium` | 846.594 | 4 | 128 | 4 | GPU Metal |
| `large` | 4.845.570 | 6 | 256 | 8 | GPU Metal |

## Arrancar en la terminal del Mac

Usá Node 24, Python 3 y uv. Desde este checkout:

~~~sh
uv sync --frozen --project training/partners/python
RUN=runs/transformer-medium-duel
CEIBO=runs/league-extended-02/qualified/duel/candidate.json
SMALL=runs/transformer-272-duel-replication
nohup caffeinate -i python3 training/transformer/run.py "$RUN" \
  --size medium --device mps --ceibo "$CEIBO" --small-reference "$SMALL" \
  --seed 27401 --warmup 512 --rounds 512 --batch 16 --pairs 512 \
  > "$RUN.log" 2>&1 < /dev/null &
~~~

Si los datos viven en otro checkout, usá rutas absolutas. `--small-reference` toma el directorio de una corrida pequeña terminada en el mismo formato. El experimento conserva copias verificadas de esa referencia y del Ceibo publicado. Para usar otro formato, pasá `--format pairs` o `--format pairs-private-senas` y los insumos correspondientes. Para el modelo grande, usá otro directorio de salida y `--size large`.

El entrenador ejecuta las redes, las pérdidas y el optimizador en Metal. El árbitro y el Transformer pequeño congelado corren en CPU. Si PyTorch no puede acceder a Metal, una corrida que pide `mps` se detiene con un diagnóstico. Para comparar rendimiento con CPU, creá otra corrida con `--device cpu` y el mismo plan de partidas. Para una prueba corta antes de usar el presupuesto de arriba, elegí otro directorio y pasá `--warmup 2 --rounds 2 --batch 2 --pairs 4`.

## Mirar el progreso y reanudar

~~~sh
python3 training/transformer/run.py "$RUN" --status
tail -f "$RUN.log"
~~~

El estado muestra las rondas calculadas y confirmadas, decisiones, chicos procesados por segundo y memoria asignada por el controlador Metal. Para reanudar un trabajo que se detuvo, conservá el mismo checkout y entorno:

~~~sh
nohup caffeinate -i python3 training/transformer/run.py "$RUN" \
  >> "$RUN.log" 2>&1 < /dev/null &
~~~

Cada ronda reúne dos juegos por cada par de repartos de `--batch`. `--microbatch` limita las posiciones que entran juntas a la GPU. Si falta memoria, probá una corrida nueva con un valor más chico. Por defecto los tamaños mediano y grande guardan un checkpoint cada ocho rondas. `--checkpoint-every` permite ajustar ese intervalo. Una interrupción puede repetir rondas posteriores al último guardado. Para terminar limpiamente en una ronda de entrenamiento, agregá `--stopAfter N`, donde `N` cuenta todas las rondas ya hechas y las que querés completar. El dispositivo y los presupuestos quedan fijados en el plan.

## Interpretar los resultados

- `policy-full.pt` contiene los pesos entrenados en CPU para cargar o exportar sin el estado del optimizador. Con `--arms both` también se genera `policy-summary.pt`. `checkpoint.pt` permite reanudar.
- `result.json` informa victorias e intervalos simultáneos del 95 % frente a Ceibo, la referencia pequeña cuando se incluye y estilos reservados. Cada comparación juega dos veces los mismos repartos nuevos e intercambia los bandos. En parejas también se prueba con un compañero fijo.
- La referencia pequeña histórica sirve como comparación práctica. Para medir el efecto del tamaño, entrená una referencia pequeña nueva con la misma semilla, presupuesto, formato y modo de historial, y compará las versiones en repartos reservados. Una victoria ante Ceibo solamente mide ese enfrentamiento. Buscá ventajas que se repitan con otros rivales y semillas.

Pruebas del modelo, dispositivo, guardado y reanudación:

~~~sh
training/partners/python/.venv/bin/python -B tests/training/test_transformer.py
~~~
