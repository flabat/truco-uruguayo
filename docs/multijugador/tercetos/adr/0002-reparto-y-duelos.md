# ADR 2 · Un reparto con uno o tres lances

**Estado.** Propuesta para el árbitro de seis asientos.

## Contexto

El reparto en línea ya usa azar del servidor y conserva las cartas para su repetición. En el motor actual, el número de ternas del reparto determina la longitud de cada vuelta y la vista incluye las cartas propias de inmediato. En el pico a pico conviven seis ternas físicas y dos participantes activos. El reglamento uruguayo describe la alternancia, el orden desde el mano y una sola muestra para el reparto. [Guía de a seis](../../../../src/data/juego.json) · [Gran Aventura, arts. 83–87](https://web.archive.org/web/20110829054729/http://www.granaventura.com/truco_uruguayo.htm)

## Decisión

El árbitro de tercetos mantiene el reparto físico y abre un lance por vez. El estado del chico contiene la meta y el marcador. El del reparto contiene su número, dador, mano, seis ternas y muestra. El lance contiene tipo, índice, asientos participantes en orden físico, marcador inicial, bazas, cantos y cobros. La bitácora pública conserva los lances terminados. Las identidades de asiento y equipo son absolutas al guardar acciones, rotular el tapete o acreditar puntos.

Con mano `m`, la redondilla usa los seis asientos en orden desde `m`. En el duelo `i` (0–2), el primero es `a = (m + i) % 6` y su rival es `(a + 3) % 6`. Los asientos contrarios siempre tienen distinta paridad. Con mano 5, el primer duelo empieza con B. Una victoria del primer participante de ese duelo suma para B. Un adaptador que use índices locales para reusar el motor de duelo convierte cartas, acciones, cobros y resultado al asiento y equipo reales antes de proyectarlos o persistirlos.

Refactorizar las funciones compartidas de vueltas y cantos para recibir el orden de los participantes y su equipo. La siguiente carta corresponde al asiento siguiente de ese orden. La búsqueda de flor, el primero entre empatados y los habilitados a responder recorren el mismo conjunto. Una carta ya tirada, ajena o de un asiento inactivo es inválida. Los identificadores públicos del reparto didáctico y sus validadores siguen comprobando exactamente sus cuatro asientos originales. [Reparto y validadores](../../../../src/motor/reparto.ts) · [Mano y vueltas](../../../../src/motor/mano.ts)

| Estado al confirmar | Transición atómica |
| --- | --- |
| Lance en juego | Aplicar una acción legal y liquidar en orden los cobros que produce. |
| Meta alcanzada | Registrar ganador y cerrar. Cualquier cobro o transición posterior se descarta. |
| Duelo 1 o 2 cerrado con el chico abierto | Anotar el resultado, actualizar el marcador y abrir el duelo siguiente con la misma muestra y sus dos ternas. La vista expone el resultado anterior y el nuevo turno. |
| Redondilla o duelo 3 cerrado | Esperar el comando existente para repartir otra mano. Después del bloqueo de mesa, rotar el dador una vez, decidir modalidad con ambos totales y repartir una vez. |

El motor recibe una distribución explícita para los tests y la reproducción. El servidor usa Fisher–Yates parcial para elegir las 19 cartas distintas del reparto en vivo. Cambiar de duelo, recargar o confirmar un comando repetido debe producir la misma distribución. La semilla del simulador didáctico y el azar de una decisión de bot son independientes del reparto en vivo.

## Opciones y consecuencias

Tres mesas de duelo separadas necesitarían sincronizar muestras, mazos, apuestas y asignación de puntos después de cada resultado. Una sola redondilla de seis para todo el chico simplificaría el árbitro, pero omitiría la alternancia pedida. Un solo reparto con lances acotados permite que las reglas de parda y jerarquía tengan una única implementación. El coste es hacer explícitas las conversiones de asiento y el momento de cada cobro.

Probar los seis posibles dadores. Cada asiento interviene exactamente una vez por pico, cada par está a tres asientos de distancia y ningún naipe ni la muestra se repite en el reparto. Las pruebas de regresión de duelo y parejas deben conservar sus replays V1.
