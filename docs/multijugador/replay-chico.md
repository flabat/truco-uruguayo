# Replay privado de un chico

Un chico empieza en 0–0. Su registro JSON contiene una cabecera y una lista ordenada de eventos. La pareja `(id, secuencia)` identifica la posición que puede guardar un reporte de error. El lector aplica las decisiones confirmadas a las cartas efectivamente repartidas, reconstruye los cobros y devuelve la vista de un solo asiento. [Contrato TypeScript y lector](../../api/replay-chico.ts) · [Diseño del historial en PostgreSQL](https://github.com/flabat/truco-uruguayo/issues/195)

## Cabecera

| Campo | Significado |
| --- | --- |
| `version`, `id` | La versión del registro y el UUID del chico. Las mesas con señas automáticas declaran `chico-v2` y `versionSenas: "senas-pie-v1"`. Los perfiles anteriores usan `chico-v1`. |
| `origen`, `corrida` | `mesa`, `arena` o `fixture`. La arena requiere asientos de computadora y los identificadores `corrida.id` y `corrida.chico`. Si hay repartos emparejados, registrar juntos `par` (desde 0) y `manga` (0 o 1). |
| `variante`, `perfil` | El perfil selecciona las reglas de la tabla siguiente, incluidas las de visibilidad. En las variantes en línea, los asientos pares integran el equipo 0 y los impares el 1. |
| `motor` | `version` identifica una semántica compatible y `build` el código de procedencia (`git:` + SHA de 40 dígitos hexadecimales o `sha256:` + 64). El lector verifica la versión y usa el motor local correspondiente. La huella sirve para localizar el build original. |
| `meta`, `inicio`, `asientos` | Meta par del chico, fecha y hora UTC en ISO 8601 con sufijo Z, y controladores en orden físico desde el asiento 0. Cada uno declara `tipo: "humano"` o `tipo: "computadora"` con la `politica` fijada para el chico. |

## Eventos y posiciones

1. **Reparto.** Guarda `manoNumero`, `puntosInicio` y `reparto`, con su versión, dador, mano, muestra y cartas por asiento en orden de entrega. El primer reparto tiene número 1. El siguiente exige una mano cerrada, el tanteador anterior y la rotación del dador.
2. **Decisión.** Guarda la `accion` confirmada, incluido el asiento absoluto, los `cobros` de esa decisión en orden y el par de `puntos` que resultó. Un cambio automático de lance queda confirmado en la misma posición que la decisión que lo produjo. En tercetos, `duelo` identifica el lance que recibió la acción (nulo en redondilla, 1 a 3 en pico a pico).
3. **Indicación del pie** (V2). Registra el emisor, el destinatario, la frase, la vuelta y la cantidad de acciones confirmadas cuando el pie habló. Todos los asientos oyen la misma frase. El lector reconstruye las señas privadas de cada vuelta desde el reparto y devuelve sólo las que corresponden a quien consulta.
4. **Salida.** Guarda `asiento`, `motivo` y `fecha`. El motivo es `abandonada` si la persona abandonó la partida, o `desconectada` si otro jugador la reemplazó o cobró la partida después del plazo de espera. Si queda otro humano en la mesa, una computadora juega ese asiento hasta el final; la cabecera no cambia y el asiento sigue declarado como humano, sin `bot` en sus decisiones. Una salida no cambia las cartas, el tanteador ni las posiciones de jugada.
5. **Cierre.** Guarda `fecha`, `estado`, `puntos` y `ganador`. Llegar a la meta determina la victoria en la propia jugada. El cierre registra `terminado` con su equipo ganador, o `inconcluso` con ganador nulo si terminó la sesión antes de alcanzar la meta. El estado `abandonado` cierra el chico cuando sale el último humano activo: va después de una salida, los `puntos` son los del tanteador, ninguno llega a la meta y gana el equipo rival de la última salida (`1 - asiento % 2`).

La secuencia empieza en 1 y avanza de a uno por evento. Dos decisiones producidas por un mismo pedido ocupan posiciones distintas. En una decisión de computadora, `bot` registra la política `solicitada` y la `aplicada`, y las versiones de `observacion` y `acciones`. Un fallback registra causa y `latenciaMs`. Si el árbitro transformó una elección del modelo, `propuesta` conserva su identificador de acción original.

## Partidas de referencia

| Variante y perfil | Caso comprobado |
| --- | --- |
| Duelo · `duel`, motor y reparto `online-1` | El asiento 0 tiene 33 de envido. La computadora quiere la falta y el chico cierra 40–0 antes de tirar una carta. [Partida](../../tests/fixtures/replay-chico/duelo.json) |
| Parejas · `pairs` o `pairs-private-senas`, motor y reparto `online-1` | El asiento 3 quiere el truco. En la posición 4, el 0 tira el as de espada con una seña que también ve el 2. Para el 1 y el 3, jugada, historial y número de posición son idénticos al silencio. El 0 gana las dos vueltas y el chico 2–0. [Partida](../../tests/fixtures/replay-chico/parejas.json) |
| Tercetos · `tercetos-v1`, motor y reparto `online-2` | Tras la redondilla, el segundo reparto abre el pico a pico. En la posición 11 se acredita el último tanto del primer duelo y entran los asientos 0 y 3. En el segundo, una contraflor al resto lleva el chico a 10–1. Quienes esperaban el tercero nunca recibieron sus cartas. [Partida](../../tests/fixtures/replay-chico/tercetos.json) |
| Gallo · `gallo-sintetico-v1`, reparto `gallo-sintetico-1` | El asiento 1 juega solo. Recibe cuatro cartas y devuelve el siete de oros antes de cantar. Los otros ven que hizo su elección. La carta devuelta queda en la vista privada del gallo. Tras un retruco rechazado la pareja gana 0–2. [Partida](../../tests/fixtures/replay-chico/gallo.json) |

El perfil sintético de gallo admite un solo reparto, descarte, truco, retruco opcional y rechazo. El equipo 0 es el gallo y el 1 es la pareja. Sirve para probar el reparto, la privacidad y un resultado completo. La rotación del gallo, la cuenta entre repartos y el resto de las acciones requieren un futuro perfil de mesa. [Gallo en la guía](../../src/data/juego.json#L25-L33)

## Reproducir una posición

Desde la raíz del repositorio con Node 24, este ejemplo muestra lo que ve el asiento 0 al abrirse su duelo. El servicio que invoque el lector debe obtener el asiento de la sesión autorizada. El registro privado contiene todas las cartas.

```sh
node --input-type=module <<'JS'
import { readFileSync } from "node:fs";
import { reproducirChico } from "./api/replay-chico.ts";
const juego = readFileSync("tests/fixtures/replay-chico/tercetos.json", "utf8");
console.log(reproducirChico(juego, 0, 11));
JS
```

La posición 0 muestra la cabecera pública del chico antes de repartir. Omitir la posición lee hasta el último evento disponible. Un prefijo se verifica independientemente del resto. Para verificar el registro entero se lee hasta el final. Un hueco, una acción ilegal o un cobro distinto del motor identifica la secuencia que falló.

Un cambio incompatible de representación exige otra versión del replay. Los cambios de reglas, de reparto o de visibilidad exigen una versión o perfil que conserve la interpretación anterior. Mantener estos cuatro ejemplos como vectores de compatibilidad y agregar los nuevos junto al lector correspondiente.

## Captura de mesas en PostgreSQL

Al repartir la primera mano de una mesa en línea, la API fija la cabecera privada en `juego.replays_chico`. El UUID del chico es el de la mesa. La huella SHA-256 identifica las fuentes del motor instaladas en el proceso que abrió el chico. Cada asiento de computadora conserva la política de la mesa, y cada decisión conserva la política que efectivamente jugó. Esto cubre mesas humanas, mixtas y de computadoras de duelo, parejas y tercetos.

El reparto ocupa la posición 0 de la mano en `juego.eventos_chico`. Las decisiones ocupan las posiciones siguientes y el cierre sigue a la jugada ganadora. La palabra del pie ocupa una secuencia propia. Su posición de jugada es nula para que la carta y el canto conserven sus posiciones. Lo mismo vale para la salida de un asiento. Bajo el bloqueo de la mesa, los escritores guardan el estado jugable, los eventos y el recibo del comando en la misma transacción. Un cliente que reintenta por HTTP o WebSocket con el mismo identificador recupera el recibo original. El trabajador de computadoras comprueba de nuevo la versión y el asiento antes de confirmar su decisión.

La columna `build` de cada evento identifica al escritor si el chico abarca más de un despliegue. Un proceso autorizado del servidor puede obtener el documento que acepta `reproducirChico` con esta consulta.

```sql
SELECT replay FROM juego.replays_chico_v1 WHERE mesa = $1;
```

La vista contiene todas las cartas y señas. El servidor autentica al jugador y le entrega la proyección de su asiento. La vista incluye únicamente los chicos compatibles observados desde el primer reparto cuyo registro cubre todas las acciones confirmadas. Si una mesa ya tenía manos al instalar esta versión, las jugadas nuevas conservan su número de mano y posición en la tabla de eventos. Los repartos y las acciones anteriores siguen en `juego.manos`. El mismo criterio conserva como parcial un historial al que le falten jugadas escritas por una instancia antigua durante el despliegue.

## Reportar la jugada visible

Las cuentas habilitadas tienen **Reportar esta jugada** junto al historial de la mesa. Abre un borrador en otra pestaña de GitHub. La persona completa qué pasó y qué esperaba y decide cuándo enviarlo. Necesita acceso al repositorio privado.

El formulario conserva la mano, la posición dentro de esa mano, la vuelta y el tanteador que muestra el tapete. Si está presentando cantos o un pico a pico, también identifica la voz o el duelo que se ve. En la variante al pie, la cantidad de indicaciones visibles distingue dos pantallas con la misma posición de carta. El servidor obtiene el asiento de la sesión, guarda la referencia y arma el historial hasta esa posición. El borrador incluye el UUID del reporte para recuperar el prefijo completo cuando el resumen excede el espacio del enlace.

### Investigar un reporte

En una conexión autorizada a PostgreSQL, usá el UUID que figura en el issue. El asiento del registro se numera desde cero. La secuencia es absoluta dentro del chico. La posición vuelve a cero al repartir cada mano y sigue contando al cambiar de duelo dentro de un pico a pico.

```sql
SELECT mesa, mano, posicion, secuencia, asiento, vuelta, duelo, fase, voz,
       indicaciones, puntos AS tanteador_en_pantalla, cliente
FROM juego.reportes WHERE id = $1;
```

Para un replay íntegro, pasá el documento de `juego.replays_chico_v1`, el asiento y la secuencia a `reproducirChico(replay, asiento, secuencia)`. Compará la decisión y sus cobros con la pantalla registrada. Una animación puede seguir mostrando el tanteador previo al cobro. Si la secuencia falta, consultá `juego.manos` por mesa y número, con las acciones anteriores o iguales a la posición. La posición cero corresponde al reparto. La cabecera y el resto de los datos del árbitro son privados.

### Habilitar o revocar una cuenta

El operador usa el **ID de jugador** de la cuenta y una conexión administrativa al esquema del juego. El cambio de permiso se aplica al servidor de inmediato. Al recargar la mesa se actualiza la visibilidad del control.

```sql
INSERT INTO juego.reporteros (jugador) VALUES ($1) ON CONFLICT DO NOTHING;
-- Para revocar el acceso:
DELETE FROM juego.reporteros WHERE jugador = $1;
```
