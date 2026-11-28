# Botón de Apple según las guías de Apple — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pantalla «Entrá a jugar» del tema `truco-oriental` muestre Apple primero, con el logo oficial, «Continuar con Apple» y los colores de las Human Interface Guidelines, y que la verificación del stack lo compruebe (#467).

**Architecture:** La imagen de Keycloak baja el `.dmg` de Apple con suma fija y extrae los dos SVG del logo alineado a la izquierda; el repo no guarda arte de Apple, solo sus sumas. El tema agrega un caso `apple` en `social-providers.ftl` con dos imágenes que alterna la clase de modo oscuro de keycloak.v2 (`pf-v5-theme-dark`). `configurar-ingreso-social.mjs` fija `guiOrder` de Apple. `verificar-ingreso-social.mjs`, que el stack ya corre con la extensión real de Apple y credenciales inventadas, comprueba orden, logo, texto y estilo.

**Tech Stack:** Keycloak 26.8.2 (keycloak.v2, FreeMarker, PatternFly 5), Docker multi-stage, Node 24 (`node:test`, Playwright).

**Spec:** [docs/superpowers/specs/2026-11-27-sign-in-with-apple-tienda-design.md](../specs/2026-11-27-sign-in-with-apple-tienda-design.md), sección «1. Botón de Apple» (también en #466); alcance en #467. Guías: [HIG, Sign in with Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple).

## Global Constraints

- Logo: solo el arte de Apple Design Resources (`Logo-Sign-in-with-Apple.dmg`, SHA-256 `99fba5c8a294a86653294b3766d7ce21dde47cc75a77367659c45ea168699af6`), sin recortar ni modificar. La licencia «Developer Artwork License Agreement for Sign in with Apple» prohíbe redistribuirlo aparte: nunca se versiona en el repo.
- Archivos: «Left-aligned - White - Medium» → `apple-blanco.svg` (logo blanco sobre negro, modo claro); «Left-aligned - Black - Medium» → `apple-negro.svg` (logo negro sobre blanco, modo oscuro). Medium: el glifo mide ~19 px, como los íconos de 20 px de los demás.
- HIG: alto del logo = alto del botón, sin relleno vertical; título solo «Continue with Apple» / «Continuar con Apple»; logo y título del mismo color, blanco o negro; fondo negro en claro y blanco en oscuro; tamaño del título ≈ 43 % del alto; margen derecho del título ≥ 8 % del ancho; mínimo 140 × 30.
- Mismo alto, ancho y radio que los demás botones: alto común `2.75rem` para todos los botones sociales.
- Textos de interfaz, commits y PR en español rioplatense. No tocar `api/` ni `docs/ingreso-social.md` (#468).

## Review Focus

- Foco con teclado sobre el botón negro: el borde de foco de PatternFly es del color del borde y desaparece sobre negro; debe verse un contorno. Prueba en la Tarea 3.
- Cambio de modo con la página abierta: colores y logo siguen a la misma clase `pf-v5-theme-dark`, nunca a dos mecanismos distintos. Prueba en la Tarea 3 (página nueva en oscuro y en claro).
- Nombre visible del proveedor cambiado en la consola: el título de Apple sale de su propia clave de mensajes, no de `displayName`. Prueba en la Tarea 3 (texto exacto).
- Logo que no carga o no es el de Apple: la prueba descarga el SVG servido y compara su suma con `logo-apple.sha256`. Tarea 3.
- Ancho de teléfono: el título no se parte y el botón conserva el alto del logo. Prueba en la Tarea 3 con 375 px.

---

### Task 1: Apple primero en la lista

**Files:**
- Modify: `scripts/configurar-ingreso-social.mjs` (`representacion`)
- Test: `tests/unit/ingreso-social.test.ts`

**Interfaces:**
- Produces: el proveedor `apple` queda con `config.guiOrder === "0"` en el alta y en cada rotación; los demás no reciben `guiOrder`.

- [ ] **Step 1: Write the failing tests** en `tests/unit/ingreso-social.test.ts`:
  - `test("crea Apple primero en la lista, con el equipo, la clave y los tokens guardados")`: alta `[404], [201]` con `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`; `assert.equal(creado.config.guiOrder, "0")`, `creado.storeToken === true`, `creado.config.teamId`, `creado.config.keyId`.
  - `test("la rotación de Apple lo devuelve al primer lugar")`: proveedor existente con `config.guiOrder: "5"` → el `PUT` lleva `"0"`.
  - En el bucle de Google/Facebook/Discord: `assert.equal(creado.config.guiOrder, undefined)`.
- [ ] **Step 2:** `node --test tests/unit/ingreso-social.test.ts` → FAIL en `guiOrder`.
- [ ] **Step 3:** En `representacion`, `if (proveedor === "apple") config.guiOrder = "0";` con un comentario: Keycloak ordena por `guiOrder` y Apple pide que su botón no quede debajo de los otros.
- [ ] **Step 4:** `node --test tests/unit/ingreso-social.test.ts` → PASS.
- [ ] **Step 5: Commit** «Poner Apple primero en el ingreso».

### Task 2: Logo oficial en la imagen de Keycloak

**Files:**
- Create: `infra/keycloak/logo-apple.sha256`
- Modify: `infra/keycloak/Dockerfile`

**Interfaces:**
- Produces: `/opt/keycloak/themes/truco-oriental/login/resources/img/social/apple-blanco.svg` y `apple-negro.svg`, servidos en `${url.resourcesPath}/img/social/…`. `logo-apple.sha256` en formato `sha256sum` (`<suma>  apple-blanco.svg`, `<suma>  apple-negro.svg`), que leen el Dockerfile y la Tarea 3.

- [ ] **Step 1:** Crear `logo-apple.sha256` con `f43d1ed5be59bcffdf4c20b5e29f8de041858678f549515377d0ba4f5ebd115e  apple-blanco.svg` y `0f56330a7a4fe2db06ec79fdbfed1eec1d434557f052add6d848daa31877f380  apple-negro.svg`.
- [ ] **Step 2:** Etapa `logo-apple` desde `node:24-bookworm-slim` (ya en caché por la API y la web): `ADD --checksum=sha256:99fb…` del `.dmg`, instalar `7zip`, extraer los dos SVG Medium con `7zz e`, renombrarlos, `sha256sum -c logo-apple.sha256`. Comentario: licencia de Apple, por qué no se versiona y qué hacer si Apple cambia el archivo. `COPY --from=logo-apple` solo los dos SVG al tema.
- [ ] **Step 3:** `docker build -f infra/keycloak/Dockerfile --target logo-apple .` termina con `apple-blanco.svg: OK` y `apple-negro.svg: OK`.
- [ ] **Step 4: Commit** «Bajar el logo de Apple al construir la imagen de Keycloak».

### Task 3: Botón de Apple en el tema y en la verificación del stack

**Files:**
- Modify: `infra/keycloak/truco-oriental/login/social-providers.ftl`, `resources/css/truco.css`, `messages/messages_es.properties`, `messages/messages_en.properties`
- Test: `scripts/verificar-ingreso-social.mjs`

**Interfaces:**
- Consumes: los SVG y `logo-apple.sha256` de la Tarea 2; `guiOrder` de la Tarea 1.
- Produces: `#social-apple` con clase `truco-apple`, `img.truco-apple-claro` (`apple-blanco.svg`) e `img.truco-apple-oscuro` (`apple-negro.svg`), título y `aria-label` desde `trucoContinuarConApple`.

- [ ] **Step 1: Write the failing checks** en `verificar-ingreso-social.mjs`:
  - Etiqueta inglesa de todos los botones: `"Continue with " + nombre` (hoy `Sign in with`).
  - Si `apple` está habilitado: el primer `a[id^='social-']` es `#social-apple`.
  - `verificarApple(page, esquema)` en claro (1280 px, es) y en oscuro y claro a 375 px (en): fondo `rgb(0, 0, 0)` y texto `rgb(255, 255, 255)` en claro, al revés en oscuro; la imagen visible es `apple-blanco.svg` en claro y `apple-negro.svg` en oscuro, con `naturalWidth > 0`, `image/svg+xml` y la suma de `logo-apple.sha256`; alto de la imagen = alto del botón; alto, ancho y `border-radius` iguales a los de `#social-google`; `font-size / alto` entre 0.41 y 0.45; margen derecho del título ≥ 8 % del ancho; botón ≥ 140 × 30; con foco de teclado, `outline-style` distinto de `none`.
- [ ] **Step 2:** Correr el script contra la mesa local con los cuatro proveedores → FAIL (`Sign in with`, logo genérico).
- [ ] **Step 3:** Mensajes: `trucoContinuarConApple=Continuar con Apple`; en inglés, `trucoContinuarConApple=Continue with Apple` y `signInWithProvider=Continue with {0}`, como «Continuar con {0}» en español.
- [ ] **Step 4:** `social-providers.ftl`: caso `apple` antes de `#default` que agrega `truco-apple` a la clase del enlace, usa `trucoContinuarConApple` en `aria-label` y en el título y pone las dos imágenes.
- [ ] **Step 5:** `truco.css`: `--truco-social-alto: 2.75rem` como `min-height` de todos los botones sociales (hoy solo dentro de `.truco-social`); `#social-apple` negro con texto blanco, `padding-block: 0`, `padding-inline-start: 0.625rem` (alinea el glifo con los demás íconos), título en la fuente del sistema a `calc(var(--truco-social-alto) * 0.43)`, logo del alto del botón; `.pf-v5-theme-dark` invierte colores y alterna las imágenes; contorno visible en `:focus-visible`.
- [ ] **Step 6:** Reconstruir `identidad`, volver a configurar los proveedores y correr el script con 0, 1 y 4 proveedores, como `verificar-stack.sh` → PASS.
- [ ] **Step 7: Commit** «Mostrar el botón de Apple según las guías de Apple».

### Task 4: Capturas, verificación y PR

- [ ] **Step 1:** Capturas con Playwright de «Entrá a jugar» a 375 px, en claro y en oscuro, con los cuatro proveedores.
- [ ] **Step 2:** `npm run check:rapido` y `npm run check:stack` → verdes.
- [ ] **Step 3:** Push, PR que cierra #467 con las capturas, y `python3 infra/ci/verificar_pr.py <PR>` registrado en el PR.
