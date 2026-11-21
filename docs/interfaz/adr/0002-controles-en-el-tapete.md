# ADR 0002 · Acciones legales al lado de la mano

**Estado.** Propuesto para la implementación. [Issue #286](https://github.com/flabat/truco-uruguayo/issues/286).

## Contexto

El tapete compartido renderiza puestos, mazo, muestra, jugadas y detalles de cada asiento. En las partidas, el panel vecino renderiza los cantos, la indicación y el historial. En pantallas angostas, el panel completo se mueve por delante del tapete. Una carta jugable puede quedar debajo del historial y el orden de Tab sigue el documento original. [Diseño y mediciones](../diseno-controles-tapete.md).

## Decisión

Agregar a `Tapete` una propiedad opcional `zonaJugador?: ReactNode` que se renderiza una sola vez al final de la región del tapete, después de los puestos. La zona ocupa una fila propia y comparte visualmente el borde del fieltro. Los consumidores sin esa propiedad usan la composición descrita en el [ADR 0001](0001-tapete-compartido.md).

Los adaptadores de partida proveen la indicación, la mano, los cantos, la seña privada cuando corresponde y la acción de continuación. La mano de la partida se renderiza una sola vez dentro de esa zona. `detalle(asiento, carta, ganadora)` conserva las pruebas de tantos y los globos de canto en su puesto. El historial, el valor y los cobros se consultan después del tapete. Las lecciones aportan sus manos mediante `detalle.mano`. El visor público consume su proyección de lectura.

La presentación usa la vista autorizada, su conjunto de acciones legales y los bloqueos de envío, conexión y presentación. Los adaptadores conservan los nombres de los cantos y el contexto del formato. El envío pasa por el comando versionado de la mesa. React y CSS resuelven la composición. El slot es un hijo de React y su contrato se acuerda antes de integrar los adaptadores. [Cliente de mesa](https://github.com/flabat/truco-uruguayo/blob/c9b662b/src/components/jugar/cliente.ts) · [Sala](https://github.com/flabat/truco-uruguayo/blob/c9b662b/src/components/jugar/Sala.tsx).

## Alternativas consideradas

| Alternativa | Implicación |
| --- | --- |
| Mantener panel lateral y adelantar el tapete con CSS | Permite un arreglo rápido de la altura. El orden del DOM y la distancia entre mano y respuestas necesitan trabajo propio. |
| Flotar botones sobre el centro o los puestos | Acerca la acción al juego. El área interactiva puede cubrir cartas, la muestra, nombres largos o el foco al variar el ancho y el reparto. |
| Reservar una fila para la zona de juego | Hace predecible el lugar de la acción, el orden del DOM y el área que se puede tocar. Requiere compactar el resto de la mesa en horizontal de poca altura. |

## Consecuencias

La zona compartida necesita pruebas en tamaños y formatos distintos. Las instantáneas deben incluir una respuesta obligatoria y el cierre de una mano, además de la apertura. Las pruebas de teclado cubren el reemplazo del botón enfocado y las actualizaciones que llegan mientras el usuario lee el historial. El PR de integración verifica también las proyecciones públicas y privadas. [Plan de trabajo](../plan-controles-tapete.md).
