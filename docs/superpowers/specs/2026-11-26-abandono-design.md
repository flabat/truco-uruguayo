# Abandonar una partida y reemplazar a quien se desconecta

Issue: [#454](https://github.com/flabat/truco-uruguayo/issues/454). Relacionado: [#448](https://github.com/flabat/truco-uruguayo/issues/448) (mesas pendientes de la cuenta).

## Intención

Hoy una mesa empezada espera para siempre a cada humano. No hay forma de dejar una partida, y si alguien se va o pierde la conexión en parejas o tercetos, los demás quedan trabados. Queremos:

- que cualquiera pueda **abandonar** una partida, con una consecuencia clara en su historial;
- que los humanos que quedan **sigan jugando** cuando alguien se va, con una computadora en el asiento vacío;
- que una **desconexión prolongada** no trabe la mesa: después de un plazo, los que quedan eligen reemplazar a quien falta.

## Decisiones de quien pidió la función

1. Abandonar cuenta como **derrota** para quien se va. Su historial la muestra como **Abandonada**.
2. **Duelo contra la computadora:** la partida termina al abandonar.
3. **Mesa con otros humanos** (parejas o tercetos): una computadora juega el asiento y la partida sigue.
4. Si el equipo de quien abandonó gana igual, sus compañeros humanos tienen una **victoria normal**. Quien abandonó conserva su Abandonada.
5. **Duelo entre dos humanos:** quien se queda **gana en el momento**.
6. **Desconexión:** cuando un jugador desconectado traba la mesa, los humanos que quedan pueden reemplazarlo (o cobrar la partida en un duelo). El historial de quien se desconectó muestra **Desconectada** y cuenta como derrota.
7. El **servidor** lleva y valida el plazo. El cliente solo lo muestra.

## Objetivos, no objetivos y lo que la haría fracasar

**Objetivos**
- Botón «Abandonar» en toda mesa empezada y sin terminar, con confirmación.
- Reemplazo y cobro por desconexión, ofrecidos a los humanos que quedan después de 60 segundos de espera.
- Historial con dos resultados nuevos: Abandonada y Desconectada.

**No objetivos**
- Ranking, penalizaciones o bloqueos por abandonar seguido.
- Plazo por jugada para humanos conectados que tardan (la mesa sigue esperando a quien está conectado).
- Devolverle el asiento a quien ya fue reemplazado.

**Lo que la haría fracasar aunque funcione**
- Que un cliente modificado pueda cobrar una partida o sacar a alguien antes del plazo.
- Que un corte breve (un túnel, un cambio de red) le cueste la partida a alguien sin que nadie lo haya elegido.
- Que abandonar y volver sirva para esquivar la derrota.
- Romper el replay o el historial de las partidas existentes.

## Estado actual que se reutiliza

- **Asiento cedido** (`juego.asientos.cedido`, migración 026, [api/retiro.ts](../../../api/retiro.ts)): al pedir la baja, una computadora juega el asiento. Sigue siendo humano para las reglas y el replay; `esperanDe` ([api/cedidos.ts](../../../api/cedidos.ts)) excluye esos asientos de los que esperan a una persona. Es permanente.
- **Presencia** ([api/vivo.ts](../../../api/vivo.ts)): un WebSocket por jugador y mesa, con ping cada 30 s. `jugadoresConectados()` da los jugadores con conexión abierta por mesa. Está solo en memoria.
- **Cierre del chico**: un evento `cierre` en `juego.eventos_chico` con `estado: "terminado" | "inconcluso"` ([api/replay-chico.ts](../../../api/replay-chico.ts), [api/replay-db.ts](../../../api/replay-db.ts)). El validador exige que `terminado` coincida con un equipo que llegó a la meta.
- **Historial** ([api/perfil.ts](../../../api/perfil.ts), [src/lib/perfil.ts](../../../src/lib/perfil.ts), [src/components/perfil/Perfil.tsx](../../../src/components/perfil/Perfil.tsx)): el resultado se deduce del tanteador (`ganada | perdida | sin-terminar | desconocido`).

## Enfoques considerados

1. **El servidor lleva el plazo y lo valida (elegido).** `vivo` registra desde cuándo la mesa espera a un asiento desconectado, lo publica en la vista, y el servidor rechaza un reemplazo o cobro antes de 60 s. Más código en el servidor, pero un cliente modificado no puede adelantarse, y un reinicio del servidor reinicia el plazo sin perjudicar a nadie.
2. **El cliente lleva el plazo y el servidor solo comprueba la desconexión.** Menos código, pero un cliente alterado podría saltear la espera. Se descartó porque el cobro entrega victorias.
3. **Reemplazo automático al vencer el plazo, sin preguntar.** Lo más simple, pero quita la decisión a los que quedan y no deja que un rival de duelo siga esperando. Se descartó por la decisión 6.

## Diseño

### Reglas

Se llama **humanos activos** a los asientos con jugador, `NOT computadora` y `NOT cedido`.

**Abandonar** (lo pide el propio jugador, mesa empezada y sin cierre):

| Mesa | Qué pasa |
|---|---|
| Duelo, rival computadora | Cierre `abandonado`, gana el equipo rival. |
| Duelo, rival humano | Cierre `abandonado`, gana el rival. |
| Parejas o tercetos, queda al menos otro humano activo | El asiento pasa a `cedido`; la computadora lo juega y la partida sigue. |
| Parejas o tercetos, no queda otro humano activo | Cierre `abandonado`, gana el equipo rival de quien abandonó. |

En una mesa sin reparto, «Abandonar» se comporta como hoy `retirarJugador`: libera el asiento y cancela la mesa si la creó. No queda registro en el historial.

**Desconexión que traba la mesa.** Un asiento **traba** la mesa cuando es un humano activo, el servidor espera algo de él (le toca jugar o responder un canto, o el compañero al pie espera su indicación) y no tiene ninguna conexión abierta a esa mesa. Si la espera la puede resolver cualquiera de varios asientos (por ejemplo, un compañero puede responder el truco por el equipo) y alguno de ellos es un humano activo conectado o una computadora, el desconectado no traba. Varios asientos pueden trabar a la vez: cada uno tiene su propio plazo y su propio reemplazo. Mientras traba durante 60 s seguidos, cada humano activo conectado puede:

- en duelo: **cobrar la partida** → cierre `abandonado` con motivo `desconectada`, gana quien cobra;
- en parejas o tercetos: **reemplazarlo** → el asiento pasa a `cedido` con motivo `desconectada`, y si ya no queda otro humano activo (caso imposible si quien reemplaza es humano activo) se cierra como arriba.

Alcanza con que **uno** acepte. «Seguir esperando» cierra el aviso para ese jugador; vuelve a aparecer a los 60 s. Si el jugador desconectado se reconecta antes, el plazo se borra y no pasó nada. Una vez reemplazado no recupera el asiento: al entrar ve la mesa como hoy ve un asiento cedido («Una computadora juega tu asiento en esta mesa.»).

**Abandonar no se deshace.** Quien abandonó no vuelve al asiento.

**Quien salió no vuelve a la mesa.** Como hoy con el cedido, la mesa deja de aparecer en sus mesas pendientes y `GET` de la mesa responde 409. El texto del 409 distingue el caso: «Abandonaste esta partida.», «Una computadora te reemplazó porque te desconectaste.» o el actual para la baja. La app muestra ese texto y vuelve al salón. El resultado lo ve en su historial.

### Datos

Migración nueva `029-abandono.sql`:

```sql
ALTER TABLE juego.asientos
  ADD COLUMN salida text CHECK (salida IN ('abandonada', 'desconectada')),
  ADD COLUMN salida_fecha timestamptz,
  ADD CONSTRAINT salida_completa CHECK ((salida IS NULL) = (salida_fecha IS NULL));
```

El cedido por baja de cuenta queda con `salida` nula: no es una derrota que se muestre.

**Replay.** Dos cambios al formato de eventos, con el validador de [api/replay-chico.ts](../../../api/replay-chico.ts) actualizado:

- evento nuevo sin posición de jugada: `{ tipo: "salida"; asiento; motivo: "abandonada" | "desconectada"; fecha }`, escrito al ceder el asiento o al cerrar;
- `cierre` admite `estado: "abandonado"` con `ganador: 0 | 1` y `puntos` por debajo de la meta, solo si lo precede un evento `salida`.

Los replays existentes no cambian y siguen validando.

### Servidor

- **`POST /api/mesas/:id/abandonar`**: lo pide el propio jugador. Aplica la tabla de reglas en una transacción con el mismo orden de bloqueo que `retirarJugador`, escribe `salida`, el evento de replay y, si corresponde, el cierre; luego `reanudarComputadoras` y `alCambiar`.
- **`POST /api/mesas/:id/reemplazar`** con `{ asiento }`: lo pide un humano activo de la mesa. Valida contra el registro de espera de `vivo` que el asiento sigue trabando la mesa y lleva 60 s o más; después hace lo mismo que abandonar con motivo `desconectada`. Devuelve 409 si el plazo no venció o el jugador volvió.
- **Registro de espera en `vivo`.** Un mapa en memoria `mesa → Map<asiento, desde>`, con una entrada por asiento que traba. Se recalcula al cambiar la mesa (`alCambiar`), al cerrarse o abrirse una conexión, y lo consulta la ruta de reemplazo. Se pierde al reiniciar el servidor, lo que reinicia el plazo; es aceptable.
- **Vista de la mesa.** La vista de cada humano activo suma `esperas: { asiento, nombre, desde, disponible: string /* ISO */ }[]`, vacía si nadie traba la mesa. La vista de quien fue reemplazado o abandonó dice que su asiento está cedido.
- El **reloj** es el del servidor. El cliente calcula la cuenta regresiva con la diferencia que recibe y no decide nada.

### Historial

`ResumenPartida.resultado` suma `"abandonada" | "desconectada"`. [api/perfil.ts](../../../api/perfil.ts) lee `salida` del asiento del jugador: si no es nula, ese es el resultado, sin importar el tanteador. Los demás se deducen como hoy, con un agregado: un cierre `abandonado` da `ganada` o `perdida` según su `ganador`, aunque nadie haya llegado a la meta.

Textos: «Abandonada» y «Desconectada». Ambas se cuentan con las derrotas donde se sumen resultados.

**Gestión.** Las mesas y las estadísticas por jugador de [api/gestion-datos.ts](../../../api/gestion-datos.ts) también deducen el ganador del tanteador (en el CTE `marcadores()`, no en la vista de la migración 022). Entran en el alcance: un cierre `abandonado` cuenta como terminado con su `ganador`, y las estadísticas cuentan como derrota toda partida con `salida` no nula aunque su equipo haya ganado. Gestión y el historial del jugador tienen que coincidir.

### Interfaz

La mesa es la app Expo (web y nativa); el historial vive solo en el perfil del sitio Astro.

- **Abandonar.** Una acción en la hoja «Más» de la mesa ([app/src/mesa/vistas/HojaMas.tsx](../../../app/src/mesa/vistas/HojaMas.tsx)), con confirmación que dice la consecuencia: «Vas a perder esta partida y quedará como Abandonada en tu historial.» En parejas o tercetos agrega «Una computadora va a jugar tu lugar.» Después vuelve al salón.
- **Aviso de desconexión.** Para los humanos activos conectados, cuando llega `espera`: «Esperando a Ana…» con la cuenta regresiva. Al vencer, el aviso ofrece «Reemplazar con una computadora» (o «Cobrar la partida» en duelo) y «Seguir esperando».
- **Al cerrar por abandono**, quien se quedó ve el resultado de la partida con la razón: «Ana abandonó la partida.» / «Ana se desconectó.»
- **Historial** ([src/components/perfil/Perfil.tsx](../../../src/components/perfil/Perfil.tsx)): las dos etiquetas nuevas, con el mismo tratamiento visual que Perdida.

## Decisiones que tomé yo (revisables)

- Cualquier humano activo puede aceptar el reemplazo: pedir el acuerdo de todos deja trabada la mesa por uno solo que no contesta.
- El plazo cuenta solo mientras la mesa espera algo del desconectado. Un desconectado al que no le toca no apura a nadie.
- En parejas o tercetos, si no queda ningún humano activo, la partida se cierra en lugar de seguir entre computadoras.
- La baja de cuenta sigue cediendo asientos sin derrota.
- 60 s de plazo, como constante del servidor.
- Un desconectado no traba la mesa si un compañero conectado o una computadora puede resolver la misma espera; varios asientos que traban tienen plazos y reemplazos independientes.
- Quien salió no vuelve a ver la mesa: recibe un aviso que explica por qué y ve el resultado en su historial.
- Gestión entra en el alcance para que sus cuentas coincidan con el historial.

## Lo que queda para quien construye

- Cómo detectar exactamente que «el servidor espera algo de un asiento» en cada formato (`aDecidir`, la espera del pie, el «siguiente» entre manos) y dónde vivir esa función.
- La forma exacta del menú de la mesa y del aviso, siguiendo los componentes existentes.
- Las pruebas: unitarias de las reglas y del validador de replay; de la API para abandonar, reemplazar antes y después del plazo, y reconexión; Playwright para el flujo de abandonar y el aviso.
