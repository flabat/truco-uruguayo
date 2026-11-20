# ADR 0002 · Una vista sin asiento para mirar en vivo

**Estado.** Visibilidad por defecto acordada. Lecturas HTTP implementadas en #230. La interfaz y el ritmo de consulta corresponden a #232.

## Contexto

Hoy la sala crea mesas por invitación. Leer una mesa como jugador exige asiento, devuelve la invitación para jugar y la lectura de la partida puede disparar el primer reparto. La vista por asiento incluye cartas, acciones legales y hechos visibles para su equipo. El cierre puede mostrar cartas que prueban los tantos. Ocultar componentes en el navegador dejaría esos datos en la respuesta. Abrir el replay completo también entregaría información para reconstruir el reparto. [Lectura de mesa](../../../../api/mesas.ts) · [Partida](../../../../api/partidas.ts) · [Vista por asiento](../../../../src/motor/mesa-online.ts)

## Contrato

El servidor arma una proyección por lista explícita de campos, sin asiento de referencia. La fuente son hechos públicos confirmados y el tanteador. Una lectura no ocupa asiento, reparte, juega, confirma un comando ni registra presencia como jugador.

| Respuesta | Contenido |
| --- | --- |
| Directorio autenticado | ID público de mesa, formato, origen, cantidad de asientos humanos y de computadora, mano, tanteador, meta y última actividad pública. |
| Detalle neutral | Los mismos datos, equipos y etiquetas de asiento, mano/dador, muestra, cartas efectivamente jugadas y sus asientos, vueltas, cantos pronunciados, cobros y resultado públicos. El próximo turno se indica solo si se deduce del juego público. |
| Datos que quedan en el servidor o en la vista del asiento autorizado | Cartas sin jugar, pruebas de tantos que las revelen incluso al cierre, reparto y semilla, señas y sus metadatos, consulta privada de flor, opciones legales, puntaje de la mano propia, decisiones internas del bot, IDs de cuenta, enlaces para tomar asiento y replay privado. |

Para el piloto, identificar al humano como «Jugador 1» y a la computadora como «Computadora 2» según el asiento. El tapete compartido muestra los dorsos de los asientos que aún no tienen una carta en la vuelta visible. La cantidad se calcula a partir de tres cartas iniciales menos las jugadas públicas de cada asiento. El espectador conserva orientación neutral aunque también tenga asiento en otra pestaña. En parejas, agregar una seña a una jugada debe producir **idéntica respuesta pública** a la de esa jugada en silencio, incluidos historial, cursor, tamaño de la lista de eventos y avisos. Nunca anunciar una espera privada de flor como turno de un asiento.

## Transporte y ciclo de vida

Proponer dos rutas de lectura separadas de las rutas de jugador. El salón consulta `GET /api/salon/mesas` cada 15 segundos. Una vista abierta consulta `GET /api/salon/mesas/:id` cada dos segundos con versión pública para revalidar. La respuesta contiene una instantánea del tablero y el historial público de la mano. La versión cambia solo por hechos públicos. Limitar a una consulta en vuelo por pestaña, suspenderla en segundo plano y actualizar al volver. Tras un corte se acepta la última instantánea completa, y se descartan respuestas antiguas. El cambio de mano reemplaza tablero e historial juntos.

Sesión vencida devuelve 401. Una mesa privada, desconocida o de formato no habilitado da la misma respuesta 404. Una mesa pública recién terminada conserva el resultado en el detalle durante una breve sobremesa propuesta de 30 minutos y sale del directorio de inmediato. Un chico interrumpido se distingue de un resultado deportivo. Las lecturas usan caché privada con revalidación de sesión y visibilidad en cada solicitud, también antes de responder que nada cambió. La pestaña de espectador jamás invoca el WebSocket de comandos ni modifica la última mesa jugada.

Un WebSocket exclusivo para espectadores reduciría consultas repetidas, pero exige administrar suscripciones, reconexión y revocación. Empezar con las lecturas HTTP permite probarlas independientemente del canal de jugadores. Medir solicitudes por segundo, retraso y coste de construir cada instantánea. Compartir el cálculo por mesa y versión. Revisar el transporte si la carga del piloto afecta los turnos humanos. [WebSocket de jugadores](../../../../api/vivo.ts) · [Privacidad de las señas](https://github.com/flabat/truco-uruguayo/issues/152)

## Contrato para el cliente del salón

Ambas lecturas requieren la cookie de sesión y devuelven JSON con una `versionPublica` opaca y un `ETag`. En la siguiente consulta se puede enviar el ETag en `If-None-Match`. Un 304 permite conservar la última respuesta. Un 401 requiere volver a ingresar. Al recibir un 404 se deja de mostrar la mesa. El cliente descarta la respuesta de una consulta anterior si ya recibió otra posterior.

| Lectura | Respuesta 200 |
| --- | --- |
| `GET /api/salon/mesas` | `mesas` en orden estable, primero las humanas. Cada fila incluye `id`, `modo`, `formato`, `origen`, cantidades `humanos` y `computadoras`, `manoNumero`, `puntos` por equipo, `meta` y `ultimaActividad` en UTC. |
| `GET /api/salon/mesas/:id` | Los campos de la fila, `asientos` con posición, equipo, tipo y etiqueta neutral, `estado`, las versiones de la mesa y `tablero`. El tablero reúne muestra, mano, dador, vueltas, acciones visibles de la mano actual, valor del truco, cobros y resultado. `turnoDeCartas` expresa el orden del tapete. Un canto puede requerir respuesta entre cartas. |

El pie muestra la versión del motor guardada en la mano (`versionReglas`) y el identificador del modelo asignado a la mesa (`politica`). Cuando hay una publicación registrada para ese identificador, `edicionModelo` aporta el nombre y la fecha que ve el espectador. Al abrir el nombre se puede consultar la huella completa.

El detalle de una mesa fresca indica `en-juego`. Un chico cerrado indica `terminada` durante los 30 minutos siguientes. Una exhibición retirada después de repartir indica `interrumpida`. Los tres estados requieren una mesa pública. Una mesa en espera, una mesa activa que perdió frescura y una partida cuya sobremesa venció devuelven 404.
