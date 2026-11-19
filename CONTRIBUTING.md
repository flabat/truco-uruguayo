# Contribuir a Truco Oriental

## Issues y coordinación

1. Buscá el tema en los [issues](https://github.com/flabat/truco-uruguayo/issues), [PR abiertos](https://github.com/flabat/truco-uruguayo/pulls) y [ramas](https://github.com/flabat/truco-uruguayo/branches). Leé los comentarios de los issues relacionados y revisá el alcance anunciado en los PR en curso. Si dos issues requieren cambios en las mismas reglas, datos o componentes, acordá qué sesión los modifica y en qué orden antes de editar.
2. Reutilizá el issue existente o abrí uno. Para errores, incluí pasos o una mano reproducible, el resultado actual y el esperado. Para funciones y decisiones de diseño, describí el problema, las opciones, los criterios y la decisión. Si hace falta acordar el diseño, registrá la decisión en el issue antes de implementarla. Para cambios de reglas, citá el artículo o sección y especificá a qué variante se aplica.
3. Reservá una rama por issue. Usá el nombre exacto `codex/issue-<número>` y la operación de creación de la referencia, que rechaza una rama existente. Una asignación o un comentario sirve para comunicar el estado, ya que varias sesiones pueden usar la misma cuenta. La rama indica que el trabajo está reservado.

Ejemplo desde un checkout cuyo `origin` apunta al repositorio principal y con GitHub CLI autenticado. Ejecutá el bloque completo para que el worktree se cree solo si la reserva tuvo éxito.

```sh
issue=42
branch="codex/issue-$issue"
git fetch origin main &&
  gh api --method POST 'repos/{owner}/{repo}/git/refs' \
    -f "ref=refs/heads/$branch" \
    -f "sha=$(git rev-parse origin/main)" &&
  git fetch origin "$branch:refs/remotes/origin/$branch" &&
  git worktree add --track -b "$branch" "../truco-issue-$issue" "origin/$branch"
```

También podés crear la referencia mediante la [API de GitHub](https://docs.github.com/en/rest/git/refs#create-a-reference) y usar un checkout aislado de esa rama. Si la reserva falla, averiguá si ya existe la rama o si falló el acceso. Si la creación remota tuvo éxito y solo falló el paso local, retomá desde la referencia creada.

Después de reservar, registrá en el issue la rama, un identificador de sesión, el alcance y las rutas que esperás tocar. Abrí un PR en borrador cuando puedas compartir el primer commit. Al suspender o transferir el trabajo, dejá en el issue o PR la rama, el último commit publicado, las comprobaciones hechas y el próximo paso. Pasá explícitamente la responsabilidad antes de que otra sesión edite la rama. Si descartás el trabajo, registrá su estado y liberá la rama cuando ya no haga falta conservarla. Para una dependencia entre PR, enlazá el PR previo y acordá el orden de integración.

## Verificación local

Con Node.js 24, npm y Python 3, ejecutá desde la raíz del checkout.

```sh
npm ci
npm exec -- playwright install --only-shell chromium
npm run check
git diff --check
```

`npm run check` ejecuta las pruebas unitarias, compila la aplicación en `dist/` para la raíz del sitio y comprueba sus enlaces internos, anclas, cartas y recursos. Playwright recorre la interfaz en Chromium de escritorio y con emulación móvil. Instalá el navegador al preparar un checkout o actualizar Playwright. En Linux podés agregar `--with-deps` al comando de instalación. Si otra sesión usa el puerto 4322, elegí uno libre con `TEST_PORT=4323 npm run check`. El PR ejecuta `CHECK_STACK=1 npm run check` para probar también la aplicación completa con la API, PostgreSQL y el proveedor de identidad. Con Docker en marcha podés repetir esa verificación localmente.

- **Reglas y datos.** Revisá el texto, las tablas, los ejemplos y las fuentes de los capítulos afectados. Calculá al menos una mano concreta y comprobá los empates, los límites del tanteador o las variantes que correspondan al cambio.
- **Interfaz y navegación.** Probá el comportamiento modificado en el navegador en un ancho móvil y otro de escritorio. Para controles interactivos, verificá teclado, foco y estados relevantes. Si cambia la búsqueda, probá un término con tilde, uno sin tilde, un resultado vacío y el enlace al capítulo.
- **Lógica e interacciones nuevas.** Agregá pruebas de regresión para el comportamiento observable, con casos normales, límites y errores aplicables. Usá pruebas unitarias para cálculos y pruebas de navegador para flujos que dependan del DOM. Incorporá su ejecución a `npm run check`.

## Pull requests

- Abrí un PR acotado contra `main` y enlazá el issue. Usá `Closes #42` si el cambio resuelve el issue. Usá `Refs #42` si el debate o el trabajo sigue abierto. [Enlace y cierre de issues en GitHub](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- Describí el cambio y cómo verificarlo. Incluí los comandos y resultados reales, los casos manuales, las fuentes de reglas y capturas si cambia la interfaz. Indicá cualquier comprobación pendiente antes de marcar el PR como listo.
- Actualizá la rama desde `main` cuando corresponda, resolvé los comentarios y verificá que los checks estén verdes tras el último cambio. La persona responsable de la revisión o del repositorio confirma la integración. Preferí squash merge y eliminá la rama y el worktree cuando el PR esté integrado y el checkout esté limpio.

## Configuración recomendada en GitHub

Creá un ruleset activo para `main` que requiera PR, el job `check` del workflow **Verificar el sitio**, una rama actualizada y la resolución de conversaciones. Bloqueá el borrado y los force pushes de `main`. Cuando haya otra persona habilitada para revisar, requerí una aprobación independiente. Si solo hay una cuenta mantenedora, puede revisar y autorizar la integración con los checks requeridos. [Reglas disponibles en GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
