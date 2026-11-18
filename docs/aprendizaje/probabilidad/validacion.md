# Verificación de la primera lección de probabilidad

Se verificó el sitio estático del commit [fb457cc](https://github.com/flabat/truco-uruguayo/commit/fb457cc). Aprender ofrece la lección avanzada y la mesa de parejas permite consultar el mismo cálculo antes de tirar una carta. Los seis cambios jugables están integrados. [Información y mundos](https://github.com/flabat/truco-uruguayo/pull/70) · [Cálculo por carta](https://github.com/flabat/truco-uruguayo/pull/71) · [Escenas y controlador](https://github.com/flabat/truco-uruguayo/pull/69) · [Worker](https://github.com/flabat/truco-uruguayo/pull/72) · [Lección en React](https://github.com/flabat/truco-uruguayo/pull/73) · [Consulta en la mano](https://github.com/flabat/truco-uruguayo/pull/75)

## Contraste numérico

| Control | Procedimiento y resultado |
| --- | --- |
| Salida editorial | Se repitió el perfil publicado, semilla de análisis 29 y 20.000 repartos. El 2 de copas ganó 12.023, el 3 de bastos ganó 13.779 y el 5 de oros ganó 12.530. Para 3 contra 2 hubo 2.100 victorias exclusivas del 3 y 344 del 2, una ventaja neta de 8,78 pp para el 3. |
| Segunda vuelta | Enumeración literal de 30 × 29 × 28 asignaciones con el motor. De 24.360 mundos, 1.175 explican todas las cartas de los bots. En 692 gana sólo el 2 de copas y en 483 pierde la pareja con ambas opciones. |
| Otros cuatro asientos | Se generaron repartos V1 para las semillas 1 a 11 con dador `semilla % 4`. Tras siete jugadas de bot, el asiento que debía jugar pasó a ser el aprendiz. Se asignó una carta libre a cada uno de los otros tres asientos y se probaron las dos alternativas sobre cada mundo admitido. De 267.960 asignaciones se admitieron **55.569**. Las once filas, incluidos los conteos discordantes, coincidieron carta por carta con el cálculo de la aplicación. |
| Independencia de información | Reordenar la mano propia, cambiar las cartas ocultas del reparto real o conservar sólo el prefijo anterior del replay reproduce la consulta de ese turno. Partir el cálculo en lotes de diferente tamaño conserva el mismo resultado. Las pruebas incluyen entrada inválida, mano cerrada, turno ajeno, jugada forzada, pardas, presupuesto agotado y empates. |

La semilla 11 da una comparación con ventaja fuera de las escenas editoriales. El aprendiz está en el asiento 3. En los mismos 5.684 mundos, el 2 de bastos gana 4.005 veces y el 3 de oros gana 3.807. En 198 gana únicamente el 2 y en ninguno gana únicamente el 3. Con la semilla 10 ambas opciones ganan en los mismos 488 de 852 mundos. [Regresión de las once posiciones](../../../tests/unit/probabilidad-integrada.test.ts) · [Oráculo de la segunda vuelta](auditar-segunda.mjs) · [Pruebas de las estadísticas y el motor](../../../tests/unit/probabilidad-calculo.test.ts)

## Uso, teclado y lectura

En Chromium a 320 y 1280 px se eligió el 5 de oros por teclado, se compararon las cartas y se jugó la alternativa de 0 %. La mano cerró a favor del rival y el repaso permitió volver al presente. En el árbol accesible, las filas identificaron el nombre de la carta, el porcentaje y las victorias sobre el mismo denominador. El foco siguió en el control de comparación al publicarse el resultado. La mesa guiada anunció el resultado con una región `aria-live="polite"` y mantuvo el foco al abrir y cerrar el panel. No hubo desborde horizontal en ambos anchos. Con JavaScript desactivado se leyó la tabla completa de la apertura. Estos recorridos ejercitaron el árbol accesible del navegador y el teclado. [Lección a 320 px](../capturas/probabilidad-320.jpg) · [Lección a 1280 px](../capturas/probabilidad-1280.jpg) · [Consulta en la mano guiada](../capturas/probabilidad-en-mano-320.jpg)

Las pruebas de navegador también bloquean el worker, fuerzan una respuesta tardía, verifican que una predicción no juega la carta y recorren otra mano. La mesa guiada conserva el turno y el registro de progreso al consultar. Una referencia editorial se muestra con su método y su denominador en la posición correspondiente. La práctica sin referencia permite continuar o reintentar. [Pruebas de la isla](../../../tests/probabilidad.spec.mjs) · [Pruebas de la mano](../../../tests/mano-guiada.spec.mjs) · [Pruebas de cancelación y caché](../../../tests/unit/probabilidad-worker.test.ts)

## Rendimiento del sitio compilado

Equipo Apple M5, macOS 27.2.1 arm64, Node 24.22.1 y Chromium headless 159.0.8154.6. Se sirvió el build por HTTP local bajo `/truco-uruguayo/`. En cada una de las diez corridas por caso se abrió un contexto nuevo a 360 × 780 px con caché HTTP deshabilitada. El perfil de práctica usa `repartir(217, 3)`, principia antes de la primera carta y analiza 4.096 mundos con semilla pública 29. La segunda vuelta usa su posición editorial exacta de 1.175 mundos. Se tomaron la mediana y el p95 por rango más próximo (con diez observaciones, el máximo).

En el perfil de Chromium se fijó `Emulation.setCPUThrottlingRate({rate: 4})` en la sesión CDP de **la página**. Esta versión de Chromium rechaza el comando en el target del worker. Un bucle de calibración tardó 35–37 ms a velocidad normal y 145–146 ms en la página limitada. En el worker tardó aproximadamente 36–40 ms en ambos modos.

| Medición en ms | Mediana | p95 |
| --- | ---: | ---: |
| Carga inicial de la mano guiada, navegación hasta `load` | 103,2 | 113,6 |
| Carga inicial de la lección, navegación hasta `load` | 71,5 | 76,2 |
| Práctica en frío, clic hasta tabla publicada | 417,8 | **469,2** |
| Práctica, creación del worker hasta su mensaje final | 414,9 | 466,9 |
| Práctica con resultado en caché, clic hasta tabla | 0,2 | 0,9 |
| Segunda vuelta en frío, clic hasta tabla | 35,0 | 38,1 |
| Segunda vuelta, creación del worker hasta su mensaje final | 31,0 | 33,7 |
| Segunda vuelta con resultado en caché, clic hasta tabla | 1,6 | 2,5 |
| Seleccionar una carta hasta respuesta visual | 41,9 | **54,2** |
| Cancelar cálculo hasta respuesta visual | 30,0 | **32,0** |

La carga inicial se mide antes de consultar. El intervalo del worker incluye creación, carga del módulo, cálculo y entrega del mensaje. Los tiempos de selección y cancelación se toman desde el clic hasta el cambio observable de estado y dos callbacks de animación sucesivos, que dan una oportunidad de repintar. Las comparaciones en caché no crean un segundo worker. El p95 quedó dentro de los objetivos de 100 ms para interacción y 5 s para el cálculo de práctica.

Como control adicional, se repitieron las diez corridas con un proceso Chromium aislado y sin el limitador CDP. Después de `load`, se identificaron exclusivamente sus procesos de tipo `renderer` mediante `SystemInfo.getProcessInfo`. Se alternaron 5 ms habilitados y 15 ms suspendidos hasta cerrar cada página, restaurando su ejecución al terminar. La fracción de tiempo habilitada medida fue del 26,3 % en la mediana. Este control sintético también limitó al worker. El p95 desde el clic hasta la tabla fue **1.788,9 ms** en práctica y **161,9 ms** en la segunda vuelta. Seleccionar y cancelar dieron **67,2 ms** y **46,6 ms** de p95. La red local y la emulación describen este ensayo concreto. Otros equipos y navegadores pueden dar tiempos distintos.

## Descarga

Se registraron las solicitudes de JS y CSS y se midieron sus cuerpos con gzip. La suma de esos recursos antes de consultar fue **18.275 bytes** en Aprender, **28.577** en la mano guiada y **88.297** en la lección avanzada. La primera consulta sumó **4.083 bytes** del worker en ambas interfaces. El renderizador de la isla (65.804 bytes) y el módulo de React (3.009 bytes) se cargaron sólo en la lección. El total de la lección después de consultar fue **92.380 bytes**. HTML, imágenes y fuentes quedan fuera de estas sumas.

## Repetir la verificación

Con la regresión de las once posiciones, pasaron 117 pruebas unitarias y 68 de navegador en cada base (136 ejecuciones de Chromium). Ambas compilaciones verificaron también enlaces, anclas, recursos y las imágenes Tatú.

Desde la raíz del checkout, con Node 24, npm y Python 3:

```sh
npm ci
npm exec -- playwright install --only-shell chromium
node scripts/estudios/salidas.ts --semilla 29 --repartos 20000
node docs/aprendizaje/probabilidad/auditar-segunda.mjs
node --test tests/unit/probabilidad-integrada.test.ts
npm run check
git diff --check
```

Para repetir el perfil estándar con dos terminales, compilar y servir la base de proyecto en la primera. La segunda ejecuta el [instrumento de medición](medir.mjs) y emite los tiempos y bytes por recurso en JSON.

```sh
PAGES_URL=https://example.org/truco-uruguayo/ npm run build
PAGES_URL=https://example.org/truco-uruguayo/ npm run preview -- --host 127.0.0.1 --port 49667
```

```sh
node docs/aprendizaje/probabilidad/medir.mjs http://127.0.0.1:49667/truco-uruguayo/
```
