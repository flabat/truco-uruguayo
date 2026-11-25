# Etapa 5 — Lanzamiento de la app: partes y orden

> Este documento divide la etapa 5 en partes con su propio issue, rama `codex/issue-<n>` y PR. Cada sesión que toma una parte escribe su plan detallado si lo necesita y lo ejecuta según AGENTS.md y CONTRIBUTING.md.

**Objetivo:** publicar la app en TestFlight y en la prueba cerrada de Google Play y, cuando haya paridad, servir `/jugar/` con la exportación web de Expo y retirar la pantalla Astro.

**Issue general:** #402.

**Diseños que mandan:**

- [Plan general de la app](../specs/2026-11-23-app-movil-design.md), etapa 5 y criterios a confirmar
- [Servidor para la app](../specs/2026-11-24-servidor-app-design.md) (etapa 2, integrada)
- [Etapa 4](2026-11-24-etapa-4-app-expo.md) (integrada: #367, #371, #372, #373 y #374)

## Restricciones globales

- Sin servicios pagos nuevos. Los únicos gastos son la membresía de Apple Developer (99 USD al año) y el alta en Google Play (25 USD, una sola vez). Builds locales o el plan gratuito de EAS.
- Ninguna sesión crea cuentas, paga, acepta términos ni despliega. Eso queda para el responsable del proyecto (ver [Lo que necesita el responsable](#lo-que-necesita-el-responsable)).
- La respuesta JSON de reportes de la API (`Accept: application/json` → `{ enlace }`) se despliega antes que cualquier binario nativo.
- Señas: rige `pairs-private-senas` también en la app.
- Textos de la interfaz, de las fichas y de los PR en español rioplatense.
- Verificación local: `npm ci` y `CHECK_STACK=1 npm run check` sobre el último commit. GitHub Actions no corre.

## Criterios a confirmar del plan general

El plan general dejó cuatro criterios propuestos en la revisión. Su estado en `main` al empezar la etapa:

| Criterio | Estado | Qué falta |
| --- | --- | --- |
| **Proveedores:** Google, Discord, Apple y contraseña; Facebook oculto mientras siga pausado | Hecho en el servidor (etapa 2): Keycloak tiene la extensión de Apple 1.17.0, la API revoca los tokens de Apple al dar de baja y la pantalla de ingreso muestra solo los proveedores habilitados. | Que el responsable cree el App ID, el Services ID y la clave en Apple, y configure el proveedor en producción ([docs/ingreso-social.md](../../ingreso-social.md#habilitar-sign-in-with-apple)). Probar un ingreso real con Apple en un iPhone. |
| **Sesión de 30 días en la app** que se renueva con el uso; la web mantiene 7 | Hecho: `api/auth.ts` emite las sesiones de tipo `app` por 30 días y las extiende cuando les quedan menos de 15. | Nada. Se confirma. |
| **Perfil nativo** con ID, nombre, cerrar sesión y eliminar cuenta | Hecho: `app/src/app/perfil.tsx` con período de gracia de 30 días. | Que la auditoría de paridad (#403) lo confirme y que las notas de revisión de Apple indiquen cómo llegar a la eliminación. |
| **Enlaces de invitación** que abren la app (universal links y app links) | Falta. | #406: `apple-app-site-association`, `assetlinks.json` y el mapeo en la app, con el Team ID y la huella de firma como datos pendientes. |

Con este estado, los cuatro criterios se dan por confirmados. Solo los enlaces de invitación necesitan trabajo de código.

## Partes

| Parte | Issue | Quién | Depende de | Qué entrega |
| --- | --- | --- | --- | --- |
| 5a · Auditoría de paridad | #403 | Autónoma | — | Tabla de paridad entre `app/` y `src/components/jugar/` y arreglo de lo que falte. Es la condición para 5f |
| 5b · Builds de tienda | #404 | Autónoma | — | Versión y número de build, permisos mínimos, íconos de iOS, Android y web, pantalla de inicio |
| 5c · Barra de estado | #405 | Autónoma | — | Iconos oscuros en la barra de estado sobre el fondo crema |
| 5d · Enlaces de invitación | #406 | Autónoma, con datos del responsable | — | `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, `associatedDomains`, `intentFilters` y mapeo de rutas |
| 5e · Fichas y privacidad | #408 | Autónoma; el responsable aprueba | — | Borradores de las fichas de App Store y Play, etiquetas de privacidad, seguridad de los datos, notas de revisión, lista de capturas, revisión de `/privacidad/` |
| 5f · `/jugar/` con Expo | #407 | Autónoma hasta el PR; el responsable integra y despliega | 5a cerrada | La exportación pasa de `/app/` a `/jugar/`, los enlaces viejos siguen andando y se retira la pantalla Astro |
| Build Release local | #390 | Autónoma | #384 (PR #400) | `npm run app:instalar -- ios\|android` con firma local |
| Distribución a testers | #394 | Necesita cuentas | #390, cuentas | `eas.json`, `eas build --local`, envío a TestFlight y a la prueba de Play, EAS Update |
| Subida a las tiendas | — | Responsable | 5b, 5d, 5e, #394, cuentas | Primer build en TestFlight y en la prueba cerrada de Play; fichas cargadas |

5a, 5b, 5c, 5d y 5e corren en paralelo. Los conflictos posibles son pocos y se resuelven al integrar:

- `app/app.json`: 5b (íconos, inicio y versión), 5d (`associatedDomains` e `intentFilters`) y 5f (`experiments.baseUrl`) tocan claves distintas.
- `infra/produccion/Caddyfile` e `infra/web.conf`: 5d agrega `/.well-known/` y 5f mueve `/app/` a `/jugar/`.
- `app/src/app/+native-intent.tsx` y `app/src/ingreso/retorno.ts` son solo de 5d. 5f anota en su PR lo que necesite ahí.

## Orden de integración y despliegue

1. **Ya desplegado o por desplegar antes de cualquier binario:** la API con la respuesta JSON de reportes y `KEYCLOAK_API_CLIENT_SECRET` (ya está en producción).
2. **5b, 5c, 5e** se integran cuando estén revisados. No cambian el sitio en producción salvo los textos de `/privacidad/`.
3. **5d** se integra y se despliega antes de subir el primer build a las tiendas: Apple y Android leen los archivos de `/.well-known/` al instalar la app. Con el Team ID y la huella cargados, se vuelve a desplegar.
4. **#390 y #394** cuando estén las cuentas.
5. **Primer build** en TestFlight (interno, sin revisión) y en la prueba cerrada de Play. Empiezan los 14 días con 12 testers.
6. **5a** cerrada, con la tabla sin huecos sin decidir.
7. **5f** se actualiza con `main`, se verifica de nuevo, el responsable lo integra y lo despliega. La vuelta atrás es revertir el PR y volver a desplegar: la pantalla Astro vuelve a `/jugar/` y la app a `/app/`.
8. **Publicación en las tiendas** cuando termine la prueba cerrada de Play y Apple apruebe la revisión.

## Lo que necesita el responsable

Ninguna sesión hace estos pasos.

1. **Apple Developer Program** (99 USD al año): crear la cuenta, aceptar los términos y anotar el **Team ID**. Con el Team ID, cargarlo como `APPLE_TEAM_ID` en producción (5d) y en la firma de los builds.
2. **Sign in with Apple real:** App ID con la capacidad, Services ID, clave `.p8`, Key ID, y configurar el proveedor en Keycloak de producción según [docs/ingreso-social.md](../../ingreso-social.md#habilitar-sign-in-with-apple). Después, ingresar con Apple desde un iPhone y comprobar la eliminación de cuenta.
3. **Google Play Console** (25 USD): crear la cuenta de desarrollador, verificar la identidad, aceptar los términos y crear la app `co.eltru.app`. Anotar la **huella SHA-256** del certificado de firma de la app (Play App Signing) para `assetlinks.json` (5d).
4. **12 testers durante 14 días** en la prueba cerrada de Play: invitar al menos 12 personas que se mantengan inscriptas 14 días seguidos. Es requisito para publicar con una cuenta personal nueva.
5. **TestFlight:** agregar los testers internos o externos. Los externos pasan por una revisión corta de Apple.
6. **Despliegue a producción** de 5d, de las fichas y de 5f, en el orden de arriba.
7. **Aprobación de las fichas de tienda** (5e): textos, capturas, clasificación por edad, etiquetas de privacidad de Apple y formulario de seguridad de los datos de Play. Cargarlas en App Store Connect y Play Console.
8. **Aprobar el cambio de `/jugar/`** (5f) una vez cerrada la auditoría de paridad.

## Riesgos

- **Revisión de Apple.** Pide Sign in with Apple, eliminación de cuenta dentro de la app y que la app no sea un sitio envuelto. Las tres cosas ya están cubiertas por las etapas 2 y 4. Las notas de revisión (5e) explican cómo jugar con una cuenta de prueba y dónde se elimina la cuenta.
- **Cuenta de prueba para la revisión.** Apple y Google necesitan una cuenta que funcione sin el proveedor de identidad social. Se usa una cuenta con contraseña creada por el responsable en producción, sin datos personales.
- **Doce testers.** Es lo que más tarda y no depende del código. Conviene empezar a juntarlos apenas exista la cuenta de Play.
- **Peso de la web.** Al pasar `/jugar/` a Expo, la primera carga crece (CanvasKit y la SPA). 5a mide el tiempo de carga en un teléfono de gama media y lo deja en la tabla.
