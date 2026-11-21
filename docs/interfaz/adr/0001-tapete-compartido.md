# ADR 0001 · Un tapete para jugar, mirar y aprender

**Estado.** Decisión para [#258](https://github.com/flabat/truco-uruguayo/issues/258). La primera entrega de duelo y parejas corresponde a [#259](https://github.com/flabat/truco-uruguayo/issues/259). La segunda incorpora tercetos y las mesas interactivas de aprendizaje.

## Contexto

La vista espectadora de parejas dibujaba una muestra suelta en el centro. La API ya identificaba al dador y a la muestra. La mesa de jugador aplicaba la convención acordada en [#114](https://github.com/flabat/truco-uruguayo/issues/114): la derecha se mide desde el asiento del dador mirando al centro. El mazo atravesado cubre la mitad inferior de la muestra. Arreglar únicamente el visor o compartir solo las imágenes dejaría las reglas de posición y de vuelta duplicadas.

## Decisión

El tapete compartido recibe asientos con identificadores físicos, el asiento situado abajo, el dador, el mano, la muestra y la vuelta visible con su resultado cuando corresponde. La disposición de dos, cuatro o seis asientos depende de la orientación. Para jugar, el asiento de quien mira queda abajo. Para mirar, queda abajo el asiento cero. El tapete ubica mazo y muestra, conserva el índice y el palo visibles y dibuja cartas jugadas, ganadores y pardas.

Las vistas deciden qué momento mostrar. El jugador conserva sus pausas de presentación, el espectador actualiza su instantánea pública y una lección puede retroceder. Las vistas también preparan sus etiquetas y controles. El jugador puede aportar sus cartas, avisos y pruebas de tantos desde su vista autorizada. Cuando un puesto no muestra una jugada ni una prueba, el tapete calcula sus dorsos como tres cartas menos las jugadas públicas de ese asiento. El jugador y la lección reservan ese espacio para sus propias cartas. En el visor se aplica a todos los asientos. Si una prueba contiene la carta jugada, la muestra en la propia prueba con su indicador de vuelta.

La API espectadora [proyecta los hechos públicos antes de enviarlos](../../multijugador/salon-en-vivo/adr/0002-vista-espectadora.md). Una seña y la misma jugada en silencio producen la misma respuesta para el espectador.

## Tercetos

Los seis asientos ocupan sus posiciones alrededor del tapete también a 320 px. El asiento de quien mira queda abajo, su rival opuesto arriba y los demás se ubican a ambos lados. El mazo y la muestra siguen la derecha de quien da, con la misma superposición de duelo y parejas. En redondilla están activos los seis. En pico a pico la vista indica los dos asientos activos de cada lance y conserva las seis posiciones, el dador y la muestra del reparto.

La vista de tercetos sigue encargándose de las pausas de los cantos, las pruebas de tantos y el historial por lance. La prueba de seis navegadores verifica la orientación desde cada asiento, el mazo y la reconexión. Un reparto de referencia recorre los tres duelos y comprueba que cambia la pareja activa, el mazo sigue en el mismo asiento y solo se habilita la mano propia cuando corresponde.

## Aprendizaje

La mano guiada, la lección de truco y la de probabilidad usan el tapete de parejas con «Vos» abajo y la muestra junto al dador. El adaptador compartido decide qué vuelta mostrar durante el repaso y aporta las cartas seleccionables y los rótulos que ayudan a reconocer las jugadas. Cada lección conserva sus pasos, pistas, cálculos, controles y foco. Las demostraciones que ilustran una carta suelta en la guía pueden seguir centrando la muestra.

La mano guiada comprueba selección y foco con teclado, estabilidad de la muestra en el repaso y traslado al cambiar el dador. La lección de truco comprueba el canto, la respuesta y el repaso hacia atrás. Probabilidad comprueba selección, foco y privacidad de las otras manos al recorrer un reparto. Las pruebas reutilizan la comprobación de superposición y posición a la derecha del dador. Playwright ejecuta estos recorridos en escritorio y móvil.

## Capturas de verificación

Las capturas se generan con `CAPTURAS_TAPETE` durante las pruebas de navegador.

| Vista | Escritorio | 320 px |
| --- | --- | --- |
| Tercetos, tercer duelo | [1280 px](../capturas/tercetos-1280.jpg) | [320 px](../capturas/tercetos-320.jpg) |
| Mano guiada | [1280 px](../capturas/mano-guiada-1280.jpg) | [320 px](../capturas/mano-guiada-320.jpg) |
| Lección de truco | [1280 px](../capturas/truco-1280.jpg) | [320 px](../capturas/truco-320.jpg) |
| Lección de probabilidad | [1280 px](../capturas/probabilidad-1280.jpg) | [320 px](../capturas/probabilidad-320.jpg) |

## Decisiones posteriores

La composición de las acciones en una mesa activa se especifica en el [ADR 0002](0002-controles-en-el-tapete.md). La invitación a girar el celular y los estados que deben conservarse se describen en el [ADR 0003](0003-orientacion-en-celulares.md).
