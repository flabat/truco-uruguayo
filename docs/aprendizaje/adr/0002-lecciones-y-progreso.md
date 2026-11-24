# ADR 2 · Lecciones por habilidad, generación y evidencia de aprendizaje

**Estado.** Decisión aceptada e implementada. Las lecciones y la mesa guiada comparten la sesión didáctica y el progreso por habilidad. [Sesión y progreso #36](https://github.com/flabat/truco-uruguayo/pull/36) · [Ruta de aprendizaje #45](https://github.com/flabat/truco-uruguayo/pull/45) · [Mesa guiada #48](https://github.com/flabat/truco-uruguayo/pull/48)

## Contexto

Los principiantes suelen elegir el número más alto, olvidar qué cartas son piezas y perder la cuenta al seleccionar cartas para flor o envido. Necesitan manos variadas, ayuda al equivocarse y libertad para practicar un tema. El catálogo debe admitir nuevas lecciones después de publicar la primera ruta.

## Decisión

Una definición TypeScript identifica la lección, la habilidad, las familias de situaciones, los pasos, los textos de ayuda y el capítulo de consulta. El control visual recibe los datos que necesita para ese paso. En la práctica, `generarSesion` pide una situación al generador. En la mesa guiada, `iniciarSesion` abre la pausa con las cartas visibles del reparto y conserva el turno. En ambos recorridos el evaluador corrige las respuestas con el motor de reglas. [Catálogo de lecciones](../../../src/aprendizaje/lecciones/index.ts) · [Generadores](../../../src/aprendizaje/generadores/index.ts) · [Sesión](../../../src/aprendizaje/sesion.ts)

| Dato | Ejemplo o significado |
| --- | --- |
| Habilidad y familia | `contar-envido` y `una-pieza`. Una misma habilidad admite varias familias. |
| Situación | Identificador reproducible, semilla, muestra y cartas relevantes. Usar una firma del contenido para detectar que dos semillas ofrecieron el mismo problema, incluso al reordenar opciones. |
| Paso | Elegir cartas, decidir si hay flor o ingresar un total. Cada paso lleva una consigna y una pista. |
| Intento | Habilidad, familia, situación, paso, resultado y uso de pista. Distinguir seleccionar cartas de calcular el total permite orientar la ayuda. |
| Progreso | Resumen por habilidad, fallos recientes, casos acreditados y una ventana acotada de situaciones recientes. Guardar formato versionado en el dispositivo. |

**Variedad con propósito.** Elegir la familia antes de repartir. Para jerarquía, incluir casos donde gana el número mayor, gana el menor y hay empate. Para flor, alternar formas de flor y negativas plausibles. Generar sin duplicar cartas, acotar los intentos y disponer de una construcción legal para una familia rara. El evaluador confirma la familia y calcula la respuesta. Pruebas con semillas fijas verifican cada familia sin depender de la suerte.

**Pistas y consulta de reglas.** El aprendiz puede pedir una pista y reintentar el mismo paso. Si al equivocarse acumula al menos dos errores en las últimas ocho respuestas de esa habilidad, la sesión muestra la pista del paso. Abrir «Regla para esta mano» durante un desafío llama a `consultarRegla()` y cuenta como ayuda porque puede revelar la respuesta. El capítulo completo se abre en otra pestaña para poder volver al mismo paso y terminar la mano. En el ejemplo resuelto y en el repaso de una mano terminada la consulta es libre. [Consulta de reglas #51](https://github.com/flabat/truco-uruguayo/pull/51)

**Cuándo se marca «Aprendido».** Una situación nueva aporta un solo acierto independiente al completar todos sus pasos al primer intento, sin pista ni consulta de la regla. La sesión reconoce una mano ya vista por la muestra y las cartas, aunque cambien la semilla o el orden de las opciones. La política inicial exige tres situaciones acreditadas de la habilidad que cubran al menos dos familias disponibles. Si la habilidad ofrece una sola familia, bastan tres situaciones distintas de esa familia. Se puede seguir practicando después de alcanzar «Aprendido». Los umbrales son configurables para poder ajustarlos con observaciones de principiantes. [Política de progreso](../../../src/aprendizaje/progreso.ts) · [Pruebas de dominio](../../../tests/unit/progreso.test.ts)

**Práctica al volver.** Con historial, la acción principal mezcla habilidades vistas y favorece los errores recientes, conservando oportunidades de repaso para las demás. Con historial vacío, la ruta empieza por jerarquía y reconocimiento de flor. Elegir un tema permite practicarlo enseguida. La sesión usa una fuente local de progreso que tolera recarga, formato desconocido o almacenamiento deshabilitado. En este último caso la sesión sigue en memoria.

**Elecciones de juego.** Elegir el ganador entre dos cartas o calcular tantos tiene una respuesta verificable. Una salida estratégica puede admitir varias cartas. El simulador acepta cualquier jugada legal. El texto puede explicar «guardaste la pieza para la segunda» y la práctica puede pedir identificar la carta ganadora en un ejercicio explícito. Ganar la mano y acertar una pregunta son eventos diferentes.

## Opciones y consecuencias

Un banco de preguntas escritas a mano facilita el control editorial y resulta útil para ejemplos guiados. La generación por familias añade variedad y permite corregir con la misma regla que se usa en la mesa. Un lenguaje de autoría independiente permitiría incorporar editores externos, con un coste de validación y mantenimiento. Para la primera ruta, una definición tipada permite revisar cada lección y sus pruebas en el mismo PR.

Quien practica como invitado conserva su progreso en el mismo navegador y dispositivo. Un nuevo dispositivo empieza sin historial. Las sesiones se prueban con un generador y un almacenamiento inyectables para comprobar pistas, avance y recuperación sin depender del navegador.
