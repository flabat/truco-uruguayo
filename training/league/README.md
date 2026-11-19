# Liga local por chico a 40

Reservá un proceso de CPU para cada formato y alterná tres semillas según los segundos ya consumidos. El manifiesto fija la revisión del entrenador, Node y el equipo. La semilla de la matriz de desarrollo es pública y pertenece a otro dominio. El campeonato independiente custodia sus propios repartos.

Desde la raíz del checkout, con Node 24, Python y el entorno de parejas fijado mediante uv:

```sh
npm ci
uv sync --frozen --project training/partners/python
export TRUCO_PYTHON="$PWD/training/partners/python/.venv/bin/python"
node training/league/cli.ts profile --run runs/league
python3 training/league/monitor.py --runtime "$PWD" --run runs/league
```

El perfil usa 15 minutos por formato. El monitor comprueba los nueve presupuestos, congela los archivos completos y ejecuta el piloto en el checkout fijado. Establece un plazo de dos horas de reloj para las tres líneas simultáneas, registra RSS del árbol de procesos por formato y semilla cada cinco segundos, y recupera el actor de cada último checkpoint al terminar. La preparación del export y la verificación posterior se miden aparte del tiempo de aprendizaje. Para adjuntarlo antes de que termine un perfil ya iniciado se admite `--attach-profile PID`. Las muestras de recursos empiezan al adjuntar. En un reinicio se valida la revisión y se continúa con el plazo original.

Para cada etapa, corré una matriz por formato con el mismo presupuesto. Un cruce de 48 pares juega dos chicos completos por par, cambiando de equipo y conservando los repartos.

```sh
node training/league/development.ts --run runs/league --stage early --format duel
node training/league/development.ts --run runs/league --stage profile --format duel
node training/league/profile-counter.ts --run runs/league --format duel --matches 512
node training/league/development.ts --run runs/league --stage pilot --format duel
```

Repetí esos comandos para `pairs` y `pairs-private-senas`. Cada matriz conserva los resultados por par para las 36 combinaciones de tres aprendices y seis estilos de computadora, y la distribución de tiempos del actor. Para extender durante ocho horas un formato, exigimos mejora del piloto frente a la primera foto y frente al perfil en los límites inferiores de sendos intervalos pareados al 95%, más mejora mediana entre las tres semillas. El presupuesto, la regla y los adversarios se fijan antes de inspeccionar el piloto. La familia con peor resultado y el orden entre tres equipos permiten detectar debilidades y ciclos. Ante una meseta, el siguiente comando mide un cambio concreto a presupuesto parejo en las tres semillas.

```sh
node training/league/variation.ts --run runs/league --format duel
node training/league/freeze.ts --run runs/league --stage pilot --format duel --counterMatches 1024
```

En duelo se compara la capacidad de agrupación tabular. En parejas se añaden dos rivales congelados a la rotación de entrenamiento. Las variantes usan el mismo presupuesto y agenda que sus controles. Se conserva el resultado por separado como diagnóstico de desarrollo. El paquete de entrada del campeonato fija el candidato, el oponente independiente, un compañero de otra semilla para los dos formatos de parejas y un contrajugador nuevo entrenado contra ese candidato. La variante de duelo aprende retornos Monte Carlo por acción y exporta el formato del actor de duelo. En parejas se entrenan una red recurrente y una tabla MC frente al mismo rival congelado. Un hash físico identifica cada archivo y el registro de servicio calcula por separado el pin de activación. El presupuesto sugerido de campeonato estima la varianza de los cambios pareados, un efecto detectable objetivo y el costo de cuatro chicos por familia en una ventana local de 30 minutos.

Las mediciones y pesos grandes se conservan en el directorio de corrida. La generación de artefactos y el campeonato son locales.

El comando `python3 training/league/finish.py --runtime "$PWD" --run runs/league --registry api/actor-registry.ts` espera los archivos verificados del piloto. Genera las matrices pendientes, aplica el criterio preregistrado, ejecuta ocho horas locales solo donde hubo progreso y compara una variante de entrenamiento donde se observó una meseta. Se comparan las respuestas de duelo MC densa y conservadora (esta última si contiene alguna fila aprendida), o las respuestas de parejas MC y recurrente. Gana la mayor fracción de victorias frente al campeón en los mismos 48 pares de desarrollo con intercambio de asientos, independientes de la matriz y del campeonato. Un empate conserva el orden declarado: MC densa antes que conservadora en duelo, MC antes que recurrente en parejas. El recibo y el paquete nombran la familia efectiva del ganador (`duel-mc`, `pairs-mc-v1` o `pairs-recurrent-v1`). Las primeras matrices del perfil y sus contrajugadores son evidencia de desarrollo. Su recibo verifica el rival guardado en el checkpoint, su semilla, los chicos completos y el archivo elegido. El índice `championship-input/index.json` enlaza los tres paquetes de evaluación.

Los segundos de pared por línea indican el presupuesto asignado. Al observar la tabla de procesos, la muestra incluye por separado CPU acumulada por PID. El informe suma diferencias entre observaciones del mismo proceso y las etiqueta como límite inferior de horas efectivas de CPU. En una corrida anterior sin ese campo se puede adjuntar `monitor.py --observe-pilot-cpu --runtime <checkout> --run <corrida>` para medir desde ese punto sin lanzar otro entrenador.

Si el coordinador del piloto se pierde antes del plazo, se puede repetir `monitor.py --runtime <checkout-fijado> --run <corrida>`. El monitor se adjunta si el coordinador sigue vivo. Si desaparece un PID adjunto sin cumplir las cuotas, respeta cualquier escritor del último lote y reanuda el plan con el mismo plazo absoluto. Un proceso iniciado por el propio monitor que falle deja el plazo abierto para diagnóstico. Los cálculos de throughput cuentan solo unidades de lotes cronometrados; se declaran por separado las unidades recuperadas sin tiempo y se excluyen de la tasa de decisiones los huecos sin contador inicial.

## Piloto local del 18 de noviembre de 2026

Con tres semillas por modalidad, la variación media desde el perfil fue +0,98 puntos porcentuales en duelo, +0,52 en parejas y −2,14 en parejas con señas. Los tres intervalos pareados al 95 % incluyeron cero. Se cerró el aprendizaje al cumplir dos horas y se comparó una variante en cada modalidad. El registro incluye el tiempo observado, las tasas y métricas por semilla, las rutas y los SHA-256 de las matrices, los pesos y los checkpoints. Las rutas de artefactos son relativas a `runs/league-130-01`. [Resultados públicos de la liga](results/local-2026-11-18.json).
