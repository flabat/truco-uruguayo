# Comparar el duelo con y sin conteo de cartas

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

Ambos actores guardan **7.424 pesos**. El nuevo usa tres grupos antes libres, con ocho intervalos de probabilidad por grupo y valores propios para los extremos 0 y 1. El tamaño del JSON puede variar al aprender valores distintos. Una segunda comparación podría asignar pesos adicionales al cruce entre el riesgo de una carta, el resultado de la primera baza y el valor del truco. Eso permitiría aprender cuándo conviene reservar la misma carta ganadora. Para medir el aporte de esos pesos conviene mantener fijos el conteo, los rivales y el tiempo de entrenamiento.
