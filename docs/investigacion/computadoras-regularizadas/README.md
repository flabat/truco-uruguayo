# Computadoras regularizadas: informe de la jornada del 27 de noviembre de 2026

Issue #461 · PR #464 · Todo se jugó entre computadoras, en la Mac M5 (10 núcleos de CPU, GPU de 10 núcleos, 24 GB).

<!-- RESUMEN -->

## Punto de partida

| Mesa en la app | Computadora que juega hoy | Cómo es |
| --- | --- | --- |
| Duelo | Ceibo Duelo (`d2146e8dd1b7`) | V1 escrito a mano más un ajuste lineal entrenado en liga. |
| Parejas (siempre con señas al pie) | `pie-parejas-v2` | Bot clásico al pie con umbrales de envido ajustados. |
| Tercetos (al pie) | `pie-clasico-v1` | Bot clásico al pie. |

Los modelos aprendidos de parejas (Ceibo Parejas y Ceibo Parejas con señas) no llegan a las mesas de la app: la app crea todas las mesas 2v2 con señas al pie.

Antes de esta jornada se probaron búsquedas tipo AlphaZero (#276 a #298). Le ganaron a Ceibo hasta 78 % en duelo, pero ninguna pasó la puerta. Retrocedieron frente al farolero frecuente, el control de cartas fuertes y el finalista de la liga. La medición de hoy explica por qué esa parte de la puerta es exigente:

| Duelo, reglas de la API, 128 pares | Ceibo | V1 |
| --- | ---: | ---: |
| contra V1 | 88,7 % | 50,0 % |
| contra el aceptador | 93,0 % | 70,7 % |
| contra el que no quiere | 91,8 % | 52,0 % |
| contra el farolero frecuente | 85,5 % | 64,8 % |
| contra el farolero ocasional | 89,1 % | 52,0 % |
| contra cartas fuertes | 88,7 % | 70,7 % |

Ceibo es, en la práctica, un explotador de V1. Todos los estilos fijos del campo son variantes de V1, así que pasar la puerta exige dos cosas a la vez: ganarle a Ceibo y explotar a los estilos tanto como él. Ceibo saca la diferencia sobre todo en el envido: frente a V1 cede 6,7 tantos de envido por chico, contra 13,2 de V1 frente a sí mismo, y no usa memoria del chico.

## Qué tipo de modelo y por qué

El truco uruguayo es un juego de información imperfecta con apuestas (envido, flor, truco), muestra, piezas y chicos a 40 o 50. Las familias de métodos consideradas:

| Familia | Ejemplos | Ventajas | Por qué no fue la elegida |
| --- | --- | --- | --- |
| Búsqueda con mundos muestreados | PIMC, AlphaZero determinizado (#276–#298) | Fuerte en el cruce directo | Fusión de estrategias; las manos rivales se muestrean sin tener en cuenta lo que revelan las apuestas. Ya falló la puerta. |
| Minimización de arrepentimiento | CFR, Deep CFR, DREAM, ESCHER | Convergencia a Nash en duelo de suma cero | Requiere recorrer el árbol con el motor y no se extiende bien a compañeros con manos privadas. No entra en una jornada. |
| Búsqueda con creencias públicas | ReBeL, Student of Games | Lo más fuerte en póker | Construir y entrenar el sistema completo lleva semanas. |
| Monte Carlo profundo | DouZero | Simple y muy fuerte en Dou Dizhu | Política determinista: no mezcla faroles, que en el truco son centrales. |
| **Gradiente de política regularizado** | **R-NaD (DeepNash), Magnetic Mirror Descent, PPO con crítico de información perfecta (PerfectDou)** | **Políticas mixtas, equipos, inferencia de una pasada** | **Elegida.** |

Tres resultados de la literatura sostienen la elección:

- DeepNash llegó al nivel de expertos humanos en Stratego sin búsqueda, con R-NaD: autojuego cuya dinámica se regulariza hacia una política de referencia para converger a un equilibrio en lugar de girar a su alrededor ([Perolat et al., Science 2022](https://arxiv.org/abs/2206.15378)).
- Magnetic Mirror Descent muestra que un gradiente de política con un término proximal hacia un «imán» reduce la explotabilidad en juegos de información imperfecta ([Sokota et al., 2022](https://arxiv.org/abs/2206.05825)). Una revisión de 2026 con miles de corridas encontró que los métodos de gradiente de política genéricos bien ajustados igualan o superan a los basados en CFR, FP y DO ([Rudolph et al., ICLR 2026](https://arxiv.org/abs/2502.08938)).
- PerfectDou dominó Dou Dizhu, un juego de cartas por equipos, con PPO y un crítico que ve todas las manos durante el entrenamiento mientras el actor ve solo la suya ([Yang et al., NeurIPS 2022](https://arxiv.org/abs/2203.16406)).

No encontré trabajos publicados de CFR ni de aprendizaje profundo para el truco; el antecedente más cercano es un trabajo de MCCFR para Toepen.

## El método

**Actor.** MLP de 404 rasgos → 256 → 256 → 17 ranuras (tres cartas por fuerza de la mano original y catorce cantos), con máscara de jugadas legales. Los rasgos salen solo de la vista del asiento: mano propia y fuerza de cada carta con esa muestra, vueltas, cantos de la mano, tantos revelados, tanteador, últimas diez jugadas, señas al pie del equipo y, en duelo, los doce contadores públicos del rival que la API ya entrega (`memory: "opponent"`). Una prueba unitaria verifica que el vector no cambia si cambian las cartas del rival. La inferencia es una pasada en TypeScript, sin búsqueda.

**Crítico.** Otra red que además ve las manos de todos los asientos. Se usa solo para estimar ventajas durante el entrenamiento y nunca se exporta.

**Aprendizaje.** PPO con recorte, entropía y una penalización KL hacia una política ancla que se renueva cada 50 iteraciones (R-NaD / MMD). Arranque por clonación del campeón de cada formato. El simulador corre en hilos de Node sobre el mismo `mesa-online` del servidor, y el aprendizaje en PyTorch con Metal.

**Recompensa moldeada.** Al cerrar cada reparto, cada asiento recibe Φ(tanteador después) − Φ(tanteador antes) de su equipo, con Φ = 2·P(ganar el chico) − 1 estimado por autojuego del bot de referencia. Es moldeado por potencial ([Ng et al., 1999](https://people.eecs.berkeley.edu/~pabbeel/cs287-fa09/readings/NgHaradaRussell-shaping-ICML1999.pdf)): la suma telescópica es el resultado del chico, así que la política óptima no cambia, pero cada canto recibe crédito en su propia mano.

**Liga y puerta.** Cada chico de entrenamiento enfrenta al aprendiz con una copia de sí mismo, instantáneas anteriores o rivales fijos (campeón, V1, retador, los cinco estilos). Los pesos de los rivales fijos se ajustan según la puerta: más chicos contra la familia donde el aprendiz queda más lejos de la tasa del campeón.

**Fidelidad con las mesas reales.** En duelo se entrena con las reglas de la API (flor inmediata, respuestas sin flor de las computadoras, anticipación ante flor y conversión de una carta en irse al mazo como `confirmarComputadora`) y con el reparto V1 de la arena. Parejas y tercetos se juegan con señas al pie como las crea la app; las indicaciones del pie siguen la regla clásica y el modelo aprende cartas y cantos condicionados a lo que le indican.

## Cómo se desarrolló la jornada

Horas en UTC.

| Hora | Paso |
| --- | --- |
| Hasta 07:13 | Lectura del motor, de la API y de las ligas anteriores; investigación, diseño, simulador, rasgos, red, aprendiz y pruebas de cobertura de jugadas. |
| 07:13 | Duelo A: clonación de Ceibo (787 mil decisiones, entropía cruzada 0,40). El clon solo le gana a Ceibo 41 %: copia el estilo, no la precisión. |
| 07:16–07:21 | Parejas A clona a `pie-parejas-v2` (gana 38 %) y Tercetos A al bot clásico (33 %). |
| 07:27 | Duelo B se separa de Duelo A en la iteración 150 con la recompensa moldeada: comparación A/B. |
| 08:39 | Primera puerta: Duelo A 65 % y Duelo B 67 % contra Ceibo, pero ceden hasta 4 puntos frente a V1 y los faroleros. |
| 08:40–10:20 | Diagnóstico: Ceibo saca su ventaja en el envido contra los estilos. Se sube la proporción de rivales fijos a 0,8, se suma el finalista de la liga y la ponderación según la puerta pasa a perseguir la tasa del campeón. |
| 08:43–10:15 | Explotabilidad: un contrajugador PPO de 45 minutos contra Duelo B y otro igual contra Ceibo. |
| 10:20 | Las marcas del campeón, medidas con 128 pares, salían hasta 5 puntos bajas. Se remiden con 512 a 1024 pares y la corrida las relee en cada instantánea. |
| 10:15–12:33 | Tres rondas más de explotadores contra instantáneas de Duelo B, cada uno sumado a la liga de Duelo B al terminar. |
| 12:34 | Parejas independiente: linaje desde cero, sin clonación, para la familia independiente de la puerta al pie. |
| 13:20 | Duelo B termina en la iteración 2934, con 3,1 millones de chicos. Selección entre cinco instantáneas con 512 pares y una semilla reservada para elegir. Queda la 2934, la única que no cede frente a ninguna familia. |
| 13:21 | Parejas A sigue tres horas más. Tercetos A termina a las 14:21 en la iteración 2520. |
| 13:31–13:35 | Campeonato oficial de duelo con `training/championship/event.ts`. El contrajugador Monte Carlo oficial se entrena contra el candidato exacto. |
| 13:31–14:31 | Explotador PPO de una hora contra el candidato final. |
| 14:22 | Tercetos independiente desde cero. |
| 14:31–14:40 | Puerta final de duelo con 2048 pares y otra semilla: no pasa. |
| 14:41 | Duelo C se separa de Duelo B con el triple de entropía, más autojuego, el explotador final y el contrajugador oficial en la liga. Cada 40 minutos un explotador nuevo entrena contra su última instantánea y se suma a la liga. |

| 16:22 | Parejas A termina en la iteración 2954. Explotador de una hora contra el candidato al pie y otro igual contra `pie-parejas-v2`. |
| 16:34 | Parejas independiente termina en la iteración 997. Selección al pie. |
| 16:40 | Parejas B se separa de Parejas A con más entropía y autojuego; los explotadores entran a su liga. Parejas independiente queda afuera para seguir siendo independiente. |
| 16:45 | Diagnóstico del agujero de duelo: el real envido. |
| 16:52 | Tercetos independiente termina en la iteración 1185. Explotadores de tercetos. |
| 17:24–17:38 | Puerta final al pie. |
| 17:54–18:13 | Puerta final de tercetos. |
| 18:14 | Tercetos B se separa de Tercetos A con la misma receta. |
| 18:25 | Duelo independiente desde cero, para la puerta final de Duelo C, porque el finalista ya estaba en la liga. |

<!-- PROCESO-RESTO -->

## Resultados

La puerta compara al candidato con el campeón sobre los mismos repartos. Para pasar, el candidato le tiene que ganar al campeón con la cota inferior del 95 % por encima del 50 % y no perder más de 2 puntos frente al campeón contra ninguna familia, también con la cota inferior. Las cotas salen de un bootstrap por pares con corrección de Bonferroni.

### Duelo

**Selección.** Cinco instantáneas de Duelo B con 512 pares y la semilla 461200, que no se usó para nada más. Además de las familias de la puerta jugaron el finalista de la liga y los cuatro explotadores entrenados durante la jornada.

| Instantánea | Contra Ceibo | Peor familia, cota inferior | Comentario |
| --- | ---: | ---: | --- |
| 1475 | 71,1 % [67,5] | −15,0 puntos | Los explotadores 2 y 3 lo castigan. |
| 1825 | 76,6 % [73,2] | −14,6 | La más fuerte contra Ceibo; cede frente a V1 y al explotador 3. |
| 2200 | 72,9 % [69,0] | −6,6 | Cede frente a V1 y al farolero ocasional. |
| 2600 | 68,4 % [65,0] | −5,0 | |
| 2934 | 71,1 % [67,7] | −2,9 | Ninguna familia por debajo de Ceibo en promedio. |

**Campeonato oficial.** `event.ts` con 256 pares, 9216 chicos y 3 minutos 46 segundos dio «no concluyente». Ese tamaño, fijo desde #132, solo detecta efectos de unos 12,6 puntos.

- Contra V1, el titular del campeonato oficial: 86,1 % [82,2; 89,8].
- Contra los estilos: entre 17 y 43 puntos más que V1.
- Contra el finalista independiente: 54,3 %.
- Contra el contrajugador oficial entrenado contra el candidato: 82,0 %, 1,4 puntos menos que V1 [−7,2; +4,5].
- Latencia mediana de 0,62 ms por decisión, sin caer nunca en el respaldo.

**Puerta final.** 2048 pares con la semilla 461300 y un contrajugador nuevo; tardó 8 minutos.

| Familia | Candidato | Ceibo | Diferencia [IC 95 %] | |
| --- | ---: | ---: | --- | --- |
| Cruce directo contra Ceibo | 68,0 % | | [66,3; 69,8] | ✓ |
| V1 | 85,4 % | 86,5 % | −1,0 [−2,6; +0,6] | ✗ |
| Retador | 85,4 % | 84,2 % | +1,2 [−0,4; +2,9] | ✓ |
| Aceptador | 93,7 % | 91,3 % | +2,4 [+1,0; +3,8] | ✓ |
| El que no quiere | 98,1 % | 92,0 % | +6,2 [+4,9; +7,5] | ✓ |
| Farolero frecuente | 84,7 % | 80,5 % | +4,2 [+2,3; +6,0] | ✓ |
| Farolero ocasional | 85,5 % | 85,9 % | −0,4 [−1,9; +1,2] | ✓ |
| Cartas fuertes | 95,7 % | 86,6 % | +9,1 [+7,6; +10,5] | ✓ |
| Finalista de la liga | 52,6 % | 40,2 % | +12,5 [+10,0; +14,8] | ✓ |
| Contrajugador oficial | 81,7 % | 83,3 % | −1,7 [−3,9; +0,5] | ✗ |
| Explotador PPO de una hora | 12,5 % | 73,8 % | −61,3 [−63,5; −58,9] | ✗ |
| Explotadores 1 a 4 de la jornada | 55 a 80 % | 29 a 43 % | +20,7 a +50,9 | ✓ |

El candidato le gana a Ceibo con claridad y lo supera contra once de las catorce familias. Falla por poco contra V1 y contra el contrajugador oficial, y falla de lleno contra el explotador PPO. El finalista no cuenta como familia independiente: entró a la liga de Duelo B a las 08:40 con peso 0,06, y también es el independiente del campeonato oficial. Por eso Duelo C se mide además contra un linaje de duelo entrenado desde cero.

**Explotabilidad.** Un explotador parte de los mismos pesos que su blanco, sin ancla, y juega solo contra él. La tabla muestra su tasa de victorias en entrenamiento a la misma altura:

| Blanco | Entropía del blanco | Iteración 50 | Iteración 140 | Al terminar |
| --- | ---: | ---: | ---: | ---: |
| Duelo B, iteración 634 | 0,26 | 54 % | 60 % | 69 % (182) |
| Duelo B, iteración 1475 | 0,23 | 63 % | 76 % | 74 % (171) |
| Duelo B, iteración 1825 | 0,22 | 64 % | 72 % | 78 % (171) |
| Duelo B, iteración 2200 | 0,20 | 54 % | 58 % | 66 % (176) |
| Duelo B, iteración 2934 (candidato) | 0,16 | 61 % | 83 % | 87 % (438) |
| Duelo C, iteración 3150 | 0,30 | 51 % | 60 % | 60 % (140) |
| Ceibo | — | 88 % | 94 % | 96 % (323) |

El explotador de Ceibo arrancó de Duelo B en la iteración 634, que ya le ganaba a Ceibo 67 %, así que su cifra no es comparable punto a punto: ganó 29 puntos en su entrenamiento, contra 37 del explotador del candidato. Lo que sí muestra es que Ceibo tampoco resiste un contrajugador dirigido y que la puerta solo se lo exige al candidato.

Tres lecturas:

1. **Ganarles a los explotadores conocidos no elimina los nuevos.** Duelo B entrenó contra los explotadores 1 a 4 y terminó ganándoles por 20 a 51 puntos más que Ceibo. Un explotador nuevo encontró otro agujero en una hora.
2. **La entropía cayó de 0,41 tras la clonación a 0,16 al final.** Cuanto más aprendía a explotar a los estilos fijos, más determinista se volvía. El blanco más explotable fue también el de menor entropía, aunque la relación no es monótona: la iteración 2200 resistió mejor que la 1475, posiblemente porque ya había entrenado contra dos explotadores y la 1475 contra uno.
3. **El contrajugador oficial es más blando que el PPO.** Le gana al candidato 18 % y a Ceibo 17 %, mientras que el PPO le gana al candidato 87,5 %. La puerta del campeonato usa el oficial; el PPO es una prueba de estrés más exigente que esta jornada agregó.

**Moldeado por potencial.** En la comparación A/B a la iteración 630, Duelo A sin moldeado le ganó a Ceibo 65,0 % [61,6; 68,3] y Duelo B con moldeado 67,0 % [63,9; 70,1], con 512 pares. La diferencia no es significativa. Duelo B siguió porque no rendía peor y el moldeado por potencial no cambia la política óptima.

**De dónde salen los puntos.** Desglose de 200 pares por chico, ganados y cedidos:

| Cruce | Gana | Manos por chico | Truco | Envido | Flor |
| --- | ---: | ---: | --- | --- | --- |
| Duelo B 1475 contra Ceibo | 74,0 % | 18,6 | +16,7 / −12,5 | +12,0 / −9,6 | +8,9 / −8,3 |
| Duelo B 1475 contra V1 | 87,8 % | 15,4 | +14,8 / −8,4 | +16,3 / −5,8 | +7,2 / −7,0 |
| Ceibo contra V1 | 86,8 % | 13,3 | +12,9 / −7,3 | +19,3 / −6,8 | +6,8 / −6,2 |

El modelo le saca a V1 más que Ceibo en el truco y menos en el envido. Contra Ceibo gana sobre todo por el truco.

<!-- RESULTADOS-DUELO-C -->

### Parejas con señas al pie

**Selección.** Parejas A en la iteración 1822 y al final de la extensión, en la 2954, con 512 pares y la semilla 461200. La 2954 superó a la 1822 contra todas las familias: 75,4 % contra 70,1 % frente a `pie-parejas-v2`.

**Puerta final.** 2048 pares con la semilla 461300; tardó 13 minutos y medio. La familia independiente es Parejas independiente, el linaje desde cero que la liga de Parejas A nunca vio. El explotador entrenó una hora contra el candidato.

| Familia | Candidato | `pie-parejas-v2` | Diferencia [IC 95 %] | |
| --- | ---: | ---: | --- | --- |
| Cruce directo contra `pie-parejas-v2` | 77,3 % | | [75,8; 78,8] | ✓ |
| Clásico al pie | 70,8 % | 65,5 % | +5,2 [+3,4; +7,2] | ✓ |
| Aceptador | 75,0 % | 78,2 % | −3,2 [−5,1; −1,4] | ✗ |
| El que no quiere | 91,9 % | 76,9 % | +15,0 [+13,3; +16,5] | ✓ |
| Farolero frecuente | 69,9 % | 57,3 % | +12,6 [+10,5; +14,7] | ✓ |
| Farolero ocasional | 70,7 % | 64,8 % | +5,9 [+4,1; +7,8] | ✓ |
| Cartas fuertes | 83,1 % | 77,8 % | +5,4 [+3,5; +7,1] | ✓ |
| Parejas independiente | 38,8 % | 39,6 % | −0,8 [−3,0; +1,5] | ✗ |
| Explotador PPO de una hora | 39,1 % | 34,0 % | +5,2 [+3,1; +7,3] | ✓ |

No pasa por dos familias:

- **El aceptador**, que dice quiero a todo. Contra él no conviene farolear, y el candidato farolea: después de un envido rival responde falta envido el 30 % de las veces con menos de 24.
- **Parejas independiente**, por poco. Ese linaje desde cero, sin clonación, le gana al campeón 60 % y al candidato 61 %, sobre todo en el envido: frente al candidato suma 10,8 tantos de envido por chico y cede 7,8. Al pie el patrón es menos nítido que en duelo porque cuenta el tanto del compañero.

**Explotabilidad.** El explotador del candidato llegó a 63 % en la iteración 140 y a 65 % al terminar, en la 160. En duelo, el del candidato llegaba a 83 % a la misma altura. Uno contra `pie-parejas-v2`, con la misma inicialización y el mismo presupuesto, pasó de 78 % a 88 %. Con el mismo presupuesto, el explotador al pie consiguió bastante menos que el de duelo. El explotador también resultó fuerte en general: le gana a `pie-parejas-v2` 66 %.

<!-- RESULTADOS-PIE-B -->

### Tercetos al pie

Tercetos A terminó en la iteración 2520. Con un solo candidato no hubo selección; la puerta de 512 pares con la semilla 461200 sirvió de anticipo y dio 66,7 % contra el bot clásico.

**Puerta final.** 2048 pares con la semilla 461300; tardó 19 minutos. El campeón es `pie-clasico-v1`, así que las familias fijas son los cinco estilos.

| Familia | Candidato | `pie-clasico-v1` | Diferencia [IC 95 %] | |
| --- | ---: | ---: | --- | --- |
| Cruce directo contra `pie-clasico-v1` | 67,5 % | | [65,8; 69,1] | ✓ |
| Aceptador | 77,7 % | 63,7 % | +14,0 [+12,1; +16,0] | ✓ |
| El que no quiere | 75,0 % | 60,3 % | +14,7 [+12,6; +16,7] | ✓ |
| Farolero frecuente | 67,1 % | 57,1 % | +10,0 [+7,6; +12,3] | ✓ |
| Farolero ocasional | 66,5 % | 51,1 % | +15,4 [+13,5; +17,4] | ✓ |
| Cartas fuertes | 84,2 % | 76,7 % | +7,5 [+5,8; +9,4] | ✓ |
| Tercetos independiente | 41,8 % | 43,5 % | −1,7 [−4,1; +0,6] | ✗ |
| Explotador PPO de una hora | 37,9 % | 46,7 % | −8,8 [−11,1; −6,5] | ✗ |

Contra los estilos, Tercetos A es el resultado más claro de la jornada: les saca entre 7 y 15 puntos más que el bot clásico. Falla contra los dos rivales aprendidos. Su explotador llegó a 65 % en la iteración 140, como al pie, pero la entropía de Tercetos A había bajado a 0,08: es el más determinista de los tres. Uno igual contra el bot clásico, con la misma inicialización, pasó de 68 % a 72 %.

<!-- RESULTADOS-TERCETOS-B -->

<!-- CONCLUSIONES -->

## Limitaciones

- **Una semilla por linaje.** Con una sola Mac y un día no hubo repeticiones, así que no sé cuánto varía el resultado entre corridas iguales.
- **La explotabilidad medida es una cota inferior.** Cada explotador entrenó una hora desde los pesos de su blanco. Uno más largo o desde cero podría encontrar agujeros más grandes.
- **Al pie, el modelo no elige las indicaciones.** Las recibe según la regla clásica y aprende a jugar con ellas. Si el pie es una persona que indica distinto, el modelo juega con indicaciones que nunca vio en el entrenamiento.
- **Sin personas.** Todo se jugó entre computadoras, como pide el protocolo. Los estilos fijos son variantes de V1 o del bot clásico; ninguna mide cómo juega una persona.
- **El campeonato oficial no distingue diferencias chicas.** Con 256 pares fijos, todo lo que quede por debajo de unos 12,6 puntos sale «no concluyente». Por eso las puertas de esta jornada usaron entre 512 y 2048 pares con `evaluate.ts`.

## Para llevarlo a la app

Este PR no activa nada. Los pesos quedan en `runs/regularized/` de la Mac.

**Duelo.** El artefacto `truco-regularized-v1` ya es servible por `api/actor-registry.ts` y entra en la imagen de la API. Para activarlo se sigue el camino de siempre: campeonato con `training/championship/event.ts` y la entrada que arma `training/regularized/bundle.ts`, verificación y activación.

**Parejas al pie y tercetos.** Falta el cableado:

1. Hoy `api/mesas.ts` fija `pie-parejas-v2`, `pie-clasico-v1` o la política de tercetos con constantes, y `juego.activaciones` solo admite `duel`, `pairs`, `pairs-senas` y `pairs-private-senas`. Hace falta una migración con claves propias para parejas al pie y tercetos, y que `mesas.ts` las lea como ya lee el duelo.
2. Una rama en `api/partidas-pie.ts` que cargue el artefacto por su pin y decida con `openRegularizedPie` de `training/regularized/actor.ts`, en lugar de `elegirAccionPoliticaPie`.
3. Registrar el modelo en `src/lib/modelos.ts` para que la app lo nombre.

## Cómo reproducirlo

Las órdenes, los nombres de los rivales y la preparación de los campeones están en [el README del entrenador](../../../training/regularized/README.md). Los modelos de la jornada quedaron en `runs/regularized/` de la Mac y no se versionan. Cada corrida guarda `config.json`, `progress.jsonl` con cada iteración y evaluación, `targets.json` con las marcas del campeón, `extra-opponents.json` con los rivales sumados durante la corrida, las instantáneas y `checkpoint.pt` para reanudar.

<!-- REPRODUCCION-RESTO -->
