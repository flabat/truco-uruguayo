# Gritar y responder al truco

Después de jugar la [mano guiada](../README.md#jugar-en-la-mesa-de-parejas), el aprendiz puede abrir otra mesa para practicar la primera apuesta sobre las vueltas. Juega en el asiento 0 con el 2 frente a los rivales 1 y 3. En un reparto conocido puede probar qué pasa cuando grita, cuando quiere y cuando cede. El resultado de estas elecciones estratégicas se explica en la mesa y queda fuera del progreso por habilidad. [Diseño #30](https://github.com/flabat/truco-uruguayo/issues/30) · [Entrega jugable #52](https://github.com/flabat/truco-uruguayo/issues/52)

## Quién tiene la palabra y cuánto se cobra

Usamos la variante uruguaya de parejas con muestra y piezas de la guía. El turno de tirar una carta y la palabra para responder un canto son dos cosas distintas. En esta mesa se juega el truco inicial una sola vez por mano. [Guía de cantos](../../../src/data/cantos.json) · [Investigación del issue](https://github.com/flabat/truco-uruguayo/issues/30#issuecomment-6969131799)

| Situación | Quién decide y qué puede hacer | Turno y tanteo del truco |
| --- | --- | --- |
| Mano abierta, todavía sin canto | El asiento al que le toca puede tirar o gritar «truco» antes de tirar, en cualquiera de las vueltas. | Tirar avanza la vuelta. Si se define la mano así, el ganador cobra 1. |
| Truco pendiente | Cualquiera de los dos rivales de quien gritó habla por su pareja antes de la próxima carta. | Las cartas esperan. El canto por sí solo sigue sin otorgar puntos. |
| «Quiero» | El rival acepta jugar por 2. | Quien gritó conserva exactamente su turno, su mano y la vuelta en curso. Al terminar las vueltas, el ganador cobra 2 en total. |
| «No quiero» | El rival cede la mano. | Termina en ese instante. La pareja de quien gritó cobra 1 aunque fuera perdiendo las vueltas. |
| Envido abierto o flor por cantar | Antes de su primera carta, el rival que debe contestar al truco puede anteponer el envido. Si corresponde flor, se canta con prioridad y desplaza el envido. | Se resuelve el lance lateral antes de contestar al truco pendiente. Cada lance tiene su propio tanteo. La lección parte después de esta decisión. |

La regla del turno de la oferta y la prioridad del envido están en «Truco, retruco y vale cuatro» y «El envido está primero». Para la respuesta antes de otra carta y el cierre por rechazo, el relevamiento del issue remite a los artículos 60–62 de Gran Aventura. Ludoteka también describe la oferta previa a jugar y el valor de la mano querida. [Quiero Truco](https://quierotruco.com/reglas-del-truco-uruguayo) · [Gran Aventura, arts. 60–62](https://web.archive.org/web/20110829054729/http://www.granaventura.com/truco_uruguayo.htm) · [Ludoteka, Truco](https://www.ludoteka.com/juegos/truco-uruguayo/reglas)

## Dos papeles sobre la misma distribución

**Gritás vos.** Semilla 217 del reparto V1, dador 3, mano 0, muestra sota de bastos. Tenés rey de bastos, 6 de espadas y caballo de copas. Nadie tiene flor. El envido simple ya se quiso y cobró antes de la salida. Mano y dador tienen 33, por lo que los 2 tantos del envido fueron para la pareja del mano. Desde este momento se muestra solo lo que se juega por el truco. [Vector del reparto y las jugadas legales](../../../tests/fixtures/replay-v1.json)

Podés tirar directamente o decir «truco». En este ejemplo el rival de la derecha quiere tu oferta para que veas cómo sigue. Volvés a elegir entre las mismas tres cartas. Si salís con el rey de bastos, siguen 7 de copas, 5 de oros y caballo de bastos. Gana el rival de la izquierda con el perico. Sale con 3 de oros. Si jugás 6 de espadas, siguen caballo de oros y 3 de espadas. La segunda sale parda y los rivales cobran 2 por ganar la primera. Sin canto, esas mismas vueltas valen 1.

**Respondés vos.** Repetí la distribución con dador 0. El rival de la derecha es mano, los tantos anteriores ya están resueltos y grita truco antes de salir. Si decís «no quiero», su pareja cobra 1 sin que se juegue ninguna carta. Si decís «quiero», sale ese mismo rival con el rey de bastos y seguís jugando cuando llegue tu turno. El ganador puede ser cualquiera de las dos parejas.

## Registro y reanudación

El [formato V1](../../../paquetes/motor/src/replay.ts) guarda cartas en `jugadas` e informa un `EstadoMano`. Se conserva su lectura y su significado para el simulador y la mano guiada. Para esta mesa, el formato V2 lleva `version: 2`, `versionReglas: 2`, `versionReparto: 1`, semilla, dador y una lista ordenada `acciones`. Su precondición es que los lances laterales ya están resueltos. El estado de apuestas envuelve al de cartas. La vista de cada jugador entrega solo sus cartas y los hechos públicos. [Contrato de mano](../../../paquetes/motor/src/mano.ts) · [ADR de replay](../adr/0001-motor-y-replay.md)

| Prefijo de acciones (semilla 217, dador 3) | Estado reconstruido justo después |
| --- | --- |
| `[]` | Sin canto, turno 0, tres cartas por asiento. |
| `{tipo:"truco", asiento:0}` | Oferta pendiente del 0. Pueden responder 1 o 3. |
| Luego `{tipo:"quiero", asiento:1}` | Oferta aceptada. Turno 0, mismas cartas, 2 tantos en juego. |
| Luego `{tipo:"carta", asiento:0, carta:"bastos-12"}` | Primera carta en la vuelta, turno 1. |
| Si en el segundo paso responde `{tipo:"no-quiero", asiento:1}` | Cierre por rechazo, equipo 0 cobra 1. |

La acción validada es también el evento público que se registra. Los cierres, puntos, vueltas y cambios de turno se derivan al reproducir cada prefijo. Se incluyen las acciones de los tres asientos automáticos. La reproducción aplica lo guardado sin volver a consultar su política. Una carta durante la espera, una respuesta de un compañero, una oferta repetida o cualquier acción después del cierre se rechaza en su posición, contada desde 1. Una versión desconocida indica el campo incompatible.

## Aceptación del primer incremento

1. Desde el resultado de la mano guiada se abre la nueva lección. Repartir otra mano guiada sigue dando una mesa de cartas con sus pausas de flor y tantos.
2. En el primer papel, jugar sin gritar cobra 1 al ganador. Gritar y obtener «quiero» permite elegir la carta original y cobra 2 al equipo que gana las vueltas. También se puede ofrecer en una vuelta posterior mientras la mano siga abierta.
3. Al cambiar de papel, ambas respuestas se pueden probar sobre la misma oferta rival. El rechazo concede 1 a quien gritó y bloquea toda jugada. Aceptar deja salir al rival.
4. Se puede repasar el canto pendiente, la respuesta, la primera carta posterior y el cierre. Las pruebas reconstruyen esos prefijos y los historiales V1, y rechazan acciones ilegales sin modificar el estado anterior.
5. Probar los controles con teclado y en móvil. La práctica fija sirve para comparar consecuencias. Retrucar, decir vale cuatro, interrumpir por flor o envido y llevar el tanteador de un chico requieren ampliar las reglas y los casos por separado.
