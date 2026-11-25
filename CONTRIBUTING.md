# Contribuir a El Truco

## Issues y coordinación

1. Buscá el tema en los [issues](https://github.com/flabat/truco-uruguayo/issues), [PR abiertos](https://github.com/flabat/truco-uruguayo/pulls) y [ramas](https://github.com/flabat/truco-uruguayo/branches). Leé los comentarios de los issues relacionados y revisá el alcance anunciado en los PR en curso. Si dos issues requieren cambios en las mismas reglas, datos o componentes, acordá qué sesión los modifica y en qué orden antes de editar.
2. Reutilizá el issue existente o abrí uno. Para errores, incluí pasos o una mano reproducible, el resultado actual y el esperado. Para funciones y decisiones de diseño, describí el problema, las opciones, los criterios y la decisión. Si hace falta acordar el diseño, registrá la decisión en el issue antes de implementarla. Para cambios de reglas, citá el artículo o sección y especificá a qué variante se aplica.
3. Reservá una rama por issue. Usá el nombre exacto `codex/issue-<número>` y la operación de creación de la referencia, que rechaza una rama existente. Una asignación o un comentario sirve para comunicar el estado, ya que varias sesiones pueden usar la misma cuenta. La rama indica que el trabajo está reservado. Codex y Claude Code siguen el mismo protocolo y el mismo prefijo: `AGENTS.md` tiene las reglas compartidas y `CLAUDE.md` las importa.

Ejemplo desde un checkout cuyo `origin` apunta al repositorio principal y con GitHub CLI autenticado. Ejecutá el bloque completo para que el worktree se cree solo si la reserva tuvo éxito.

```sh
issue=42
branch="codex/issue-${issue}"
git fetch origin main &&
  gh api --method POST 'repos/{owner}/{repo}/git/refs' \
    -f "ref=refs/heads/${branch}" \
    -f "sha=$(git rev-parse origin/main)" &&
  git fetch origin "${branch}:refs/remotes/origin/${branch}" &&
  git worktree add --track -b "${branch}" "../truco-issue-${issue}" "origin/${branch}"
```

También podés crear la referencia mediante la [API de GitHub](https://docs.github.com/en/rest/git/refs#create-a-reference) y usar un checkout aislado de esa rama. Si la reserva falla, averiguá si ya existe la rama o si falló el acceso. Si la creación remota tuvo éxito y solo falló el paso local, retomá desde la referencia creada.

Después de reservar, registrá en el issue la rama, un identificador de sesión, el alcance y las rutas que esperás tocar. Abrí un PR en borrador cuando puedas compartir el primer commit. Al suspender o transferir el trabajo, dejá en el issue o PR la rama, el último commit publicado, las comprobaciones hechas y el próximo paso. Pasá explícitamente la responsabilidad antes de que otra sesión edite la rama. Si descartás el trabajo, registrá su estado y liberá la rama cuando ya no haga falta conservarla. Para una dependencia entre PR, enlazá el PR previo y acordá el orden de integración.

## Verificación local

Los PR se verifican en la computadora de quien los abre: GitHub Actions no corre por falta de créditos. Con Node.js 24, npm, Python 3 y Docker en marcha, ejecutá desde la raíz del checkout, sobre el último commit del PR.

```sh
npm ci
npm exec -- playwright install --only-shell chromium
CHECK_STACK=1 npm run check
git diff --check
```

`npm run check` ejecuta las pruebas unitarias, compila la aplicación en `dist/` para la raíz del sitio y comprueba sus enlaces internos, anclas, cartas y recursos. Playwright recorre la interfaz en Chromium de escritorio y con emulación móvil. Instalá el navegador al preparar un checkout o actualizar Playwright. En Linux podés agregar `--with-deps` al comando de instalación. Si otra sesión usa el puerto 4322, elegí uno libre con `TEST_PORT=4323 npm run check`. `CHECK_STACK=1` agrega la prueba de la aplicación completa con la API, PostgreSQL y el proveedor de identidad. Si no podés usar Docker, ejecutá `npm run check` e indicá en el PR que falta la prueba de la pila completa; no integres hasta que alguien la corra.

- **Reglas y datos.** Revisá el texto, las tablas, los ejemplos y las fuentes de los capítulos afectados. Calculá al menos una mano concreta y comprobá los empates, los límites del tanteador o las variantes que correspondan al cambio.
- **Interfaz y navegación.** Probá el comportamiento modificado en el navegador en un ancho móvil y otro de escritorio. Para controles interactivos, verificá teclado, foco y estados relevantes. Si cambia la búsqueda, probá un término con tilde, uno sin tilde, un resultado vacío y el enlace al capítulo.
- **Lógica e interacciones nuevas.** Agregá pruebas de regresión para el comportamiento observable, con casos normales, límites y errores aplicables. Usá pruebas unitarias para cálculos y pruebas de navegador para flujos que dependan del DOM. Incorporá su ejecución a `npm run check`.

### Niveles de verificación

Varias sesiones comparten la misma computadora. Elegí el nivel según el momento:

| Nivel | Cuándo | Qué corre | Tiempo aproximado |
|---|---|---|---|
| `npm run check:rapido` | Mientras trabajás, después de cada cambio. | Las cartas, las unitarias cuyo árbol de imports toca lo que cambió respecto de `origin/main`, los tipos de la app si cambió `app/` o `paquetes/`, las pruebas de despliegue si cambió Python o `infra/`, y Playwright solo para las rutas afectadas. Sin Docker. | Menos de 2 minutos |
| `npm run check` | Antes de un commit que vas a publicar. | Todo lo anterior completo: unitarias en paralelo, build, enlaces, cartas y todas las pruebas de Playwright. | Unos 3 minutos |
| `CHECK_STACK=1 npm run check` | Antes de pedir revisión y antes de integrar, sobre el último commit. | `npm run check` más la pila completa en Docker. | Unos 12 minutos, más la espera en la cola |

`npm run check:rapido -- --plan` muestra qué correría y por qué, sin correr nada. Si cambia `package.json`, `package-lock.json`, `astro.config.mjs` o `playwright.config.mjs`, corre todo lo que no usa Docker. Lo que el sitio carga sin `import` (por ejemplo `public/`) hace correr todas las pruebas de navegador. Es una ayuda para iterar: no reemplaza la verificación completa del PR.

`node --test` usa por defecto tantos procesos como núcleos menos uno; `TEST_CONCURRENCY=4` lo limita. Playwright usa la mitad de los núcleos (2 workers en CI); `PLAYWRIGHT_WORKERS=2` o `PLAYWRIGHT_WORKERS=25%` lo cambian si la máquina está cargada.

`npm run check:stack` (y por lo tanto `CHECK_STACK=1`) entra en una cola de la máquina: `scripts/cola-pila.py` deja correr 2 pilas a la vez como máximo y atiende en orden de llegada. Mientras esperás, muestra tu posición y qué checkouts tienen los puestos. Los candados están en `~/.cache/truco/cola-pila` y se liberan solos si el proceso termina o se corta. Cada puesto usa sus propios puertos (18080/18081 el primero, 18090/18091 el segundo), salvo que fijes `TEST_WEB_PORT` y `TEST_OIDC_PORT`. `TRUCO_COLA_PILAS` cambia el máximo; no lo subas en esta Mac.

## Pull requests

- Abrí un PR acotado contra `main` y enlazá el issue. Usá `Closes #42` si el cambio resuelve el issue. Usá `Refs #42` si el debate o el trabajo sigue abierto. [Enlace y cierre de issues en GitHub](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- Describí el cambio y cómo verificarlo. Incluí los comandos y resultados reales, los casos manuales, las fuentes de reglas y capturas si cambia la interfaz. Indicá cualquier comprobación pendiente antes de marcar el PR como listo.
- Actualizá la rama desde `main` cuando corresponda, resolvé los comentarios y repetí la verificación local tras el último cambio. No esperes el check de GitHub: los comandos y resultados del PR son la verificación. La persona responsable de la revisión o del repositorio confirma la integración. Preferí squash merge y eliminá la rama y el worktree cuando el PR esté integrado y el checkout esté limpio.

## Configuración recomendada en GitHub

En un repositorio privado del plan gratuito de GitHub, los rulesets no se aplican. Si el repositorio pasa a ser público o a un plan que los admita, creá un ruleset activo para `main` que requiera PR, una rama actualizada y la resolución de conversaciones, y que bloquee el borrado y los force pushes de `main`. No requieras el job `check` del workflow **Verificar el sitio** mientras no haya créditos de GitHub Actions: sin ejecución, bloquearía todas las integraciones. Cuando haya otra persona habilitada para revisar, requerí una aprobación independiente. Si solo hay una cuenta mantenedora, puede revisar y autorizar la integración con la verificación local registrada en el PR. [Reglas disponibles en GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
