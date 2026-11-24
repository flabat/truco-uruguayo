# ¿Con qué carta salir en parejas?

Sos mano en el asiento 0. Tenés el **2 de copas**, el **3 de bastos** y el **5 de oros**. La muestra es el **6 de copas**, así que tu 2 es la pieza más fuerte y gana la primera vuelta si salís con él. ¿Con qué salida gana más manos tu pareja?

Con el bot simple en los cuatro asientos después de la salida, **abrir con el 3 de bastos** dio la mayor frecuencia de victoria. En 20.000 repartos ganó 1.756 manos más que abrir con la pieza y 1.249 más que abrir con el 5. Si tu compañero guarda otras cartas o los rivales responden de otra manera, también puede cambiar el orden de las salidas.

| Salida del aprendiz | Manos ganadas por 0 y 2 | Frecuencia |
| --- | ---: | ---: |
| 2 de copas | 12.023 de 20.000 | 60,115 % |
| 3 de bastos | 13.779 de 20.000 | 68,895 % |
| 5 de oros | 12.530 de 20.000 | 62,650 % |

## Cómo repetir el estudio

Desde la raíz del proyecto, con Node.js 24, ejecutá el estudio completo o pedí el detalle de tres de sus repartos.

```sh
node scripts/estudios/salidas.ts --semilla 29 --repartos 20000
node scripts/estudios/salidas.ts --semilla 44 --repartos 3 --detalle
```

El primer comando imprime el resumen en JSON. El segundo agrega las manos por asiento y las tres respuestas de `ganaPareja02`, en el orden de la tabla de salidas. Para revisar un solo reparto, usá su semilla con `--repartos 1 --detalle`. Las semillas corresponden al muestreo condicionado de este estudio. El simulador de terminal usa su propia función de reparto para reconstruir un replay. [Ejecutor del estudio](../../../scripts/estudios/salidas.ts) · [Simulador de terminal](../../aprendizaje/simular.md)

Para ver el reparto que motivó la pregunta, ejecutá `node scripts/simular-mano.ts --semilla 830838 --dador 3`. Da la misma muestra y las mismas tres cartas visibles, con 35 de envido. El estudio conserva esa información y vuelve a sortear las manos del compañero y los rivales.

## Qué se mantiene fijo

El asiento 3 reparte, el 0 es mano y el 2 es su compañero. Al abrir, el aprendiz conoce sus cartas, la muestra y los asientos. Las tres salidas se fijan con esa información, antes de generar una carta ajena.

Para cada semilla, el ejecutor quita las cuatro cartas visibles del mazo canónico de 40. Usa `crearAzar(semilla)` del motor para extraer nueve cartas de las 36 restantes sin reposición. Cada extracción toma la posición `piso(azar() × cantidad restante)`, contando desde cero, y conserva el orden de las demás cartas. Las primeras tres van al asiento 1, las siguientes al 2 y las últimas al 3. Así se muestrean las manos ocultas bajo el supuesto de baraja bien mezclada. Se usan las semillas consecutivas del 29 al 20.028, ambas incluidas. [Mazo canónico](../../../paquetes/motor/src/cartas.ts) · [Generador seudoaleatorio](../../../paquetes/motor/src/reparto.ts)

Cada reparto se juega tres veces desde el mismo estado inicial. Cambia únicamente la carta impuesta en el primer turno. A partir de ahí **todos**, incluido el aprendiz, usan la misma política determinista. El bot abre cada vuelta con su carta más fuerte. Al responder, tira la menor si el compañero va ganando. En otro caso juega la menor que supere al rival más fuerte. Si solo puede empardar, busca la parda, o descarta la menor si el compañero ya emparda. Cuando no alcanza, tira la menor. Entre cartas propias de igual fuerza elige la primera del mazo canónico. Cada bot recibe su mano y la mesa pública a través de `vistaPara`. [Política del bot](../../../paquetes/motor/src/jugadores.ts) · [Vistas y cierre de la mano](../../../paquetes/motor/src/mano.ts)

Una victoria cuenta cuando el motor declara ganadora de la mano a la pareja 0 y 2, incluidas las manos que se resuelven por pardas. La mesa juega únicamente las vueltas, sin cantos, señas ni apuestas.

## Cuánto cambia el resultado al cambiar la salida

«Solo A» cuenta los repartos donde 0 y 2 ganan con A y pierden con B. «Solo B» cuenta el caso inverso. Los demás aportan cero a la diferencia. Por ejemplo, el 2 de copas le dio la victoria a la pareja en 344 repartos que perdía con el 3 de bastos. El 3 revirtió el resultado en 2.100 repartos. De ahí salen las 1.756 victorias de ventaja.

| Salida A | Salida B | Solo A | Solo B | Diferencia A − B (pp) | Error estándar (pp) | Intervalo del 95 % (pp) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2 de copas | 3 de bastos | 344 | 2.100 | −8,780 | 0,239 | −10,701 a −6,859 |
| 2 de copas | 5 de oros | 1.419 | 1.926 | −2,535 | 0,289 | −4,456 a −0,614 |
| 3 de bastos | 5 de oros | 2.401 | 1.152 | +6,245 | 0,295 | +4,324 a +8,166 |

La unidad de muestreo es **un reparto** con sus tres desenlaces. Para cada par, la diferencia `D` vale +1, −1 o 0. El JSON expresa la media de `D` y su error estándar (desvío muestral de `D` dividido por `√n`) como proporciones. La tabla los multiplica por 100 para expresarlos en puntos porcentuales (pp).

El intervalo usa la cota bilateral de Hoeffding para diferencias entre −1 y 1. A la media se le suma y resta `√(2 × ln(2 / 0,05) / n)` y se recorta a [−1, 1]. Es un intervalo conservador por comparación, bajo el modelo de repartos independientes que aproxima el generador seudoaleatorio. También se puede calcular con pocos repartos. Su amplitud cubre el azar del reparto bajo esta política. Medir el efecto de cambiar de rivales requeriría volver a jugar con sus políticas.

## Tres repartos para auditar

Resultado para la pareja 0 y 2 según la carta de salida.

| Semilla | 2 de copas | 3 de bastos | 5 de oros |
| ---: | --- | --- | --- |
| 44 | Pierde | Gana | Pierde |
| 45 | Pierde | Pierde | Pierde |
| 46 | Pierde | Gana | Gana |

En la semilla **44**, el asiento 1 tiene 6 de oros, caballo de copas y 6 de espadas. El compañero tiene 4 de espadas, 3 de copas y 3 de espadas. El asiento 3 tiene sota de oros, 4 de oros y 5 de copas. Conocemos esas cartas al auditar el reparto. Así se jugaron las tres vueltas al salir con el 3 de bastos.

| Vuelta | Jugadas, en orden de asiento desde quien sale | Pareja ganadora |
| ---: | --- | --- |
| 1 | **0** juega 3 de bastos · **1** caballo de copas · **2** 4 de espadas · **3** 4 de oros | 1 y 3, con el caballo de copas |
| 2 | **1** juega 6 de oros · **2** 3 de copas · **3** 5 de copas · **0** 2 de copas | 0 y 2, con el 2 de copas |
| 3 | **0** juega 5 de oros · **1** 6 de espadas · **2** 3 de espadas · **3** sota de oros | 0 y 2, con el 3 de espadas |

En este reparto, el rival gastó el caballo de copas para ganar la primera. El aprendiz pudo usar su pieza para superar el 5 de copas en la segunda y su compañero ganó la tercera con un 3 común. Al abrir con el 2 de copas, la pareja ganó la primera, pero el caballo y el 5 de copas de los rivales ganaron las dos siguientes.
