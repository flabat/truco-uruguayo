# ADR 1 · Motor puro, mesa de parejas y replay versionado

**Estado.** Decisión aceptada e implementada. El simulador de terminal y la mesa guiada comparten el motor de parejas y el replay V1. [Diseño #28](https://github.com/flabat/truco-uruguayo/pull/28) · [Simulador #44](https://github.com/flabat/truco-uruguayo/pull/44) · [Mesa guiada #48](https://github.com/flabat/truco-uruguayo/pull/48)

## Contexto

La guía describe las reglas en prosa y tablas. Las lecciones, la mesa guiada y un futuro análisis de probabilidades necesitan aplicar las mismas reglas a repartos distintos. Un error en una mano debe poder reproducirse aunque después cambie el criterio de un rival automático. [Reglas de la mesa y las vueltas](../../../src/data/juego.json) · [Reglas de los tantos](../../../src/data/cantos.json)

## Decisión

Usar módulos TypeScript puros, ejecutables en Node y en el navegador. La guía y sus referencias sirven como oráculos editoriales para escribir ejemplos comprobados a mano. Las funciones de dominio calculan el resultado para cualquier entrada legal. El motor, la política de cada jugador y la presentación tienen interfaces independientes.

| Contrato público | Resultado |
| --- | --- |
| [`pieza(carta, muestra)`](../../../paquetes/motor/src/cartas.ts) | Rango efectivo 2, 4, 5, 11 o 10, o `null` si la carta es común. Compartido por jerarquía y tantos. `CardId` usa claves Tatú como `copas-04`. |
| [`compararCartas(a, b, muestra)`](../../../paquetes/motor/src/jerarquia.ts) | Un resultado positivo favorece a la primera, negativo a la segunda y cero indica empate. |
| [`evaluarTantos(cartas, muestra)`](../../../paquetes/motor/src/tantos.ts) | Modalidad flor/envido, forma, total y todos los desgloses óptimos. Cada desglose identifica la base y los aportes de las cartas. |
| [`repartir(semilla, dador)`](../../../paquetes/motor/src/reparto.ts) | Reparto V1 con cuatro manos y muestra. Acepta semillas enteras sin signo de 32 bits, incluido cero, y dadores del 0 al 3. |
| [`iniciarMano(reparto)` y `jugarCarta(estado, { asiento, carta })`](../../../paquetes/motor/src/mano.ts) | La primera función crea el estado inicial. La segunda devuelve `{ ok: true, estado }` con el estado siguiente o `{ ok: false, error }` si rechaza la jugada. El estado previo se conserva. |
| [`vistaPara(estado, asiento)`](../../../paquetes/motor/src/mano.ts) | Cartas restantes propias, muestra, asientos, turno, cartas jugadas, historial público y resultado disponible. Se construye seleccionando campos permitidos. |
| [`elegirJugada(vista)`](../../../paquetes/motor/src/jugadores.ts) | Devuelve una carta legal para el asiento en turno. El llamador entrega la jugada al motor. |
| [`capturarReplay(estado)` y `reproducirReplay(datos)`](../../../paquetes/motor/src/replay.ts) | La captura guarda las jugadas de un reparto reproducible con su semilla y dador. La reproducción acepta texto JSON o su valor decodificado y devuelve el estado reconstruido o el motivo del rechazo. |

**Orden y mesa.** El mazo canónico enumera oros, copas, espadas y bastos, cada palo con 1–7, 10, 11 y 12. Los asientos 0–3 se numeran en sentido antihorario y forman las parejas 0/2 y 1/3. El mano es el siguiente asiento después del dador. Se dan tres rondas de una carta por asiento y se gira la siguiente como muestra. El sitio elige una semilla para iniciar cada partida y la entrega explícitamente al motor.

**Estado de la mano.** El estado privado conserva reparto, cartas restantes, turno, orden de las cartas de la vuelta, vueltas cerradas y equipo ganador cuando corresponde. Cada jugada comprueba asiento activo, fase y pertenencia de la carta. Las vueltas se cierran tras cuatro jugadas. El motor decide el cierre anticipado y las pardas según la tabla de la guía. [Capítulo de vueltas](../../../src/data/juego.json)

Si ambos equipos alcanzan el máximo, la vuelta sale parda. Si solo los dos compañeros empatan arriba, su pareja gana la vuelta y, si la mano sigue, abre quien tiró primero una de esas cartas. En la prueba, los asientos juegan en orden 1, 2, 3 y 0. Los reyes comunes del 2 y del 0 empatan arriba, por lo que el 2 abre la vuelta siguiente. Esta regla se contrastó con la implementación uruguaya de Truquito. [Decisión en #20](https://github.com/flabat/truco-uruguayo/issues/20#issuecomment-6969028128) · [Prueba del motor](../../../tests/unit/mano.test.ts) · [PR #37](https://github.com/flabat/truco-uruguayo/pull/37)

**Información por asiento.** El controlador conoce la semilla, las manos y el registro completo. Cada bot y la interfaz de juego reciben solo la vista de su asiento. La semilla permitiría deducir cartas ajenas. Para probar el límite, dos repartos con las mismas cartas y acciones visibles deben inducir la misma elección del bot.

**Cómo juegan el compañero y los rivales.** La política inicial abre cada vuelta con su carta más fuerte. Al responder, compara lo que ya se jugó con la muestra. Si el compañero supera a todos los rivales de la vuelta, tira la menor para guardar fuerza. En los demás casos juega la menor que supere al rival más fuerte. Si solo puede aspirar a una parda, la busca con la menor que empate, o tira la menor si el compañero ya emparda. Si la vuelta está perdida, también tira la menor. Entre cartas propias de igual fuerza elige la primera en el orden canónico del mazo. El aprendiz puede jugar cualquiera de sus cartas en su turno.

**Registro V1.** JSON con `version`, `versionReglas`, `versionReparto`, `semilla`, `dador` y `jugadas` en orden, cada una con asiento y carta. Incluye las jugadas del aprendiz y de los tres bots. Un replay vuelve a repartir y aplica las jugadas registradas con el motor de esa versión. Un prefijo válido reconstruye una mano parcial. Una acción ilegal informa su posición. Un formato, regla o reparto desconocido devuelve un error explícito. Los cambios incompatibles requieren otra versión y una decisión sobre la lectura de la anterior.

## Opciones y consecuencias

Un guion fijo por pantalla resolvería una demostración inicial, pero cada lección tendría que duplicar el cálculo de tantos y la selección de casos. Guardar solo una semilla sería más compacto y haría que los historiales dependieran de las decisiones de bots futuros. Un servidor central facilitaría partidas entre personas y agregaría despliegue y estado remoto. Para una práctica individual y un sitio estático, el registro breve de jugadas y el estado local cubren el uso previsto.

El coste es mantener compatibilidad entre el orden del mazo, el algoritmo de reparto y los replays publicados. Las pruebas comparan el resultado con dos vectores de referencia. [Reparto V1](../../../tests/fixtures/reparto-v1.json) · [Replay V1](../../../tests/fixtures/replay-v1.json)

Para comprobar la ida y vuelta desde la raíz del repositorio con Node.js 24, guardá la mano y reproducila. Los dos comandos muestran el mismo relato, con 33 de envido para el aprendiz y victoria de la pareja 1/3 tras una segunda vuelta parda. [Guía del simulador](../simular.md)

```sh
node scripts/simular-mano.ts --semilla 217 --dador 3 --guardar mano.json
node scripts/simular-mano.ts --replay mano.json
```
