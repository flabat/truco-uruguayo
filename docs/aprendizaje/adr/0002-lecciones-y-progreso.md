# ADR 2 · Lecciones por habilidad, generación y evidencia de aprendizaje

**Estado.** Propuesto para la primera implementación. Las políticas numéricas iniciales se pueden ajustar con observaciones de principiantes.

## Contexto

Los principiantes suelen elegir el número más alto, olvidar qué cartas son piezas y perder la cuenta al seleccionar cartas para flor o envido. Necesitan manos variadas, ayuda al equivocarse y libertad para practicar un tema. El catálogo debe admitir nuevas lecciones después de publicar la primera ruta.

## Decisión

Una definición TypeScript identifica la lección, la habilidad, las familias de situaciones, los pasos, los textos de ayuda y el capítulo de consulta. La sesión coordina generador, evaluador e interacción. El control visual recibe los datos que necesita para ese paso. Las respuestas se corrigen con el motor de reglas. La mesa guiada puede invocar una pausa didáctica en el turno actual y entregar el control al simulador después de la respuesta.

| Dato | Ejemplo o significado |
| --- | --- |
| Habilidad y familia | `contar-envido` y `una-pieza`. Una misma habilidad admite varias familias. |
| Situación | Identificador reproducible, semilla, muestra y cartas relevantes. Usar una firma del contenido para detectar que dos semillas ofrecieron el mismo problema, incluso al reordenar opciones. |
| Paso | Elegir una o más cartas, responder sí/no o ingresar un total. Cada paso incluye consigna y forma de comprobar la respuesta. |
| Intento | Habilidad, familia, situación, paso, resultado y uso de pista. Distinguir seleccionar cartas de calcular el total permite orientar la ayuda. |
| Progreso | Resumen por habilidad, fallos recientes, casos acreditados y una ventana acotada de situaciones recientes. Guardar formato versionado en el dispositivo. |

**Variedad con propósito.** Elegir la familia antes de repartir. Para jerarquía, incluir casos donde gana el número mayor, gana el menor y hay empate. Para flor, alternar formas de flor y negativas plausibles. Generar sin duplicar cartas, acotar los intentos y disponer de una construcción legal para una familia rara. El evaluador confirma la familia y calcula la respuesta. Pruebas con semillas fijas verifican cada familia sin depender de la suerte.

**Pistas y dominio.** Por defecto, el segundo error reciente en la habilidad activa una pista sobre el paso que falló. El aprendiz puede volver a la misma situación y luego recibe una distinta. Una situación aporta a lo sumo un acierto independiente, cuando se resuelve al primer intento y sin pista. Como punto de partida, tres situaciones nuevas resueltas así marcan «Aprendido», con al menos dos familias si la habilidad ofrece dos o más. Para una habilidad con una sola familia bastan tres situaciones distintas. Una repetición, un acierto tras pista o varios pasos acertados en el mismo caso no multiplican la evidencia. El estado Aprendido mantiene disponible la práctica.

**Práctica al volver.** Con historial, la acción principal mezcla habilidades vistas y favorece los errores recientes, conservando oportunidades de repaso para las demás. Con historial vacío, la ruta empieza por jerarquía y reconocimiento de flor. Elegir un tema permite practicarlo enseguida. La sesión usa una fuente local de progreso que tolera recarga, formato desconocido o almacenamiento deshabilitado. En este último caso la sesión sigue en memoria.

**Elecciones de juego.** Elegir el ganador entre dos cartas o calcular tantos tiene una respuesta verificable. Una salida estratégica puede admitir varias cartas. El simulador acepta cualquier jugada legal. El texto puede explicar «guardaste la pieza para la segunda» y la práctica puede pedir identificar la carta ganadora en un ejercicio explícito. Ganar la mano y acertar una pregunta son eventos diferentes.

## Opciones y consecuencias

Un banco de preguntas escritas a mano facilita el control editorial y resulta útil para ejemplos guiados. La generación por familias añade variedad y permite corregir con la misma regla que se usa en la mesa. Un lenguaje de autoría independiente permitiría incorporar editores externos, con un coste de validación y mantenimiento. Para la primera ruta, una definición tipada permite revisar cada lección y sus pruebas en el mismo PR.

El progreso local permite usar la práctica en GitHub Pages. Se conserva en ese navegador y dispositivo. Un nuevo dispositivo empieza sin historial. Las sesiones se prueban con un generador y un almacenamiento inyectables para comprobar pistas, avance y recuperación sin depender del navegador.
