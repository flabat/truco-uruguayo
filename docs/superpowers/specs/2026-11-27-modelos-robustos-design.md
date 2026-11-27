# Computadoras robustas con autojuego regularizado

Issue #461. Aprobado por el responsable el 27 de noviembre de 2026.

## Intención

Que la computadora juegue mejor al truco en las mesas que usa la gente: duelo, parejas con señas al pie y, si alcanza el tiempo, tercetos. "Mejor" significa pasar la puerta completa del campeonato: ganarle al campeón vigente (límite inferior del IC simultáneo del 95 % por encima del 50 %) y no perder más de 2 puntos porcentuales frente a ninguna familia de rivales, incluido un contrajugador entrenado contra el candidato. Los candidatos anteriores (AlphaZero, liga lineal) fallaron justamente esa segunda parte.

## Metas, no metas y antimetas

- Metas: elegir y justificar un tipo de modelo; entrenarlo durante una jornada en la Mac (CPU y Metal); medirlo con la puerta; dejar un PR en borrador con entrenador, soporte de servicio, pruebas e informe.
- No metas: activar modelos en el VPS o en producción; evaluar contra humanos.
- Antimetas: un modelo que gana el cruce directo pero es explotable por un estilo fijo; un modelo que necesita información de otros asientos al servir; inferencia que se acerque al plazo de 200 ms.

## Restricciones

- Cada asiento decide con su vista; las señas privadas solo las ve la pareja (AGENTS.md).
- Inferencia en TypeScript en el worker de la API, plazo 200 ms, VPS de 2 CPU.
- Pesos fuera de Git, en `runs/`. Uso completo de la Mac M5 (10 núcleos, GPU de 10 núcleos, 24 GB).
- En 2v2 la app crea mesas `pairs-private-senas` con `senas-pie-v1`; el campeón allí es `pie-parejas-v2`. En duelo, el pin activo (Ceibo Duelo).

## Enfoques considerados

1. **Autojuego regularizado con actor-crítico (elegido).** Gradiente de política tipo PPO con penalización KL hacia una política ancla que se actualiza despacio (R-NaD de DeepNash, Magnetic Mirror Descent). Crítico con información perfecta solo durante el entrenamiento (PerfectDou). Rasgos de memoria pública del chico para adaptarse a faroleros, aceptadores y similares. Liga de rivales: sí mismo, instantáneas, Ceibo, V1, los cinco estilos y explotadores. Arranque por imitación del bot vigente del formato. Funciona igual con equipos.
2. **Búsqueda tipo AlphaZero con mundos muestreados.** Ya probada en #276–#298: gana el cruce directo pero falla la puerta; el muestreo de manos ignora lo que revelan las apuestas y sufre fusión de estrategias.
3. **Deep CFR / ReBeL.** Mejor teoría para duelo de suma cero, pero requiere recorrer el árbol completo con el motor y no se extiende bien a compañeros con manos privadas. No entra en una jornada.
4. **Monte Carlo profundo tipo DouZero.** Simple y fuerte en Dou Dizhu, pero la política es determinista y no puede mezclar faroles.

## Decisiones del diseño

- Orden: duelo, parejas al pie, tercetos.
- En parejas al pie se conservan al principio las indicaciones del bot clásico; el modelo aprende cartas y cantos condicionados a las indicaciones recibidas.
- Duelo se mide con la herramienta oficial (`training/championship`). Para parejas al pie, que esa herramienta no cubre, se arma un campo espejo con las mismas familias en ese formato y `pie-parejas-v2` como campeón.
- El informe va en español rioplatense en `docs/investigacion/` y como página publicada.

## Lo que queda al constructor

Arquitectura exacta de la red, rasgos, hiperparámetros, mezcla de rivales, presupuestos por corrida y qué ablaciones correr, según el rendimiento medido del motor.
