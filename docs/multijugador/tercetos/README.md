# Una mesa jugable de tres contra tres

**Diseño propuesto para El Truco.** Una persona crea una mesa, elige el puntaje, invita hasta cinco personas y puede completar los lugares libres con computadoras. Se juega un chico entero. Cada terceto lleva su propia cuenta. La meta acordada para el producto es **50 tantos, 25 malas y 25 buenas**, editable antes de crear la mesa. La configuración del puntaje se entrega en el [PR #170](https://github.com/flabat/truco-uruguayo/pull/170). Este documento especifica el modo de juego que se implementará después. [Issue de diseño](https://github.com/flabat/truco-uruguayo/issues/171)

## Recorrido desde la invitación hasta la victoria

1. En **Jugar → Crear una mesa**, el anfitrión elige **3 contra 3**. Ve el total propuesto y las dos mitades. Puede elegir otro total par. La invitación y la sala muestran lo acordado a todos los participantes.
2. Se ocupan los asientos 0–5 en orden. El equipo A ocupa 0, 2 y 4. El B ocupa 1, 3 y 5. La sala muestra los seis nombres y equipos. Un invitado que vuelve recupera su lugar. Con el sexto asiento ocupado se produce el primer reparto una sola vez.
3. En la **redondilla** participan los seis. En el **pico a pico** se juegan tres duelos sucesivos entre rivales enfrentados. Cada uno tiene cantos, vueltas y resultado propios. Las seis manos pertenecen al mismo reparto y comparten la muestra.
4. El tanteador muestra el total y la cuenta de cada lado. Al cobrar tantos también aparece el motivo. Con 24–19, si A gana un envido de dos, queda 26–19, una buena contra 19 malas. Al llegar a la meta se anuncia el equipo ganador, se cierra el chico y se ofrece crear otra mesa.
5. Si un jugador recarga durante un canto o un duelo, vuelve al mismo asiento y ve la acción pendiente. Mientras falta un jugador humano con la palabra, la mesa espera su regreso. Una desconexión conserva sus cartas y su asiento.

## Reparto, turnos y transición entre modalidades

La primera redondilla comienza con dador sorteado. La mano es el asiento siguiente al dador en el orden circular de juego. Se reparten tres cartas por asiento, en tres pasadas, y se descubre la muestra. Se usan 19 cartas distintas del mazo de 40. El dador avanza un lugar por **reparto completo**.

| Situación | Próximo paso |
| --- | --- |
| Empieza el chico | Redondilla de seis. |
| Termina una redondilla con ambos equipos por debajo de la mitad | Nuevo reparto de pico a pico. |
| Termina un duelo, todavía queda otro y ambos equipos están por debajo de la meta | Anotar el resultado y abrir el siguiente duelo del mismo reparto, aun si alguien acaba de entrar en buenas. |
| Termina el tercer duelo | Nuevo reparto de redondilla. |
| Un equipo ya está en buenas al preparar el próximo reparto | Redondilla para ese reparto y los siguientes. |
| Un cobro alcanza o supera la meta | Victoria inmediata. Se detienen cartas, cobros posteriores y duelos pendientes. El tanteador se topa en la meta. |

Con dador 4 y mano 5, los duelos son **5–2, 0–3 y 1–4**. El primer asiento de cada par abre y tiene prioridad ante igualdad de tantos. Al pasar de un duelo al siguiente se conservan la muestra, el dador y el tanteador actualizado. El primer reparto después de ese pico tiene dador 5 y mano 0. [Decisión sobre el motor](adr/0002-reparto-y-duelos.md)

## Cantos y palabra

La redondilla admite los cantos de las mesas en línea, con flor obligatoria antes de la primera carta de quien la tiene, envido antes de resolver el truco pendiente y hasta tres vueltas para ganar la mano. Los jugadores pueden responder al canto válido de un adversario según las opciones del árbitro. Un empate entre tantos ganadores se resuelve por orden desde el mano. Al empatar dos cartas máximas de equipos opuestos la vuelta es parda. Para la siguiente salida y las combinaciones de pardas se usa la regla existente de las vueltas. Con máximas iguales del mismo equipo sale quien jugó primero de los empatados. [Motor de la mano](../../../src/motor/mano.ts) · [Motor de cantos](../../../src/motor/cantos-online.ts)

Durante cada duelo sólo tienen la palabra los dos rivales enfrentados. Cada apuesta, respuesta, vuelta y flor se resuelve dentro de ese par. Al cerrar, los tantos van al equipo del asiento que los ganó. La propuesta para falta envido, contraflor al resto y retiro voluntario se detalla por situación. [Decisión sobre reglas y puntaje](adr/0001-puntaje-y-cantos.md)

## Tapete y accesibilidad

En escritorio, el asiento propio queda abajo, el rival enfrentado arriba y los otros cuatro a los costados según su posición relativa. Las etiquetas identifican «Vos», «Compañero» o «Rival», más el mano y el dador. En móvil, una lista compacta mantiene los seis nombres en orden y el panel de acciones queda junto a las cartas propias. La muestra, la última vuelta y el historial se pueden consultar aun cuando le toca a otro. Los diseños se validan desde los asientos 0 y 5 a 320 px y a un ancho de escritorio.

El pico muestra «Duelo 2 de 3», los dos nombres, sus equipos y quién tiene la palabra. Quien espera ve un mensaje como «Juegan Ana y Luis. Te toca en el tercer duelo». El cliente recibe su mano sólo al abrirse su duelo. El resultado de cada duelo se conserva en el historial del reparto. Al actuar con teclado, el foco pasa al estado del turno cuando desaparece el botón pulsado. Los anuncios de canto, cobro, cambio de duelo y victoria incluyen texto. Los colores de los equipos sirven de apoyo visual.

## De la mesa actual al modo de seis

| Parte | Punto de partida y cambio propuesto |
| --- | --- |
| Capacidad e identidad | `api/mesas.ts` y PostgreSQL admiten dos o cuatro asientos. Agregar el modo de seis, conservar la unicidad por persona y asignar equipos por paridad. |
| Dominio | `reparto.ts` limita el tipo de asiento a 0–3. Separar el contrato del reparto didáctico V1 de los asientos físicos del modo de seis. Reusar jerarquía, tantos, pardas y acciones legales con los participantes del lance. |
| Árbitro | `api/partidas.ts` trata un reparto como una sola mano. Incorporar modalidad, participantes activos e índice de duelo. El servidor decide cobros, cambio de lance y fin del chico. |
| Transporte y recuperación | HTTP y WebSocket comparten comandos, clave idempotente y bloqueo por mesa. Extender la vista privada y reconstruir la fase leyendo el reparto y las acciones aceptadas. [Decisión sobre persistencia](adr/0003-persistencia-y-vistas.md) |
| Computadoras | El bot básico juega con la vista de su asiento y las acciones legales. Generalizar su evaluación a dos compañeros. Definir una identidad de política de tercetos. Los actores entrenados actuales declaran formatos de dos o cuatro plazas. [Decisión sobre computadoras](adr/0004-computadoras.md) |

El primer hito jugable comprende seis humanos o mesas mixtas, cantos, invitación y recuperación de un chico completo. Al crear una mesa también se pueden habilitar señas automáticas para las redondillas. Cada compañero se las pasa en privado al pie de su equipo y toda la mesa oye las indicaciones del pie. En el pico a pico se suspende esa comunicación hasta la próxima redondilla. La liga de entrenamiento, el ranking, el chat de voz y los partidos al mejor de tres son extensiones con requisitos propios. [Plan de implementación y pruebas de aceptación](implementacion.md)
