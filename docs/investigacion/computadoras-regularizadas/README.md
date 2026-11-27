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

<!-- PROCESO -->

<!-- RESULTADOS -->

<!-- REPRODUCCION -->
