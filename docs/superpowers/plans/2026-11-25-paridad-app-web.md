# Paridad entre la app y la mesa web (etapa 5a)

**Issue:** #403, parte de #402. Condición para pasar `/jugar/` a la exportación Expo (#407).

**Comparación:** la mesa web Astro (`src/pages/jugar.astro`, `src/pages/volver.astro`, `src/components/jugar/`) contra la app (`app/src/`) en `main` a412941. Se leyó el código de los dos lados. La exportación web de la app se probó en Chromium con la pila local (API, PostgreSQL y Keycloak descartables) mediante `scripts/verificar-app-salon.mjs` y `scripts/verificar-app-mesa.mjs`, además de una sonda manual de teclado sobre la mano.

**Estados:** **igual** (el jugador web no pierde nada), **arreglado en #403** (faltaba y este PR lo agrega), **difiere a propósito** (con la decisión y dónde se tomó) y **issue aparte** (hueco grande, fuera de este PR).

## Tabla

| Función | Web (`/jugar/`) | App | Estado |
| --- | --- | --- | --- |
| 1 contra 1 | `EnJuego` en `Tablero.tsx` | `MesaEnJuego` + `mesaDeJugador` | **Igual.** Se juega con computadoras y entre personas (`verificar-app-mesa.mjs`: `probarDueloConComputadora`, `probarEnvido`). |
| 2 contra 2 con señas al pie (`pairs-private-senas` + `versionSenasPie`) | Casilla «Señas automáticas al pie», apagada por defecto | Siempre con señas al pie (`cuerpoDeMesaNueva`) | **Difiere a propósito.** El plan de la 4c (`2026-11-24-salon-y-sala.md`) fija que 2 contra 2 se crea siempre con señas al pie y sin casilla. |
| Privacidad de las señas | Gestos solo para el pie y su compañero | `senasEnMesa`: `ninguna` para rivales, espectadores y 1 contra 1, y descarte de gestos de otro equipo | **Igual.** `verificar-app-mesa.mjs` (`probarPrivacidad`) comprueba que diego (rival) y clara (espectadora) no reciben ni muestran gestos, globos ni píldoras del equipo de eva. |
| Seña elegida a mano (mesas legadas, `MesaConSenas` + `select`) | Se ofrece si el servidor no anuncia señas al pie para 2 contra 2 | Se juega en silencio y se listan las señas recibidas del compañero | **Difiere a propósito.** Plan de la 4d (`2026-11-24-mesa-app.md`, «Señas»). Con el retiro de `/jugar/` ya no se crean mesas legadas. |
| 2 contra 2 sin señas | Casilla apagada | No se ofrece | **Difiere a propósito.** Misma decisión de la 4c. |
| 3 contra 3 (tercetos, redondilla y pico a pico) | `MesaDeTercetos`, si `/api/modalidades` trae `3v3` | `mesaDeTercetos` + `datosDeTercetos`, mismo criterio | **Igual.** Señas al pie en redondilla si el servidor las ofrece para `3v3` (la web las deja optativas: misma decisión que en parejas). Nunca es pública, como en la web. |
| Salón y mesas públicas | `SalonEnVivo`, consulta cada 15 s con ETag | `Salon` + `useConsulta`, 15 s con ETag | **Igual.** Si `salonHabilitado` es falso, la web abre «Crear una mesa» y la app muestra el salón cerrado con «Crear mesa»: mismo resultado. |
| Crear mesa (modalidad, chico, visibilidad, con computadoras) | `AbrirMesa` | `app/crear.tsx` | **Igual.** Mismos textos y validación del chico (`textoDeMeta`). |
| Texto de visibilidad | Menciona el Discord de la mesa pública | Omitía el Discord | **Arreglado en #403** (`textoVisibilidad`). |
| `/jugar/?crear=1` (retorno permitido del ingreso, `api/auth.ts`) | Abre «Crear una mesa» | Se ignoraba y mostraba el salón | **Arreglado en #403:** destino `crear` en `enlaces.ts`, también después de ingresar. |
| Invitación (enlace, copiar, compartir) | Campo, «Copiar invitación» y «Compartir invitación» | Campo seleccionable y «Compartir invitación» (hoja del sistema; si no hay, copia) | **Igual** en lo que se puede hacer. La app une los dos botones: `compartirInvitacion` copia cuando no hay hoja de compartir. |
| Ocupar el asiento desde la invitación | Vista previa y «Ocupar mi asiento» | `app/invitacion/[token].tsx` | **Igual.** Si ya estaba sentado, va directo a la mesa en los dos. |
| Volver a mi mesa | Botón en salón, crear y visor (`truco.ultima-mesa.<jugador>`) | Botón en el salón, misma clave | **Igual** en lo esencial. En crear y en el visor la app ofrece «Volver al salón» y, desde ahí, «Volver a mi mesa»: la mesa del teléfono deja una sola salida (plan de la 4d). |
| `/volver/?mesa=` | `volver.astro` consulta la mesa y redirige a `/jugar/?mesa=` o `?mirar=`; sin sesión, ingresa y vuelve | `index.tsx` recibe `?mesa=` y `?mirar=` | **Igual** si `volver.astro` sigue y `/jugar/` sirve la app (ver «Para #407»). |
| `?mirar=` | Nunca se interpreta como invitación | `destinoDeEnlace`: `mirar` manda sobre `invitacion` y `mesa` | **Igual.** `verificar-app-salon.mjs` lo prueba con los dos parámetros juntos. |
| Espectador | `VisorEspectador`, cada 2 s | `Visor` sobre la misma mesa, cada 2 s, sin mano ni Cantos | **Igual.** La web suma «Crear mi mesa» y «Volver a mi mesa» en el visor; la app deja «Volver al salón» (misma decisión de una sola salida). |
| Mesa cancelada y agregar computadoras | Sala de espera | `app/sala/[id].tsx` | **Igual.** |
| Historial de la mano | `HistorialDeMano` (con indicaciones del pie y flor querida) | Hoja «Mano»: «Lo que pasó», vueltas terminadas y lances de tercetos | **Igual.** |
| Reporte de jugada | Formulario a `/api/mesas/<id>/reportes` en otra pestaña | En la web, el mismo formulario; en las apps, `Accept: application/json` y `Linking.openURL` | **Igual.** Solo con `puedeReportar`. Los campos salen de `camposDelReporte` (`app-mesa-reporte.test.ts`). |
| Resumen de tantos y tantos cobrados | `ResumenDeTantos`, `PruebaEnMesa`, «Tantos cobrados» | `FinDeMano` (pruebas y cobros) y hoja «Tantos» | **Igual.** |
| Voces de los cantos | Globos de texto (`GloboDeVoz`, `PalabraDelPie`) | Globos y, además, audio (4e) con interruptor en la hoja «Más» | **Igual** (la app suma el audio). |
| Voz por Discord | `VozDiscord`, enlace que vence | Hoja «Voz»: mismo alcance, vencimiento y texto de espectador | **Igual.** |
| Comunidad de Discord («¿Buscás con quién jugar?») | `Comunidad.tsx`, se oculta por jugador | No estaba | **Arreglado en #403:** aviso en el salón, misma clave `truco.comunidad.oculta.<jugador>`. |
| Conteos anónimos de `/eventos/` (`compartir-mesa`, `ingreso-mesa`, `discord`) | `contar()` en compartir, ocupar asiento y Discord | No estaban | **Arreglado en #403** en la exportación web (`salon/eventos.ts`). Las apps nativas no cuentan, para no sumar datos a lo que declaran en las tiendas. |
| Reconexión | `useMesa` con `online`, `offline` y `pageshow` | `useMesa` con `AppState` | **Arreglado en #403:** en la web, `avisosDeApp` también escucha `online`, `offline` y `pageshow` (`salon/avisos-red.ts`). En las apps, el cierre del socket y la vuelta a primer plano bastan. La sala y la barra de la mesa muestran «Reconectando…». |
| Bloqueo de jugadas sin red, enviando o con versión de señas desconocida | `bloqueada` en `Sala.tsx` | `bloqueada` en `MesaEnJuego` | **Igual**, con el mismo texto «Actualizá la aplicación para jugar con esta versión de señas.». |
| Sugerencia horizontal | `SugerenciaHorizontal` en la sala de espera, en el teléfono vertical | No | **Difiere a propósito.** La app está fijada en vertical y la mesa se diseñó para el teléfono (plan de la 4c). |
| Teclado | Botones nativos y foco que vuelve al encabezado | Tab llega a cada carta (`<button aria-label="Jugar …">`) y Enter la juega; atajos 1, 2, 3, C, Q, N y Escape | **Igual.** Comprobado en Chromium con la pila local. |
| Lector de pantalla | `role="status"` en la zona de juego y etiquetas en cartas y asientos | Regiones vivas en el estado y en «Reconectando…», etiquetas en cartas, asientos y pruebas | **Igual** en la web. En iOS y Android falta probar con VoiceOver y TalkBack: **issue aparte #410.** |
| Versión del motor y del modelo | `PieMesa` en el pie del sitio | Hoja «Más» | **Igual.** |
| Perfil y eliminación de cuenta | `/perfil/` del sitio (sigue en Astro) | `app/perfil.tsx`: nombre, ID, cerrar sesión, eliminar con 30 días de gracia | **Igual.** |
| «Mis partidas» | En `/perfil/` | No estaba | **Arreglado en #403** en la web: «Ver mis partidas» abre `/perfil/#mis-partidas`. En las apps nativas: **issue aparte #409.** |
| Recuperarse de un error al entrar | «Reintentar», «Volver al salón» y «Jugar una mano guiada» | «Reintentar» en el ingreso y «Volver al salón» en cada pantalla | **Difiere a propósito.** La mano guiada es una página del sitio (`/aprender/mano/`) que sigue en el menú del sitio. |

No quedan huecos sin decidir: todo es igual, se arregla en este PR, difiere por una decisión anotada o tiene issue propio (#409, #410).

## Para #407 (mover la exportación a `/jugar/`)

- `app/src/salon/enlaces.ts`: `enlaceParaCompartir` arma `/app/?invitacion=`. Tiene que pasar a `/jugar/?invitacion=`.
- `app/src/ingreso/plataforma.ts`: `abrirIngreso` en la web pide `volver=/app/`. Tiene que pedir `volver=/jugar/`, que `regresoPermitido` de `api/auth.ts` ya acepta.
- Conservar `src/pages/volver.astro`: redirige a `/jugar/?mesa=` o `/jugar/?mirar=`, y la app los recibe en `index.tsx`. El ingreso vuelve a `/volver/?mesa=`, `/jugar/?mirar=`, `/jugar/?crear=1` y `/jugar/?invitacion=`, y la app entiende las cuatro.
- Conservar `public/eventos/*.txt`: la exportación web los pide con rutas absolutas.
- Las claves de `localStorage` son las mismas que las de `/jugar/` (`truco.ultima-mesa.<jugador>`, `truco.comunidad.oculta.<jugador>`): quien ya jugó conserva «Volver a mi mesa» y el aviso oculto.
- `scripts/verificar-app-salon.mjs` y `scripts/verificar-app-mesa.mjs` usan `/app/` en las rutas y en la expresión de los recursos de cartas.
