# Ejemplos resueltos al entrar y volver a un tema

Quien elige **Encontrar las piezas** por segunda vez puede querer otra explicación o estar listo para jugar. La propuesta es abrir con otra mano explicada y poner **Ir a practicar** junto al título. En la primera visita también hay variedad. Dos personas pueden recibir cartas distintas que enseñan la misma regla. [Plan de implementación](plan.md) · [Decisión en GitHub](https://github.com/flabat/truco-uruguayo/issues/83)

## Qué encuentra hoy el aprendiz

Los cinco temas de cartas definen una sola muestra, una mano y un texto. Elegir un tema siempre llama a `abrir(tema, true)`. En la pantalla de piezas, por ejemplo, el 4 de copas siempre está de muestra y el rey siempre lo sustituye. Para llegar a una mano nueva hay que pasar por toda la explicación y tocar «Probar con otra mano». La portada ya invita a volver para probar una mano nueva. En práctica mixta el historial sí determina si conviene abrir con un ejemplo. [Catálogo](../../../src/aprendizaje/lecciones/index.ts) · [Rutas](../../../src/components/aprendizaje/ruta.ts)

## La experiencia propuesta

| Momento | Qué ve o puede hacer |
| --- | --- |
| Elige un tema por primera vez | Ve «Ejemplo resuelto», la pregunta y el botón principal **Ir a practicar** antes del tapete. La muestra, las cartas y una explicación breve forman un ejemplo completo. Al pie aparece **Ver otro ejemplo**. |
| Quiere jugar enseguida | **Ir a practicar** abre «Tu turno» con una mano generada. Un solo toque alcanza también en móvil. |
| Quiere seguir leyendo | **Ver otro ejemplo** cambia la muestra, las cartas y su explicación como una unidad. El foco lleva a la pregunta para recorrer el ejemplo nuevo por teclado o lector de pantalla. |
| Sale a «Todos los temas» y vuelve a elegir el tema, incluso otro día | Recibe el siguiente ejemplo del tema en ese navegador, aunque antes solo haya leído. Puede ir directo a practicar. |
| Recarga el ejemplo o vuelve a esa entrada con Atrás o Adelante | Recupera el ejemplo que estaba leyendo. Un regreso por el historial conserva el punto de lectura. |
| Entra por «Primeros cinco minutos» o práctica mixta | El recorrido inicial sigue pasando por comparación y flor en ese orden. Mixta usa el historial de práctica para decidir cuándo mostrar un ejemplo. Cada vez que alguno de estos recorridos necesita un ejemplo, lo toma del catálogo del tema. |

En la primera entrega, cada tema tendrá tres ejemplos escritos y revisados. Dos permiten introducir la regla y el tercero ofrece un caso de repaso. En un navegador nuevo se sortea una de las dos aperturas por tema. Al volver o pedir otro se elige entre los ejemplos pendientes hasta recorrer los tres. El nuevo ciclo empieza con una mano distinta de la última. El historial de ejemplos empieza con el primer ejemplo visto, aunque la persona ya tenga aciertos guardados de una versión anterior.

### Una visita a «Encontrar las piezas»

Supongamos que sale el **6 de copas** de muestra y aparecen el **5 de copas**, el **5 de espadas** y el **7 de bastos**. La explicación puede decir «El 5 de copas es pieza porque coincide con el palo de la muestra. El 5 de espadas tiene el mismo número, pero es de otro palo. El 7 de bastos conserva su valor común». Las dos cartas con el mismo número ayudan a ver qué cambia al mirar el palo.

El ejemplo actual del **4 de copas** se conserva para el repaso. Ahí el aprendiz ya puede preguntarse qué pasa cuando una de las piezas queda en la mesa. El texto explica por qué el rey de copas ocupa ese lugar y el 5 de copas también es pieza. En una apertura sencilla, la orientación junto al tapete se concentra en reconocer el palo. La regla desplegable sigue disponible para consultar la lista completa y la sustitución.

## Catálogo inicial

Las dos aperturas de cada tema deben funcionar por sí solas. La tabla fija la muestra, las cartas y la observación que la explicación debe ayudar a hacer. En las cuentas, el motor proporciona los sumandos y el resultado para las cartas que efectivamente se muestran. [Evaluación de las situaciones](../../../src/aprendizaje/generadores/evaluacion.ts)

| Tema | Uso | Muestra | Cartas visibles | Qué se aprende |
| --- | --- | --- | --- | --- |
| Comparar dos cartas | Apertura A | 6 de bastos | 2 de bastos, as de espadas | El 2 es pieza y gana incluso al as de espadas. |
| Comparar dos cartas | Apertura B | 6 de oros | As de espadas, 4 de oros | El 4 es pieza y gana desde la otra posición. |
| Comparar dos cartas | Repaso | 6 de copas | 3 de oros, 3 de bastos | Ambas cartas tienen la misma fuerza. Empatan. |
| Reconocer flor | Apertura A | 6 de bastos | 7, 3 y as de copas | Las tres cartas comparten palo y forman flor. |
| Reconocer flor | Apertura B | 7 de copas | As de oros, 6 de oros, 3 de espadas | Hay dos palos y ninguna pieza. Falta flor. |
| Reconocer flor | Repaso | 6 de bastos | 4 de bastos, 7 de copas, 3 de copas | Una pieza completa las dos copas para formar flor. |
| Encontrar las piezas | Apertura A | 6 de copas | 5 de copas, 5 de espadas, 7 de bastos | Solo el 5 de copas es pieza. |
| Encontrar las piezas | Apertura B | 7 de bastos | 4 de oros, 6 de espadas, 4 de bastos | Solo el 4 de bastos es pieza. |
| Encontrar las piezas | Repaso | 4 de copas | Rey de copas, 5 de copas, 4 de espadas | El rey sustituye al 4 de copas. El 5 de copas también es pieza. |
| Contar envido | Apertura A | 6 de bastos | 4 de copas, 7 de copas, as de espadas | Las dos copas suman 20 + 4 + 7 = 31. |
| Contar envido | Apertura B | 6 de espadas | 5 de oros, as de bastos, 3 de oros | Los dos oros suman 20 + 5 + 3 = 28. |
| Contar envido | Repaso | 6 de bastos | 4 de bastos, 7 de copas, as de espadas | La pieza ya incluye la base. Con el 7 suma 29 + 7 = 36. |
| Contar flor | Apertura A | 6 de bastos | 7, 3 y as de copas | Se suma la base una vez, 20 + 7 + 3 + 1 = 31. |
| Contar flor | Apertura B | 6 de espadas | 2, 6 y 4 de oros | Las tres cartas cuentan, 20 + 2 + 6 + 4 = 32. |
| Contar flor | Repaso | 6 de bastos | 4 de bastos, 7 de copas, 3 de copas | La pieza aporta 9 sobre la base, 20 + 9 + 7 + 3 = 39. |

## Elecciones de diseño

Una sola mano permite pulir el texto, pero su respuesta se vuelve predecible. Un reparto libre da más variedad, aunque puede presentar una excepción antes de enseñar la regla. Tres ejemplos revisados por tema permiten elegir la dificultad de la apertura, nombrar cartas concretas y ofrecer una situación distinta al volver. Si alguien quiere ejercitarse durante más tiempo, el generador ya ofrece manos nuevas.

Entrar directamente a «Tu turno» después de la primera visita sería cómodo para quien quiere jugar. Elegir el tema también puede ser una manera de pedir que le expliquen la regla de nuevo. El botón de práctica a la vista y la rotación de ejemplos atienden esas dos intenciones. La propuesta abarca las cinco prácticas por tema. La mano guiada y las lecciones dedicadas de cantos y probabilidad tienen recorridos propios.

## Historial y progreso

Guardar en el navegador los identificadores estables de los ejemplos vistos por tema. Leer explicaciones y consultar la regla del ejemplo son acciones libres. Solo al tocar **Ir a practicar** se abre una sesión de práctica y empiezan a aplicarse las reglas de pistas, intentos y acreditación. La generación debe evitar las tres manos resueltas del tema, incluso si se reordenan las cartas. [Política de progreso](../adr/0002-lecciones-y-progreso.md)

La rotación funciona en memoria durante la visita si el navegador bloquea el almacenamiento. Con un catálogo actualizado, descartar los identificadores retirados y elegir entre los vigentes. El progreso de práctica previo se conserva. El criterio observable es que alguien pueda leer varias explicaciones y volver a la lista con el tema aún en «Sin practicar», o con exactamente los aciertos que ya tenía.
