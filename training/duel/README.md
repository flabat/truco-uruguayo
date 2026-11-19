# Entrenamiento local del duelo

Desde la raíz con Node 24, un solo proceso por directorio de corrida. La semilla controla repartos, elección de los nodos de entrenamiento y dos flujos de muestreo de jugadas. La evaluación de desarrollo deriva otra semilla con dominio propio. Todos los asientos los ocupan computadoras.

```sh
npm ci
node --test tests/unit/training-duel.test.ts
node training/duel/cli.ts --format duel --config training/configs/duel-local.json --run runs/duel-a --iterations 16
node training/duel/cli.ts --resume runs/duel-a/checkpoint --iterations 128
```

El límite de iteraciones es acumulativo. El archivo `checkpoint` reemplaza atómicamente la última versión al completar cada bloque de `saveEvery` iteraciones. Un reinicio verifica su SHA-256 y recupera las tablas de arrepentimiento y de estrategia media, visitas, iteración, estado de los tres generadores y el juego reducido. Al reanudar se puede aumentar el límite. La ejecución escribe `actor.json` y `manifest.json` al completar el límite. Una interrupción entre archivos permite regenerarlos con el último checkpoint. El lector independiente `loadDuelActor(path)` verifica esquema, reglas, acciones e identidad de los pesos.

Cada manifiesto registra versión de código, runtime, presupuesto, visitas, número de filas, tiempo, resultados por rival y hashes de los artefactos. Con iguales revisión, configuración, semilla e iteraciones se recuperan los mismos bytes del checkpoint y actor, y los mismos resultados pareados. El tiempo y memoria reflejan cada ejecución. La evaluación de desarrollo ejecuta por defecto ocho pares por oponente a 40, invierte los asientos y verifica el replay de cada chico. `--eval-pairs N` fija otra cantidad. La evaluación de promoción y sus oponentes sellados corresponden al campeonato independiente.

## Referencia exacta

En el duelo de Kuhn cada asiento recibe en privado uno de tres rangos. Puede pasar, apostar, pagar o retirarse según la secuencia pública. El pago neto va de −2 a +2. En cada iteración se alterna el asiento que actualiza, se muestrea uno de los seis repartos y una acción en los nodos del rival. Se evalúan las dos alternativas del asiento que actualiza y se acumula su arrepentimiento frente al valor mixto. El promedio de cada conjunto pesa la probabilidad de las decisiones anteriores del propio asiento. El oráculo evalúa las seis distribuciones contra las 64 políticas puras posibles de cada rival. Los tests verifican el valor exacto −1/18 de una política mixta conocida, su explotabilidad cero y las respuestas óptimas ante políticas entrenadas con tres semillas. [Muestreo externo de Lanctot y colaboradores](https://proceedings.neurips.cc/paper/2009/hash/00411460f7c92d2124a67ea0f4cb5f85-Abstract.html)

## Experimento en el chico completo

Cada iteración empieza con una trayectoria de cobertura uniforme del motor en línea. Se escoge con muestreo de reservorio un turno del asiento que actualiza. En el subárbol local se enumeran las acciones legales de ese asiento hasta `expandDepth` decisiones ramificadas, y se muestrean las del rival. En la frontera se simulan ambos asientos hasta que el chico llega a 40, con utilidad +1 o −1 por el vencedor. Se usa la misma secuencia de repartos futuros en todas las ramas. La estrategia permanece fija durante la estimación de alternativas. La política incorpora exploración; si ningún arrepentimiento es positivo se apoya en V1. Las trayectorias de cobertura acumulan la estrategia con el alcance propio de cada asiento.

La representación agrupa en una tabla de capacidad fija el tanteador, la posición respecto a mano, la muestra, los palos y la fuerza de las cartas originales, los cobros y cantos y las jugadas ordenadas. Las tres cartas posibles ocupan ranuras distintas según su fuerza; cada canto conserva su ranura. Al exportar se guarda sólo la tabla media y los IDs de versión. Un asiento sin peso aprendido para sus jugadas legales recurre a V1. Las colisiones de la tabla y la profundidad acotada son aproximaciones del juego completo. La convergencia contra una respuesta exacta se mide para el duelo reducido.
