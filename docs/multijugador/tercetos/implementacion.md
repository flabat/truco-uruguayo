# Implementación del modo 3 contra 3

**Resultado de la entrega.** Seis personas pueden jugar un chico desde sus navegadores, pasar de redondilla a pico a pico, reconectar en cualquier duelo y obtener el mismo ganador. Una persona también puede completar la mesa con cinco computadoras. El total inicial es 50, con la opción de elegir otra meta par. [Diseño de la mesa](README.md)

## Orden de integración

Los paquetes siguientes están dimensionados como PR revisables. Las dependencias son funcionales. El diseño y la configuración del puntaje se pueden revisar por separado. Antes de implementar cada paquete, buscar o abrir su issue y reservar la rama según el flujo del proyecto. [Contribución](../../../CONTRIBUTING.md) · [Configuración del chico](https://github.com/flabat/truco-uruguayo/pull/170)

| Paquete | Depende de | Entrega comprobable |
| --- | --- | --- |
| 1. Reglas y vectores | Configuración del chico y revisión del ADR 1 | Perfil de reglas y resultados de referencia para 50 y una meta personalizada. |
| 2. Distribución y redondilla | 1 | El motor puro reparte a seis y resuelve una mano íntegra con cantos. |
| 3. Pico a pico y replay | 2 | Un solo reparto abre tres duelos en orden y reconstruye el estado hasta cualquier acción. |
| 4. Mesa y persistencia | 1 para preparar la migración, 3 para servir partidas | Seis sesiones crean y recuperan una mesa por HTTP y WebSocket. |
| 5. Computadoras | 3, luego 4 para verificar el servicio | Los bots completan un chico desde sus vistas privadas. |
| 6. Sala y tapete | Contrato de vista de 3 y 4 | En escritorio y móvil, cada jugador distingue cuándo espera, cuándo puede actuar y cuánto se cobró. |
| 7. Integración y activación | 4, 5 y 6 | El stack completo pasa las pruebas de seis personas y mesa mixta y permite abrir nuevas mesas de tercetos. |

### 1. Fijar el perfil de reglas

En `src/motor/`, separar la meta del chico del perfil que determina las apuestas. Reusar la configuración introducida en #170. Convocar la revisión de las propuestas de la casa sobre la falta, el resto, el retiro al mazo y el cruce de mitad durante un pico. Incorporar la decisión al perfil versionado de seis y a `src/data/cantos.json` y `src/data/juego.json`, con sus fuentes. Guardar casos determinados a mano en `tests/fixtures/`.

**Aceptación.** Las aserciones incluyen 24, 25, 26, 49 y 50 sobre una meta de 50, ambos equipos en mitades distintas y el caso 13/26. Para la falta, verificar al ganador que va adelante y al que va atrás. La prueba de contraflor debe detectar un segundo cobro accidental de las flores. [ADR 1](adr/0001-puntaje-y-cantos.md)

### 2. Repartir y jugar una redondilla

En `reparto.ts` y `mesa-online.ts` validar la distribución de seis con Fisher–Yates parcial. En `mano.ts` y `cantos-online.ts` introducir participantes explícitos, manteniendo los validadores de los repartos existentes. Extender orden de juego, empate entre compañeros, parda entre rivales, comparación de tantos y la consulta de flor a tres jugadores por lado. Los comandos del nuevo perfil reciben el asiento absoluto. Incluir el retiro durante el turno de carta con su liquidación.

**Aceptación.** Probar seis posiciones de dador, 19 cartas únicas, vuelta completa de seis jugadas, una mano resuelta en dos vueltas, tres pardas y flor en el sexto asiento. Incluir dos compañeros con cartas máximas y dos rivales empatados en envido. Pasar también los vectores históricos de cuatro y dos asientos.

### 3. Encadenar los duelos

Implementar el estado de reparto con uno o tres lances, la proyección de participantes y las transiciones de la tabla del diseño. Reusar el motor de duelo para las vueltas y el perfil de tercetos para los cantos. Guardar un corte del marcador por lance para evaluar la falta. Registrar el cierre y apertura del duelo en el mismo paso que la acción final. Exportar un vector de reproducción con el reparto elegido, su meta y las acciones confirmadas.

**Aceptación.** Cubrir mano 5 con 5–2, 0–3 y 1–4. Una jugada de 4 en el segundo duelo se rechaza. Al entrar en buenas en el primer duelo se completa el reparto. Si se gana el chico en el segundo se cancelan las acciones restantes. Comparar las acciones legales, el turno, el marcador y las cartas visibles después de cada acción del replay con los del estado en vivo. [ADR 2](adr/0002-reparto-y-duelos.md)

### 4. Dar de alta y recuperar mesas

Preparar una migración aditiva sobre `juego.mesas`, `juego.asientos` y, según el formato de registro acordado, `juego.manos`. El lector del formato nuevo tiene que estar desplegado antes de admitir su creación. Agregar el modo a `api/mesas.ts`. En `partidas.ts`, `turnos.ts` y `vivo.ts` reutilizar la autenticación, el bloqueo por mesa, la comprobación de versión y la respuesta idempotente. Entregar la proyección privada del asiento tanto en GET como en cada confirmación. Conservar la versión esperada del comando entre lances.

**Aceptación.** Migrar una base con partidas de 2 y 4 a medio jugar y reanudarlas. Simular dos invitados que compiten por el asiento 5, dos compañeros que responden al mismo truco y dos comandos de nuevo reparto simultáneos. Verificar un único asiento adjudicado, un solo cobro y un solo reparto. Reiniciar API y base en medio de una respuesta de flor y entre duelos. Confirmar que los seis jugadores vuelven con sus vistas correctas. [ADR 3](adr/0003-persistencia-y-vistas.md)

### 5. Completar con computadoras

Agregar el bot básico y probar una mesa mixta con turno humano al principio, en el medio y al cierre. El trabajo pendiente se crea bajo la misma transacción que avanzó el árbitro. Revalidar la versión y el actor al confirmar. Adaptar la política de cartas a dos compañeros y evaluar su legalidad con el mismo proyector que se emplea para cada humano. Versionar por separado cualquier futuro actor aprendido de seis.

**Aceptación.** Serie de repartos deterministas para todas las posiciones, incluyendo un bot que conserva una pieza porque su segundo compañero ya ganó la vuelta. En el stack, jugar hasta la meta con cinco bots, reiniciar en un turno pendiente y verificar que no hay doble jugada. [ADR 4](adr/0004-computadoras.md)

### 6. Diseñar la interacción de seis asientos

Agregar **3 contra 3** al selector de la sala y aplicar el valor inicial de esa modalidad al seleccionarla. Permitir editarlo antes de confirmar. La sala de espera de los invitados muestra el total efectivo y los equipos. Extender los tipos de `cliente.ts` y representar las fases en `Sala.tsx` y `Tablero.tsx`. Las instrucciones del turno y las acciones salen de la vista del servidor. Mantener accesibles las tres cartas propias en pantalla angosta y las seis posiciones identificables.

**Aceptación.** Usar seis contextos de navegador con sesiones independientes. Desde los lugares 0 y 5, probar invitación, teclado, foco tras jugar, lector de estado, rotación del dador, cambio de duelo sin recargar y vuelta del navegador a mitad del segundo duelo. Las capturas para revisión muestran móvil a 320 px y escritorio. Inspeccionar además los cuerpos HTTP y WS de los cuatro asientos en espera.

### 7. Validar el chico completo y abrir la modalidad

Ampliar `scripts/verificar-mesas.mjs`, `verificar-partidas.mjs`, `verificar-juego-navegador.mjs` y `verificar-stack.sh`. Incorporar los nuevos casos a `npm run check` y la verificación de seis clientes a `npm run check:stack`. Registrar en el PR comandos reales, resultados, capturas y referencias de los replays. Actualizar la guía del entorno con creación, invitaciones y una mano de ejemplo.

| Escenario de punta a punta | Resultado requerido |
| --- | --- |
| Seis humanos, meta 50 | Cambio de reparto y dador, alternancia por debajo de 25 y redondillas después del cruce. Un solo ganador a 50. |
| Un humano y cinco bots, meta 26 | Entrada en buenas al llegar a 13 y victoria a 26. Todos recuperan esa meta tras reiniciar. |
| Pico con una baja de conexión | Un ausente conserva su plaza. Se puede terminar un duelo entre otros dos. Cuando le toca al ausente, la partida espera hasta que vuelve a entrar y juega. |
| Victoria por canto en un duelo | Queda acreditado el lance decisivo una vez. El estado terminal impide acciones, nuevo duelo y nuevo reparto. |
| Lectura desde seis cuentas | Cada respuesta contiene sólo lo autorizado al asiento, incluso tras recargar y al reenviar un id de comando. |
| Actualización con mesas históricas | Duelos, parejas, señas y replays previos completan su suite y pueden terminar en la misma base. |

En desarrollo, habilitar la creación de tercetos tras el primer ensayo integral. En despliegue, instalar primero esquema y lectores, luego habilitar las escrituras nuevas y finalmente mostrar la modalidad en la sala. Vigilar fallos de replay, rechazos por turno, latencia de acciones y mesas con trabajo de bot pendiente sin progreso. Comparar las mediciones con partidas de seis del ensayo local. Para retirar una versión, cerrar la creación de mesas nuevas de seis y mantener el lector y el árbitro compatibles para las activas. Conservar los repartos y las acciones para reproducir la incidencia. La publicación sigue el procedimiento habitual del repositorio.
