# Comparar los tres modelos de duelo

Desde la raíz del checkout, con Node 24 y Python 3, esta orden reparte seis horas de entrenamiento entre tres modelos de duelo. La evaluación se ejecuta al final y lleva tiempo adicional.

```sh
caffeinate -i node training/selfplay/compare-duel.ts --interactions --from runs/local-pilot-03 --run runs/duel-trio-01 --seconds-per-arm 7200 --pairs 256
```

| Modelo | Pesos de la política | Qué aprende |
| --- | ---: | --- |
| `baseline` | 7.424 | La política del piloto original. |
| `odds` | 7.424 | Usa además la probabilidad de que el rival supere o empate cada carta propia. |
| `interactions` | 11.264 | Aprende cuánto vale una jugada al combinar esas probabilidades con el resultado de la primera baza y los puntos de truco en juego. |

Los tres aprenden uno después del otro, durante dos horas activas cada uno, desde el mismo campeón congelado, con la misma semilla de repartos y el mismo conjunto inicial de rivales. Los pesos adicionales comienzan en cero. Cada modelo juega contra los otros dos y contra el campeón original. Con 256 pares son 512 chicos por cruce, con asientos invertidos, y 3.072 chicos de evaluación en total.

Para medir el aporte de los pesos adicionales, mirá el enfrentamiento de `interactions` contra `odds`. La terminal lo muestra al terminar y se guarda en `comparison.json` bajo `matchups.interactionsVsOdds`. Si el extremo inferior de su intervalo del 95 % supera el 50 %, el modelo ampliado tuvo ventaja en esos repartos para ese entrenamiento. Cada intervalo describe un único cruce. Una réplica con otra semilla permite comprobar si la mejora se repite.

Si interrumpís la comparación, repetí la misma orden agregando `--resume`. Para abrir el **tablero en el navegador** desde otra terminal en macOS:

```sh
python3 training/selfplay/duel_dashboard.py runs/duel-trio-01 --open
```

El tablero muestra el modelo activo, el tiempo de entrenamiento que le queda a cada modelo y al conjunto, las últimas jugadas públicas y los resultados de los cruces cuando termina la evaluación. La página se actualiza aunque cierres esa terminal. Podés volver a abrir `monitor.html` en el directorio de la comparación. Si reiniciás la Mac, repetí la orden del tablero después de reanudar.

[Ver una captura del tablero con una corrida de ejemplo](../../docs/interfaz/capturas/duel-training-dashboard.jpg).

Para consultar el último evento de cada modelo directamente en la terminal:

```sh
find runs/duel-trio-01 -path '*/events/duel-a.jsonl' -exec tail -n 1 {} \;
```

## Comparar solo el modelo original y el modelo con conteo

Desde la raíz del checkout, con Node 24 y Python 3, esta orden dedica tres horas de entrenamiento al modelo actual y tres al que cuenta cartas. Ambos parten del campeón congelado al inicio del piloto indicado en `--from`. Se puede usar un piloto en curso. El entrenamiento y la evaluación se juegan íntegramente entre computadoras.

```sh
caffeinate -i node training/selfplay/compare-duel.ts \
  --from runs/local-pilot-03 --run runs/duel-odds-01 \
  --seconds-per-arm 10800 --pairs 256
```

Elegí un directorio nuevo en `--run`. Los dos modelos entrenan uno después del otro con el mismo presupuesto, la misma semilla de repartos y el mismo conjunto inicial de rivales. Cada trabajador termina el chico en curso cuando alcanza su tiempo. El informe registra los segundos y los chicos efectivamente completados. El guardado y la evaluación llevan tiempo adicional. Para una prueba rápida se puede elegir, por ejemplo, `--seconds-per-arm 30 --pairs 8`.

La terminal indica qué modelo está entrenando. Desde otra terminal se puede leer el último avance de ambos. Cada archivo aparece al comenzar ese entrenamiento y se actualiza aproximadamente cada cinco segundos.

```sh
tail -n 1 runs/duel-odds-01/{baseline,odds}/events/duel-a.jsonl
```

Se puede interrumpir con Ctrl+C y repetir la orden original agregando `--resume`, con el mismo directorio, presupuesto, cantidad de pares y versión de Node. El trabajador continúa desde el último checkpoint. Para repetir el experimento con otro entrenamiento independiente, elegí otro directorio. Por defecto cada comparación nueva genera su propia semilla. También se puede fijar con `--seed`.

## Leer el resultado

Al terminar, la terminal muestra la tasa de victorias del modelo con conteo frente al control y su intervalo del 95 %. En `comparison.json`, `headToHead` resume el enfrentamiento directo. Con 256 pares son 512 chicos, dos por secuencia de repartos con los asientos invertidos. Un intervalo que cruce el 50 % deja abierta la ventaja en este entrenamiento.

El mismo informe incluye las victorias de cada modelo frente al campeón inicial y la diferencia emparejada en `againstChampion.delta`. `arms` registra los segundos, los chicos, la cantidad de pesos, el tamaño del archivo y la ubicación de cada candidato. Los intervalos describen la variación entre repartos de evaluación para esos modelos. Para medir la variación entre entrenamientos, repetí con otra semilla.

## Qué aprende el modelo

Para cada carta propia, el modelo calcula la probabilidad de que la mejor carta que aún guarda el rival la supere o la empate. Usa la jerarquía de la muestra, las tres cartas propias originales y cada carta rival que se jugó en la mano. El cálculo supone repartos equiprobables entre las cartas desconocidas. Las preferencias de juego y de farol del rival quedan fuera de este cálculo. El aprendiz también usa el riesgo de su mejor carta al valorar un canto.

Con muestra 6 de oros y una mano de 4 de oros, 7 de copas y 4 de bastos, solo el 2 de oros supera al 4 de oros. De entrada la probabilidad de que el rival lo tenga es 3/36. Si el rival gasta el 2 en la primera baza, baja a cero. Si en cambio juega el as de espadas, es 2/35.

El modelo con conteo usa tres grupos antes libres, con ocho intervalos de probabilidad por grupo y valores propios para los extremos 0 y 1. El archivo JSON puede variar de tamaño cuando aprende valores distintos.

El tercer modelo agrega **3.840 pesos**. Para jugar una carta usa las probabilidades de esa carta. Para los cantos usa las de su mejor carta restante. Distingue si la primera baza sigue abierta, terminó parda, la ganó o la perdió. También distingue de uno a cuatro puntos de truco. Al proponer o responder a una subida tiene en cuenta el valor en disputa. Así puede aprender, por ejemplo, a jugar antes la misma carta cuando perdió la primera baza y hay tres puntos en juego.
