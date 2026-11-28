# Computadoras regularizadas: informe de la jornada del 27 de noviembre de 2026

Issue #461 · PR #464 · Todo se jugó entre computadoras, en la Mac M5 (10 núcleos de CPU, GPU de 10 núcleos, 24 GB).

## Resumen

En un día de Mac entrené computadoras con autojuego regularizado: PPO con una penalización KL hacia una política ancla que se renueva (R-NaD, Magnetic Mirror Descent), un crítico que ve todas las manos solo durante el entrenamiento y una liga a la que se suman explotadores. La inferencia es una pasada de red, sin búsqueda, en 0,6 ms por decisión.

| Mesa | Modelo nuevo | Contra el campeón (2048 pares) | Estado |
| --- | --- | --- | --- |
| Parejas al pie | Parejas C, iteración 3800 | 74,3 % [72,6; 76,0] contra `pie-parejas-v2` | Activo en el VPS como «Parejas al pie 1». |
| Tercetos al pie | Tercetos A, iteración 2520 | 66,8 % [65,1; 68,5] contra `pie-clasico-v1` | Activo en el VPS como «Tercetos al pie 1». |
| Duelo | Duelo C, iteración 4300 | 57,3 % [55,4; 59,1] contra Duelo 2 | Pasa el campeonato oficial contra V1, pero no la puerta relajada contra Duelo 2. Sigue Duelo 2. |

- **Al pie**, los dos modelos le ganan al campeón por 17 a 24 puntos y les sacan más que él a los cinco estilos fijos. Ninguno pierde en promedio más de 1,4 puntos frente a una familia que decide.
- **En duelo**, Duelo C le gana a Duelo 2 en el cruce directo y frente a los rivales aprendidos (Ceibo, el finalista, un linaje independiente), y resiste mucho mejor a los explotadores. Pero Duelo 2 aprieta a V1 y a sus variantes más que nadie, y frente a V1, al retador y al farolero ocasional Duelo C saca entre 7 y 8 puntos menos que él.
- **Ningún modelo pasa la puerta estricta.** Todos pierden contra un explotador PPO entrenado una hora contra ellos, como también le pasa a Ceibo. A pedido del dueño del proyecto, la activación usó una puerta relajada que trata a los explotadores como prueba de estrés.
- **El hallazgo principal es la explotabilidad.** Arrancar clonando al campeón hace que la entropía colapse y el modelo se vuelva determinista y explotable. Subir la entropía sola no alcanzó. Lo que funcionó fue sumarle explotadores frescos a la liga cada 40 minutos: el explotador de una hora pasó de ganar 87 % contra Duelo B a 65 % contra Duelo C.

## Punto de partida

| Mesa en la app | Computadora que juega hoy | Cómo es |
| --- | --- | --- |
| Duelo | Duelo 2 (`2cefef8e30b7`) | Ajuste residual sobre V1 con memoria del rival y reparación del envido, publicado el 23 de noviembre. Le gana a Ceibo Duelo (`d2146e8dd1b7`) cerca del 60 %. |
| Parejas (siempre con señas al pie) | `pie-parejas-v2` | Bot clásico al pie con umbrales de envido ajustados. |
| Tercetos (al pie) | `pie-clasico-v1` | Bot clásico al pie. |

Los modelos aprendidos de parejas (Parejas 2 y Parejas con señas 2) no llegan a las mesas de la app: la app crea todas las mesas 2v2 con señas al pie.

Hasta las 20:30 tomé como campeón de duelo a Ceibo, el modelo que nombra el repositorio (`src/lib/modelos.ts`). El activado en el VPS era Duelo 2. Las selecciones y puertas de la tarde se midieron contra Ceibo; las nocturnas, contra Duelo 2. En 200 pares, Ceibo le gana a Duelo 2 el 40,3 %.

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
| 18:34 | Parejas B se corta en la iteración 3375: con más entropía cayó contra el aceptador (68 % contra 78 % del campeón). |
| 18:41 | El dueño del proyecto relaja la puerta: el objetivo pasa a ser un modelo mejor en cada formato, no uno que resista a todo explotador. |
| 18:44 | Parejas C se separa de Parejas A en la 2954 con menos entropía y 70 % de chicos contra rivales fijos, ponderados hacia el aceptador. |
| 19:32 | Pedido de activar en el VPS los mejores modelos cuando terminen las puertas. |
| 20:30 | Aparece el error de campeón: el de duelo en el VPS es Duelo 2. Las puertas nocturnas se rearman contra Duelo 2. |
| 20:45 | La rama había corrido en el VPS (migración aplicada, activaciones sin cambios); el despliegue de `main` de esta hora la reemplaza, y con él el VPS deja de poder abrir los modelos regularizados hasta integrar #464. |
| 22:44 | Parejas C termina en la iteración 4101. Selección entre el final y tres instantáneas: queda la 3800. |
| 22:55 | Duelo independiente termina en la iteración 1971: 52,1 % contra Ceibo. |
| 22:57 | Se integra #464 y el VPS pasa a servir los modelos regularizados. Los tres candidatos abren en el contenedor de la API. |

| 23:14 | Tercetos B termina en la iteración 3971, con 1,1 millones de chicos. Explotador de una hora contra él. |
| 23:41 | Duelo C termina en la iteración 4619, con 4,9 millones de chicos. El bucle de explotadores cierra a las 23:47, después de doce rondas. |
| 23:47–00:02 | Selección de duelo contra Duelo 2 entre el final y tres instantáneas congeladas: queda la 4300. |
| 00:02–00:07 | Campeonato oficial de Duelo C. |
| 23:50–00:22 | Puertas finales de parejas y tercetos con la semilla 461400. |
| 00:07–01:03 | Explotador de una hora contra Duelo C. |
| 01:03–01:24 | Puertas finales de duelo contra Duelo 2, con Duelo C y Duelo B sobre los mismos repartos. |
| 01:25 | Activación en el VPS de «Parejas al pie 1» y «Tercetos al pie 1». Ensayo en el VPS de un chico completo de parejas y otro de tercetos al pie con los modelos activados: aprobado. |

## Resultados

La puerta compara al candidato con el campeón sobre los mismos repartos. Las cotas salen de un bootstrap por pares con corrección de Bonferroni.

- **Puerta estricta.** El candidato le tiene que ganar al campeón con la cota inferior del 95 % por encima del 50 % y no perder más de 2 puntos frente al campeón contra ninguna familia, también con la cota inferior.
- **Puerta relajada**, la que pidió el dueño del proyecto a las 18:41 y la que decidió las activaciones. Mantiene el cruce directo. Contra cada familia que no sea un explotador, el candidato no puede perder en promedio más de 2 puntos frente al campeón, y la cota inferior no puede bajar de −5. Los explotadores PPO quedan como información (`training/regularized/verdict.ts`).

Las puertas de la tarde usaron la semilla 461300 y las nocturnas la 461400. Ninguna de las dos se usó para elegir instantáneas: eso se hizo con la 461200.

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
| Duelo C, iteración 4300 (candidato) | 0,49 | 53 % | 58 % | 65 % (613) |
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

**El agujero del real envido.** Con `envido.ts`, el explotador final abre real envido con 31 o más y Duelo B le responde falta envido el 78 % de las veces con menos de 24. Nadie en el campo de la liga decía real envido, así que Duelo B nunca había pagado ese error.

**Duelo C.** Se separó de Duelo B en la 2934 con entropía 0,015, el triple que Duelo B, 20 % de autojuego y 70 % de rivales fijos. Cada 40 minutos un explotador nuevo entrenó contra su última instantánea y se sumó a su liga. Corrió nueve horas, hasta la iteración 4619, y la entropía subió de 0,16 a 0,49. Los doce explotadores terminaron entre 52 y 62 %; el de Duelo B había llegado a 87 %.

**Selección.** Contra Duelo 2, con 512 pares y la semilla 461200. Ninguna instantánea pasaba la puerta relajada, así que quedó la de menor pérdida frente a la peor familia que decide.

| Instantánea | Contra Duelo 2 | Peor familia que decide |
| --- | ---: | --- |
| 4125 | 57,1 % [53,5] | Retador −7,2 |
| 4300 | 60,1 % [56,4] | V1 −6,8 |
| 4450 | 57,3 % [54,0] | Retador −8,1 |
| 4619 (final) | 58,0 % [54,3] | Retador −12,5 |

**Campeonato oficial: pasa.** `event.ts`, con 256 pares y 9216 chicos, contra V1, el titular del campeonato:

- Cruce directo: 80,1 % [75,6; 84,6].
- Contra cada familia, entre 18 y 39 puntos más que V1, con todas las cotas inferiores positivas.
- Contra Duelo independiente, el linaje desde cero: 62,7 %. Contra el contrajugador oficial entrenado contra Duelo C: 77,3 %.
- Latencia mediana de 0,61 ms y p99 de 1,7 ms, sin caer nunca en el respaldo.

**Puerta final contra Duelo 2.** 2048 pares con la semilla 461400, Duelo C y Duelo B sobre los mismos repartos.

| Familia | Duelo C 4300 | Duelo B 2934 | Duelo 2 | Duelo C − Duelo 2 | Duelo B − Duelo 2 |
| --- | ---: | ---: | ---: | --- | --- |
| Cruce directo contra Duelo 2 | 57,3 % | 53,5 % | | [55,4; 59,1] ✓ | [51,7; 55,3] ✓ |
| V1 | 80,7 % | 86,2 % | 88,5 % | −7,9 [−9,5; −6,1] ✗ | −2,3 [−3,9; −0,8] ✗ |
| Retador | 80,4 % | 86,2 % | 88,4 % | −8,0 [−9,7; −6,2] ✗ | −2,2 [−3,8; −0,6] ✗ |
| Aceptador | 93,8 % | 94,5 % | 93,7 % | +0,1 [−1,3; +1,5] ✓ | +0,8 [−0,6; +2,3] ✓ |
| El que no quiere | 96,9 % | 97,9 % | 94,5 % | +2,4 [+1,2; +3,7] ✓ | +3,5 [+2,2; +4,8] ✓ |
| Farolero frecuente | 82,2 % | 84,6 % | 82,7 % | −0,6 [−2,4; +1,5] ✓ | +1,9 [0,0; +3,6] ✓ |
| Farolero ocasional | 81,3 % | 86,4 % | 88,0 % | −6,7 [−8,5; −4,9] ✗ | −1,6 [−3,2; +0,1] ✓ |
| Cartas fuertes | 92,9 % | 96,1 % | 89,8 % | +3,1 [+1,4; +4,6] ✓ | +6,3 [+4,9; +7,8] ✓ |
| Ceibo | 68,5 % | 68,5 % | 59,0 % | +9,5 [+7,1; +11,8] ✓ | +9,5 [+7,3; +12,0] ✓ |
| Finalista de la liga | 58,2 % | 52,0 % | 54,0 % | +4,2 [+1,6; +6,6] ✓ | −2,03 [−4,6; +0,4] ✗ |
| Duelo independiente | 62,6 % | 58,1 % | 53,0 % | +9,6 [+7,3; +12,0] ✓ | +5,1 [+2,9; +7,6] ✓ |
| Contrajugador oficial de Duelo B | 87,1 % | 81,7 % | 88,0 % | −0,8 [−2,8; +1,2] ✓ | −6,2 [−8,5; −4,2] ✗ |
| Contrajugador oficial de Duelo C | 77,1 % | 79,0 % | 86,1 % | −9,0 [−10,9; −6,7] ✗ | −7,1 [−9,2; −5,0] ✗ |
| Explotador final de Duelo B | 80,9 % | 13,2 % | 75,0 % | +5,9 (estrés) | −61,9 (estrés) |
| Los doce explotadores de la liga de Duelo C | | | | 0,0 a +19,9 (estrés) | −14,3 a +12,3 (estrés) |
| Explotador nuevo de Duelo C | 33,5 % | 50,8 % | 36,9 % | −3,4 (estrés) | +13,9 (estrés) |
| **Puerta relajada** | | | | **no pasa** | **no pasa** |

Duelo 2 es fuerte justo donde lo era Ceibo: aprieta a V1 y a sus variantes, con 88 % contra V1. Duelo C le gana el cruce directo y le saca más a los tres rivales aprendidos, pero frente a V1, al retador y al farolero ocasional le sacan 7 u 8 puntos menos. El contrajugador oficial de Duelo C le gana más a Duelo C que a Duelo 2, como es de esperar en un rival entrenado contra él; en el campeonato oficial, Duelo C igual le saca 22 puntos más que V1. El explotador que destruía a Duelo B le gana a Duelo C 19 %.

Duelo B también le gana a Duelo 2 en el cruce directo, pero cede por poco frente a V1, el retador y el finalista y de lleno frente a los dos contrajugadores, y casi todos los explotadores de Duelo C le ganan más que a Duelo 2.

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

**Parejas B y C.** Parejas B se separó de Parejas A con entropía 0,015 y más autojuego. A las dos horas había caído contra el aceptador, con 68 % contra 78 % del campeón en la evaluación de la corrida, y se cortó en la 3375. Parejas C volvió a separarse de Parejas A con la receta opuesta: entropía 0,005, 70 % de chicos contra rivales fijos con la ponderación según la puerta, que los empuja hacia el aceptador, y los explotadores de Parejas A y B en la liga. Corrió cuatro horas, hasta la 4101.

**Selección de Parejas C.** 512 pares con la semilla 461200.

| Instantánea | Contra `pie-parejas-v2` | Aceptador [cota inferior] | Relajada |
| --- | ---: | --- | --- |
| 3250 | 74,1 % [71,0] | −1,6 [−5,1] | no pasa |
| 3525 | 73,2 % [70,1] | 0,0 [−3,5] | pasa |
| 3800 | 75,1 % [72,1] | −0,2 [−4,0] | pasa, elegida |
| 4101 (final) | 73,1 % [69,9] | 0,0 [−3,8] | pasa |

**Puerta final de la noche.** 2048 pares con la semilla 461400, los tres candidatos sobre los mismos repartos. Diferencias contra `pie-parejas-v2`:

| Familia | Parejas C 3800 | Parejas A 2954 | Parejas B 3375 |
| --- | --- | --- | --- |
| Cruce directo contra `pie-parejas-v2` | 74,3 % [72,6; 76,0] | 76,8 % [75,1; 78,3] | 68,4 % [66,7; 70,0] |
| Clásico al pie | +9,3 [+7,3; +11,1] | +6,0 [+4,1; +7,9] | +2,5 [+0,3; +4,3] |
| Aceptador | −1,4 [−3,2; +0,4] | −3,0 [−4,9; −1,1] | −6,8 [−8,9; −4,5] |
| El que no quiere | +16,2 [+14,6; +17,8] | +16,2 [+14,7; +17,7] | +10,7 [+9,0; +12,5] |
| Farolero frecuente | +16,3 [+14,3; +18,4] | +13,0 [+10,9; +15,1] | +10,4 [+8,2; +12,5] |
| Farolero ocasional | +10,1 [+8,1; +11,9] | +6,2 [+4,3; +8,1] | +3,5 [+1,5; +5,5] |
| Cartas fuertes | +8,3 [+6,3; +10,0] | +5,0 [+3,1; +6,8] | +5,4 [+3,4; +7,4] |
| Parejas independiente | −0,1 [−2,4; +2,0] | −1,2 [−3,5; +0,8] | +1,0 [−1,1; +3,2] |
| Explotadores de Parejas A y B (estrés) | +12,0 y +11,2 | +4,2 y +6,0 | +21,2 y +15,1 |
| Explotador nuevo de Parejas C (estrés) | −6,2 [−8,2; −4,2] | −7,7 [−10,0; −5,5] | +1,6 [−0,5; +3,9] |
| **Puerta relajada** | **pasa** | no pasa (aceptador) | no pasa (aceptador) |

Parejas C resigna 2,5 puntos de cruce directo frente a Parejas A, pero cierra la familia del aceptador y les saca más que Parejas A a todos los estilos. Es el que se activó. Su explotador de una hora llegó a 64 % en la iteración 140 y a 70 % al terminar, en la 293; el de Parejas A estaba en 63 % a la misma altura. La entropía de Parejas C quedó en 0,15, apenas por debajo de la de Parejas A.

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

**Tercetos B.** Se separó de Tercetos A en la 2520 con entropía 0,02, 30 % de autojuego y el explotador de Tercetos A en la liga. Corrió cinco horas, hasta la 3971, con 1,1 millones de chicos, y la entropía subió de 0,08 a 0,75. Fue candidato el final.

**Puerta final de la noche.** 2048 pares con la semilla 461400. Diferencias contra `pie-clasico-v1`:

| Familia | Tercetos B 3971 | Tercetos A 2520 |
| --- | --- | --- |
| Cruce directo contra `pie-clasico-v1` | 61,5 % [59,8; 63,2] | 66,8 % [65,1; 68,5] |
| Aceptador | +6,8 [+4,7; +9,0] | +14,1 [+12,2; +16,0] |
| El que no quiere | +17,1 [+15,1; +19,1] | +14,6 [+12,6; +16,6] |
| Farolero frecuente | +4,8 [+2,3; +7,2] | +9,9 [+7,5; +12,2] |
| Farolero ocasional | +11,8 [+9,9; +13,6] | +15,3 [+13,4; +17,1] |
| Cartas fuertes | +4,2 [+2,4; +6,2] | +5,3 [+3,5; +7,0] |
| Tercetos independiente | +9,7 [+7,3; +12,0] | −0,6 [−3,1; +1,9] |
| Explotador de Tercetos A (estrés) | +13,0 | −12,4 |
| Explotador nuevo de Tercetos B (estrés) | −13,7 | −24,3 |
| **Puerta relajada** | **pasa** | **pasa** |

Pasan los dos. La regla de activación, fijada antes de las puertas, elige al de mayor cruce directo salvo que la diferencia sea menor a un punto, así que quedó Tercetos A. Tercetos B es el más robusto: le gana al linaje independiente por 10 puntos y resiste mejor a los dos explotadores. El explotador entrenado contra Tercetos B le gana todavía más a Tercetos A. A cambio, Tercetos B le saca 5 puntos menos al bot clásico y menos que Tercetos A a cuatro de los cinco estilos.

## Conclusiones

1. **El método sirve en los tres formatos.** Con un día de Mac, el gradiente de política regularizado con crítico de información perfecta les ganó a los campeones al pie por 17 a 24 puntos y a Duelo 2 por 7, sin búsqueda.
2. **Clonar al campeón es un buen arranque y una trampa.** Ahorra horas, pero la entropía colapsa (de 0,41 a 0,16 en duelo, 0,08 en tercetos) y el modelo se vuelve determinista y explotable. Subir la entropía sola no alcanzó: Parejas B empeoró contra el aceptador. Lo que funcionó fue la entropía junto con explotadores frescos en la liga: el explotador de una hora pasó de 87 % contra Duelo B a 65 % contra Duelo C, y el que destruía a Duelo B le gana a Duelo C 19 %.
3. **El campeón contra el que se mide cambia la respuesta.** Ceibo y Duelo 2 son, en la práctica, explotadores de V1, y la puerta mide cuánto se explota a V1 y a sus variantes. Un modelo general que no se especializa en V1 le gana a Duelo 2 en el cruce directo y le sigue perdiendo esas familias.
4. **La puerta estricta no la pasa ningún modelo aprendido.** Cualquier política fija pierde contra un explotador entrenado contra ella, Ceibo incluido (96 %). La puerta relajada separa «mejor jugador» de «inexplotable», que es lo que el proyecto necesita para activar.
5. **Al pie, los explotadores consiguen menos.** Con el mismo presupuesto, los explotadores de parejas y tercetos llegaron a entre 63 y 65 % a la iteración 140, contra 83 % en duelo. El tanto del compañero y las indicaciones del pie le quitan previsibilidad a la política.

### Próximos pasos

- **Duelo:** Duelo C pasa el campeonato oficial y le gana a Duelo 2, pero no pasa la puerta relajada contra él. Activarlo es una decisión del proyecto: cambia un modelo que exprime a V1 por uno más general y menos explotable. La alternativa es un Duelo D desde Duelo C con Duelo 2 en la liga y la ponderación según la puerta persiguiendo sus marcas.
- **Tercetos:** un Tercetos C desde Tercetos B con más rivales fijos, para recuperar los estilos sin perder la robustez.
- **Varias semillas por formato**, para saber cuánto varía cada resultado.
- **Mirar las partidas con personas** en las mesas al pie, ahora que los dos modelos están activos.

## Limitaciones

- **Una semilla por linaje.** Con una sola Mac y un día no hubo repeticiones, así que no sé cuánto varía el resultado entre corridas iguales.
- **La explotabilidad medida es una cota inferior.** Cada explotador entrenó una hora desde los pesos de su blanco. Uno más largo o desde cero podría encontrar agujeros más grandes.
- **Al pie, el modelo no elige las indicaciones.** Las recibe según la regla clásica y aprende a jugar con ellas. Si el pie es una persona que indica distinto, el modelo juega con indicaciones que nunca vio en el entrenamiento.
- **Sin personas.** Todo se jugó entre computadoras, como pide el protocolo. Los estilos fijos son variantes de V1 o del bot clásico; ninguna mide cómo juega una persona.
- **El campeonato oficial no distingue diferencias chicas.** Con 256 pares fijos, todo lo que quede por debajo de unos 12,6 puntos sale «no concluyente». Por eso las puertas de esta jornada usaron entre 512 y 2048 pares con `evaluate.ts`.

## Para llevarlo a la app

#464 integró el cableado, y el VPS sirve los modelos regularizados desde las 22:57. El 28 de noviembre a la 01:25 UTC quedaron activados:

| Clave | Nombre | Pin | Modelo |
| --- | --- | --- | --- |
| `pairs-pie` | Parejas al pie 1 | `3844512649a4` | Parejas C, iteración 3800 |
| `triples-pie` | Tercetos al pie 1 | `5159eb12687e` | Tercetos A, iteración 2520 |
| `duel` | Duelo 2 | `2cefef8e30b7` | Sin cambios |

Un ensayo en el VPS jugó un chico completo de parejas y otro de tercetos al pie y comprobó que cada decisión de la computadora usó el pin activado. Los pesos y los artefactos quedan en `runs/regularized/` de la Mac y en `juego.artefactos` del VPS.

**Duelo.** El artefacto `truco-regularized-v1` es servible por `api/actor-registry.ts` y entra en la imagen de la API. Duelo C está en `runs/regularized/candidates/duel-c-pick.json` (pin `5ddfce0cc19f`) y su campeonato oficial, aprobado, en `runs/regularized/campeonato-duel-c/`. Activarlo es `register duel` y `activate duel` con ese archivo. Ojo: `rollback duel` borra la activación y deja a V1, no a Duelo 2; para volver a Duelo 2 hay que activar su pin.

**Parejas al pie y tercetos.** El cableado:

- La migración `030-pie-aprendido.sql` suma las claves `pairs-pie` y `triples-pie` a `juego.artefactos` y `juego.activaciones`. Al pie no se comparte la activación de `pairs-private-senas`, porque ahí las indicaciones siguen la regla clásica y el actor solo elige cartas y cantos.
- `policyctl.ts` registra, activa y revierte con esas claves y valida que el artefacto declare el formato correcto.
- `api/mesas.ts` crea las mesas al pie con el actor activado: en parejas, con las mismas condiciones que `pie-parejas-v2` (meta entre 20 y 80, `MODELO_PIE_PAREJAS` distinto de 0); en tercetos, siempre. Sin activación todo sigue como hoy.
- `api/politica-pie.ts` abre el actor una vez por proceso y decide la jugada en `api/bot-pendiente.ts` con el tanteador y la meta del chico. Para anticipar si la computadora va a jugar carta y conviene esperar la seña de un pie humano se usa la política clásica, porque el actor recién muestrea su jugada en su turno.
- `verificar-stack.sh` registra y activa actores chicos al azar en las dos claves, comprueba que las mesas nuevas los toman y ensaya chicos completos de parejas y tercetos al pie con ellos.

Para activar o volver atrás desde la Mac (ver `docs/produccion.md`):

```sh
ssh truco-vps "sudo docker exec -i truco-produccion-api-1 node policyctl.ts register pairs-pie" < runs/regularized/candidates/pie-c-pick.json
ssh truco-vps "sudo docker exec truco-produccion-api-1 node policyctl.ts activate pairs-pie <pin>"
ssh truco-vps "sudo docker exec truco-produccion-api-1 node policyctl.ts rollback pairs-pie"
```

`rollback` en una clave al pie deja la mesa con su política fija: `pie-parejas-v2` en parejas y `pie-clasico-v1` en tercetos.

## Cómo reproducirlo

Las órdenes, los nombres de los rivales y la preparación de los campeones están en [el README del entrenador](../../../training/regularized/README.md). Los modelos de la jornada quedaron en `runs/regularized/` de la Mac y no se versionan. Cada corrida guarda `config.json`, `progress.jsonl` con cada iteración y evaluación, `targets.json` con las marcas del campeón, `extra-opponents.json` con los rivales sumados durante la corrida, las instantáneas y `checkpoint.pt` para reanudar.

**Bifurcar una corrida.** Copiar el directorio de la corrida madre, anotar el punto de partida en `progress.jsonl` y reanudar con la receta nueva. Por ejemplo, Duelo C:

```sh
R=runs/regularized
cp -R $R/duel-b $R/duel-c
echo '{"event":"fork","from":"duel-b","iteration":2934}' >> $R/duel-c/progress.jsonl
node training/regularized/run.ts --run $R/duel-c --hours 9 --workers 3 \
  --entropy 0.015 --self-share 0.2 --snap-share 0.1 --fixed-share 0.7
```

Parejas C usó `--entropy 0.005 --self-share 0.2 --snap-share 0.1 --fixed-share 0.7` desde Parejas A, y Tercetos B `--entropy 0.02 --self-share 0.3 --snap-share 0.1 --fixed-share 0.6` desde Tercetos A. Duelo independiente arrancó desde cero con `--format duel --no-bc --hidden 192,192 --seed 2 --entropy 0.01`.

**Explotador.** Parte de los pesos de su blanco, sin ancla, y juega solo contra él. Para sumarlo a una liga en marcha, se agrega a `extra-opponents.json` de esa corrida.

```sh
node training/regularized/run.ts --format duel --run $R/exploit-x --exploit blanco.bin --init blanco.pt \
  --hours 1 --workers 2 --rows 32768 --eval-every 100000 --seed 21
```

**Puerta y veredicto.** El campeón de duelo se baja del VPS (`SELECT contenido FROM juego.artefactos WHERE pin = …`) y se pasa como `actor:`.

```sh
node training/regularized/evaluate.ts --format duel --candidate net:$R/candidates/duel-c-pick.json \
  --champion actor:$R/champions/duelo2.json --family ceibo=actor:… --family independiente=net:… \
  --pairs 2048 --seed 461400 --workers 4 --out $R/gate.json
node training/regularized/verdict.ts $R/gate.json
```

**Campeonato oficial de duelo.** `node training/regularized/bundle.ts` arma la entrada (con `--independent-lineage` para nombrar el linaje independiente) y `training/championship/event.ts` registra, corre y verifica, como en los campeonatos anteriores.
