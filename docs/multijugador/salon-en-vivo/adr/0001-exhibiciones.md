# ADR 0001 · Completar el salón con chicos de exhibición

**Estado.** Objetivo de producto acordado. Reposición y ritmo implementados en #231.

## Opciones

Una cantidad fija de seis mesas de computadoras garantiza variedad, pero sigue consumiendo capacidad cuando hay suficientes partidas humanas. Reproducir partidas grabadas es barato y admite pausa, aunque quien entra a mitad de una no está viendo un juego en curso. Completar el salón con exhibiciones en el servidor permite que dos personas sigan el mismo canto en el mismo instante y que el coste baje al crecer la actividad humana.

## Decisión

Un ciclo del servidor mantiene un objetivo de seis chicos observables. Al arrancar y luego, como punto de partida, cada 15 segundos, cuenta mesas públicas en curso con al menos una persona (H) y exhibiciones sanas en curso o ya reservadas (E). Reserva como máximo `max(0, 6 − H − E)` altas. Una reserva cuenta para evitar duplicados, pero aparece en la lista recién con el primer reparto confirmado. Se elige primero el formato menos representado, alternando en empate. Con cinco mesas de parejas y un hueco, se abre un duelo.

| Situación | Decisión del servidor |
| --- | --- |
| Nadie juega al arrancar | Reservar tres duelos y tres parejas. Repartir y escalonar los turnos. |
| Hay dos mesas públicas con personas y una exhibición sana | Abrir tres exhibiciones. Las mesas privadas y las que esperan reparto quedan fuera del cálculo. |
| Aparecen cuatro mesas humanas mientras se miran seis exhibiciones | Mantener los diez chicos. Al terminar cada exhibición se recalcula el faltante. |
| Hay doce partidas humanas | Mostrar las doce, paginadas si hace falta. Se detienen las altas de exhibiciones. |

El intervalo de cinco a diez describe un salón tranquilo con llegadas y cierres. Seis es el objetivo tras la reposición. Las llegadas simultáneas pueden llevar el total por encima de diez y una caída puede llevarlo por debajo de cinco. Medir el tiempo de recuperación y servir el recuento observado.

## Persistencia y operación

Marcar el origen de la mesa (humana, ensayo, exhibición) y su visibilidad por separado. Seis cupos persistentes de exhibición con ocupación única, reservados en una transacción serializada, limitan incluso las altas concurrentes y las mesas trabadas. Un cupo conserva el ID del chico hasta su cierre o retiro por fallo. Reintentar el alta debe encontrar el mismo chico. El creador técnico requerido por el esquema carece de asiento y se excluye de actividad humana. Las mesas mixtas cuentan una sola vez en H.

Reutilizar el árbitro, el reparto, la política fijada al crear la mesa y la confirmación transaccional de turnos. Cada computadora decide desde su propia vista. Los formatos de exhibición son `duel` y `pairs-private-senas`. La exhibición sigue sin clientes conectados. Guardar el próximo instante elegible por mesa y confirmar una sola acción por turno, también con la política básica. Probar cuatro segundos entre acciones y ocho al cierre de mano. Ajustar observando si un principiante alcanza a leer un canto y su respuesta.

El bucle actual de ensayos busca trabajo al terminar cada turno y procesa mesas con `solo_computadoras`. Separar por origen tanto la selección de la próxima mano como la de turnos pendientes, para que ese bucle no adelante una exhibición. Dar prioridad a mesas humanas y limitar el trabajo simultáneo de exhibición. Después de un reinicio, recuperar desde el último turno confirmado y la versión guardada, sin reproducir una ráfaga de turnos vencidos. Ante un fallo repetido, quitar la mesa de la lista, reintentar con espera creciente y liberar su cupo al retirarla. Los espectadores ven que se interrumpió.

Propuesta de frescura inicial: último hecho público en los últimos cinco minutos para mesas humanas y 60 segundos para exhibiciones. La lectura de un espectador, la voz y los gestos privados no renuevan esa marca. Separar la retención y medir el almacenamiento de exhibiciones antes de dejarlas en marcha permanente. Clasificación, perfiles y métricas de jugadores excluyen los asientos técnicos. Entrenamiento y evaluación permanecen entre computadoras, fuera del tráfico de espectadores y de las partidas humanas. [Ensayos actuales](../../../../api/ensayos.ts) · [Confirmación de turnos](../../../../api/bot-pendiente.ts)

## Activación y recuperación

Con `EXHIBICIONES_HABILITADAS=1` en el servicio API de Compose, el servidor repone los cupos al arrancar y revisa el faltante cada 15 segundos. El valor inicial es `0` para preparar el piloto. Al volver a `0` y recrear la API, los chicos ya reservados terminan y se suspenden las altas. La primera mano se escalona por cupo. Después de cada acción se esperan cuatro segundos hasta el próximo turno u ocho si toca repartir otra mano.

PostgreSQL concede un solo paso de exhibición a la vez entre instancias. El trabajador cede si hay una decisión de computadora pendiente en una mesa humana. La acción, el replay y la nueva fecha se confirman juntos. Al perder la conexión antes de confirmar, el siguiente proceso retoma el turno. El primer fallo oculta la mesa del directorio y permite reintentar a los ocho segundos. El segundo espera dieciséis segundos. El tercero retira el chico, elimina su turno pendiente y deja enfriar ese cupo durante cinco minutos.

En la prueba de integración, dos procesos reponen seis cupos sobre una base descartable y el reloj simulado permite recorrer los seis chicos hasta el cierre. El piloto de capacidad y retención se sigue en [#234](https://github.com/flabat/truco-uruguayo/issues/234).
