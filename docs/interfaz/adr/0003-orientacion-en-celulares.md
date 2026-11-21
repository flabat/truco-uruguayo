# ADR 0003 · Orientación horizontal como sugerencia

**Estado.** Propuesto para la implementación. [Issue #286](https://github.com/flabat/truco-uruguayo/issues/286).

## Contexto

En parejas y tercetos, el ancho adicional permite dar a cada puesto una posición clara y acercar la zona de acciones a la mano. La altura útil de un teléfono horizontal puede ser baja cuando aparecen las barras del navegador. Los jugadores pueden elegir su orientación y usar bloqueo de rotación o tecnología de asistencia. [Orientación en WCAG 2.2](https://www.w3.org/TR/WCAG22/#orientation).

## Decisión

Ofrecer un aviso en línea en la sala de espera de parejas y tercetos si faltan jugadores y se cumple la consulta de medios `(orientation: portrait) and (max-width: 600px) and (any-pointer: coarse)`. El umbral es un punto de partida que se verifica con los tamaños del diseño. Mostrar «Girás el celular y ves mejor toda la mesa.» con el botón «Ahora no». En un teléfono que abre una partida activa, la prioridad es la zona de juego.

El aviso aparece una vez por pestaña por sesión de navegación. Registrar su primera exposición en `sessionStorage` al entrar en la condición de visibilidad. Mantener la instancia visible hasta que se descarte, cambie la condición o se abandone la espera. Si se gira con el aviso ya expuesto y luego se vuelve a vertical, el aviso permanece retirado durante esa sesión. Usar memoria local de la interfaz si el navegador restringe el almacenamiento. Al descartarlo con teclado, devolver el foco al encabezado de la espera cuando el botón pierde su nodo. Si el foco cae dentro del aviso al girar, aplicar la misma recuperación.

El giro provoca un reflujo de CSS. La vista conserva su instancia, el asiento, el comando en curso, la seña correspondiente a la versión actual y el estado de los controles. El jugador decide la orientación en el dispositivo. Ambas orientaciones ofrecen las mismas acciones legales. [Zona de juego](0002-controles-en-el-tapete.md).

## Alternativas consideradas

| Alternativa | Implicación |
| --- | --- |
| Optimizar ambos formatos y omitir el aviso | Mantiene la espera simple. Reduce el descubrimiento de la disposición horizontal. |
| Avisar en cada apertura o abrir un diálogo | Aumenta la exposición del mensaje. Interrumpe acciones urgentes y añade trabajo de foco. |
| Aviso breve en la espera con descarte | Aprovecha una pausa natural y permite seguir jugando en la orientación elegida. |

## Consecuencias

Horizontal requiere una prueba de altura disponible con barras del navegador y zonas seguras. El aviso requiere comprobaciones de teclado, persistencia por pestaña, rotación, almacenamiento bloqueado y apertura directa a una partida. [Matriz de aceptación](../diseno-controles-tapete.md#criterios-de-aceptación).
