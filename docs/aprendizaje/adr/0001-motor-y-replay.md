# ADR 1 · Motor puro, mesa de parejas y replay versionado

**Estado.** Propuesto para la primera implementación. El PR de diseño registra la decisión de arquitectura. El primer hito la valida con una ejecución de terminal y un replay.

## Contexto

La guía describe las reglas en prosa y tablas. Las lecciones, la mesa guiada y un futuro análisis de probabilidades necesitan aplicar las mismas reglas a repartos distintos. Un error en una mano debe poder reproducirse aunque después cambie el criterio de un rival automático. [Reglas de la mesa y las vueltas](../../../src/data/juego.json) · [Reglas de los tantos](../../../src/data/cantos.json)

## Decisión

Usar módulos TypeScript puros, ejecutables en Node y en el navegador. La guía y sus referencias sirven como oráculos editoriales para escribir ejemplos comprobados a mano. Las funciones de dominio calculan el resultado para cualquier entrada legal. El motor, la política de cada jugador y la presentación tienen interfaces independientes.

| Contrato público propuesto | Semántica que los consumidores pueden asumir |
| --- | --- |
| `pieza(carta, muestra)` | Rango efectivo 2, 4, 5, 11 o 10, o ausencia de pieza. Compartido por jerarquía y tantos. `CardId` usa claves Tatú como `copas-04`. |
| `compararCartas(a, b, muestra)` | Un resultado positivo favorece a la primera, negativo a la segunda y cero indica empate. |
| `evaluarTantos(cartas, muestra)` | Modalidad flor/envido, total y desgloses óptimos. Cada desglose identifica base y aportes de cartas. La corrección de una selección puede comprobar todas las equivalentes. |
| `repartir(semilla, dador)` | Reparto V1 con cuatro manos y muestra. Semilla entera sin signo de 32 bits, incluido cero. El issue de reparto fija el algoritmo con un vector público antes de que otros módulos dependan de él. |
| `iniciarMano(reparto)` y `jugarCarta(estado, {asiento, carta})` | Crea el estado inicial o produce un estado siguiente. Una acción ilegal devuelve un error identificable y conserva el estado previo. |
| `vistaPara(estado, asiento)` | Su mano, muestra, asientos, turno, cartas jugadas, historial público y resultado disponible. Se construye seleccionando campos permitidos. |
| `elegirJugada(vista)` | Devuelve una carta legal. Un criterio estable resuelve empates de la política. El llamador entrega la jugada al motor. |

**Orden y mesa.** El mazo canónico enumera oros, copas, espadas y bastos, cada palo con 1–7, 10, 11 y 12. Los asientos 0–3 se numeran en sentido antihorario y forman las parejas 0/2 y 1/3. El mano es el siguiente asiento después del dador. Se dan tres rondas de una carta por asiento y se gira la siguiente como muestra. El sitio elige una semilla para iniciar cada partida y la entrega explícitamente al motor.

**Estado de la mano.** El estado privado conserva reparto, cartas restantes, turno, orden de las cartas de la vuelta, vueltas cerradas y equipo ganador cuando corresponde. Cada jugada comprueba asiento activo, fase y pertenencia de la carta. Las vueltas se cierran tras cuatro jugadas. El motor decide el cierre anticipado y las pardas según la tabla de la guía. Dos máximos de compañeros ganan juntos frente a valores inferiores. Para determinar qué compañero abre a continuación en ese caso, adoptamos como convención inicial al primero de esos compañeros que jugó el máximo. Hacerla visible en las pruebas y contrastarla con la fuente al implementar. [Capítulo de vueltas](../../../src/data/juego.json)

**Información por asiento.** El controlador conoce la semilla, las manos y el registro completo. Cada bot y la interfaz de juego reciben solo la vista de su asiento. La semilla permitiría deducir cartas ajenas. Para probar el límite, dos repartos con las mismas cartas y acciones visibles deben inducir la misma elección del bot.

**Registro V1.** JSON con `version`, `versionReglas`, `versionReparto`, `semilla`, `dador` y `jugadas` en orden, cada una con asiento y carta. Incluye las jugadas del aprendiz y de los tres bots. Un replay vuelve a repartir y aplica las jugadas registradas con el motor de esa versión. Un prefijo válido reconstruye una mano parcial. Una acción ilegal informa su posición. Un formato, regla o reparto desconocido devuelve un error explícito. Los cambios incompatibles requieren otra versión y una decisión sobre la lectura de la anterior.

## Opciones y consecuencias

Un guion fijo por pantalla resolvería una demostración inicial, pero cada lección tendría que duplicar el cálculo de tantos y la selección de casos. Guardar solo una semilla sería más compacto y haría que los historiales dependieran de las decisiones de bots futuros. Un servidor central facilitaría partidas entre personas y agregaría despliegue y estado remoto. Para una práctica individual y un sitio estático, el registro breve de jugadas y el estado local cubren el uso previsto.

El coste es mantener compatibilidad entre el orden del mazo, el algoritmo de reparto y los replays publicados. Dos vectores revisados, uno de reparto y otro de jugadas, detectarán cambios accidentales. El hito de terminal hará una ida y vuelta completa sobre esos contratos.
