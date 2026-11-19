# Liga de autojuego

Cada chico a 40 se juega íntegramente entre políticas de computadora. El duelo cuenta con dos trabajadores. Las parejas cuentan con dos, uno sin señas y otro con señas visibles únicamente para el compañero. El motor proyecta la mesa desde el asiento que decide. La modalidad histórica con señas públicas queda excluida.

Con Node 24, la preparación congela las entradas de un ciclo anterior, los rivales y compañeros de evaluación, la semilla y los umbrales de promoción en un directorio nuevo.

```sh
node training/selfplay/prepare.ts RUN PREVIOUS_CYCLE
TRUCO_EPOCH=1 node training/selfplay/train.ts RUN duel a --seconds 1200
TRUCO_EPOCH=1 node training/selfplay/train.ts RUN duel b --seconds 1200
TRUCO_EPOCH=1 node training/selfplay/train.ts RUN pairs a --seconds 1200
TRUCO_EPOCH=1 node training/selfplay/train.ts RUN pairs-private-senas a --seconds 1200
```

El supervisor ejecuta los cuatro trabajadores en paralelo. En parejas alterna los linajes a/b por época. Cada aprendiz ajusta su política con resultados de chicos completos. La liga incluye autojuego, campeones anteriores, estilos fijos, modelos archivados y contrincantes que se especializan contra el campeón. Los compañeros también rotan. Cada trabajador guarda el optimizador, generador aleatorio, parámetros, tiempo de aprendizaje y registro cada cinco segundos. Repetir la misma orden completa el presupuesto pendiente de la época.

Al terminar los cuatro trabajadores, se evalúa cada modalidad en paralelo. Por ejemplo, para evaluar la primera época de duelo y al final confirmar el modelo contra el campeón inicial se usan estas órdenes.

```sh
node training/selfplay/evaluate.ts RUN duel 1
node training/selfplay/evaluate.ts RUN duel final
```

La preselección, las pruebas por época y la confirmación final usan repartos diferentes. En cada prueba ambos modelos reciben los mismos repartos y se intercambian los asientos. Para declarar una mejora, el límite inferior simultáneo del 95 % de la tasa de victoria directa debe superar 50 %, y el límite inferior del cambio en cada familia de rivales debe superar −2 puntos porcentuales. En parejas también se prueba con compañeros ajenos a la liga. El informe de señas mide el efecto de habilitarlas y enmascararlas en repartos emparejados.

Los eventos en `RUN/events` alimentan el monitor. Cada `RUN/<modalidad>/eval-final.json` incluye estimaciones, intervalos, número de chicos e identificadores de los modelos. Un modelo calificado se conserva para investigación local. Su activación en el juego del navegador es una operación aparte.

## Supervisión local

En macOS, arrancá el tablero y el supervisor después de preparar el directorio de corrida y el checkout fijado. El tablero puede mostrar el avance de la preparación antes de liberar el aprendizaje.

~~~sh
python3 training/selfplay/launch_macos.py "$RUN" --runtime "$RUNTIME" --node "$(command -v node)" --port 8776
~~~

El comando registra dos servicios para el usuario conectado. El bloqueo de pantalla mantiene las tareas activas. Si cerrás sesión o se reinicia el equipo, repetí el comando desde el mismo checkout, con el mismo directorio. El plazo máximo conserva su hora original. Para usar terminales en otro sistema POSIX, arrancá los procesos por separado.

~~~sh
python3 training/selfplay/monitor.py "$RUN" --port 8776
python3 training/selfplay/supervise.py "$RUN" --runtime "$RUNTIME" --node "$(command -v node)"
~~~

Abrí la dirección de `$RUN/ops/monitor-url.txt` o el archivo `$RUN/monitor.html`. `tail -f "$RUN/progress.log"` muestra el registro. El HTTP escucha solo en loopback. `--file-only` lo desactiva y `--port 0` permite elegir un puerto disponible.

Cuando estén verificadas las entradas y el código de la corrida, `touch "$RUN/READY"` libera el supervisor. Cada época ejecuta dos linajes de duelo y una computadora por variante de parejas. Ambos linajes se alternan en cada variante de parejas. Las tres evaluaciones de época se hacen en paralelo después de que los cuatro entrenamientos confirman sus checkpoints. Cada reintento continúa hasta el objetivo acumulado de segundos de su época. Para diagnosticar un error, consultá `$RUN/ops/tasks/<tarea>.log` y su archivo JSON. Después de corregir la causa, `touch "$RUN/ops/retry-<tarea>"` habilita hasta tres nuevos intentos. Los plazos, los checkpoints y las evaluaciones anteriores se conservan.

Las curvas de desarrollo miden victorias contra el campeón de cada época. La confirmación final usa un conjunto de repartos independiente y el campeón congelado al inicio. El tablero separa las victorias observadas en entrenamiento de esas evaluaciones. Los informes finales están en `$RUN/<formato>/eval-final.json` y el resumen en `$RUN/ops/summary.json`.

Para arrancar otra noche, pasá el directorio de la liga anterior como `PREVIOUS_CYCLE`. La preparación lee las tres confirmaciones finales y comprueba las huellas de modelos e insumos. En cada modalidad, una mejora confirmada inicia los nuevos linajes con sus pesos aprendidos. Si el aspirante no califica, se conserva el campeón inicial. La nueva liga usa repartos nuevos, reinicia el optimizador y el crítico, y guarda el aspirante y el contrincante anteriores entre sus rivales. El protocolo registra el parentesco por modalidad. Reanudar el mismo directorio tras una interrupción conserva todo el estado del optimizador.

## Piloto de regresiones pareadas

Los perfiles opcionales `pilot` y `extended` toman como punto de partida una liga terminada. Ejemplo para ejecutar tres épocas de 20 minutos con una semilla nueva:

~~~sh
node training/selfplay/prepare.ts RUN PARENT NEW_SEED pilot
~~~

El perfil `extended` ejecuta 18 épocas. Los dos perfiles comparan políticas congeladas en repartos de entrenamiento idénticos con asientos intercambiados. Una caída respecto del campeón aumenta el peso de ese rival y de esa composición de equipo. En parejas también se juega frente al estilo de cartas fuertes con los dos asientos aprendidos y con un compañero congelado. Los cuatro chicos de cada sondeo no actualizan el optimizador y se contabilizan por separado en `probeGames`.

La selección pondera el peor cambio entre los estilos de desarrollo y exige preferentemente una mayoría directa del 55 %. La confirmación final usa nuevos repartos, 4.096 pares por familia y los umbrales originales. En el piloto, los dos aspirantes de coordinación ajustados solo en entrenamiento deben congelarse en `RUN/training-candidates/<modalidad>/team.json` antes del cribado final. El informe por modalidad incluye los cambios emparejados respecto del finalista anterior y sus intervalos exploratorios. La regla de extensión figura en el protocolo antes de comenzar.
