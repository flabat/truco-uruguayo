# Etapa 4 — App Expo: partes y orden

> Este documento divide la etapa 4 en partes con su propio issue, rama `codex/issue-<n>`, plan detallado y PR. Cada sesión que toma una parte escribe su plan con `superpowers:writing-plans` en `docs/superpowers/plans/` y lo ejecuta.

**Objetivo:** llevar el juego en línea a una app Expo para iOS, Android y web, con la mesa nueva.

**Diseños que mandan:**

- [Plan general de la app](../specs/2026-11-23-app-movil-design.md)
- [Servidor para la app](../specs/2026-11-24-servidor-app-design.md) (etapa 2, integrada)
- [Mesa nueva](../specs/2026-11-24-mesa-nueva-design.md) (etapa 3)

## Restricciones globales

- Expo (SDK vigente al empezar) con builds de desarrollo, Expo Router y TypeScript. No se usa Expo Go.
- Mismo protocolo `truco.v1` y mismos endpoints que la web. No se cambia el servidor salvo que una parte lo justifique en su PR.
- Señas: rige `pairs-private-senas` y solo hay señas automáticas al pie. Nada de seña llega a rivales ni espectadores.
- Gráficos: híbrido Skia + Reanimated + vistas comunes, con las tres reglas de capas del diseño de la mesa.
- Textos en español rioplatense, con los verbos de los cantos de #355.
- Verificación local: `npm ci` y `CHECK_STACK=1 npm run check` antes de pedir revisión. GitHub Actions no corre.
- Sin servicios pagos nuevos.

## Partes

| Parte | Issue | Depende de | Qué entrega |
| --- | --- | --- | --- |
| 4a · Cliente compartido | #359 | — | `paquetes/cliente`: tipos, HTTP/WS con autenticación configurable y lógica de presentación sin DOM. La web lo usa, sin cambios visibles |
| 4b · Base de la app | #360 | — | `app/` con Expo Router, ingreso por canje, sesión Bearer, perfil y eliminación de cuenta, exportación web en una dirección de prueba |
| 4c · Salón y sala | a crear | 4a, 4b | Salón en vivo, crear mesa, sala de espera con invitación, entrada de espectador, enlaces `?invitacion=`, `?mesa=` y `?mirar=` |
| 4d · Mesa | a crear | 4a, 4b | La mesa del diseño: geometría, capa Skia, hojas, señas al pie, tercetos, espectador, fin de mano, escritorio, animaciones, hápticos, modo liviano |
| 4e · Voces y sonidos | a crear | #356 integrado | Seis voces por asiento generadas una vez, efectos, reproducción con `expo-audio`. Antes, el usuario aprueba una muestra |

4a y 4b corren en paralelo. Comparten solo `package.json` y `package-lock.json` en la raíz (los workspaces), así que la segunda en integrarse resuelve ese conflicto. 4c y 4d corren en paralelo una vez integradas 4a y 4b. 4d puede empezar antes el módulo puro de geometría, que no depende de Expo. 4e es independiente del código de la mesa: entrega los clips y un módulo `reproducirVoz(asiento, frase)` que 4d llama.

La etapa 5 (lanzamiento) empieza cuando 4c, 4d y 4e están integradas y hay paridad.
