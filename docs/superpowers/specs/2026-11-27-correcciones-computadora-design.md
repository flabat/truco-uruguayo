# Correcciones de la computadora (issue #460)

## Intención

En el issue #460, la computadora aceptó un vale cuatro con una mano perdida. En la tercera vuelta, la persona ya había jugado el 4 de oros, una pieza porque la muestra era el 7 de oros. A la computadora solo le quedaba el As de espadas. Decir «no quiero» le costaba 3 puntos y «quiero» le costaba 4, sin chance de ganar. Ninguna estrategia justifica esa jugada.

La decisión vino de la política entrenada (perfil `duel`). El motor solo ofreció acciones legales. La heurística de respaldo, `elegirAccionOnline`, habría hecho lo mismo, porque acepta con cualquier carta a partir del 3.

Queremos que la computadora no cometa errores que se demuestran con lo que ve su asiento. Las faroleadas y los riesgos razonables le quedan a la política.

## Objetivos

- Que la computadora nunca diga «quiero» a un truco, retruco o vale cuatro cuando ya no puede ganar la mano.
- Que la computadora siga subiendo cuando ya tiene la mano ganada, en vez de solo querer. Nunca dice «no quiero» ni se va al mazo.
- Reunir en una lista corta y nombrada estas correcciones y la que ya existe (#452).
- Registrar en el replay qué corrección se aplicó, para medir cuántas veces se equivoca el modelo.

## Lo que no se busca

- Prohibir las faroleadas. Si la computadora canta o sube con la mano perdida, la jugada queda como está, igual que el retruco del #460.
- Elegir el orden de las cartas cuando la mano está ganada. Puede ser una corrección futura.
- Cubrir 2v2, tercetos ni la computadora al pie en la v1. Para ellos la lista devuelve la decisión sin cambios.
- Aplicar las correcciones en el entrenamiento o la evaluación. Las corridas siguen midiendo la política sin corregir.

## Lo que no puede pasar

- Que una corrección use información oculta para ese asiento: las cartas del rival que no se jugaron o el mazo.
- Que una corrección produzca una acción ilegal.
- Que cambie el comportamiento de un asiento cedido, porque lo juega una persona. `confirmarAutomatica` ya lo separa.

## Enfoques considerados

- **A. Reescribir la decisión después de la política (elegido).** Las correcciones corren en `confirmarComputadora` ([api/turnos.ts](../../../api/turnos.ts)). Cubren la política entrenada y la heurística, y siguen el patrón del #452. El replay ya guarda la `propuesta` original cuando difiere de la acción aplicada. En contra: la política no aprende de la corrección.
- **B. Quitar la acción antes de consultar la política.** Habría que sacar «quiero» de las acciones legales, como hacen las señas. Pero las acciones legales son parte de la entrada del modelo, así que cambiarlas lo lleva fuera de su distribución de entrenamiento. Además necesita otro gancho para la heurística y no deja registro del error.
- **C. Solo reentrenar.** No garantiza que el error desaparezca. Puede complementar a A más adelante.

## Diseño

### Módulo

Un módulo nuevo, `paquetes/motor/src/correcciones.ts`, con funciones puras y una lista ordenada:

```ts
type Correccion = {
  nombre: string;
  corregir(estado: EstadoOnline, asiento: Asiento, decision: ActionId): ActionId | null;
};
export const correcciones: readonly Correccion[] = [/* entregar-mazo, nunca-querer-perdida, subir-ganada */];
export function corregirDecision(estado, asiento, decision): { decision: ActionId; correccion?: string };
```

`corregirDecision` aplica la primera corrección que devuelve algo distinto de `null`, y solo si esa acción es legal en el estado. Si ninguna corrección aplica, devuelve la decisión original. No hay registro dinámico, configuración ni interruptores.

### Análisis «¿la mano ya está decidida?»

Una función en el motor, `desenlaceSeguro(estado, asiento): "ganada" | "perdida" | null`, que solo usa lo que ve el asiento: sus cartas, las cartas jugadas y la muestra.

1. Arma el conjunto de cartas no vistas: el mazo sin las cartas propias, las jugadas ni la muestra.
2. Recorre cada mano oculta posible del rival, con tantas cartas como le quedan.
3. Para cada mano posible, termina la mano con `jugarCarta` de [mano.ts](../../../paquetes/motor/src/mano.ts) y lee `equipoGanador`. Así hereda las reglas de pardas y desempates del motor sin reescribirlas.
   - **Perdida:** el asiento pierde en todas las manos posibles y en todos los órdenes de juego de ambos.
   - **Ganada:** existe una estrategia del asiento que gana contra cualquier mano posible y cualquier orden del rival. Es una búsqueda ∃/∀ sobre un árbol de a lo sumo tres cartas por lado.
   - Si no, `null`.

Solo se aplica en duelo, cuando hay dos participantes. Ignorar las restricciones públicas sobre la mano del rival, por ejemplo que cantó flor, hace el análisis más prudente, nunca menos correcto. En duelo el costo es de unos pocos miles de manos simuladas como mucho. Si medimos que pesa, se puede limitar el análisis a la segunda y la tercera vuelta.

### Correcciones de la v1

| Nombre | Cuándo | Cambio |
|---|---|---|
| `entregar-mazo` | la regla actual de `confirmarComputadora`: `antesDeSalida` o `segundaPerdidaEnDuelo` | carta → `mazo` |
| `nunca-querer-perdida` | hay un truco, retruco o vale cuatro pendiente y `desenlaceSeguro` da `"perdida"` | `quiero` → `no-quiero` |
| `subir-ganada` | `desenlaceSeguro` da `"ganada"` | la siguiente subida legal (`truco`, `retruco` o `vale-cuatro`). Si no hay subida legal y hay un canto pendiente, `quiero`. |

`subir-ganada` cubre dos momentos:

- **Al responder.** Ante un truco, la computadora contesta retruco; ante un retruco, vale cuatro; ante un vale cuatro, quiero. Reemplaza `quiero`, `no-quiero` y `mazo`.
- **En su turno.** Si puede cantar la siguiente subida, la canta antes de jugar la carta. Reemplaza una carta o `mazo`. Después del canto, la política vuelve a decidir la carta en su próximo turno.

Con la mano ganada, subir nunca es peor que querer: si el rival acepta, cobra más; si no quiere, cobra lo mismo que habría cobrado queriendo. Por eso la regla no necesita otra condición. Que la computadora también cante en su turno, y no solo al responder, fue mi decisión al interpretar «que siga subiendo».

Con la mano perdida, las subidas nunca se corrigen: responder un retruco con vale cuatro es una faroleada legítima.

### Conexión y registro

- `confirmarComputadora` llama a `corregirDecision` en lugar de su condición actual y confirma la decisión resultante.
- `DecisionBotV1` ([api/replay-chico.ts](../../../api/replay-chico.ts)) suma `correccion?: string`. `decisionReplay` ya escribe `propuesta` cuando la acción aplicada difiere. Ahora también escribe el nombre de la corrección. El camino de la política (`bot-pendiente.ts`) y el de `jugarComputadoras` pasan ese nombre al replay.

### Pruebas

- La posición del #460 reconstruida con sus jugadas, muestra 7 de oros. La computadora propone `quiero` y se confirma `no-quiero`, con `correccion: "nunca-querer-perdida"`.
- Mano ganada con un truco pendiente: la política propone `quiero` o `no-quiero` y se confirma `retruco`. Con un vale cuatro pendiente se confirma `quiero`.
- Mano ganada en su turno, sin canto pendiente: la política propone una carta y se confirma `truco`. Después del canto querido, la siguiente decisión de la computadora vuelve a pasar por la política.
- Una posición dudosa, con cartas del rival que podrían ganarle, en la que no se corrige nada.
- La subida a vale cuatro con la mano perdida no se toca.
- 2v2 y un asiento cedido quedan sin cambios.
- Las pruebas de `tests/unit/duelo-mazo.test.ts` siguen pasando sin cambios.
- Pruebas unitarias de `desenlaceSeguro` con pardas en la primera y la segunda vuelta.

## Queda a criterio de quien lo construya

- Cómo devuelve `confirmarComputadora` el nombre de la corrección a los que la llaman: un valor extra o un campo en la mano.
- Si `segundaPerdidaEnDuelo` se reescribe sobre `desenlaceSeguro` o se conserva tal cual dentro de `entregar-mazo`. Recomiendo conservarla en la v1 para no tocar el comportamiento del #452.
- El nombre del módulo y de las funciones, siempre que siga el estilo del repositorio.
