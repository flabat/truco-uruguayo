# Una mesa de jugador para duelo, parejas y tercetos

**Diseño y plan de implementación · [Issue 318](https://github.com/flabat/truco-uruguayo/issues/318)**

En la primera vuelta del pico a pico, Computadora 4 canta truco antes de tirar. Ana ve sus tres cartas y puede responder. Frente a ella deberían verse los tres dorsos de Computadora 4 y, a los costados, las cuatro manos que esperan su duelo. Cuando termina ese enfrentamiento, los dos puestos se despejan al pasar al siguiente. Los nombres, el dador y la muestra conservan su lugar durante todo el reparto. Esta es la referencia de aceptación para la mesa de seis. [Decisiones de la entrevista](https://github.com/flabat/truco-uruguayo/issues/318#issuecomment-7113772048)

La entrega abarca la API de partida y la experiencia del jugador desde la espera inicial hasta el cierre del chico. El visor actual de duelo y parejas forma parte de la verificación de compatibilidad. Abrir mesas públicas de tercetos queda para una decisión independiente.

## Diferencias que hay que resolver

| Hoy | Consecuencia para el jugador | Cambio propuesto |
| --- | --- | --- |
| Duelo y parejas pasan las jugadas al tapete para dibujar dorsos. Tercetos le pasa los participantes del lance y omite las manos ocultas. | Un rival con tres cartas parece tener el puesto vacío, incluso en redondilla. | Definir el contenido de cada puesto en todas las vistas de jugador. [Tapete](../../src/components/jugar/Tapete.tsx) · [Duelo y parejas](../../src/components/jugar/Tablero.tsx) · [Tercetos](../../src/components/jugar/Tercetos.tsx) |
| Las rutas son comunes. La respuesta de una mesa de seis sin completar trae `vista: null`. El tipo del cliente exige una vista, un lance y un historial para cualquier partida de tercetos. | El cliente evita esa combinación consultando si la mesa está lista. Otro consumidor puede interpretar mal una respuesta válida. | Representar la espera inicial en el contrato y probarla directamente por HTTP. [Servicio](../../api/partidas.ts) · [Cliente](../../src/components/jugar/cliente.ts) |
| Dos y cuatro asientos presentan cartas y cantos por pasos. Seis organiza las pausas alrededor de los cantos. También elige la última vuelta cerrada con un criterio diferente. | Una actualización con varias jugadas puede adelantar el ganador o dejar una vuelta anterior a la vista después de un rechazo. | Elegir cartas, resultado y tantos para el mismo instante visible. [Presentación de vueltas](../../src/components/jugar/presentacion-vueltas.ts) · [Presentación de tercetos](../../src/components/jugar/presentacion-cantos-tercetos.ts) |
| Las modalidades comparten la zona del jugador. Duelo y parejas agrupan acciones por función. Tercetos arma una sola lista y compone por separado el turno y el historial. | La misma respuesta cambia de ubicación y el lector de pantalla recibe agrupaciones distintas. | Reutilizar los controles y el vocabulario comunes, con identificación del duelo y desglose por lance en seis. [Zona del jugador](../../src/components/jugar/ZonaJugador.tsx) · [Historial](../../src/components/jugar/HistorialDeMano.tsx) |

## Qué aparece en cada puesto

El tapete se orienta desde quien juega y usa números de asiento físicos. En duelo, parejas y redondilla participan todos. En pico a pico cada puesto pasa de **en espera** a **en duelo** y luego a **duelo terminado**. El lance actual y los lances cerrados permiten distinguir esos estados. El nombre y el papel de cada persona siguen visibles. Los dos participantes actuales se identifican por texto además del contraste. [Orden de los duelos](../multijugador/tercetos/adr/0002-reparto-y-duelos.md)

| Puesto en el instante mostrado | En el tapete | En la zona del jugador |
| --- | --- | --- |
| Propio, participando | Nombre, carta jugada en la vuelta cuando corresponda y cantos públicos. | Cartas propias autorizadas. Al responder un canto se pueden consultar aunque jugar carta esté deshabilitado. |
| Otro participante, sin carta en la vuelta visible | Un dorso por carta restante. Se empieza con tres y se descuenta cada carta que ese asiento ya tiró en el lance hasta ese instante. | La indicación de turno o de respuesta que corresponda al usuario. |
| Otro participante que ya tiró en la vuelta visible | Su carta jugada ocupa el lugar de los dorsos durante esa vuelta. | La indicación se actualiza con el turno. |
| Esperando su duelo, incluido el puesto propio | Tres dorsos junto al nombre hasta que comience su duelo. | Quien espera lee «Te toca en el duelo 2 de 3», con su número real. Al empezar recibe sus cartas en la zona inferior y se retiran sus dorsos. |
| Duelo terminado mientras sigue el reparto | El puesto queda sin cartas, incluso si hubo rechazo antes de la primera jugada. Conserva su nombre y la indicación de que ya jugó. | «Ya jugaste tu duelo». El resultado y las jugadas quedan en el historial de ese lance. |
| Pico cerrado, incluso si se ganó el chico antes del tercer duelo | Se retiran todos los dorsos, incluidos los de duelos que ya no se jugarán. Las pruebas que el servidor publica al cierre aparecen en el tapete con su duelo identificado. | Resultado, tantos por lance y por equipo, y continuación disponible. |
| Cierre en duelo, parejas o redondilla | Aplicar la misma convención a los puestos sin jugada ni prueba. Los dorsos indican cuántas cartas quedaron. Una prueba pública ocupa su puesto. | En duelo y parejas se conservan las cartas propias autorizadas que aún no figuran en la prueba. En tercetos el servidor retira la mano y los tantos privados al cerrar el reparto. |

**Ejemplo comprobable.** Con Ana en el asiento 0 y mano en el 3, los duelos son 3–0, 4–1 y 5–2. En el primero, Ana ve cinco grupos de tres dorsos mientras responde al truco inicial. Si rechaza, en el segundo ve vacíos los puestos 3 y 0, tres dorsos en 4 y 1 hasta que tiren, y tres en 5 y 2 mientras esperan. En el tercero quedan despejados 3, 0, 4 y 1. Al recargar en cualquiera de esos momentos debe ver la misma distribución. Desde el asiento 1, el segundo duelo muestra la propia mano en los controles.

El mazo cruzado sobre la muestra es independiente de las manos y sigue junto al dador cuando su puesto se despeja. Una mano oculta tiene una sola descripción accesible, por ejemplo «Tres cartas en mano · espera el duelo 2». Una carta que también integra una prueba aparece una sola vez en el mismo puesto. [Diseño del tapete compartido](adr/0001-tapete-compartido.md)

## Contrato entre el servidor y el cliente

Conservar las rutas de lectura, acción y siguiente reparto y el protocolo WebSocket actuales. El motor conserva el reparto, las reglas, los cobros y la autorización de cada asiento. Una proyección de jugador convierte esa información al mismo contrato de lectura para los tres modos. La orientación, los textos, los dorsos y la pausa de una jugada se calculan en el cliente. Un cambio de API aporta semántica de partida a todos los consumidores, aunque la corrección inicial de los dorsos puede salir con los datos que ya llegan. [Proyección del jugador](../../src/motor/mesa-online.ts) · [Proyección de tercetos](../../api/partidas-tercetos.ts) · [Transporte en vivo](../../api/vivo.ts)

| Parte del contrato propuesto | Contenido y semántica |
| --- | --- |
| Identidad y versión | Mantener `formato` con sus variantes de señas, la versión de concurrencia, el número de reparto, la meta, los dos puntajes absolutos y el ganador. Añadir una versión del contrato de lectura independiente de la versión de reglas y de la del comando. |
| Fase de la partida | Unión explícita para mesa incompleta, reparto en curso, reparto cerrado y chico terminado. La mesa incompleta admite `vista: null` en los tres modos. Un reparto cerrado admite el siguiente reparto si el chico sigue abierto. |
| Contexto del lance | En una mesa repartida, exponer tipo de lance, índice cuando sea un pico y participantes en asientos físicos. Duelo y parejas tienen un lance simple por reparto. Tercetos conserva redondilla o duelo 1, 2 o 3, además de los lances archivados. Cada lance se identifica por reparto, tipo e índice. |
| Hechos del juego | Dador, mano, muestra, vueltas, jugadas, cantos y cobros para el destinatario. Cada carta, resultado y cobro conserva su asiento o equipo y su lance. Sólo el servidor determina qué pruebas de tantos puede publicar y cuándo. |
| Vista propia | Distinguir participar, esperar duelo y haber terminado. La autorización de la mano propia es independiente del turno. Un participante puede ver sus cartas mientras otro actúa. Quien espera en seis recibe acciones legales vacías y carece de cartas y tantos propios. Las consultas privadas de flor y las señas sólo llegan a sus destinatarios. |

**Implementación del contrato.** Añadir `contexto` con `versionVista` y `fase` en la respuesta. Reutilizar `lance` en el nivel donde ya lo recibe tercetos y añadirlo para duelo y parejas. Los demás campos de juego y la proyección privada conservan sus nombres. Por ejemplo, este fragmento identifica el segundo duelo del reparto del ejemplo desde cualquier asiento.

```json
{
  "formato": "triples",
  "manoNumero": 2,
  "contexto": { "versionVista": 1, "fase": "en-juego" },
  "lance": { "tipo": "pico-a-pico", "duelo": 2, "activos": [4, 1] }
}
```

Las otras fases son `sin-repartir`, `reparto-cerrado` y `chico-terminado`. Antes del reparto se omite el lance. En dos y cuatro se usa `tipo: "simple"`, con todos los participantes y `duelo: null`. El lector normaliza el contexto nuevo o lo deriva de los campos anteriores. Para cada puesto combina el lance visible con las participaciones ya cerradas en ese reparto. Un asiento futuro tiene tres cartas por definición. Un asiento terminado se despeja aunque sus jugadas públicas sumen menos de tres. El permiso de ver la mano propia al cierre se toma de la proyección del destinatario.

GET, confirmación HTTP y confirmación privada WebSocket deben producir la misma vista normalizada para el mismo asiento y versión. El aviso general de actualización sigue indicando que hay que releer. Ante un reintento, conservar el recibo del comando original y su versión, con los filtros de privacidad vigentes. El lector admite un recibo histórico sin el bloque nuevo. Un recibo antiguo no debe hacer retroceder una vista más reciente. Mantener el conflicto de versión y la aplicación única de la acción ante dos respuestas simultáneas. [Recibos y control de versión](../../api/partidas.ts)

El espectador conserva su proyección pública independiente y su orientación neutral. En parejas con señas, la misma jugada con seña y en silencio produce la misma carta, historial, avisos y respuesta pública para rivales y espectadores. La cuenta de dorsos sólo usa jugadas ya visibles. El cliente de seis jamás necesita las cartas de otro jugador para representar su mano. [Proyección del espectador](../../api/tablero-espectador.ts) · [Privacidad por asiento en tercetos](../multijugador/tercetos/adr/0003-persistencia-y-vistas.md)

## Turno, ritmo e historial

- **Acciones.** La lista legal del servidor alimenta el mismo orden y agrupación de controles en los tres modos. Usar «Tu turno», «Podés responder» o el nombre de quien actúa, según la vista autorizada. En el pico se agrega «Duelo 2 de 3» y los nombres de los dos participantes. Conservar los valores de falta por equipo y sus reglas de cálculo en seis. Las señas se muestran únicamente en las variantes y relaciones que las habilitan.
- **Vuelta visible.** Usar un mismo punto de presentación para carta, dorsos, voz, ganador, tanteador e historial. Al terminar una vuelta por cartas, mostrar la última carta y después el resultado. Conservar esa vuelta hasta la primera carta de la siguiente o el cambio de lance. Si decidió el reparto, sigue en el tapete al recargar, también en caso de parda. Si hay mazo o rechazo, mostrar el cierre por ese motivo y pasar las vueltas anteriores al historial. Si una actualización abarca dos duelos, terminar de presentar el primero antes de mostrar la mano propia o las acciones del segundo.
- **Historial y pruebas.** En duelo, parejas y redondilla hay un lance que consultar por reparto. En el pico se mantiene una sección por duelo con sus jugadas, motivo del cierre y tantos. Cuando el lance final ya está archivado, contabilizarlo una sola vez. En seis, las pruebas de tantos de los duelos se publican al cierre del reparto, incluido el cierre por victoria anticipada del chico. Mostrar las declaraciones de flor que el perfil ya hace públicas. [Cierres y pruebas](../../src/motor/mesa-online.ts) · [Reglas de tercetos](../multijugador/tercetos/adr/0001-puntaje-y-cantos.md)
- **Interacción.** Mientras se confirma un comando o se presenta un paso anterior, mantener visible la mano autorizada de ese paso y bloquear envíos. Una reconexión abre la vista vigente sin repetir cantos ya pasados. Conservar el foco de teclado en la zona de juego tras desaparecer el botón activado. El anuncio de estado identifica la acción disponible y el duelo una sola vez.

## Entregas y criterios de salida

| Orden | Trabajo | Prueba que habilita el siguiente paso |
| --- | --- | --- |
| 1. Reproducir y corregir los dorsos | En los adaptadores de jugador y en el tapete, calcular por puesto el contenido visible a partir de la proyección actual. Mantener el adaptador del espectador y el de las lecciones. Esta entrega se puede desplegar con la API actual. | La captura de Ana se reproduce con cinco manos boca abajo y con las tres cartas propias en su panel. Un rechazo despeja sólo los puestos del duelo que terminó. Una redondilla empieza con cinco manos ajenas boca abajo. |
| 2. Publicar y leer el contexto de partida | Tipar primero la espera inicial. Añadir al proyector el bloque aditivo para 2, 4 y 6 asientos, normalizarlo en el cliente y usar el mismo recorrido en lectura, confirmación y reconexión. | Probar cliente anterior con servidor nuevo y cliente nuevo con respuesta anterior. Un reintento cruzado HTTP/WS entrega el recibo original, incluso después de avanzar de duelo o reiniciar la API. |
| 3. Compartir presentación y controles | Extraer selección de la vuelta, agrupación de acciones y contenido de puesto. Conservar extensiones por lance para falta, espera y resumen de tercetos. Incorporar la secuencia de cartas a las pausas de seis. | Con jugadas agrupadas, una parda, una flor y un cierre por mazo o rechazo, la carta, la voz, el resultado y los puntos aparecen en orden. El lector y el teclado permiten responder al mismo canto en las tres modalidades. |
| 4. Integrar y desplegar | Contrastar los dos lectores sobre las mismas partidas guardadas. Desplegar el servidor aditivo antes de activar el cliente compartido. Revisar errores de lectura, conflictos, comandos duplicados y partidas que dejan de avanzar. | Las mesas en curso pueden jugar hasta el cierre. Si aparece una regresión, volver al lector o presentador anterior conservando las partidas, sus recibos y el lector de registros históricos. |

Para cada entrega, buscar o abrir su issue y reservar su rama según el [flujo del repositorio](../../CONTRIBUTING.md). El trabajo de controles tiene pruebas y decisiones previas. Antes de tocar `Tablero`, `Tercetos`, el historial o las proyecciones, coordinar el orden con el trabajo de señas al pie. Integrar el contrato con los permisos de la variante que llegue a `main`. [Controles integrados](https://github.com/flabat/truco-uruguayo/pull/294) · [Diseño de controles](https://github.com/flabat/truco-uruguayo/pull/287) · [Señas al pie](https://github.com/flabat/truco-uruguayo/pull/315)

## Matriz de verificación

| Nivel | Casos mínimos |
| --- | --- |
| Contrato y motor | Casos deterministas de dos, cuatro y seis asientos, mesa incompleta, primer reparto, parda, cierre por cartas, rechazo antes de jugar, mazo, envido o flor y final anticipado. Comparar todos los asientos físicos, sus acciones legales, las cartas autorizadas y la suma de cada cobro una vez. Usar los replays existentes como referencias. [Pruebas del pico](../../tests/unit/pico-tercetos.test.ts) · [Replays](../../tests/unit/replay-chico-online.test.ts) |
| API y reconexión | Para un mismo asiento y versión, comparar GET con los dos transportes de confirmación. Probar id repetido, versión atrasada, dos compañeros que responden a la vez y reinicio entre los duelos 1 y 2. Leer antes, durante y después del duelo propio. Al cierre, comprobar que duelo y parejas conservan las cartas propias autorizadas y que seis retira sus campos privados. Verificar también la ausencia de cartas privadas y de pistas de flor en los cuerpos de quienes esperan. [Persistencia de tercetos](../../scripts/verificar-persistencia-tercetos.mjs) |
| Privacidad y consumidores existentes | Comparar dos jugadas equivalentes con seña y con silencio desde el rival y el visor, también tras reconectar. Comprobar que las pruebas de un duelo anterior se revelan al cerrar el reparto. Repetir los casos existentes de dorsos y muestra del espectador y de las lecciones. [Visor y dador](../../tests/dador.spec.mjs) · [Señas](../../tests/senas-online.spec.mjs) |
| Navegador | Verificar los tres duelos desde los seis puestos, cuatro manos en espera al abrir el primero, dos en el segundo, ninguna en el tercero y puestos despejados tras un cierre anticipado. Cubrir móvil de 320 px, horizontal, escritorio, texto ampliado, foco y anuncios. Guardar capturas comparables del truco inicial, el primer cambio de duelo y el cierre. [Seis sesiones](../../tests/tercetos-online.spec.mjs) · [Controles](../../tests/controles-tapete.spec.mjs) · [Secuencia de vueltas](../../tests/vueltas-online.spec.mjs) |

Cada PR de implementación registra `npm ci`, `npm run check` y sus comprobaciones dirigidas. La entrega del contrato verifica además el stack con API, PostgreSQL y WebSocket. La aceptación final requiere que una mesa iniciada antes de la actualización complete el chico y que al volver a abrirla se vean los mismos puestos, acciones y tantos que en una sesión conectada.
