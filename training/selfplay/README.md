# Liga de autojuego

Cada chico a 40 se juega íntegramente entre políticas de computadora. El duelo cuenta con dos trabajadores. Las parejas cuentan con dos, uno sin señas y otro con señas visibles únicamente para el compañero. El motor proyecta la mesa desde el asiento que decide. La modalidad histórica con señas públicas queda excluida.

## Entrenar desde Terminal en la Mac

Desde la raíz del repositorio, con Git, Node 24 y Python 3.9 o posterior, podés preparar otra generación a partir de una liga completa. Usá la carpeta de la liga con su protocolo, sus modelos y sus evaluaciones. En esta Mac, la última liga del ciclo de noviembre se guardó en `runs/league-extended-02`. Si cambiás de checkout o de equipo, pasá la ruta absoluta a esa carpeta o copiá la carpeta completa. Los pesos y las partidas se guardan fuera de Git.

```sh
npm run league -- start runs/piloto-03 --from runs/league-extended-02
runs/piloto-03/league status
runs/piloto-03/league results
```

La primera orden verifica los resultados del padre, congela el código del commit actual y los insumos, elige una semilla nueva y arranca la liga en segundo plano. Podés cerrar Terminal. Todo el trabajo se ejecuta en la Mac y funciona sin conexión, cuenta de Codex ni clave de API. Dejá la Mac enchufada y con la tapa abierta durante la corrida. El supervisor evita la suspensión por inactividad mientras tiene tiempo disponible.

Para seguir entrenando después de una corrida completa, usá el ejecutable de esa carpeta. Verifica los resultados y conserva el código y la versión de Node de esa liga. Podés repetirlo desde cada generación, incluso si moviste la carpeta fuera del repositorio.

```sh
runs/piloto-03/league next runs/piloto-04
```

El piloto autónomo entrena tres épocas de veinte minutos por trabajador, con un plazo total de dos horas para entrenamiento y evaluaciones. El cribado incluye los aspirantes de la propia liga y el finalista anterior. El perfil queda identificado como `local-pilot` en el protocolo.

Usá `status` durante la corrida para ver la época, los chicos jugados por cada trabajador, el plazo y la dirección del tablero local. Al terminar queda el archivo `monitor.html`. La orden `results` verifica los resultados por reparto y muestra para cada modalidad el campeón conservado o clasificado, la ruta del modelo, el intervalo de victoria directa y la familia de rivales con el peor límite inferior. La clasificación exige que el límite inferior simultáneo del 95 % supere el 50 % contra el campeón y que el cambio supere −2 puntos porcentuales en cada familia. La activación en el juego es una decisión posterior.

Si el piloto cumple su criterio de extensión, podés usar su carpeta como padre de seis horas de aprendizaje por trabajador, con ocho horas de plazo total. La orden `results` informa la decisión. Ambas variantes de parejas deben superar al campeón en el límite inferior directo. Frente al rival de cartas fuertes, el cambio respecto del finalista previo debe ser de al menos −2 puntos porcentuales en ambas y de al menos +1 punto en alguna.

```sh
runs/piloto-03/league next runs/extendida-03 --profile extended
```

Si cerraste sesión o reiniciaste la Mac, usá el mismo directorio y la misma versión exacta de Node. La reanudación verifica el código y los insumos guardados antes de recuperar checkpoints y el plazo original. Un plazo vencido queda registrado como corrida incompleta. Podés iniciar otro piloto desde la última liga completa.

```sh
runs/piloto-03/league resume
```

Para comprobar la preparación y elegir cuándo gastar el presupuesto, agregá `--prepare-only` a `start` y luego usá `resume`. El directorio de salida debe ser nuevo. Los archivos de una corrida preparada permiten reanudarla sin el padre. Si un trabajador agota sus reintentos, `status` indica el registro y la orden para reintentar tras resolver la causa.

También podés sustituir `npm run league --` por `python3 -B training/selfplay/local.py` en todas las órdenes. Esta liga solo usa las bibliotecas incluidas con Node y Python. Si Node 24 está instalado fuera del PATH, asigná su ruta absoluta a `TRUCO_NODE`.

## Encadenar pilotos automáticamente en macOS

Podés activar la continuación mientras un piloto está en curso o después de que termine. Desde el checkout, instalá una vez el comando en la carpeta de ese piloto. La instalación también sirve para ligas autónomas preparadas con una versión anterior que tenga `league next`.

```sh
python3 -B training/selfplay/continuous install runs/piloto-03
runs/piloto-03/continuous start
```

La Mac comprueba el estado aproximadamente una vez por minuto. Cuando el piloto termina y sus resultados pasan la verificación, prepara y arranca otro piloto corto con los repartos y campeones que selecciona `league next`. Con la carpeta `piloto-03`, las siguientes generaciones se guardan en `piloto-04`, `piloto-05` y así sucesivamente. El ciclo sigue aunque ningún aspirante supere al campeón. Cada generación conserva sus archivos y ocupa espacio adicional en disco.

Usá siempre la carpeta inicial para consultar o detener la cadena. El estado identifica la generación actual y muestra su progreso y tablero.

```sh
runs/piloto-03/continuous status
runs/piloto-03/continuous stop
```

Podés cerrar Terminal. El servicio vuelve a estar disponible al iniciar sesión en macOS. Mantené las carpetas de la serie en su ubicación durante la continuación. Cada piloto conserva su plazo original. Si una liga termina incompleta, falla la verificación o la siguiente carpeta ya estaba ocupada, `continuous status` muestra el motivo de la pausa. `stop` desactiva los próximos arranques y deja terminar el piloto que ya esté corriendo. Para habilitar la continuación otra vez, repetí `continuous start`.

## Preparación y trabajadores individuales

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

`calibrate-duel.ts LEAGUE OUTPUT` congela una rejilla de ajustes de pesos de cartas y apuestas, selecciona en repartos distintos y conserva un único actor de duelo antes de la auditoría de desarrollo. Usa solo los rivales de entrenamiento.

Para una confirmación adicional de actores ya congelados, escribí en `RUN/plan.json` la semilla nueva, `finalPairs`, `resamples`, la probabilidad de error simultáneo `familyError` y las reglas `gates.directLowerAbove` (0,5) y `gates.everyFamilyDeltaLowerAbove` (−0,02). Ejecutá `confirm.ts RUN PARENT DUEL PAREJAS PAREJAS_PRIVADAS` con Node y, por cada modalidad, `evaluate.ts RUN FORMATO final`. El comando congela los tres candidatos, sus rivales y las huellas de los insumos antes de jugar.

Al preparar una continuación, se puede pasar el directorio de la confirmación fija como último argumento después del perfil. Se comprueba su protocolo padre, se reconstruyen los resultados de cada familia y se verifican las huellas y los umbrales. Si el aspirante del ciclo principal califica, tiene precedencia. Si solo califica el aspirante de la confirmación, se conserva su actor completo como campeón. Un experto trasladado de modalidad sigue disponible para jugar con su adaptador y el nuevo aprendiz usa el último punto de partida nativo.

Si ambos estudios califican a políticas diferentes, se puede preregistrar un desempate en un directorio separado y ejecutar `playoff.ts PRIMARY EXTRA PLAYOFF FORMAT`. El límite unilateral de Hoeffding usa los promedios de cada par de repartos y controla un error total del 1 % en tres formatos. La continuación acepta `PLAYOFF` como último argumento; solo reemplaza al aspirante principal por el adicional si gana con ese criterio.
