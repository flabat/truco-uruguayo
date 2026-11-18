# Plan de implementación · Probabilidad de ganar la mano

La entrega permite predecir, comparar y jugar cada carta legal de un turno, primero en dos escenas auditables y después en una mano nueva. Incluye una consulta opcional durante la mano guiada. Se integra en GitHub Pages mediante PR a `main`. [Diseño didáctico](README.md) · [Método estadístico](../adr/0003-probabilidad-condicionada.md) · [Arquitectura de navegador](../adr/0004-leccion-react-worker.md) · [Seguimiento #60](https://github.com/flabat/truco-uruguayo/issues/60)

## Orden y propiedad de los cambios

El [PR de diseño se sigue en #59](https://github.com/flabat/truco-uruguayo/issues/59). Al integrarlo, dos agentes pueden empezar en paralelo por #61 y #63. Cada fila corresponde a un subissue de #60. Los bloqueos también están cargados en GitHub.

| Issue | Entrega y archivos a cargo | Se integra después de |
| --- | --- | --- |
| [#61 · Información y mundos](https://github.com/flabat/truco-uruguayo/issues/61) | `src/probabilidad/informacion.ts`, `mundos.ts` y sus unitarias. Vista canónica, validación, listas compatibles por asiento, enumeración y muestreo. | #59 |
| [#62 · Evaluación y estadística](https://github.com/flabat/truco-uruguayo/issues/62) | `calcular.ts`, `estadistica.ts`, pruebas y compatibilidad del CLI histórico. Victorias, discordantes, intervalos simultáneos y resultados por perfil. | #61 |
| [#63 · Contenido y sesión](https://github.com/flabat/truco-uruguayo/issues/63) | `src/aprendizaje/probabilidad/`, escenas, textos y pruebas del controlador. Predicción, consulta, confirmación, otra mano y repaso. Puede avanzar con un proveedor simulado basado en los resultados publicados. | #59 |
| [#64 · Worker y cliente](https://github.com/flabat/truco-uruguayo/issues/64) | `src/probabilidad/worker.ts`, `cliente.ts` y pruebas. Pedidos versionados, cancelación, caché acotada y fallback validado. | #62 |
| [#65 · Lección jugable](https://github.com/flabat/truco-uruguayo/issues/65) | Integración de React, lockfile, página `/aprender/probabilidad/`, `src/components/probabilidad/` y sus E2E. Es el único issue que cambia las dependencias de frontend. | #63 y #64 |
| [#66 · Consulta en la mano](https://github.com/flabat/truco-uruguayo/issues/66) | Adaptador en `/aprender/mano/`, acceso desde `/aprender/` y pruebas de navegación y compatibilidad. Comparte el cliente y los textos de resultados. | #64 y #65 |
| [#67 · Verificación integrada](https://github.com/flabat/truco-uruguayo/issues/67) | Recuento independiente, evidencia numérica y de navegador, mediciones, documentación del estado implementado y cierre de #60. | #66 |

Al comenzar, revisar los comentarios, PR (incluidos borradores) y ramas. Reservar exclusivamente `codex/issue-<n>` desde el `main` vigente y anunciar sesión, alcance y rutas. Cada agente abre su PR, adjunta comprobaciones y enlaza su issue. Si necesita tocar un archivo de otra fila, acordar en ambos issues quién hace el cambio y el orden. #63 usa fixtures editoriales. #62 conserva un oráculo numérico separado para que un error de producción no valide su propia salida. [Flujo del repositorio](../../../CONTRIBUTING.md)

## Contratos que permiten trabajar en paralelo

| Productor → consumidor | Acuerdo mínimo |
| --- | --- |
| Mesa o sesión → análisis | `PosicionPublicaV1 { version, asiento, dador, muestra, cartas, jugadas }`. `cartas` son las propias que quedan. `jugadas` termina exactamente en el cursor. La política de asignación y el tamaño de muestra dependen del perfil público. |
| Evaluador → cliente | Unión discriminada para resultado exacto, estimado, fuera de turno, mano terminada, entrada inválida, incompatibilidad demostrada y presupuesto agotado. Resultado completo con versión, clave, N, fila por carta, par por cada combinación y método. Los errores del worker y la cancelación son estados de transporte. |
| Sesión → vista | Instantánea pública, fase, candidata predicha, alternativa inspeccionada, resultado del análisis si coincide su clave y acciones disponibles. Predecir y comparar son reversibles. Confirmar juega por la vía del motor. |
| Worker → ambas superficies | Mismo cálculo para la misma entrada. `requestId` decide si el mensaje pertenece al pedido activo. La clave versionada decide si el resultado pertenece a esa posición. Las referencias precalculadas incluyen ambos perfiles editoriales y los metadatos que exige el comparador de claves. |

## Pruebas y evidencia de aceptación

**Cálculo y reglas.** Correr los dos controles de la ADR 3 con los enteros sin redondear. Guardar posición, perfil y versión de cada fixture. Variar asiento/dador, orden de cartas propias y jugadas ya visibles. Incluir un rey que toma el lugar de una pieza mostrada, primera parda, segunda parda, cierre en dos vueltas, tres pardas, turno ajeno, una sola carta y terminal. Los tests pequeños usan enumeración literal y el motor, además de casos donde se puede predecir el resultado a mano. Un empate exacto, una diferencia estimada inconclusa y una ventaja distinguible necesitan tres pruebas separadas.

**Integridad estadística.** Las victorias de A menos las de B deben ser iguales a `soloA − soloB`. Invertir el par cambia el signo. Reordenar las opciones no cambia los mundos. Una partida real alternativa y un replay con otro futuro deben proyectar la misma clave, mensajes y resultados hasta el cursor. Verificar que un estado legal con una jugada imposible para los bots genera el diagnóstico apropiado y que agotar el tope de propuestas no lo confunde con imposibilidad. Colisiones de cartas requieren rechazar la asignación completa. Comparar el muestreo con una distribución exhaustiva pequeña usando semillas fijas y una tolerancia definida antes de la prueba. El análisis histórico de 20.000 mundos es una prueba de referencia reproducible, distinta de medir propiedades estadísticas sobre varios seeds.

**Interacción y accesibilidad.** En las dos bases del sitio, abrir desde Aprender, predecir las tres alternativas por teclado, comparar, cambiar de predicción antes de revelar o inspeccionar otra carta después, confirmar una sola vez y volver al prefijo de la decisión. Comprobar que una carta con 0 % se puede jugar. Ejercitar otra mano, una sola opción, error y reintento, llegada tardía de resultados y navegación de vuelta a la guía. Leer la tabla con los nombres de carta, porcentajes, unidades y anuncio de estado. Revisar foco, contraste y lectura a 320 px y escritorio. El resultado de la partida y el uso del panel de análisis deben respetar el progreso existente.

**Rendimiento y recuperación.** Usar un build de producción y registrar máquina, navegador, viewport, limitación de CPU y versiones. Como objetivos iniciales, en Chromium con CPU limitada 4× y diez corridas por caso, buscar que seleccionar una carta o cancelar dé respuesta visual en menos de **100 ms** (p95), y que la posición libre de referencia de 4.096 mundos termine en menos de **5 s** (p95). Publicar mediana y p95 de cálculo en frío y de consulta en caché, con los tiempos separados de carga. La posición libre de referencia se obtiene con `repartir(217,3)`, turno inicial de 0, tres cartas, perfil de práctica y semilla de análisis 29. Medir la posición intermedia exacta por separado. Verificar en Network que el worker se solicita al comparar y que las rutas generales no descargan React. Adjuntar tamaños comprimidos de los recursos adicionales de la lección. Si hay que ajustar un presupuesto, acordar el cambio en #60, identificar el nuevo perfil y volver a verificar cifras y latencia. Una UI que se congela, enseña un resultado vencido o clasifica con una muestra incompleta bloquea la entrega.

**Salida.** Cada PR corre `npm ci`, `npm run check` y `git diff --check`. Los casos nuevos entran en el runner existente. En #67 registrar los PR integrados, tablas y comandos reproducibles, evidencia de escritorio/móvil, ambos caminos base y qué versión se verificó. Marcar las ADR como implementadas cuando esos contratos existan en `main`. La persona responsable revisa e integra. El despliegue manual sigue el procedimiento del repositorio.

## Límites de esta entrega

Una segunda política de jugadores permitiría enseñar sensibilidad al modelo. Añadir cantos introduciría dos objetivos distintos, ganar la mano y maximizar tantos esperados, además de información pública nueva. Incorporar esas extensiones requiere identificar la variante, la evidencia disponible y la métrica de cada lección. El primer incremento queda completo al cerrar los siete issues enumerados arriba.
