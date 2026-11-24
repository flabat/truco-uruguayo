# ADR 3 · Probabilidad de ganar la mano desde la información del aprendiz

**Estado.** Decisión implementada. Los [mundos compatibles](https://github.com/flabat/truco-uruguayo/pull/70) y el [cálculo pareado](https://github.com/flabat/truco-uruguayo/pull/71) están integrados. La [verificación independiente](../probabilidad/validacion.md) contrasta las dos escenas y once posiciones de práctica. Continúa las decisiones sobre motor, vista por asiento y replay de la [ADR 1](0001-motor-y-replay.md) y el [estudio de salidas](../../investigacion/salidas/README.md).

## Pregunta y modelo

Para cada carta legal `c` estimamos **P(la pareja del aprendiz gana la mano | información en este turno, jugar c ahora, política V1 en los turnos siguientes)**. La pareja se obtiene con `equipoPorAsiento[asiento]`. El ganador proviene de `equipoGanador`, con las pardas y cierres del motor. Cada candidato representa una acción que elegimos imponer sobre el mismo estado. El modelo de reparto inicial es una baraja bien mezclada de 40 cartas, cuatro manos etiquetadas de tres y una muestra. El resto queda en el mazo. [Reglas implementadas](../../../paquetes/motor/src/mano.ts) · [Reparto](../../../paquetes/motor/src/reparto.ts)

El compañero y los dos rivales siguen `elegirJugada(vistaPara(estado, asiento))` en el historial observado y en la continuación. El aprendiz pudo elegir libremente en los turnos pasados. Después de la carta candidata también sigue esa política para que las alternativas tengan la misma continuación definida. El desempate de cartas propias usa el orden canónico del mazo. Un cambio de bot, orden de desempate o reglas requiere nueva versión y revalidar los resultados editoriales. La etiqueta al público es «con los jugadores automáticos de esta mesa». [Bot V1](../../../paquetes/motor/src/jugadores.ts)

## Frontera de información

`PosicionPublicaV1` contiene versión, asiento del aprendiz, dador, muestra, cartas propias restantes y secuencia ordenada de jugadas públicas `{asiento, carta}` hasta el cursor. Mano, turno, equipos y cierre se derivan o se contrastan con el motor. Se construye con `VistaAsiento` de ese instante. La clave canónica conserva el orden de las jugadas y ordena la mano propia por el mazo. El cálculo recibe por separado la configuración reproducible. El reparto real, su semilla, las cartas de compañero y rivales, el historial futuro y el identificador de una escena que permita reconstruirlos quedan en el controlador del juego. El código de estimación sólo trabaja con la proyección pública.

Reconstruir las tres cartas iniciales propias uniendo las restantes a las ya jugadas por el aprendiz. Validar identidad, unicidad, tres cartas por asiento al completar el reparto, dador y mano, dueño de cada carta pública, orden de turnos, resultado de las vueltas y terminalidad. Un prefijo mal formado da un error de entrada. Una posición legal que no le toca al aprendiz y una mano cerrada tienen estados propios. Una jugada forzada admite una cifra y cero comparaciones. Una historia legal que ningún bot V1 pudo producir da «incompatible con este modelo» cuando se pudo demostrar exhaustivamente.

## Distribución de las cartas ocultas

Al abrir, fijar muestra y cartas propias. Sortear nueve cartas distintas entre las 36 disponibles y distribuir tres por asiento ajeno, dejando 27 sin repartir. Una distribución de tres manos etiquetadas tiene el mismo peso que cualquier otra. Para el ejemplo publicado se conserva el orden exacto de extracción del estudio, con semillas de análisis 29 a 20.028. La semilla del reparto que se juega cumple una función distinta.

Durante la mano, las decisiones públicas de un bot dan información sobre sus cartas. Por ejemplo, si al abrir una vuelta el bot jugó un 6, una mano donde aún guardaba una pieza más fuerte no explica esa apertura bajo V1. El modelo condiciona también por esa evidencia. El siguiente procedimiento evita esperar a que una baraja aleatoria reproduzca por casualidad toda la historia:

1. Fijar la muestra, las tres cartas iniciales propias y, para cada asiento ajeno, sus cartas ya jugadas. Cada asiento ajeno necesita `3 − cantidad que jugó` cartas adicionales. Formar el conjunto libre excluyendo todas las fijas.
2. Para cada asiento ajeno, enumerar combinaciones sin orden del tamaño que necesita. Para cada combinación, recorrer sus decisiones pasadas con sus cartas de entonces y los hechos públicos **anteriores** a esa jugada. Retener la combinación si el bot habría jugado exactamente la carta observada en cada decisión. El aprendiz sólo debe haber jugado legalmente. Para construir vistas parciales, las salidas, pardas y líderes deben derivarse de los mismos resultados del motor. Una implementación inicial también puede reconstruir un mundo completo y filtrar al reproducirlo como oráculo.
3. Un mundo es una terna de combinaciones retenidas, una por asiento, sin ninguna carta compartida. Las cartas restantes integran el mazo. En el modo exacto, visitar cada terna disjunta una vez. En Monte Carlo se puede tomar una combinación **uniforme e independiente** de cada lista y descartar **toda** la terna si hay colisión. Volver a sortear sólo el asiento que colisionó sesga las probabilidades. Con listas muy grandes al abrir, usar el sorteo directo sin reposición.
4. Componer un `RepartoV1` sintético legal con las cartas públicas y elegidas. El campo semilla de este contenedor es metadato de simulación. Iniciar con `iniciarMano`, reproducir las jugadas con `jugarCarta` y comprobar que la vista proyectada coincide con la entrada. El motor gobierna la instrucción de terminar. Evitar serializar estos mundos con el replay por semilla del juego real.

**Por qué cada mundo vale lo mismo.** El reparto uniforme da igual peso a cada asignación de las cartas faltantes a los tres asientos etiquetados y al mazo. Los órdenes posibles dentro de cada mano aportan el mismo factor y la política usa un desempate independiente del orden recibido. Las decisiones deterministas por asiento dan verosimilitud 1 o 0 para el historial público. Conservar sólo asignaciones compatibles equivale a condicionar ese reparto inicial. El muestreo de las listas tiene probabilidad de propuesta constante por terna, y rechazar la terna completa conserva esa uniformidad. Si el bot más adelante toma decisiones aleatorias o recibe señas, haría falta un modelo distinto.

## Jugar cada alternativa y comparar

```text
para cada mundo compatible (enumerado o extraído):
    reconstruir una vez el estado justo antes de elegir
    para cada carta legal, desde ese mismo estado:
        imponer la carta del aprendiz con jugarCarta
        mientras haya turno:
            obtener la vista del asiento actual
            aplicar la jugada de la política V1 a esa vista
        anotar 1 si equipoGanador es la pareja del aprendiz, o 0
    acumular el vector entero de resultados y sus pares
```

El denominador común `N` es la cantidad de mundos completos aceptados y evaluados en **todas** las alternativas. Para la carta A, `pA = victoriasA / N`. Para comparar A con B, contar `soloA` y `soloB`. La diferencia es `Δ = (soloA − soloB) / N`. Multiplicar por 100 para expresarla en puntos porcentuales. Los mundos donde ambas ganan o ambas pierden cuentan en el denominador. Conservar enteros y denominador hasta la presentación. Con exactitud, una igualdad de conteos significa igualdad en el modelo incluso si A y B ganan en mundos diferentes.

En una muestra fija, cada diferencia por mundo toma −1, 0 o +1. Para `m = k(k−1)/2` pares de `k` cartas y error familiar 0,05, usar la cota bilateral de Hoeffding con corrección de Bonferroni. El margen conservador de cada diferencia en proporciones es `sqrt(2 × ln(2m / 0,05) / N)`. Aplicar `[Δ−margen, Δ+margen]` y recortar a [−1,1]. Con tres cartas y N=20.000, el margen es aproximadamente **2,19 pp**. La interfaz sólo señala una carta como mejor distinguida por la muestra si el límite inferior frente a **cada** alternativa supera cero. Si un par incluye cero, informar diferencia inconclusa para ese par. La cota tiene nivel nominal bajo muestreo independiente de mundos, aproximado por el generador seudoaleatorio. No mide error del modelo. En modo exacto el intervalo por azar de muestreo tiene amplitud cero. Con cero pares se omite. El CLI histórico conserva su intervalo individual por par y su JSON publicado. [Cálculo original](../../../scripts/estudios/salidas.ts)

## Perfil V1 y límites de trabajo

- Las dos posiciones editoriales tienen perfiles fijos en un registro por **clave pública**. Apertura: protocolo histórico, 20.000 mundos. Segunda decisión: enumeración completa. Para práctica libre, intentar enumeración si el producto de los tamaños de las listas compatibles es como máximo **32.768**. Con una lista vacía se puede declarar incompatibilidad de inmediato. Detectar la apertura sin construir listas innecesarias.
- Si el producto supera el umbral, usar un perfil de **4.096 mundos aceptados** con un máximo de **65.536 propuestas**, semilla de análisis pública V1 fija 29 y secuencia determinista. La clave del resultado incluye posición canónica, versión del motor/política/algoritmo y perfil. Partir el trabajo en lotes conserva el flujo de números y los conteos. Los perfiles son decisiones iniciales a medir en dispositivos reales.
- Si el presupuesto se agota antes de llegar a N, devolver «presupuesto agotado» con contadores de diagnóstico. Un muestreo infructuoso no prueba imposibilidad. El tiempo transcurrido puede motivar cancelar, nunca decidir qué carta recomendar. Publicar una clasificación sólo al completar el perfil. Si el usuario abandona un turno se descarta todo resultado tardío.
- Respuesta final: clave y versión, método, semilla de análisis si aplica, mundos evaluados, propuestas cuando corresponda, filas por `CardId` con victorias y pares con orientación explícita, conteos discordantes, diferencia e intervalo. La UI puede derivar la orientación inversa cambiando signo y extremos. Las opciones y su orden visual no intervienen en el muestreo. La ejecución no altera el juego.

## Dos controles reproducibles

**Apertura.** Ejecutar `node scripts/estudios/salidas.ts --semilla 29 --repartos 20000`. En orden 2 de copas, 3 de bastos, 5 de oros, los conteos verificados son **12.023, 13.779 y 12.530**. Para 3 contra 2, los discordantes son **2.100 y 344**. Para 3 contra 5 son **2.401 y 1.152**. Las semillas de auditoría 44, 45 y 46 dan respectivamente (pierde, gana, pierde), (pierde, pierde, pierde) y (pierde, gana, gana). El perfil editorial debe reproducir los enteros, incluso si usa resultados precalculados.

**Turno intermedio.** Tomar el [prefijo de siete jugadas](../probabilidad/README.md#segunda-decisión--gastar-la-pieza-ahora). Quedan 30 cartas libres y una carta por asignar a cada asiento ajeno. Un oráculo corto puede recorrer las **30 × 29 × 28 = 24.360** ternas ordenadas distintas. Para cada una, iniciar la mano, exigir la jugada de V1 en las seis decisiones ajenas, imponer legalmente las siete jugadas y jugar cada opción hasta el cierre. Quedan **1.175** mundos compatibles. En el orden (2 de copas, 5 de oros), los conteos conjuntos son **(gana,gana)=0, (gana,pierde)=692, (pierde,gana)=0, (pierde,pierde)=483**. Este recuento se verificó al diseñar la lección mediante enumeración directa con el motor. El issue de cálculo debe conservar un oráculo automatizado independiente del muestreador de producción.

Para reproducir el segundo control desde la raíz, ejecutar `node docs/aprendizaje/probabilidad/auditar-segunda.mjs` con Node 24. El [oráculo de la segunda vuelta](../probabilidad/auditar-segunda.mjs) usa sólo las reglas y la política existentes. Verifica los totales y publica las cuatro celdas del recuento.

## Alternativas y consecuencias

Evaluar sólo el reparto real permite explicar cómo terminó una partida, pero revela información particular al valorar la decisión. Sortear mundos diferentes por carta desperdicia la posibilidad de identificar en qué manos cambió el resultado. Ignorar lo que jugaron los bots da una pregunta distinta y puede asignar peso a manos que la mesa nunca produciría. Un juego óptimo o un modelo de rivales humanos exigirían definir estrategias e inferencia nuevas. La política V1 es reproducible, permite una comparación auditable y limita la generalización de cualquier porcentaje.
