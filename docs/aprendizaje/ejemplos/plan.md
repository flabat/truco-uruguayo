# Plan de implementación de los ejemplos resueltos

La entrega está dividida en dos PR. El primero hace que cada tema pueda abrir con dos manos sencillas y que las explicaciones coincidan con las cartas. El segundo recuerda qué vio la persona y permite elegir entre repasar y practicar. [Diseño y catálogo de 15 manos](README.md) · [Issue de diseño #83](https://github.com/flabat/truco-uruguayo/issues/83)

## 1. Catálogo, selección inicial y exclusión de manos

**Entrega #84.** Cambiar el contrato de `Tema` en `src/aprendizaje/lecciones/` para que cada ejemplo tenga ID estable dentro del tema, uso didáctico, muestra, cartas y texto propio. Incorporar las 15 manos del diseño. La orientación para una apertura de piezas debe poder explicar la regla básica antes de presentar la excepción. [Issue #84](https://github.com/flabat/truco-uruguayo/issues/84)

- Hacer que la selección inicial reciba una fuente de azar controlable. Dos valores controlados deben permitir obtener las dos aperturas del mismo tema. Usar una fuente independiente de las semillas de práctica para que leer ejemplos no altere una secuencia reproducible de ejercicios.
- Pasar el ejemplo elegido a `mostrarEjemplo` en `ejercicio.ts`. Renderizar sus cartas, muestra, texto y, para envido y flor, los sumandos de `explicarSituacion`. En `ruta.ts`, generar práctica con las firmas de los tres ejemplos del tema y las claves recientes. Reutilizar `claveSituacion`, que conserva el papel de la muestra y ordena las cartas. Hoy hay ocho claves recientes y el generador admite quince exclusiones. Las once caben en el contrato actual.
- Ampliar `tests/unit/lecciones.test.ts` para verificar los IDs y firmas únicos por tema, las dos aperturas, la legalidad de las cartas y el resultado editorial de cada mano con el motor. Incluir las cartas que aportan al envido y los valores de una pieza y un rey sustituto. Forzar en una prueba una colisión entre una mano editorial y un candidato del generador para verificar que se reparte otra.
- Ajustar en este PR los consumidores de `tema.ejemplo`, la prueba de autoría de una lección adicional y los E2E que esperan una carta o un texto particular. Fijar la elección de ejemplo donde importa la mano exacta. Los escenarios de práctica conservan sus semillas y sus aserciones pedagógicas.

Al terminar #84, un navegador nuevo puede mostrar cualquiera de las dos aperturas. Este PR puede verificarse por sí solo mientras se prepara el comportamiento entre visitas.

## 2. Rotación por tema, controles y navegación

**Entrega #85.** Integrar el catálogo de #84 en la ruta, el render de ejercicios y la portada donde dice qué ocurre al elegir un tema. Actualizar la receta de autoría en `docs/aprendizaje/README.md`. En GitHub, #84 figura como dependencia de #85. [Issue #85](https://github.com/flabat/truco-uruguayo/issues/85)

- Guardar por ID de tema, en una clave local versionada propia, los IDs ya vistos del ciclo y el último elegido. En el primer ciclo elegir una apertura sencilla. Después elegir entre los pendientes. Al agotar el ciclo, empezar otro excluyendo al último en el primer sorteo. Guardar al presentar el ejemplo, aunque la persona salga sin practicar. Validar y acotar el estado al catálogo actual. Tratar fallos de lectura o escritura con una copia en memoria. El formato V1 de progreso de práctica debe seguir siendo legible.
- Distinguir una elección nueva desde el índice de la restauración de una entrada del navegador. Una opción es guardar tema, paso del recorrido cuando corresponda e ID visible en `history.state`. Al recargar o recibir `popstate`, la ruta restaura un ID válido sin consumir otra selección. **Ver otro ejemplo** reemplaza el ejemplo de esa entrada. Un ID retirado da lugar a una selección válida. Mientras se lee un ejemplo no hace falta guardar las cartas por separado.
- Exponer **Ir a practicar** antes del tapete, de modo que se pueda actuar sin recorrer la explicación. Poner **Ver otro ejemplo** al pie. Mantener el foco en la pregunta al cambiar de ejemplo y en el paso activo al empezar a jugar. Una apertura mixta con historial de práctica sigue entrando directamente al desafío correspondiente. Actualizar las pruebas y los selectores que hoy identifican el botón anterior.
- Hacer que ambos controles usen la ruta existente. Cambiar un ejemplo no invoca `generarSesion` ni `abrirSituacion`. Empezar a practicar abre una sola sesión. Al completar la mano, **Otra mano** sigue repartiendo un ejercicio.

### Comprobaciones de aceptación

| Escenario | Comprobación observable |
| --- | --- |
| Dos primeras visitas independientes | Con azar controlado, cada navegador puede ver una apertura sencilla distinta del mismo tema. La explicación nombra cartas presentes y el motor confirma el resultado. |
| Retorno tras solo leer | Entrar, volver al índice y elegir el mismo tema. Cambian las cartas. En una nueva pestaña del mismo navegador continúa el ciclo. Otro tema lleva su propia cuenta. |
| Cambio de ejemplo y fin del ciclo | Las primeras tres muestras con sus cartas tienen distintas firmas. La cuarta difiere de la tercera. Se puede leer indefinidamente y volver a la lista con el mismo avance. |
| Recarga e historial | Recargar un ejemplo y usar Atrás/Adelante conserva su ID y las cartas. Una nueva elección explícita desde la lista sí consume el siguiente ejemplo. |
| Guardado anterior o dañado | Probar progreso V1 previo con aciertos, historial de ejemplos ausente, JSON inválido, un ID retirado y almacenamiento denegado. La persona puede repasar y jugar, y los aciertos existentes se conservan cuando su almacenamiento está disponible. |
| Primera práctica y ayuda | Un toque en «Ir a practicar» presenta una mano distinta del catálogo. Completarla sin ayuda permite acreditar. Abrir la regla durante la práctica conserva la mano y cuenta como ayuda. Leer la regla durante un ejemplo deja intacto el progreso. |
| Entrada guiada y mixta | Completar comparación y reconocimiento de flor en orden. En mixta, comprobar tanto el caso de una habilidad nueva como el de una ya practicada. |
| Teclado y pantalla angosta | A 320 px y en escritorio, revisar que controles, muestra y mano sean legibles. Recorrer con Tab y Enter los dos controles, comprobar el foco tras cada acción y verificar los nombres accesibles de las cartas. |

Usar pruebas unitarias para el catálogo y la rotación con azar controlado. En Playwright, recorrer las acciones visibles en `tests/aprender.spec.mjs` y adaptar los casos pertinentes de `tests/consulta-aprendizaje.spec.mjs` y `tests/muestra.spec.mjs`. Ejecutar `npm run check` para verificar los recorridos en la aplicación servida en la raíz del sitio.

## Revisión y traspaso

Antes de editar por cada issue, revisar sus comentarios, PR abiertos y borradores, y ramas. Reservar `codex/issue-<número>` desde el `main` vigente con creación exclusiva, usar un checkout aislado y anunciar el alcance en el issue. Las dos entregas comparten el catálogo y la ruta. Integrar #84 antes de #85. Si el primero sigue en revisión, el segundo puede prepararse como PR dependiente siguiendo el procedimiento del repositorio y enlazando el PR previo. [Flujo de contribución](../../../CONTRIBUTING.md)

En cada PR ejecutar con Node 24 `npm ci`, `npm exec -- playwright install --only-shell chromium`, `npm run check` y `git diff --check`. Registrar los resultados reales, las pruebas de navegador y las capturas de los cambios visibles. El trabajo de implementación se completa cuando ambos issues tienen su PR verificado y el recorrido integrado satisface la tabla de aceptación. La persona responsable confirma la integración en `main`. [Issues de catálogo](https://github.com/flabat/truco-uruguayo/issues/84) y [rotación](https://github.com/flabat/truco-uruguayo/issues/85)
