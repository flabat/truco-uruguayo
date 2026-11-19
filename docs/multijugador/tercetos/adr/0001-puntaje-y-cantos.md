# ADR 1 · Puntaje y cantos de los tercetos

**Estado.** Meta predeterminada y configuración acordadas. Liquidación de cantos y retiros propuesta para la primera versión en línea.

## Contexto y fuentes

El Club Canelón Chico fijó 50 tantos para el 3 contra 3 en 2026. Su reglamento pone la entrada en buenas en 25, distingue la falta según el puntaje del ganador y asigna 15 tantos al resto en pico a pico. El texto deja abierta la inclusión de las flores en esos 15 y el resultado del resto en redondilla cuando el ganador aún está en malas. La guía del proyecto documenta esas diferencias. Gran Aventura fija 40 por chico y limita la falta y el resto en los duelos a 10. [Canelonchiqueadas, pág. 11](https://canelonchiqueadas.com.uy/reglamento.pdf#page=11) · [Gran Aventura, arts. 4 y 83–87](https://web.archive.org/web/20110829054729/http://www.granaventura.com/truco_uruguayo.htm) · [Comparación del pico a pico](https://github.com/flabat/truco-uruguayo/issues/1) · [Comparación del resto](https://github.com/flabat/truco-uruguayo/issues/3)

## Decisión de producto

Un chico, dos cuentas absolutas. La mesa propone 50 para tercetos y 40 para duelo y parejas. El anfitrión elige un total entero, par y positivo al crear la mesa. El servidor persiste el valor y valida el rango que admite la base. La mitad se deriva del total. Con meta 50, 24 son 24 malas, 25 son cero buenas, 26 es una buena y 50 son 25 buenas. Una elección de 26 da 13 y 13. Todos leen la misma meta en creación, invitación, juego, reconexión y replay. [Implementación de la configuración](https://github.com/flabat/truco-uruguayo/pull/170)

## Perfil propuesto de cantos

| Situación | Cobro y prioridad |
| --- | --- |
| Truco sin cantar, querido, retruco y vale cuatro | 1, 2, 3 y 4 respectivamente. El rechazo concede el valor anterior. |
| Envido y real envido | 2 y 3, con las subidas legales del motor. Al aceptar, comparar sólo a quienes participan del lance. Un empate favorece a quien esté antes en el orden desde el mano. |
| Falta envido querida | Calcularla al conocer al equipo ganador. Tomar su cuenta al comienzo del lance. En malas cobra la distancia hasta la mitad. En buenas, la distancia hasta ganar. La redondilla toma la cuenta al iniciar su reparto y cada duelo la toma después del duelo precedente. Como regla de la casa, al querer una falta elevada se cobra esa distancia por todo el envite. Al rechazar se cobra lo previamente envidado, con mínimo de uno para la falta directa. |
| Flor, con flor envido y rechazo | Reusar el cobro de flores propias y la apuesta de la cadena de cantos en juego. Aplicar la declaración sólo a los seis participantes de la redondilla o a los dos del duelo. La flor desplaza al envido y se liquida antes de un rechazo de truco reservado. |
| Contraflor al resto querida en redondilla | Proponemos que quien gane la comparación gane el chico, tanto en malas como en buenas. Esta interpretación coincide con el resumen público del club. El PDF sólo explicita el caso en buenas. [Resumen del torneo, sección Reglamento](https://canelonchiqueadas.com.uy/#reglamento) |
| Contraflor al resto querida en pico a pico | Proponemos cobrar 15 tantos en total, con las flores de ambos contendientes incluidas. Mantener el importe de 15 al personalizar la meta y limitar la anotación final a lo que falta para ganar. El rechazo sigue la apuesta anterior y las flores que correspondan según el motor. |
| Irse al mazo | Proponemos que el jugador con el turno de carta pueda conceder al rival el valor vigente del truco en el lance activo. Primero se resuelven las declaraciones obligatorias y los cobros pendientes. En redondilla cierra la mano del equipo. En un duelo cierra ese enfrentamiento y habilita el próximo si el chico sigue abierto. Para rechazar un canto se usa la respuesta «No quiero». |

El cambio de mitad se evalúa al elegir el tipo de **nuevo reparto**. Si se cruza a buenas en el primer duelo, se completan los otros dos. Alcanzar la meta en cualquier cobro termina el chico de inmediato. El historial registra el valor del canto y el total acreditado hasta la meta. Cada cobro tiene un único ganador y una posición inequívoca en la secuencia.

## Casos para aprobar el perfil

- A 50 y con A=32, B=19, B quiere y gana la falta directa en redondilla. Cobra 6 y queda 32–25. Si B empieza en 25 y gana, llega a 50.
- A 50 y con A=2, B=4, cada rival activo tiene flor y A gana el resto en pico. El cobro único deja 17–4. Si A parte de 24 y gana, termina ese lance en 39 y los reenvites del siguiente duelo usan esa cuenta.
- A 26 y con A=12, B=11 al inicio del primer duelo, A gana un envido de dos. Queda en 14, una buena. Puede cerrarse el chico durante el segundo duelo por un resto de 15. El tercero pierde vigencia.
- Con A=49 y un rechazo de truco reservado, un envido querido de A gana el chico inmediatamente. El rechazo pendiente no genera un segundo cobro.

## Alternativas y consecuencias

La regla del puntero usada por el motor en línea permite fijar el valor de una falta antes de saber quién la gana. El perfil de tercetos necesita calcular el importe después de la comparación. El servidor y la interfaz deben expresar el valor condicional de ese canto. El tope de 10 de Gran Aventura sería otra variante implementable. Vincular cada mesa a su versión de reglas permite reproducirla si se incorporan otros perfiles. Las elecciones de la casa se revisan con estas cuatro manos antes de publicar el modo.
