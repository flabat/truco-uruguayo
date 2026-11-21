# Piloto de búsqueda y autojuego para duelo

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

El piloto usa CPU y solo cubre duelo. Publicar o integrar un candidato al juego en línea queda fuera del experimento.

~~~sh
node --test tests/unit/training-alphazero.test.ts
~~~
