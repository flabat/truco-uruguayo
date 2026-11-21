# Controles de juego dentro del tapete

**Estado.** Diseño para implementar. [Issue #286](https://github.com/flabat/truco-uruguayo/issues/286).

El borde inferior del tapete reúne la mano propia, la indicación de turno y todas las acciones legales. La persona que juega puede mirar sus cartas, tirar una o responder un canto en la misma zona. En celulares, la vista horizontal aprovecha mejor los cuatro o seis puestos. La vista vertical también permite jugar la partida completa.

## Problema observado

En un duelo de apertura, la primera carta jugable empezaba a 1093 px en una ventana de 320 × 800 y a 1023 px en una de 393 × 852. «Tu turno», los cantos y el historial aparecían más arriba. Tab recorría primero las cartas porque el cambio de orden en móvil era visual. Estas mediciones se hicieron con datos de prueba y se reprodujeron en `b42a0a8`. La interfaz ya comparte la disposición de puestos, mazo, muestra y vueltas entre juego, espectador y lecciones. [Cambio auditado](https://github.com/flabat/truco-uruguayo/commit/b42a0a8d913134767011da72597a478da868a46d) · [ADR del tapete compartido](adr/0001-tapete-compartido.md).

## Composición

1. **Antes del tapete.** Identificación de la mesa, enlace al salón y tanteador del chico. Dentro de una partida, compactar este encabezado en los tamaños pequeños.
2. **Dentro del tapete.** Muestra, mazo, puestos, cartas jugadas y resultado de la vuelta. El último bloque es la zona de juego, centrada desde el asiento propio y separada de los puestos con espacio reservado en la cuadrícula. La superficie del bloque puede cruzar visualmente el borde del fieltro. Las cartas, los botones y sus contornos de foco tienen espacio propio.
3. **Dentro de la zona de juego.** Primero una indicación breve de estado, después el selector privado de seña cuando corresponda, la mano propia y los cantos o respuestas. Mantener la zona en el mismo sitio cuando cambien los botones. Los cantos pueden ocupar dos filas. Un toque en una carta habilitada la juega en el acto.
4. **Después del tapete.** Historial, detalle de vueltas o lances, tantos propios, valor de la mano y desglose de cobros. Al cerrar, el estado inmediato y el botón de continuación están en la zona de juego. El desglose conserva su ubicación de consulta. El cálculo y el formato de los tantos se coordinan con [#249](https://github.com/flabat/truco-uruguayo/issues/249) y [#250](https://github.com/flabat/truco-uruguayo/issues/250).

En escritorio se conserva la misma secuencia. El ancho sobrante puede distribuir los cantos dentro de la zona de juego. Reservar más espacio vertical para la muestra y cartas jugadas cuando el dador está abajo. En horizontal de baja altura, reducir márgenes, encabezados y separaciones antes de reducir el tamaño de los controles. En vertical, dejar que la página crezca cuando el reparto de seis, nombres largos o el tamaño de texto lo requieran.

## Estados visibles y acción esperada

| Estado recibido o presentado | Indicaciones y acciones |
| --- | --- |
| Turno propio con carta legal | «Tu turno». Mano activa. Mostrar todos los cantos legales con sus nombres actuales. Los grupos «Truco» y «Envido y flor» se usan cuando ayudan a distinguir opciones. |
| Respuesta o declaración pendiente | Identificar el canto y quién lo hizo o debe responder. Mostrar las respuestas legales en la misma zona, incluida la flor obligatoria o el pase cuando estén disponibles. Mantener visible la mano que el asiento está autorizado a ver. La carta queda inactiva cuando `carta` falta entre las acciones legales. |
| Turno ajeno o duelo ajeno | Nombrar a la persona que actúa o indicar el duelo propio en pico a pico. Conservar la ubicación de la mano y su disponibilidad según la vista del asiento. |
| Envío o presentación | Al enviar, indicar «Enviando jugada…» mientras se confirma. Durante una secuencia visible, conservar el relato de la carta, el canto o el resultado. Aplicar los bloqueos existentes y dibujar solo acciones que pueda ofrecer la vista. |
| Reconexión o error | Mostrar el estado junto a la mano y bloquear el envío cuando la mesa pierde conexión. Al volver, usar la última vista autorizada y sus acciones legales. Los errores de sesión, permisos o mesa no disponible siguen la ruta de recuperación de la sala. |
| Mano, reparto o chico terminado | Ubicar «Repartir otra mano» o «Crear otra mesa» en la zona de juego cuando la vista habilita el paso siguiente. Mantener el resultado legible y el detalle debajo del tapete. |

En mesas de parejas con señas, la elección es opcional, empieza en «Silencio» y se vincula a la versión de la jugada. La elección viaja junto a una carta o canto que la admite. El remitente y su compañero reciben la seña según su vista autorizada. Para rivales y espectadores, la jugada y el historial equivalen a los de la misma acción en silencio. La prueba cubre tanto la proyección recibida como el DOM visible. [Contrato del formato](../../training/contracts/README.md) · [Vista espectadora](../multijugador/salon-en-vivo/adr/0002-vista-espectadora.md).

## Foco y lectura

El DOM refleja el orden visible de la zona de juego. Usar botones nativos, un grupo con nombre para la mano y un selector con etiqueta para la seña. Separar el encabezado enfocable de la zona que anuncia el estado, de modo que cada cambio importante se comunique una vez. Cuando una acción por teclado quita o deshabilita el control enfocado, enfocar la indicación de estado y dejar la siguiente acción legal a un recorrido predecible de Tab. Si el foco ya está en otro control válido, conservarlo. Las actualizaciones de rivales y los cambios de orientación conservan el foco de quien está leyendo o interactuando.

Los botones de juego tienen un objetivo de 44 × 44 px CSS como mínimo. El estado y la disponibilidad se expresan en texto y semántica, además del color. Probar zoom, texto ampliado y navegación por teclado con la zona visible. Las preferencias de movimiento reducido aplican a efectos visuales. El relato cronológico de jugadas y cantos se conserva según los hooks actuales. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Mensajes de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

## Orientación en celulares

Mostrar una sugerencia descartable en la sala de espera de parejas o tercetos que se abre en un teléfono en vertical. Texto propuesto «Girás el celular y ves mejor toda la mesa.» Acción «Ahora no». Al girar, se retira el aviso. Se presenta una vez por pestaña durante la sesión de navegación. Una mesa que abre directamente en juego muestra la partida sin intercalar un paso de orientación. [ADR de orientación](adr/0003-orientacion-en-celulares.md).

## Criterios de aceptación

| Caso | Resultado |
| --- | --- |
| Duelo vertical a 320 × 800 y parejas vertical a 393 × 852 | En el turno inicial estable, se ven la indicación, la mano y las alternativas legales al abrir la partida, con la presentación asentada y la página en su posición inicial. Una respuesta a truco es visible y accionable desde la misma zona. |
| Tercetos vertical a 320 × 800 y zoom o texto ampliado | Seis puestos legibles, con scroll vertical de página si hace falta. La mano y sus controles quedan juntos, sin scroll horizontal ni recortes. Probar nombres largos y la muestra junto al puesto inferior. |
| Parejas y tercetos en horizontal a 800 × 360 y 852 × 393 | Desde la vista del tapete, la mano y los botones de respuesta se usan sin desplazarse entre ellos. Verificar al menos un dispositivo real con las barras del navegador visibles antes de dar por aprobada la experiencia móvil. |
| Giro durante una mano | Conserva versión de jugada, seña seleccionada si esa versión sigue vigente, foco y estado del historial. Se puede seguir jugando después del giro. |
| Teclado y lector de pantalla | Tab sigue el orden visual. Enter o Espacio envía una sola acción. Una jugada que retira el botón activo deja un destino de foco predecible. Se puede identificar el canto, la respuesta y el cierre sin depender del color. |
| Espectador y aprendizaje | El espectador usa la superficie pública con sus dorsos y sin controles privados. Las lecciones mantienen sus instrucciones, selección y repaso, y comparten la geometría de la mesa. |

[ADR de los controles](adr/0002-controles-en-el-tapete.md) · [Plan de implementación](plan-controles-tapete.md) · [Prompt de traspaso](prompt-controles-tapete.md).
