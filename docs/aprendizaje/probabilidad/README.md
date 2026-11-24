# ¿Con qué carta tiene más chances de ganar la mano tu pareja?

**Primera lección de probabilidad.** El aprendiz elige en el tapete. Puede confirmar su jugada enseguida, consultar las chances de su pareja antes de tirar o volver a esa decisión en el repaso. La medida es la probabilidad de que su pareja gane la **mano completa** de truco uruguayo 2 contra 2, dadas las cartas que podía conocer en ese momento y la forma de jugar acordada para los cuatro asientos. [Decisión estadística](../adr/0003-probabilidad-condicionada.md) · [Decisión de interfaz](../adr/0004-leccion-react-worker.md) · [Plan e issues](plan.md) · [Resultados verificados](validacion.md)

## Qué va a poder explicar el aprendiz

- Por qué asegurar la primera vuelta puede dejar peores chances de ganar la mano.
- Cómo una carta pública cambia las posibilidades del compañero y de los rivales, y cuándo vale la pena guardar o gastar una pieza.
- Qué significa «ganó en unas 69 de cada 100 manos posibles con estos jugadores». La explicación identifica las cartas conocidas, el modo de jugar de los bots y la variación entre repartos. Una sola derrota también es compatible con esa estimación.

La unidad de práctica es una **decisión de carta**. Participan vos (asiento 0), tu compañero (2) y los rivales (1 y 3). Se juega hasta que el motor adjudica las vueltas, con sus reglas de pardas y cierre temprano. El tanteador del partido, los cantos, las señas y las creencias sobre rivales humanos quedan para modelos posteriores. La probabilidad de ganar una vuelta se puede mencionar cuando se deduce directamente de la posición. La cifra que se compara en todas las filas es la de ganar la mano. [Motor de la mano](../../../paquetes/motor/src/mano.ts) · [Antecedente de aprendizaje estratégico](../adr/0002-lecciones-y-progreso.md)

## Primera decisión · salir o guardar la pieza

Sos mano. Tenés **2 de copas, 3 de bastos y 5 de oros**. La muestra es el **6 de copas**. El 2 de copas es la pieza mayor y asegura la primera vuelta. El tapete conserva el orden del reparto. Si abrís «Ver chances», la tabla compara las tres salidas sobre los mismos 20.000 repartos posibles.

| Carta de salida | Manos que ganó la pareja | Presentación al aprendiz |
| --- | ---: | ---: |
| 2 de copas | 12.023 / 20.000 | 60,1 % |
| 3 de bastos | 13.779 / 20.000 | 68,9 % |
| 5 de oros | 12.530 / 20.000 | 62,7 % |

Con el 3, tu pareja ganó **unas 9 manos más de cada 100** que con el 2. En 2.100 repartos ganó sólo con el 3 y en 344 ganó sólo con el 2. La diferencia neta es 1.756 de 20.000, o **8,78 puntos porcentuales**. El desenlace coincidió en los otros 17.556. La explicación invita a mirar un reparto donde se entiende la diferencia. El caso 44 del estudio permite perder la primera con el 3, ganar la segunda con el 2 y dejar que el compañero gane la tercera. El informe incluye la secuencia completa y cómo repetirla. [Estudio de salidas y diferencias pareadas](../../investigacion/salidas/README.md)

## Segunda decisión · gastar la pieza ahora

La siguiente posición del caso 44 se abre directamente como otro ejercicio. Mostrar las cartas a medida que se recorre el historial y detenerse **antes** de la segunda jugada del aprendiz.

| Vuelta | Jugadas públicas, en orden |
| --- | --- |
| Primera | Vos, 3 de bastos · rival derecho, caballo de copas · compañero, 4 de espadas · rival izquierdo, 4 de oros. Ganan los rivales. |
| Segunda, hasta tu turno | Rival derecho, 6 de oros · compañero, 3 de copas · rival izquierdo, 5 de copas. Te quedan 2 de copas y 5 de oros. |

| Carta en el turno actual | Manos que gana la pareja | Probabilidad en el modelo |
| --- | ---: | ---: |
| 2 de copas | 692 / 1.175 | 58,9 % |
| 5 de oros | 0 / 1.175 | 0 % |

El rival ya tiene una vuelta y está ganando la segunda con el 5 de copas, una pieza. Si tirás el 5 de oros, la mano termina ahí. El 2 de copas gana esa vuelta y abre una tercera. En **692** mundos gana tu pareja jugando el 2 y pierde jugando el 5. En los otros **483** pierde con ambas. Acá «exacta» quiere decir que se contaron todos los repartos que satisfacen el modelo de esta lección. En la apertura se tomó una muestra. El contraste entre ambas decisiones da sentido a la pregunta «¿cuándo guardarías la pieza?». [Oráculo de recuento](../adr/0003-probabilidad-condicionada.md#dos-controles-reproducibles)

## Recorrido jugable

| Momento | Acción del aprendiz y respuesta de la lección |
| --- | --- |
| Entrar | Desde Aprender se puede abrir directamente `/aprender/probabilidad/`. Mostrar el objetivo, quién juega con quién, la muestra y el caso de apertura. El ejemplo editorial también se puede leer con JavaScript desactivado. |
| Elegir | Las cartas propias están boca arriba junto a «Vos». Se puede elegir con puntero, Tab y Enter o Espacio. La marca en la carta y el nombre en «Jugar» indican la selección. |
| Consultar | Cada turno propio inicia una comparación. «Ver chances» muestra el resultado en el orden de la mano y «Ocultar chances» lo vuelve a guardar. Cambiar de carta actualiza la explicación. Las cifras describen las victorias de tu pareja con estos bots. |
| Jugar | «Jugar [nombre]» confirma una sola carta. Los otros asientos avanzan con el motor hasta el turno del aprendiz o el cierre. La confirmación está disponible aunque el cálculo siga pendiente, se haya cancelado o falle. En un turno con una sola carta se puede explicar su probabilidad, sin sugerir una elección. |
| Repasar | Retroceder recupera la vista pública de ese prefijo. Una carta jugada vuelve a la mano si se retrocede a su turno. Se pueden explorar las alternativas y volver al presente con la jugada y la selección originales. |
| Transferir | Abrir el segundo ejercicio aunque el reparto jugado haya seguido otra línea. «La salida» y «La segunda vuelta» se agrupan en «Ejemplos guiados». «Repartir otra mano» crea un reparto V1 nuevo. El panel indica la vuelta en juego o en el cursor. La predicción y la victoria real son ocasiones de reflexión y no suman aciertos a las habilidades existentes. |

El caso editorial de apertura se puede jugar con el reparto V1 de semilla **830838**, dador 3. El caso editorial intermedio proviene del muestreo del **estudio 44**, que tiene un generador distinto. Asociar ese escenario a su definición versionada y a las jugadas confirmadas. El replay V1 del motor corresponde a repartos generados por `repartir`. En ambos casos el proveedor de análisis recibe sólo la vista proyectada hasta el cursor. [Estudio original](../../investigacion/salidas/README.md) · [Replay V1](../../../paquetes/motor/src/replay.ts)

## Probabilidades durante la mano guiada

En `/aprender/mano/`, ofrecer «Comparar mis cartas» al llegar al turno del aprendiz en la fase de juego. El panel comparte exactamente el cálculo y los textos de método con la lección. Abrirlo, cerrarlo o seleccionar una alternativa conserva el turno y la selección de la mesa. Una carta jugada, un nuevo reparto, un cambio de cursor o la salida de la página invalidan el pedido anterior. Durante una pausa de flor o tantos siguen vigentes las reglas de ayuda de esa actividad. En un turno ajeno del replay se puede seguir navegando. En una mano terminada se muestra el ganador y acceso a decisiones anteriores. [Controlador actual](../../../src/aprendizaje/mano-guiada.ts)

## Cómo presentar el resultado

Usar una frase corta como «Con el 3 de bastos, tu pareja ganó 13.779 de 20.000 manos simuladas». Redondear sólo para mostrar. En un empate exacto, nombrar las cartas equivalentes por probabilidad. Si el azar de muestreo impide distinguir dos opciones, decir «Con esta muestra, la diferencia entre estas cartas queda abierta». Una explicación causal específica de una mano incluye sus jugadas y se rotula «un ejemplo». En práctica libre, preferir los hechos calculados a una explicación estratégica inventada.

La mesa conserva el orden espacial y los nombres accesibles Tatú. En móvil, las filas de comparación van debajo de la mesa y se leen sin desplazar la página horizontalmente. Indicar la elección también con texto. El teclado permite predecir, comparar, jugar y repasar. Anunciar un resultado completo una vez, conservar el foco al llegar un cálculo y devolverlo al control adecuado al cerrar. Mientras calcula, se puede seguir jugando. Si falla y hay una referencia certificada para esa misma posición y configuración, usarla con su etiqueta. En otra posición mostrar «No pudimos calcular estas chances» y ofrecer reintentar.

## Cuándo está lista

Se puede recorrer desde el sitio estático, resolver las dos decisiones y probar una tercera mano. Para la misma posición pública y el mismo perfil, lección, panel y replay dan idénticos conteos. Existen pruebas numéricas independientes para ambas referencias, una prueba de dos repartos reales indistinguibles al aprendiz y un recorrido de teclado que incluye una respuesta tardía del worker. Los presupuestos de cálculo y los responsables de verificar cada condición figuran en el [plan de implementación](plan.md).
