# Entrega por fases y sesiones concurrentes

## Cierre del primer tramo

El seguimiento #15 cerró con sus 16 subissues completados. Desde la terminal se puede jugar, guardar y reproducir una mano de parejas. En el navegador se puede practicar por tema o mezclar habilidades, contar los tantos en la mesa guiada, jugar hasta el cierre y repartir de nuevo con otro dador. Se verificaron el teclado, las vistas móvil y de escritorio y las dos rutas base del sitio. [Verificación de cierre](https://github.com/flabat/truco-uruguayo/issues/15#issuecomment-6970184141) · [Simulador](simular.md) · [Guía de la ruta y la mesa](README.md)

El mapa, el orden de las sesiones y los criterios de aceptación que siguen conservan el plan original. Las ADR enlazan los contratos que quedaron en `main`. [ADR del motor](adr/0001-motor-y-replay.md) · [ADR de aprendizaje](adr/0002-lecciones-y-progreso.md)

## Mapa de entregas

Las dependencias son las mínimas para implementar desde `main`. La fase expresa prioridad y un resultado verificable. El issue contiene el alcance completo, los casos de aceptación, los archivos de prueba y las rutas a cargo. Las rutas del cuadro son relativas a `src/` salvo `scripts/` y los archivos de verificación del repositorio.

| Fase | Issue y entrega | Requiere integración de | Propiedad principal |
| --- | --- | --- | --- |
| 1 | [#16](https://github.com/flabat/truco-uruguayo/issues/16) Cartas, piezas y descubrimiento de pruebas | Sin dependencias previas | `motor/cartas.ts` y check común |
| 1 | [#17](https://github.com/flabat/truco-uruguayo/issues/17) Comparación de cartas | [#16](https://github.com/flabat/truco-uruguayo/issues/16) | `motor/jerarquia.ts` |
| 1 | [#18](https://github.com/flabat/truco-uruguayo/issues/18) Flor, envido y desgloses | [#16](https://github.com/flabat/truco-uruguayo/issues/16) | `motor/tantos.ts` |
| 1 | [#19](https://github.com/flabat/truco-uruguayo/issues/19) Semilla y reparto | [#16](https://github.com/flabat/truco-uruguayo/issues/16) | `motor/reparto.ts` |
| 2 | [#20](https://github.com/flabat/truco-uruguayo/issues/20) Estado, vistas y pardas | [#17](https://github.com/flabat/truco-uruguayo/issues/17), [#19](https://github.com/flabat/truco-uruguayo/issues/19) | `motor/mano.ts` |
| 2 | [#21](https://github.com/flabat/truco-uruguayo/issues/21) Historial y restauración | [#20](https://github.com/flabat/truco-uruguayo/issues/20) | `motor/replay.ts` |
| 2 | [#22](https://github.com/flabat/truco-uruguayo/issues/22) Política de los bots | [#20](https://github.com/flabat/truco-uruguayo/issues/20) | `motor/jugadores.ts` |
| 2 | [#23](https://github.com/flabat/truco-uruguayo/issues/23) Entrada por terminal y prueba integral | [#21](https://github.com/flabat/truco-uruguayo/issues/21), [#22](https://github.com/flabat/truco-uruguayo/issues/22), [#18](https://github.com/flabat/truco-uruguayo/issues/18) | `scripts/simular-mano.ts` |
| 3 | [#24](https://github.com/flabat/truco-uruguayo/issues/24) Generadores por habilidad | [#17](https://github.com/flabat/truco-uruguayo/issues/17), [#18](https://github.com/flabat/truco-uruguayo/issues/18), [#19](https://github.com/flabat/truco-uruguayo/issues/19) | `aprendizaje/generadores/` |
| 3 | [#25](https://github.com/flabat/truco-uruguayo/issues/25) Sesión, pistas y progreso | [#16](https://github.com/flabat/truco-uruguayo/issues/16) | `aprendizaje/{tipos,sesion,progreso}.ts` |
| 4 | [#26](https://github.com/flabat/truco-uruguayo/issues/26) Ruta, lecciones y práctica | [#24](https://github.com/flabat/truco-uruguayo/issues/24), [#25](https://github.com/flabat/truco-uruguayo/issues/25) | `pages/aprender/index.astro`, componentes y lecciones |
| 4 | [#27](https://github.com/flabat/truco-uruguayo/issues/27) Mesa guiada y nuevo reparto | [#23](https://github.com/flabat/truco-uruguayo/issues/23), [#26](https://github.com/flabat/truco-uruguayo/issues/26) | `pages/aprender/mano.astro`, mesa y adaptador |

## Cuándo abrir sesiones en paralelo

1. **Empezar por [#16](https://github.com/flabat/truco-uruguayo/issues/16).** Una sesión publica los tipos de carta, la identidad de pieza, el orden canónico y el descubrimiento automático de pruebas. Esta sesión es responsable de los archivos de verificación compartidos.
2. **Con la base en main, abrir tres sesiones en paralelo.** Los issues [#17](https://github.com/flabat/truco-uruguayo/issues/17), [#18](https://github.com/flabat/truco-uruguayo/issues/18) y [#19](https://github.com/flabat/truco-uruguayo/issues/19) se implementan en archivos independientes y consumen la misma definición de pieza o baraja. Para adelantar la fase didáctica, [#25](https://github.com/flabat/truco-uruguayo/issues/25) también puede arrancar con un proveedor de situaciones de prueba.
3. **Con jerarquía y reparto, abrir [#20](https://github.com/flabat/truco-uruguayo/issues/20).** El motor de turnos puede avanzar aunque todavía se esté revisando el cálculo de tantos. Cuando estén jerarquía, tantos y reparto, [#24](https://github.com/flabat/truco-uruguayo/issues/24) puede construirse mientras avanza la mesa.
4. **Con los turnos integrados, abrir [#21](https://github.com/flabat/truco-uruguayo/issues/21) y [#22](https://github.com/flabat/truco-uruguayo/issues/22) en paralelo.** Replay consume la transición de mano. Los bots consumen la vista de un asiento. La integración de terminal [#23](https://github.com/flabat/truco-uruguayo/issues/23) espera esas dos partes y los tantos.
5. **Con generadores y sesión, integrar [#26](https://github.com/flabat/truco-uruguayo/issues/26).** Puede solaparse con la demostración de terminal. Abrir [#27](https://github.com/flabat/truco-uruguayo/issues/27) cuando el hito sin navegador y la ruta de aprendizaje ya estén en `main`.

Un issue abierto está disponible para reserva cuando se hayan integrado sus dependencias y la rama `codex/issue-<número>` esté libre. Seguir la creación exclusiva, el checkout aislado, el comentario de alcance y el PR descritos en [CONTRIBUTING.md](../../CONTRIBUTING.md). Enlazar un cambio de contrato desde los issues consumidores antes de que sus sesiones lo implementen. Cada sesión agrega su archivo de prueba. El issue de la ruta es dueño de la navegación general y el de la mesa añade su enlace después.

## Cómo aceptar cada fase

| Fase | Comprobación observable |
| --- | --- |
| 1 · Reglas y reparto | Los ejemplos publicados dan la jerarquía y los tantos esperados. El rey sustituye donde corresponde. Una semilla de referencia produce exactamente las doce cartas y la muestra acordadas. |
| 2 · Mano reproducible | Desde la terminal, jugar, guardar y reproducir una mano de parejas con idénticos turnos, vueltas y resultado. Cubrir cierres en dos y en tres vueltas, incluidas pardas. Cambiar las cartas ocultas no cambia la decisión de un bot con la misma vista. |
| 3 · Motor didáctico | Las familias se generan de forma reproducible. Tras una pista se repite el caso y después se reparte otro. Solo el acierto independiente de una situación fresca acredita progreso. Comprobar recarga y práctica por tema y mixta. |
| 4 · Ruta disponible | En móvil y escritorio, completar comparación y flor, practicar tantos, jugar la mano guiada y volver a repartir. Una lección adicional del mismo tipo reutiliza los controles existentes. Probar el recorrido desde la portada de la aplicación. |

Cada PR ejecuta las comprobaciones de contribución. Las pruebas unitarias utilizan ejemplos calculados a mano además de invariantes del motor. Las pruebas de navegador cubren los pasos que dependen del DOM, el teclado y la persistencia. El cierre del seguimiento general requiere una mano reproducible desde terminal y un nuevo reparto desde el flujo guiado integrado en la ruta.

## Seguimientos posteriores al primer tramo

El estudio de la salida compara tres cartas sobre los mismos repartos del simulador. La lección de cantos parte de la mano guiada y tiene su propio diseño y seguimiento de implementación. [Estudio de la salida #29](https://github.com/flabat/truco-uruguayo/issues/29) · [Diseño de los cantos #30](https://github.com/flabat/truco-uruguayo/issues/30) · [Lección de cantos #52](https://github.com/flabat/truco-uruguayo/issues/52)
