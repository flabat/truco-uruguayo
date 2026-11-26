# Un salón con partidas en vivo

Al entrar a **Jugar**, una persona puede mirar una mano de truco antes de decidir si quiere jugar. En una noche sin jugadores encontrará seis exhibiciones reales, tres duelos y tres mesas de parejas. Cada una lleva la etiqueta **Exhibición · Solo computadoras**. Cuando juegan personas, sus mesas públicas aparecen primero. La promesa al recién llegado es que hay truco para mirar. La cantidad de personas presentes es una pregunta distinta.

**Acuerdos de producto.** En duelo y parejas, las mesas humanas nuevas se listan de forma predeterminada y el anfitrión puede elegir una mesa privada. En horas tranquilas buscamos seis partidas en total, con ambos formatos disponibles. A medida que llegan personas, las exhibiciones en curso terminan su chico. Las cifras de ritmo, disponibilidad y medición que siguen son propuestas para el piloto. [Issue de diseño](https://github.com/flabat/truco-uruguayo/issues/227)

**Publicación.** El salón se entrega directamente a las cuentas autenticadas. La decisión posterior al diseño reemplaza el piloto de cohortes. El operador puede cambiar la meta de seis partidas, pausar las exhibiciones y reanudar las manos en curso. [Decisión de lanzamiento](https://github.com/flabat/truco-uruguayo/issues/244) · [Operación del salón](operacion.md)

## El primer minuto

1. Después del ingreso, **Mesas en juego** aparece en el salón junto a **Crear una mesa**. Si la persona viene por una invitación o intenta volver a su asiento, aterriza en el destino que eligió. Mirar tiene su propio enlace y conserva el acceso a **Volver a mi mesa**.
2. Cada fila responde tres preguntas antes del clic. Por ejemplo, **Parejas · 2 personas y 2 computadoras**, **Mano 3 · 12 a 8 de 40**, **Mirar mesa**. Otra puede decir **Duelo · Exhibición · Solo computadoras**, **Mano 1 · 2 a 0 de 40**. Se ordenan primero las mesas con personas y después las exhibiciones, con orden estable dentro de cada grupo. Los totales se refieren a mesas, y los números de cada fila a asientos. Evitar nombres humanos inventados, indicadores de audiencia simulada y promesas de conversación.
3. Al abrir, **Estás mirando** identifica la vista. El tapete tiene orientación fija, equipos, muestra, última vuelta, tantos y los cantos públicos de la mano. Una frase sitúa a quien llegó tarde, por ejemplo «El equipo 1 quiso el truco. La mano vale dos tantos». Las cartas aparecen cuando se juegan. El historial ayuda a seguir una vuelta aunque se haya pasado a Discord unos segundos.
4. **Voz de esta mesa en Discord** queda visible en la vista de cada partida, también en las exhibiciones. Al activarla se obtiene **Entrar a Discord** para ese juego. Antes de salir se lee «La sala es abierta. Jugadores y espectadores pueden conversar». En una exhibición se agrega «Las computadoras juegan sin audio». La aplicación no afirma quién está hablando. Se puede seguir toda la mano con el sonido apagado.
5. Al terminar, el tanteador conserva el resultado. **Crear mi mesa** invita a probar el juego y **Mirar otra mesa** vuelve al salón. Ninguna de las dos acciones interrumpe un partido ni sustituye a alguien en su asiento.

## Qué hace pública una mesa

El formulario de creación presenta **Mostrar en el salón** marcado, con el texto «Quienes ingresen pueden ver las jugadas y abrir el Discord de esta mesa». Al desmarcarlo se lee **Mesa privada por invitación**. La espera y la entrada por invitación informan la visibilidad de la mesa antes de jugar. Participar sigue requiriendo asiento. Se propone mantener la elección durante ese chico. Se conservan privadas las mesas anteriores, las creadas por clientes que aún no muestran la elección y los ensayos del operador. Los tercetos quedan para una ampliación con proyección propia.

«En juego» exige primer reparto confirmado, chico abierto y actividad reciente. Una mesa esperando asientos, abandonada hace horas o terminada sale del directorio. Una mesa humana vuelve en cuanto registra una nueva jugada pública. Si se corta la conexión, el tapete conserva el último estado con **Reconectando**. Si la lista no carga, permite reintentar y crear mesa. Si queda vacía, dice **Todavía no hay mesas en juego**. El servidor cuenta solo las que de verdad puede mostrar.

## Cómo sabremos si ayuda

La hipótesis es que ver una vuelta comprensible reduce el esfuerzo de sentarse por primera vez. En el piloto, comparar cohortes de primer ingreso con y sin acceso al salón, durante las mismas franjas horarias y con el mismo flujo de creación. La unidad es la persona, una vez por cohorte. La señal principal es la proporción que confirma su **primera jugada** dentro de las 24 horas del ingreso. Así se incluye también a quien empezó directamente a jugar.

Como diagnóstico, contar cuántos ven el salón, abren una mesa, presencian dos jugadas públicas nuevas, piden el enlace de voz y vuelven a jugar dentro de siete días. Separar exhibiciones y mesas con personas. Un clic en Discord mide intención. Para medir confianza, mostrar a principiantes ambas clases de mesa y preguntar «¿Quién estaba jugando?», «¿Qué cartas viste?» y «¿Quién podía escucharte?». Registrar respuestas, errores de comprensión y tiempo hasta ver la primera jugada. Si aumenta el tiempo mirando pero cae la primera jugada o se confunden computadoras con personas, revisar etiquetas y recorrido antes de ampliar. Los eventos de medición llevan categoría y tiempos, sin cartas, identidades de Discord ni invitaciones.

## Decisiones y entrega

- [Cómo retomar tus mesas desde cualquier dispositivo](mis-mesas.md)
- [Cuántas exhibiciones mantener y cómo jugarlas](adr/0001-exhibiciones.md)
- [Qué puede leer un espectador y cómo se actualiza la mesa](adr/0002-vista-espectadora.md)
- [Cómo se abre el mismo Discord desde la tribuna](adr/0003-voz.md)
- [Orden de implementación, aceptación y despliegue](implementacion.md)
