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

Repetí esos comandos para `pairs` y `pairs-senas`. Cada matriz conserva los resultados por par para las 36 combinaciones de tres aprendices y seis estilos de computadora, y la distribución de tiempos del actor. Para extender durante ocho horas un formato, exigimos mejora del piloto frente a la primera foto y frente al perfil en los límites inferiores de sendos intervalos pareados al 95%, más mejora mediana entre las tres semillas. El presupuesto, la regla y los adversarios se fijan antes de inspeccionar el piloto. La familia con peor resultado y el orden entre tres equipos permiten detectar debilidades y ciclos. Ante una meseta, el siguiente comando mide un cambio concreto a presupuesto parejo en las tres semillas.

```sh
node training/league/variation.ts --run runs/league --format duel
node training/league/freeze.ts --run runs/league --stage pilot --format duel --counterMatches 1024
```

En duelo se compara la capacidad de agrupación tabular. En parejas se añaden dos rivales congelados a la rotación de entrenamiento. Las variantes usan el mismo presupuesto y agenda que sus controles. Se conserva el resultado por separado como diagnóstico de desarrollo. El paquete de entrada del campeonato fija el candidato, el oponente independiente, un compañero de otra semilla para los dos formatos de parejas y un contrajugador nuevo entrenado contra ese candidato. La variante de duelo aprende retornos Monte Carlo por acción y exporta el formato del actor de duelo. Las parejas exportan las tablas MC del aprendiz fijado al rival. Un hash físico identifica cada archivo y el registro de servicio calcula por separado el pin de activación. El presupuesto sugerido de campeonato estima la varianza de los cambios pareados, un efecto detectable objetivo y el costo de cuatro chicos por familia en una ventana local de 30 minutos.

Las mediciones y pesos grandes se conservan en el directorio de corrida. La generación de artefactos y el campeonato son locales.
