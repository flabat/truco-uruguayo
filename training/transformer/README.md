# Experimento de historial de la mano

Dos Transformers de una capa y dos cabezas reciben los mismos rasgos de Ceibo, la misma lista de jugadas legales y vuelven a empezar con los mismos pesos. Uno también lee la secuencia de la mano desde el asiento que decide: quién jugó, qué carta o canto hizo, los puntos visibles que se cobraron, el tanto mostrado y las señas que ese asiento puede ver. Con señas se usa exclusivamente `pairs-private-senas`. La proyección de la arena filtra las señas antes de codificar la observación.

Ambos aprenden primero de las mismas decisiones de Ceibo y luego juegan chicos a 40, con asientos alternados, contra Ceibo, estilos fijos y ellos mismos. Durante esta segunda etapa cada red elige sus propias jugadas. El aprendizaje ajusta los pesos con el resultado de cada chico completo. El árbitro de la arena aplica las reglas y ambos modelos puntúan únicamente las jugadas que ese árbitro ofrece.

## Ejecutar en una terminal

Desde este checkout, con Node 24, Python 3 y uv:

~~~sh
uv sync --frozen --project training/partners/python
RUN=runs/transformer-duel
CEIBO=runs/league-extended-02/qualified/duel/candidate.json
python3 training/transformer/run.py "$RUN" --ceibo "$CEIBO" --warmup 96 --rounds 96 --batch 8 --pairs 256
~~~

Si los artefactos viven en otro checkout, usá la ruta absoluta de `candidate.json`. El primer comando de corrida guarda y verifica una copia del Ceibo publicado para ese formato. Para repetir con una semilla independiente, usá otro directorio y agregá `--seed 27202`. Para parejas, pasá `--format pairs` o `--format pairs-private-senas` y el `candidate.json` correspondiente. Todos los participantes son computadoras.

Para dejar una corrida nueva en segundo plano, agregá `nohup nice -n 10` antes de `python3` y `> archivo.log 2>&1 < /dev/null &` al final. En macOS, `caffeinate -i` puede mantener la máquina activa mientras corre el proceso.

~~~sh
python3 training/transformer/run.py "$RUN" --status
python3 training/transformer/run.py "$RUN"
~~~

El segundo comando reanuda desde la última ronda o bloque de evaluación confirmado. Conservá este checkout y sus versiones de Node y PyTorch. El directorio guarda el plan, los pesos de ambos candidatos con el estado del optimizador, el progreso y los resultados. El plan fija los presupuestos al crear la corrida. Para detenerla limpiamente en una ronda de entrenamiento, usá `--stopAfter N`, donde `N` cuenta las rondas de ambas etapas acumuladas. También podés interrumpir con Ctrl+C y repetir el comando de reanudación con el mismo directorio.

## Interpretar el resultado

- `plan.json` registra el Ceibo utilizado, las semillas separadas y el presupuesto por modelo. Cada ronda juega `2 × batch` chicos por modelo, con datos de imitación compartidos.
- `evaluation.json` guarda los dos resultados por reparto y enfrentamiento. La evaluación comienza después de congelar ambos modelos. Cada comparación usa repartos independientes del entrenamiento con dos juegos por reparto e intercambio de bandos.
- `result.json` informa las victorias e intervalos simultáneos del 95 %. Para afirmar que el Transformer con historial supera a ambos, el extremo inferior de su tasa de victoria debe superar el 50 % frente a Ceibo y frente al Transformer con resumen. Los estilos reservados y, en parejas, el compañero fijo sirven para detectar dependencia de un rival o de la coordinación entre dos copias del modelo.
- El entrenamiento de una sola semilla mide esos pesos y ese presupuesto. Las corridas con semillas de entrenamiento independientes ayudan a comprobar si el resultado se repite.
