# Mesa nueva de El Truco: diseño visual

Fecha: 2026-11-24 · Estado: aprobado · Issue #357 · Etapa 3 del [plan de la app móvil](2026-11-23-app-movil-design.md)

## Intención

En el teléfono la mesa actual está apilada como una página: el estado, los cantos en grupos, el tanteador y recién abajo el tapete. Para ver las cartas hay que hacer scroll. Esa es la queja principal.

La mesa nueva entra entera en una pantalla vertical de teléfono y se siente como un juego: la mano en abanico, cartas que vuelan al paño, hápticos y la voz de cada jugador al cantar. En la computadora es la misma mesa con más aire y dos paneles a los costados.

La etapa 4 (app Expo) implementa este documento para iOS, Android y web con un solo código.

Las maquetas que se mostraron están en [`mesa-nueva/`](mesa-nueva/). Se abren en el navegador desde el repositorio, con las cartas Tatú de `public/img/cartas/tatu/`. Son orientativas: este documento manda cuando no coinciden. Por ejemplo, las maquetas dicen «Cantar» y el botón definitivo es «Cantos».

## Objetivos

- Una sola pantalla sin scroll en el teléfono, en vertical, desde 360 × 640 puntos.
- Mano grande y cómoda de tocar o arrastrar.
- Animaciones fluidas, hápticos y sonido con poca latencia en las apps.
- Paridad con la mesa web: 1 contra 1, 2 contra 2 con señas automáticas al pie, 3 contra 3 (redondilla y pico a pico), mesas públicas, espectador, historial y reporte de jugada, resumen de tantos, voces de los cantos y voz por Discord.
- Lugar reservado para el botón de voz propia de la etapa 6 (LiveKit).
- La variante de escritorio es la misma mesa, no otro diseño.

## No objetivos

- Accesibilidad para lector de pantalla y navegación por foco en esta versión. Los atajos de teclado de escritorio son una comodidad, no un requisito de accesibilidad.
- Rediseñar el salón, la creación de mesa y la sala de espera. La etapa 4 los lleva a Expo con el mismo lenguaje visual (paño, píldoras, hojas), sin un diseño propio.
- Orientación horizontal en el teléfono. La app se fija en vertical.
- Señas elegidas a mano (ver [Señas](#señas-siempre-automáticas)).

## Anti-objetivos

- Que haya que hacer scroll para ver o jugar las cartas.
- Que un rival o un espectador vea una seña o un gesto. Rige la regla de AGENTS.md: solo quien hace la seña y su compañero la ven.
- Una mesa de escritorio que diverja de la del teléfono.
- Que una hoja tape la mano mientras el jugador decide.

## Restricciones

- Expo + React Native para iOS, Android y web (plan general).
- Un solo desarrollador: se prefiere menos código propio.
- La descarga inicial de la web puede ser pesada si solo pesa al arrancar. La fluidez durante el juego no se negocia.
- Los verbos de los cantos siguen el issue #355: **cantar** solo la flor y sus respuestas, **tocar** el envido, real envido y falta envido, **gritar** el truco, retruco y vale cuatro. Los puntos se **dicen** o se **declaran**. El sustantivo genérico es «canto».

## Enfoques considerados

### Disposición en el teléfono

| Disposición | Qué es | Resultado |
| --- | --- | --- |
| A · Cantos a la vista | Fila de botones de cantos legales sobre la mano | Descartada: la mano queda mediana |
| **B · Mano grande con botón de cantos (elegida)** | Mano en abanico grande; los cantos detrás de un botón que abre una hoja | Elegida: la mano es donde se siente el juego |
| C · Panel de decisión | Cuando toca decidir sube un panel con todo junto y la mano se achica | Se tomó de C que la hoja suba sola al recibir un canto |

### Cómo se dibuja y se anima

| Enfoque | A favor | En contra |
| --- | --- | --- |
| Vistas de React Native + Reanimated + Gesture Handler | Liviano en la web; estándar de Expo | Brillos, sombras y partículas más pobres |
| Todo en un lienzo Skia | Lo más pulido | Texto, botones, hojas y scroll hechos a mano: mucho código propio |
| Animated de React Native, sin Reanimated | Sin dependencias | El arrastre corre en el hilo de JavaScript y se traba cuando llega la red |
| **Híbrido: Skia + Reanimated para el paño y las cartas, vistas comunes para el resto (elegido)** | Lo más pulido con menos código propio; mismo código en las tres plataformas | Dos capas que hay que mantener alineadas; CanvasKit (unos 3 MB) en la web |

El usuario pidió lo más pulido con menos código duplicado y aceptó una descarga inicial pesada en la web. El híbrido gana porque Skia solo dibuja lo que se luce, mientras que el texto y los controles ya vienen resueltos en las vistas comunes.

## La mesa en el teléfono (disposición B)

Maqueta: [`mesa-nueva/disposicion-v2.html`](mesa-nueva/disposicion-v2.html), tarjeta B.

De arriba hacia abajo:

1. **Barra superior.** A la izquierda, una píldora con el tanteador: «Nos 12 · 9 Ellos · a 30». En 1 contra 1 dice «Vos» y «Rival»; en parejas y tercetos, «Nos» y «Ellos». A la derecha, ☰ abre la hoja Más. El estado de red («Reconectando…») aparece como una segunda píldora junto al tanteador mientras dura.
2. **Paño.** Ocupa el centro. Cada asiento muestra el nombre, el papel («Tu pareja», «Rival», «Mano», «Dador», «Pie») y, debajo, los dorsos de las cartas que le quedan o la carta que jugó en esta vuelta. Quien tiene el turno se ilumina.
3. **Mazo y muestra.** La muestra va boca arriba y el mazo encima la tapa a medias, cruzado. El conjunto se ubica **a la derecha de quien dio**, desde el punto de vista de ese jugador, del lado de quien es mano. Debajo va el rótulo «Muestra · 6 de oros». En cada mano, mazo y muestra se mudan al lado del nuevo dador.
4. **Estado.** Un título en serif («Tu turno», «Turno de Diego», «Diego tocó envido») y una línea de indicación. Sale de la misma lógica que hoy usan `estadoDelTurno` y `palabra` en `Tablero.tsx` y `Tercetos.tsx`.
5. **Mano propia.** Tres cartas en abanico, grandes (unos 100 puntos de ancho en un teléfono de 390). Se juega con **un solo toque**, como hoy en la web: la carta se levanta al apoyar el dedo y vuela al paño al soltarlo. También se puede arrastrar al paño. Si el dedo se desliza fuera de la carta antes de soltar, o el arrastre no llega al paño, la carta vuelve a la mano y no se juega. Fuera de tu turno, la mano se ve pero no responde.
6. **Botón «Cantos».** Abajo a la derecha, sobre la mano. Aparece solo cuando hay cantos legales. Abre la hoja de cantos.
7. **Tira inferior.** Cuatro pestañas: **Mano** (en tercetos, **Reparto**), **Tantos**, **Voz** y **Más**. Cada una abre una hoja.

En el 1 contra 1 el rival va arriba, al frente. En parejas: vos abajo, tu pareja al frente y los rivales a los costados.

## Hoja de cantos

Maqueta: [`mesa-nueva/hoja-cantar.html`](mesa-nueva/hoja-cantar.html).

Regla general: **ninguna hoja tapa la mano**. Al abrirse una hoja sobre la mesa, la mano sube y se achica, y el paño se comprime arriba. Las cartas siempre se ven al decidir.

- **Abierta por el jugador en su turno.** Encabezado «Cantos», con tus tantos a la derecha («Tenés 33 de envido»). Solo aparecen los cantos legales, agrupados: Envido (envido, real envido, falta envido), Flor (flor, con flor envido, contraflor al resto) y Truco (truco, retruco, vale cuatro). «Irme al mazo» va separado, abajo, en rojo. Se cierra deslizando hacia abajo o tocando el paño.
- **Te tocan, te gritan o te cantan.** La hoja sube sola, con un háptico de aviso, y aparece el globo del canto en el asiento de quien cantó. El encabezado dice el canto con su verbo: «Diego tocó envido». Arriba van Quiero y No quiero, grandes. Abajo, las subidas legales. No se puede cerrar sin responder. Si un truco quedó pendiente, el encabezado lo recuerda: «Queda pendiente el truco de Diego».
- **Responde tu compañero.** La hoja no sube. El estado dice «Responde Clara».
- **Flor.** Cuando te toca declarar, la hoja sube sola con Flor, Con flor quiero o Paso, según lo legal, y el texto de `respuestaConFlor`.
- **Falta envido en tercetos.** La hoja muestra cuánto cobra cada equipo, como hoy (`faltaPorEquipo`).

## Señas siempre automáticas

Maqueta: [`mesa-nueva/senas-automaticas.html`](mesa-nueva/senas-automaticas.html).

Nadie elige una seña. La mesa usa las señas automáticas al pie que ya existen (`paquetes/motor/src/senas-pie.ts`, PR #315): al empezar cada vuelta, el sistema calcula los gestos según las cartas de cada compañero y se los muestra solo al pie de su equipo.

- **Sos el pie.** Junto al asiento del compañero se abre solo un globo con candado («Señas de Clara»), con sus caras (`CaraSena`) y lo que significan («2 de la muestra»). Cuando un compañero te espera, aparecen sobre la mano las frases legales (Vení, Jugá o Voy a vos), «Jugá» con cada carta que el compañero mostró («Jugá el tres») y «Dejar jugar». Al tocar una, toda la mesa ve el globo de voz en tu asiento y oye la frase con tu voz.
- **No sos el pie.** No hacés nada. Una píldora con candado te dice qué gestos le mostraste al pie en esta vuelta («Le mostraste a Clara: Tres · As»). Las frases del pie te llegan como globo de voz en su asiento, con un háptico liviano si son para vos. Mientras no tiraste, la frase para vos reemplaza a la píldora («Eli: Jugá el 4 de espadas», o «Eli: Vení · juega Ana» si el equipo va a otro compañero) y la carta nombrada lleva el halo dorado en tu mano (#425).
- **Rivales y espectadores** no reciben globo, píldora ni gestos. El servidor ya los proyecta así (`vistaDelPie`). La app no debe pedir ni guardar nada más.
- **Mesas con seña elegida a mano** (el selector de los clientes viejos). La app no las crea. Si abre una, juega en silencio: manda cada jugada sin seña y muestra las señas que le llegan de su compañero, sin selector. Ese modo deja de crearse cuando se retire la pantalla Astro (etapa 5).
- **1 contra 1** no tiene señas.

## Tercetos (3 contra 3)

Maqueta: [`mesa-nueva/tercetos-v2.html`](mesa-nueva/tercetos-v2.html).

Los equipos se alternan alrededor del paño. A tus dos costados se sientan rivales, en las esquinas de arriba tus compañeros y al frente un rival. El orden de juego va en sentido contrario a las agujas del reloj, como en la mesa real. Cada asiento es un círculo con la inicial y el color del equipo, así se reconoce quién es quién sin leer seis nombres.

- **Redondilla.** Juegan los seis. Los cinco asientos van en arco por arriba, con dorsos o la carta jugada en chico. Las señas al pie funcionan igual que en parejas.
- **Pico a pico.** La pantalla es la del duelo 1 contra 1: tu rival del duelo ocupa el lugar del rival, arriba y grande, con sus dorsos y su carta. Los otros cuatro quedan como puntos tenues en sus lugares de la mesa, con su estado («Ya jugó», «Duelo 3»). Al cambiar de duelo, el nuevo rival se desliza al centro. Si esperás tu duelo, la mano se ve pero no se juega, y el estado dice «Te toca en el duelo 3 de 3».
- Una etiqueta arriba del paño dice el lance: «Reparto 2 · Redondilla · Vuelta 1» o «Pico a pico · Duelo 2 de 3».
- La pestaña Mano se llama **Reparto** y agrupa la redondilla y los tres duelos (lo que hoy hacen `LanceCerrado` y `DetallesDelLance`).

## Espectador, fin de mano y hojas

Maqueta: [`mesa-nueva/espectador-fin.html`](mesa-nueva/espectador-fin.html).

- **Espectador.** La misma mesa sin mano propia, sin botón Cantos y sin señas. El tanteador nombra a los equipos por sus jugadores («Ana y Clara 12 · 9 Diego y Compu»). Abajo van una píldora «👁 Mirando» y «Volver al salón». Oye las voces de los cantos. La voz por Discord está en la pestaña Voz, como hoy en `VisorEspectador`.
- **Fin de mano.** Una tarjeta sobre el paño con quién ganó y por qué («El cierre fue por las vueltas»), cada cobro (lo de `ResumenDeTantos`) y las cartas con que se probaron los tantos (lo de `PruebaEnMesa`). Abajo, un botón grande: «Repartir otra mano», o «Crear otra mesa» si terminó el chico. En tercetos, la tarjeta dice «Tantos de este reparto».
- **Hoja Mano.** Lo que pasó en orden (jugadas, cantos, frases del pie), las vueltas terminadas con su ganador, «Reportar esta jugada» (`ReporteDeJugada`) y «Manos anteriores».
- **Hoja Tantos.** Tus tantos, el valor de la mano y los tantos cobrados.
- **Hoja Voz.** El enlace de voz por Discord (`VozDiscord`), con el mismo texto de alcance que hoy. En la etapa 6 suma arriba el botón de voz propia.
- **Hoja Más.** Reglas, versión de reglas y modelo de la computadora (lo de `PieMesa`), sonido y hápticos encendidos o apagados, y «Salir al salón».

## Variante ancha para escritorio

Maqueta: [`mesa-nueva/escritorio.html`](mesa-nueva/escritorio.html).

- **Desde 1024 puntos de ancho.** La tira desaparece y sus hojas pasan a ser paneles fijos. A la izquierda, el panel Mano (o Reparto). A la derecha, el panel Tantos con debajo Voz y los datos de Más. El centro es la mesa B con más aire y cartas más grandes. La hoja de Cantos sube solo dentro de la columna central.
- **Entre 600 y 1024 (tablet o ventana angosta).** La mesa del teléfono, más grande y con la tira.
- **Atajos de escritorio.** 1, 2 y 3 juegan directamente las cartas de la mano, de izquierda a derecha; C abre Cantos; Q es Quiero; N es No quiero; Escape cierra la hoja. Las cartas también se arrastran con el mouse.

## Movimiento, hápticos y sonido

Maqueta con prototipo que se puede tocar: [`mesa-nueva/movimiento.html`](mesa-nueva/movimiento.html).

| Momento | Movimiento | Háptico | Sonido |
| --- | --- | --- | --- |
| Reparto | Las cartas salen del mazo del dador, de a una, en el orden real (unos 80 ms entre cartas). Al final se dan vuelta las tuyas | Ninguno | Roce de naipe por carta |
| Tocás o arrastrás una carta | Se levanta al tocarla. Al soltarla vuela al paño con un rebote leve y se achica. Si el arrastre no llega al paño, vuelve a la mano | Liviano al levantar, medio al apoyar | Naipe sobre paño |
| Carta de otro jugador | Sale de su asiento y se da vuelta en el aire | Ninguno | Naipe sobre paño, más bajo |
| Te tocan, te gritan o te cantan | El globo salta desde el asiento y sube la hoja de respuesta | Aviso | Voz del canto con la voz de ese asiento |
| Canto entre otros | El globo salta desde el asiento | Ninguno | Voz del canto |
| Se gana la vuelta | La carta ganadora brilla y las demás se oscurecen 0,6 s | Liviano si la ganó tu equipo | Ninguno |
| Se cobran tantos | El número del tanteador salta y cuenta hacia arriba | Éxito si son de tu equipo | Ficha corta |
| Se gana el chico | Las cartas se juntan al centro, aparece el cartel, partículas | Éxito | Festejo breve |
| Frase del pie para vos | Globo de voz en el asiento del pie | Liviano | Voz de la frase |
| Declaración de tantos | Globo «33 de envido» | Ninguno | Voz del número y del canto |

- **Cola de presentación.** Cuando llegan juntas varias jugadas (bots, reconexión), se presentan en orden, cada una con su animación y su voz, sin bloquear al jugador que tiene que decidir. Es lo que hoy hacen `secuencia-de-mesa.ts`, `useVozDelPie` y `pausaDeVoz` (1,5 s entre voces), ahora con animación. Al reconectar o al abrir una mesa en curso, el estado aparece en su lugar, sin animar el pasado.
- **Reducir movimiento.** Con esa opción del sistema activada, las cartas aparecen en su lugar sin volar y no hay partículas.
- **Sonido y hápticos** se apagan por separado desde la hoja Más y la app recuerda la elección. En la web no hay hápticos, y el sonido arranca después del primer toque, como exigen los navegadores.

### Voces

- **Una voz por asiento.** Cada asiento de la mesa tiene su propia voz, así se distingue quién canta sin mirar. En la mesa más grande hay seis voces distintas. La voz depende del número de asiento, no de la cuenta: en una mesa dada, cada jugador conserva su voz durante todo el chico. Las computadoras también hablan.
- **Qué se dice.** Todos los cantos y respuestas (con sus textos de `src/lib/cantos.ts`, ajustados a #355), «Me voy al mazo», las frases del pie (Vení, Jugá, Voy a vos), y las declaraciones de tantos («treinta y tres de envido», «veintinueve de flor»).
- **Cómo se hacen.** Se generan una sola vez con un servicio de voz sintética (ElevenLabs o la API de voz de OpenAI; el usuario tiene claves de los dos) en español rioplatense, y se guardan como clips cortos dentro de la app. No hay costo mensual ni llamadas durante el juego. Los números de los tantos pueden armarse uniendo el clip del número con el del canto, si suena natural.
- **Orden y aprobación.** Los clips se generan después de que se integre el issue #355, para no grabar textos que van a cambiar. La lista de frases sale del código (`src/lib/cantos.ts`, `textoFrasePie`, rangos de tantos del motor). Antes de generar las seis voces completas, el usuario escucha una muestra de una voz (un canto, una respuesta, una declaración armada por partes) y la aprueba. Mientras tanto, la app funciona con los globos de texto y sin voz.

## Arquitectura gráfica

Enfoque elegido: **híbrido Skia + Reanimated + vistas comunes.**

- **Capa del paño (Skia).** `@shopify/react-native-skia` dibuja el paño, las cartas (las imágenes Tatú), los dorsos, el mazo con la muestra, los brillos de la carta ganadora y las partículas del festejo. Reanimated mueve todo en el hilo de la interfaz. Skia lee directamente los valores compartidos de Reanimated.
- **Capa de interfaz (vistas comunes).** Tanteador, nombres y papeles, globos, estado, botón Cantos, hojas, tira y paneles de escritorio.
- **Gestos.** Sobre cada carta propia hay una vista transparente que sigue a la carta con los mismos valores de Reanimated. Recibe el toque y el arrastre (`react-native-gesture-handler`) y lleva un `testID` («carta-espadas-03») para las pruebas de Playwright.
- **Hápticos y audio.** `expo-haptics` y `expo-audio`. Los clips se precargan al entrar a la mesa.

Reglas para que las dos capas no se desarmen:

1. **Una sola geometría.** Un módulo puro calcula, a partir del tamaño de la pantalla, la modalidad y el asiento propio, dónde va cada asiento, cada carta jugada, el mazo y la mano. Las dos capas leen solo de ahí. Se recalcula al cambiar el tamaño de la ventana. Ese módulo tiene pruebas unitarias.
2. **El lienzo va siempre al fondo.** Todas las vistas van encima. Si el festejo necesita partículas sobre el cartel, va un segundo lienzo chico sobre ese cartel.
3. **Nada de texto en Skia.** Todo texto va en vistas.

Web:

- CanvasKit (unos 3 MB) se descarga en segundo plano mientras el jugador está en el salón o en la sala de espera, junto con las 41 imágenes de cartas. Al sentarse, la mesa ya está lista. Si alguien entra directo por un enlace a la mesa, ve el estado de la mesa en vistas mientras carga el lienzo.
- En la web no hay un hilo de interfaz aparte. En computadora alcanza; en un teléfono viejo que juega desde el navegador puede trabarse un poco. La fluidez se cuida primero en las apps.

## Alcance respecto de la etapa 4

Este documento diseña la mesa. La etapa 4 también lleva a Expo el salón, la creación de mesa, la sala de espera, el ingreso y el perfil, según el plan general. La precarga de CanvasKit y de las cartas se hace en la pantalla que esté antes de la mesa en ese momento. Si todavía no existe, la mesa muestra su estado en vistas mientras carga el lienzo, como cuando se entra por un enlace directo.

## Pruebas y rendimiento

Por ahora no hay un Android físico. Se prueba en el simulador de iOS, en el emulador de Android y en la web. El único teléfono real es un iPhone 16 Pro Max, que es de gama alta y no sirve para encontrar el piso de rendimiento. Por eso:

- Efectos medidos desde el principio: sombras y brillo de la carta ganadora sí; partículas solo en el festejo del chico, en cantidad baja.
- Un **modo liviano** listo desde la primera versión. Sin partículas ni brillos animados, con sombras fijas y animaciones más cortas. Se activa solo cuando el sistema pide reducir movimiento, y se puede forzar desde la hoja Más. Si en un teléfono real aparece una traba, se ajusta qué apaga el modo liviano sin tocar el diseño.
- Criterio de aceptación: en el iPhone y en el emulador de Android, jugar una carta y recibir un canto no pierde cuadros visibles, con la red simulada lenta. En la web de escritorio, lo mismo en Chrome.

## Lo que queda a criterio de quien construye

- Medidas, tipografía y colores exactos, partiendo de la paleta actual (`--paper #faf8f0`, `--ink #233d31`, `--accent #a34b34`, paño `#3a614a → #1c392d`) y de DM Serif Text y DM Sans.
- Curvas y duraciones exactas de las animaciones, dentro de lo descrito.
- Qué háptico concreto de `expo-haptics` corresponde a «liviano», «medio», «aviso» y «éxito».
- Qué voces elegir y cómo nombrar y empaquetar los clips.
- Cómo se divide la geometría en componentes.
- Cómo se ve la mesa mientras falta gente (sala de espera) y la carga del lienzo en la web, con el mismo lenguaje visual.

## Decisiones tomadas por quien escribe este documento

Las marcadas acá no las pidió el usuario explícitamente. Se pueden corregir al revisar:

- El botón dice «Cantos» y los avisos usan el verbo de cada canto, por el issue #355.
- Los cortes de ancho son 600 y 1024 puntos.
- Los atajos de teclado son 1–3, C, Q, N y Escape.
- La app se fija en vertical en el teléfono.
- La voz depende del número de asiento.
- El estado de red va como píldora junto al tanteador.
- Un toque juega la carta, sin confirmación, como hoy en la web.
- Las voces esperan a #355 y a la aprobación de una muestra.
- El modo liviano y el criterio de rendimiento, a partir de que por ahora solo hay simuladores y un iPhone de gama alta.
