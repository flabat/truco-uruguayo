# ADR 4 · Computadoras de tercetos

**Estado.** Propuesta para completar mesas con entre uno y cinco rivales o compañeros de computadora.

## Contexto

El servidor puede detener el árbitro cuando hay un humano habilitado y avanzar las computadoras pendientes. La política básica decide desde la vista del asiento y sus acciones legales. Su selección de cartas hoy busca un solo compañero que ya haya jugado. Las políticas entrenadas, las observaciones y los manifiestos de la liga distinguen duelo y parejas y codifican sus capacidades. [Jugador básico](../../../../paquetes/motor/src/jugadores.ts) · [Contratos de entrenamiento](../../../../training/contracts/index.ts) · [Trabajo de bot pendiente](../../../../api/bot-pendiente.ts)

## Decisión

Crear una política básica y versionada para la mesa de seis. Evaluará las cartas ya jugadas por **todos** los compañeros y rivales activos, usando la mejor carta de cada equipo y las reglas de empate. Para los cantos, entregar la misma lista de acciones y la misma información que recibiría una persona en ese asiento, incluido el valor de la apuesta según quién gane la falta. El bot elige entre acciones legales y pasa por el mismo comando, validación y cobro que un humano.

En redondilla, si un canto admite a un compañero humano y a una computadora, mantener la prioridad de espera que ya usa `jugarComputadoras`. Si todos los habilitados son bots, decidir en orden desde el mano del lance. Durante un pico sólo se programa a jugadores del duelo activo. Una transición al siguiente duelo vuelve a calcular el actor elegible. Cuando la versión cambia, el proceso descarta una inferencia que siga en curso para el turno anterior.

Asignar a las mesas nuevas de tercetos la política básica de seis. El registro de políticas de entrenamiento sigue exigiendo compatibilidad de formato y capacidad. Habilitar en el futuro un actor aprendido de seis requerirá un formato de observación, datos de entrenamiento, máscaras, evaluación contra la política básica y métricas de juego específicas de seis. El primer chico jugable depende sólo de la política básica.

## Alternativas y consecuencias

Usar un actor de parejas como sustituto requiere recortar dos jugadores y pierde información sobre el segundo compañero y el orden de respuesta. Una política entrenada desde el primer hito requiere una liga y una colección de replays nuevos. La política básica permite entregar mesas mixtas y ofrece un rival reproducible para el desarrollo posterior.

## Prueba de aceptación

Ejecutar hasta el final un chico de seis computadoras en un ensayo privado y otro con un humano y cinco computadoras en el stack local. Cada turno debe pertenecer a un asiento activo, cada acción debe figurar en su máscara y cada partida debe producir un solo ganador. Con la misma observación y la misma elección de azar, cambiar cartas ocultas de otros jugadores debe producir la misma decisión. Reiniciar con un bot pendiente entre el primer y el segundo duelo y verificar que se confirma una sola acción.
