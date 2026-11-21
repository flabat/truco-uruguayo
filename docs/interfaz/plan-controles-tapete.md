# Plan de implementación de los controles del tapete

[Diseño](diseno-controles-tapete.md) · [ADR de controles](adr/0002-controles-en-el-tapete.md) · [ADR de orientación](adr/0003-orientacion-en-celulares.md) · [Prompt para iniciar la implementación](prompt-controles-tapete.md).

## Preparación

El coordinador lee [AGENTS.md](../../AGENTS.md) y [CONTRIBUTING.md](../../CONTRIBUTING.md), verifica el `main` remoto y revisa issues, PR abiertos o en borrador y ramas. Usa un issue de implementación distinto del [issue documental #286](https://github.com/flabat/truco-uruguayo/issues/286). Abre o reutiliza un issue por paquete. Reserva cada rama `codex/issue-<número>` con creación exclusiva desde `main` y registra responsable, archivos y dependencias. Cada agente trabaja en un checkout aislado y usa un puerto de pruebas diferente. Los paquetes A, B y C pueden empezar simultáneamente. D coordina e inicia sus recorridos de prueba en paralelo.

Los [PR #253](https://github.com/flabat/truco-uruguayo/pull/253) y [#255](https://github.com/flabat/truco-uruguayo/pull/255) llevaban el desglose y los totales cuando se redactó el diseño. Revisar su estado antes de tocar el tablero. Si siguen abiertos, acordar el traspaso o el orden con sus responsables. La integración de la nueva composición toma como base el contenido de resumen que esté acordado. Si ambos PR siguen en curso y el trabajo de interfaz avanza, D puede preparar los test y la adaptación del bloque de acciones en su rama. La adaptación final de las zonas compartidas se hace después del arreglo #249 y luego del resumen #250, o con un orden distinto acordado explícitamente con quien los lleva.

## Contratos para el trabajo en paralelo

Congelar al inicio el siguiente acuerdo. Todo cambio posterior se comunica antes de reanudar adaptaciones dependientes.

- **A entrega a D** `Tapete.zonaJugador?: ReactNode`, una sola región visual después de los puestos. La variante de partida se activa cuando existe el slot. Para reglas exteriores del tablero de jugador, usar `.j-partida--jugador` y mantener las reglas del visor en su selector actual.
- **B entrega a D** un componente de presentación de la zona de juego. Recibe de los adaptadores título, detalle, bloqueo o espera, mano, selector de seña opcional, cantos y acción de continuación. Los adaptadores mantienen sus acciones y textos de dominio. B y D fijan juntos la firma concreta en el issue antes de desarrollar. El contrato incluye recuperación del foco tras activación por teclado y un único anuncio de estado.
- **C entrega a D** un componente de sugerencia que se monta durante la espera de parejas o tercetos. Recibe una referencia o una función para restaurar foco al encabezado de espera. C comparte la forma de montar el componente y la clave de sesión que usarán los tests.
- **D entrega a A, B y C** los datos de prueba y un punto de integración común cuando junta las ramas. Las pruebas se basan en las vistas autorizadas y en los selectores semánticos. Mantener los cambios de contrato en ramas de sus responsables.

## A · Composición del tapete y tamaños

**Archivos propios.** `src/components/jugar/Tapete.tsx`, `tapete.css` y `jugar.css`. Cualquier hoja adicional que requiera la geometría queda bajo este paquete.

1. Incorporar el slot opcional tras la cuadrícula de puestos. Prever el caso con y sin mano, con una o dos filas de cantos y con la muestra junto al asiento propio.
2. Diseñar el área visual que se cruza con el fieltro y reservar en la cuadrícula espacio para toda la zona interactiva. Encapsular las reglas del jugador. El modo de baja altura debe funcionar en horizontal con barras visibles y zonas seguras.
3. Verificar 2, 4 y 6 puestos, nombres largos, muestra a la derecha del dador y contornos de foco. Incluir casos de ausencia del slot con el espectador y las lecciones.
4. Entregar el diff, la firma definitiva, los tamaños comprobados y cualquier ajuste requerido del encabezado. Si necesita un cambio en otro archivo, se lo pide al propietario.

**Dependencias.** Empieza desde `main`. Usa un montaje local temporal para comprobar el slot si hace falta. D confirma las dimensiones en la ruta final.

## B · Acciones y foco

**Archivos propios.** Nuevo componente compartido dentro de `src/components/jugar/` y su CSS propio si es necesario. A conserva geometría y CSS exterior.

1. Componer en el orden acordado la indicación, la seña opcional, la mano, los cantos y la acción de continuación. Usar HTML nativo y nombres accesibles existentes. Los adaptadores entregan los controles y sus callbacks.
2. Crear el destino de foco y el anuncio persistente de estado. Al enviar por teclado, conservar el foco si el control sigue activo. Cuando se pierda al quitar o bloquear el botón y permanezca en la mesa, restaurarlo a la indicación o al destino definido. Probar que una actualización ajena preserva un foco válido y que cada tecla causa un solo envío.
3. Dejar las reglas de legalidad, la selección privada y el avance de la presentación en los adaptadores. Entregar a D la firma, los ejemplos de DOM y las comprobaciones de foco.

**Dependencias.** Empieza desde `main` con el acuerdo de interfaz. Puede probar el componente en un fixture local antes de conectarlo al slot. Las pruebas E2E de la ruta final quedan en D.

## C · Sugerencia para jugar en horizontal

**Archivos propios.** Nuevo `SugerenciaHorizontal.tsx` y su CSS junto a los componentes de juego. D conserva `Sala.tsx` y las pruebas E2E de la ruta.

1. Implementar la consulta de medios, el aviso en línea y el ciclo de exposición por pestaña del ADR. Gestionar la suscripción al cambio de la consulta y su limpieza.
2. Ofrecer descarte por un botón nativo y restauración de foco cuando el nodo activo desaparece. Usar la memoria de interfaz ante un fallo de `sessionStorage`.
3. Documentar para D el montaje en la sala de espera, la referencia al encabezado y los escenarios de giro, descarte, almacenamiento bloqueado y pestaña nueva.

**Dependencias.** Empieza desde `main`. Comparte con A los tamaños horizontales de verificación. El aviso sale a producción en el mismo PR integrado que la nueva composición.

## D · Adaptadores, integración y pruebas del recorrido

**Archivos propios.** `src/components/jugar/{Sala,Tablero,Tercetos,Senas}.tsx`, `senas.css` si corresponde, y los tests de integración. Coordina con A cualquier cambio en las clases y con B y C las firmas. `VisorEspectador.tsx` y los adaptadores de lecciones sirven como regresiones de la API opcional de `Tapete`. Si el encabezado global requiere un ajuste, D controla la modificación acotada a la partida.

1. Separar cada panel de jugador en una zona de juego y un detalle posterior. Adaptar primero duelo, luego parejas con y sin señas y finalmente tercetos en redondilla y pico a pico. Pasar la mano mediante el slot y conservar el filtrado de cartas que ya estén en una prueba de tantos. Respetar la espera y los lances visibles para cada asiento.
2. Conectar el selector privado dentro de la zona, conservando la vigencia por versión y la confirmación con una sola acción. Diferenciar espera, envío, presentación y reconexión a partir del estado que ya tiene `Sala`. Mantener el envío por `jugada` y los identificadores de comando existentes.
3. Montar el aviso en la espera de parejas y tercetos si faltan asientos. El encabezado de espera recibe el foco de recuperación cuando corresponda. Validar el caso de acceso directo y el giro en una partida activa.
4. Reutilizar fixtures y comprobaciones de `tests/jugar.spec.mjs`, `tests/dador.spec.mjs`, `tests/tercetos-online.spec.mjs`, `tests/senas-online.spec.mjs`, `tests/vueltas-online.spec.mjs` y `tests/salon.spec.mjs`. Agregar un spec de la nueva composición si las aserciones compartidas de geometría y foco se vuelven más claras allí.
5. Afirmar cajas visibles de mano y acciones dentro del viewport en los casos definidos en el diseño. Cubrir scroll horizontal, controles recortados, orden de Tab, pérdida de foco al jugar, número de envíos, reconexión y rotación. Las comparaciones entre orientaciones usan la misma versión y las mismas acciones legales. Comprobar que el visor y las lecciones conservan sus recorridos y que el DOM público y las vistas rivales reciben la misma jugada e historial con seña que en silencio.
6. Guardar capturas de un duelo vertical a 320 px, una respuesta en parejas, un terceto horizontal de baja altura y una mesa de escritorio. Verificar en un teléfono real con las barras del navegador y documentar el recorrido por teclado y lector de pantalla o detallar qué comprobación sigue pendiente. Usar datos sintéticos o mesas de computadoras y `pairs-private-senas` cuando corresponda.

**Dependencias.** Puede avanzar con la revisión y los fixtures antes de recibir A, B y C. Aplica la integración del tablero después de fijar las firmas y coordinar el puntaje.

## Orden de integración y revisión

1. A, B y C trabajan desde el `main` reservado y publican sus diffs en sus ramas de issue. Al comunicar el traspaso, identifican el commit exacto, los archivos y las comprobaciones reales.
2. D reúne los commits revisados en la rama de integración desde el `main` vigente. Los paquetes A, B y C se revisan en borrador y se incorporan a un único PR de producto junto con los adaptadores. D actualiza las ramas o PR relacionados con el enlace de integración. El orden de aplicación es **A, B y C, luego D**. Entre A, B y C los cambios son disjuntos.
3. Antes de pedir revisión, ejecutar `npm ci`, `npm run check` y `git diff --check`. Registrar comandos, capturas, resultados y pruebas manuales en el PR. Validar las regresiones del stack cuando lo indique el flujo del repositorio. Usar el PR de integración contra `main` para revisión y entrega.
