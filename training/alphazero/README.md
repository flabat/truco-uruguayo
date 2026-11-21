# Búsqueda y autojuego para duelo y parejas

La red chica tiene una salida de política para las jugadas legales y otra que estima el resultado del chico. Se inicia con el prior de Ceibo. La arena juega encuentros completos entre computadoras. La red aprende de las visitas de búsqueda y del ganador del chico, con los pesos congelados mientras se generan las partidas de cada época.

El árbol agrupa las decisiones propias por el historial visible. Muestrea manos rivales compatibles desde la observación del asiento y pondera las jugadas anteriores con un modelo de Ceibo suavizado. Las decisiones simuladas del rival siguen una política fija en su propio asiento. La búsqueda combina el valor de la red con simulaciones hasta el fin de la mano, y traduce el tanteador a probabilidad de ganar el chico. Es una adaptación del ciclo de AlphaZero a cartas ocultas con un rival simulado fijo. Los resultados dependen de ese supuesto y del presupuesto de búsqueda.

## Ejecutar y reanudar

Con Node 24 y Python 3, desde el checkout:

~~~sh
RUN=runs/alphazero-duel
CEIBO=runs/league-extended-02/qualified/duel/candidate.json
python3 training/alphazero/run.py "$RUN" --ceibo "$CEIBO" \
  --seed 27601 --epochs 20 --train-pairs 6 --simulations 16 --eval-pairs 256
~~~

Si el Ceibo publicado vive en otro checkout, pasá su ruta absoluta. Usá otro directorio y otra semilla para probar una réplica. Para dejarlo en segundo plano en macOS, anteponé `nohup caffeinate -i` al comando y agregá `> "$RUN.log" 2>&1 < /dev/null &` al final.

~~~sh
python3 training/alphazero/run.py "$RUN" --status
python3 training/alphazero/run.py "$RUN"
~~~

El plan fija el código, los presupuestos y el Ceibo por huella. La segunda orden retoma desde la última época guardada o desde el último par confirmado de evaluación. El reporte principal en `result.json` compara el actor aprendido con búsqueda contra Ceibo en dos juegos por reparto con asientos intercambiados. El intervalo del 95 % vuelve a muestrear pares completos. Como controles exploratorios se mide la misma red sin búsqueda y la búsqueda con la red inicial. `evaluation.json` conserva las victorias por reparto y `policy.json` los pesos y la tabla de continuación.

Usá `--format duel`, `--format pairs` o `--format pairs-private-senas` y el Ceibo publicado correspondiente. En parejas se muestrean las manos ajenas conjuntamente y cada resultado entrena a ambos asientos del equipo ganador. Una evaluación adicional fija el mismo compañero `rare-bluff` para ambos candidatos y alterna sus asientos. Esta variante juega parejas sin señas. Publicar un candidato al juego en línea queda fuera del experimento.

## Corrida de una hora con la GPU del Mac

Instalá el entorno PyTorch fijado con `uv sync --frozen --project training/partners/python`. Desde una terminal nativa de macOS:

~~~sh
RUN=runs/alphazero-metal-hour
CEIBO=runs/league-extended-02/qualified/duel/candidate.json
python3 training/alphazero/run.py "$RUN" --ceibo "$CEIBO" --device mps \
  --seed 28001 --epochs 128 --train-pairs 6 --simulations 48 --eval-pairs 512 \
  --budget-seconds 3600 --reserve-seconds 1200 --primary-only
~~~

Metal ajusta los pesos de política y valor. La arena y las simulaciones del árbol se ejecutan en CPU. Cada época registra el tiempo de ajuste y la memoria asignada en Metal. `TRUCO_PYTHON` permite seleccionar el ejecutable de otro entorno compatible con PyTorch.

Esta configuración genera hasta 1.536 chicos de autojuego con 48 simulaciones por decisión, reserva 20 minutos para evaluar y contrasta al candidato aprendido con búsqueda contra Ceibo en 512 repartos nuevos. El reloj del plan sigue corriendo durante una interrupción. Hasta el tope de entrenamiento solo se guardan épocas completas. Al terminar esa etapa se congela el candidato antes de abrir los repartos de evaluación y se guarda cada par completo. Si vence la hora antes del último par, se conserva el avance y el proceso termina sin emitir un veredicto.

~~~sh
node --test tests/unit/training-alphazero.test.ts
~~~


## Corridas nocturnas

Los ejemplos reservan dos de ocho horas para evaluar. El reloj sigue corriendo durante una detención. Guardá las dos corridas y sus logs en directorios distintos y usá el mismo checkout cuando necesites reanudarlas.

~~~sh
CEIBO_ROOT=runs/league-extended-02/qualified
PREVIOUS=runs/alphazero-280-hour/policy.json

nohup caffeinate -i python3 training/alphazero/run.py runs/alphazero-night-duel \
  --format duel --ceibo "$CEIBO_ROOT/duel/candidate.json" --initial-policy "$PREVIOUS" \
  --device mps --seed 28401 --epochs 1000 --train-pairs 8 --simulations 48 --eval-pairs 512 \
  --budget-seconds 28800 --reserve-seconds 7200 --primary-only \
  > runs/alphazero-night-duel.log 2>&1 < /dev/null &

nohup caffeinate -i python3 training/alphazero/run.py runs/alphazero-night-pairs \
  --format pairs --ceibo "$CEIBO_ROOT/pairs/candidate.json" \
  --device mps --seed 28402 --epochs 1000 --train-pairs 6 --simulations 48 --eval-pairs 384 \
  --budget-seconds 28800 --reserve-seconds 7200 --primary-only \
  > runs/alphazero-night-pairs.log 2>&1 < /dev/null &
~~~

`--initial-policy` conserva una copia verificada del actor y su tabla de continuación. El duelo compara el candidato entrenado tanto con Ceibo como con ese actor congelado usando el mismo número de simulaciones. En parejas, `--primary-only` conserva el duelo de equipos completos y el contraste con compañero fijo. Los contrastes usan repartos nuevos, con intervalos pareados simultáneos del 95 %.

Para comparar capacidad, repetí la orden de duelo con otro directorio de salida y `--hidden 256`. El ancho por defecto de 24 tiene 1.248 pesos y el de 256 tiene 13.312. El ensanchamiento conserva las probabilidades y el valor del actor de partida antes de cualquier actualización. Ambas corridas pueden usar la misma semilla y el mismo presupuesto de búsqueda. El tope de tiempo puede darles presupuestos efectivos de autojuego distintos.


## Parejas con señas privadas de rango

~~~sh
python3 training/alphazero/run.py runs/alphazero-rangos \
  --format pairs-private-senas --device mps --seed 29601 --epochs 24 --train-pairs 4 \
  --simulations 24 --eval-pairs 128 --primary-only \
  --ceibo runs/league-extended-02/qualified/pairs-private-senas/candidate.json
~~~

La política elige la jugada y, una vez por mano cuando puede, señala la carta más fuerte que todavía conserva y que tiene un gesto de rango. La red recibe una estimación conservadora de la fuerza anunciada por su compañero. La búsqueda da prioridad a repartos compatibles y descarta una pista cuando aparece una carta del rango indicado. Los gestos ambiguos conservan todas las cartas compatibles. Cuando el presupuesto no encuentra repartos compatibles con la pista, se usan repartos compatibles con la historia pública o se vuelve al prior legal.

Solo el emisor y su compañero ven la seña. Para los rivales, el historial, el evento y la semilla de búsqueda son iguales a los de la misma jugada en silencio. Dentro de la búsqueda, la clave del árbol aplica la misma visibilidad.

Además de enfrentar a Ceibo con el equipo completo y con un compañero fijo, `signals-ablation` enfrenta los mismos pesos en ambos equipos. Uno envía y usa señas y el otro juega en silencio. El informe cuenta las señas emitidas y las decisiones con una pista disponible. El experimento usa la convención de rangos de la guía del juego.
