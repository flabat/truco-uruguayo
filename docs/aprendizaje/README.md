# Diseño de la ruta de aprendizaje

La ruta está pensada para quien practica a solas y quizá conoce la conga, pero recién empieza a jugar al truco con muestra. En los primeros cinco minutos debería poder comparar dos cartas y reconocer flor en una mano nueva. Al terminar el primer tramo debería saber qué cartas contar, cuánto vale una pieza y cómo elegir su primera carta en una mesa de parejas.

El primer entregable técnico es una mano completa que se [juega y reproduce desde la terminal](simular.md). La misma lógica se usa después en la práctica y en la mesa del navegador. El [plan de implementación](plan.md) muestra los issues, el orden de integración y las oportunidades de trabajo paralelo. El [issue de seguimiento](https://github.com/flabat/truco-uruguayo/issues/15) reúne las entregas.

## Qué comparte una lección con el simulador

| Componente | Qué recibe y qué entrega | Quién lo usa |
| --- | --- | --- |
| Reglas | Cartas y muestra. Devuelve pieza efectiva, comparación o tantos con las cartas y los sumandos de la cuenta. | Generadores, corrección de ejercicios, mesa y jugadores automáticos. |
| Reparto y mano | Semilla y dador para repartir. Estado y jugada para avanzar un turno, cerrar una vuelta o terminar la mano. | Simulación por terminal, replay y mesa guiada. |
| Generador | Habilidad, familia de casos y semilla. Devuelve una situación legal identificable, lista para evaluar con las reglas. | Lección de un tema y práctica mixta. |
| Sesión de aprendizaje | Definición de lección, situación y acciones del aprendiz. Conserva intentos, ofrece pistas y registra evidencia por habilidad. | Ruta y pausas didácticas de la mesa. |
| Interfaz Astro | Vista pública de mesa y mano propia, o situación de ejercicio. Convierte toques y teclado en respuestas o jugadas. | Páginas estáticas con interacción en el navegador. |

La galería ya contiene los nombres e imágenes Tatú. El motor modela las 40 cartas del truco con las mismas claves. El catálogo completo incluye también otros rangos, comodines y el reverso. La interfaz resuelve la imagen y el texto accesible con el catálogo y la ruta base del sitio. [Catálogo](../../src/lib/cartas.ts) · [Componente Carta](../../src/components/Carta.astro)

## Dos recorridos sobre el mismo motor

**Un ejercicio corto.** La sesión elige «contar envido con una pieza». El generador entrega, por ejemplo, muestra de 6 de bastos, 4 de bastos, 7 de copas y as de espadas. La evaluación devuelve 36 y las contribuciones 29 y 7. La selección de cartas y el total son dos respuestas distintas. Si el aprendiz identifica las dos cartas y falla la cuenta, la pista puede concentrarse en el valor del 4. Una selección de igual valor también debe aceptarse cuando hay varias óptimas.

**Una mano guiada.** La primera vez el aprendiz es mano. Ve sus tres cartas, la muestra y los asientos de su compañero, enfrente, y de los dos rivales. Antes de la salida, la sesión consulta al evaluador para reconocer flor y contar los tantos pertinentes. Esa pausa conserva el turno. Al jugar una carta, el simulador valida la jugada y avanza. Los otros tres asientos usan el mismo mecanismo hasta que el aprendiz vuelve a jugar o la mano termina. La explicación de una salida describe la consecuencia de la jugada. El resultado de la mano y la evidencia de aprendizaje se registran por separado.

**Repetir o repartir.** Una pista permite volver a intentar la situación actual. Un replay reconstruye esa partida con sus jugadas originales. «Repartir de nuevo» elige otro reparto, evita repetir el anterior y rota el dador. Cada comportamiento tiene su propia prueba.

## Jugar en la mesa de parejas

En **Aprender**, elegí **Jugar una mano guiada**. La primera vez sos mano. Frente a vos se sienta tu compañero, con un rival a cada lado. Los dorsos indican cuántas cartas les quedan. Cada carta jugada aparece junto al asiento que la tiró.

Primero decidí si tenés flor. Marcá las cartas que cuentan para tu flor o tu envido y escribí el total. Podés pedir una pista y volver a intentar sobre el mismo reparto. Después, tocá una carta de tu mano para jugarla. Con el teclado, usá Tab para elegir el control y Enter o Espacio para activar una carta. Los otros tres asientos juegan hasta que te toca de nuevo o se define la mano. En **Vueltas jugadas**, abrí una vuelta para consultar el orden de sus cartas.

Al terminar, **Reproducir la mano** te deja avanzar y retroceder por las jugadas originales. **Repartir de nuevo** pasa el mazo un asiento a la derecha y cambia el reparto. Al recargar o volver desde las reglas en la misma pestaña, se retoma el paso, el turno o la jugada de la reproducción. La pestaña conserva la mesa mientras el navegador permita guardarla. El progreso por habilidad se guarda por separado en el dispositivo.

## Cómo agregar una lección

La ruta publicada ofrece cinco temas abiertos. El recorrido inicial empieza con una comparación y sigue con una decisión de flor. Cada tema presenta una mano resuelta antes de repartir para practicar. El ejemplo explica las cartas y, cuando corresponde, muestra los sumandos del motor. Solo las manos de práctica aportan al progreso.

Para agregar una lección centrada en una flor aparente:

1. Partí de `reconocerFlor` en el [catálogo de lecciones](../../src/aprendizaje/lecciones/index.ts). Dale un `id` propio, conservá la habilidad `reconocer-flor` y elegí la familia `flor-aparente`. En esa familia una pieza acompaña a dos cartas de palos distintos. El [generador](../../src/aprendizaje/generadores/index.ts) prepara las manos y el [evaluador](../../src/aprendizaje/generadores/evaluacion.ts) corrige la decisión y explica los errores.
2. Escribí el título, el resumen y la orientación. Para el ejemplo podés usar muestra de 6 de bastos con 4 de bastos, 7 de copas y as de espadas. Explicá por qué falta flor. Conservá el capítulo `flor` y el paso `decidir-flor`, que ya muestra «Tengo flor» y «Sin flor». Para una lección de cuenta se pueden combinar `elegir-cartas` y `responder-total`.
3. Agregá la definición a `temas`. La lista y la práctica por tema leen ese catálogo. Las lecciones de una misma habilidad comparten su historial. La práctica mixta elige por habilidad y usa la primera definición de esa habilidad.
4. Probá la respuesta correcta, un error seguido de pista y una mano distinta al repetir. Hay un [ejemplo ejecutable de esta ampliación](../../tests/unit/lecciones.test.ts) y [pruebas de los controles en escritorio y móvil](../../tests/aprender.spec.mjs). Ejecutá `npm run check` para comprobar ambos montajes del sitio.

## Límites de la primera entrega

Los tantos de una mano enseñan qué se puede cantar. El resultado de las vueltas identifica al equipo que gana la mano. La siguiente parte de la ruta podrá introducir cantar truco, quiero y no quiero y el tanteador de apuestas. El estudio de probabilidades podrá comparar políticas de salida en repartos reproducibles. Para comparar mesas de dos y cuatro jugadores habrá que definir además el modo mano a mano. La primera entrega juega cuatro asientos.

El sitio conserva la consulta rápida de reglas. Los dos registros explican las decisiones y los costos de mantenimiento. [ADR 1 · Motor y replay](adr/0001-motor-y-replay.md) · [ADR 2 · Lecciones y progreso](adr/0002-lecciones-y-progreso.md)
