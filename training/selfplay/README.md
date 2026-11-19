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
