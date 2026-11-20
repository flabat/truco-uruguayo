# ADR 0001 · Un tapete para jugar, mirar y aprender

**Estado.** Decisión para [#258](https://github.com/flabat/truco-uruguayo/issues/258). La primera entrega de duelo y parejas corresponde a [#259](https://github.com/flabat/truco-uruguayo/issues/259).

## Contexto

La vista espectadora de parejas dibujaba una muestra suelta en el centro. La API ya identificaba al dador y a la muestra. La mesa de jugador aplicaba la convención acordada en [#114](https://github.com/flabat/truco-uruguayo/issues/114): la derecha se mide desde el asiento del dador mirando al centro. El mazo atravesado cubre la mitad inferior de la muestra. Arreglar únicamente el visor o compartir solo las imágenes dejaría las reglas de posición y de vuelta duplicadas.

## Decisión

El tapete compartido recibe asientos con identificadores físicos, el asiento situado abajo, el dador, el mano, la muestra y la vuelta visible con su resultado cuando corresponde. La disposición de dos o cuatro asientos depende de la orientación. Para jugar, el asiento de quien mira queda abajo. Para mirar, queda abajo el asiento cero. El tapete ubica mazo y muestra, conserva el índice y el palo visibles y dibuja cartas jugadas, ganadores y pardas.

Las vistas deciden qué momento mostrar. El jugador conserva sus pausas de presentación, el espectador actualiza su instantánea pública y una lección puede retroceder. Las vistas también preparan sus etiquetas y controles. El jugador puede aportar sus cartas, dorsos, avisos y pruebas de tantos desde su vista autorizada. Si una prueba contiene la carta jugada, la muestra en la propia prueba con su indicador de vuelta.

La API espectadora [proyecta los hechos públicos antes de enviarlos](../../multijugador/salon-en-vivo/adr/0002-vista-espectadora.md). Una seña y la misma jugada en silencio producen la misma respuesta para el espectador.

## Extensión

La disposición de seis asientos debe conservar el mazo junto al dador cuando cambian los participantes activos del pico a pico. Las lecciones interactivas pueden aportar selección de cartas, pistas y controles de repaso a la misma mesa. Las ilustraciones independientes de la guía pueden centrar la muestra.

Cada migración sustituye el tapete anterior y amplía las comprobaciones compartidas. Se verifica el reparto equivalente en las vistas que lo usan, cada lado del dador, el paso a otro reparto y el resultado de vuelta en escritorio y a 320 px. La comprobación geométrica mide la cobertura del mazo y el espacio respecto de nombres, jugadas y controles.
