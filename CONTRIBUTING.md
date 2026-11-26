# Contribuir a El Truco

## Issues y coordinación

1. Buscá el tema en los [issues](https://github.com/flabat/truco-uruguayo/issues), [PR abiertos](https://github.com/flabat/truco-uruguayo/pulls) y [ramas](https://github.com/flabat/truco-uruguayo/branches). Leé los comentarios de los issues relacionados y revisá el alcance anunciado en los PR en curso. Si dos issues requieren cambios en las mismas reglas, datos o componentes, acordá qué sesión los modifica y en qué orden antes de editar.
2. Reutilizá el issue existente o abrí uno. Para errores, incluí pasos o una mano reproducible, el resultado actual y el esperado. Para funciones y decisiones de diseño, describí el problema, las opciones, los criterios y la decisión. Si hace falta acordar el diseño, registrá la decisión en el issue antes de implementarla. Para cambios de reglas, citá el artículo o sección y especificá a qué variante se aplica.
3. Reservá una rama por issue. Usá el nombre exacto `codex/issue-<número>` y la operación de creación de la referencia, que rechaza una rama existente. Una asignación o un comentario sirve para comunicar el estado, ya que varias sesiones pueden usar la misma cuenta. La rama indica que el trabajo está reservado. Codex y Claude Code siguen el mismo protocolo y el mismo prefijo: `AGENTS.md` tiene las reglas compartidas y `CLAUDE.md` las importa.

Desde un checkout cuyo `origin` apunta al repositorio principal, con GitHub CLI autenticado, empezá el issue con un comando:

```sh
npm run trabajo -- 42
```

El comando reserva `codex/issue-42` desde `origin/main` con la operación exclusiva, crea el worktree `../truco-issue-42`, comenta en el issue la rama, la sesión, el worktree y los puertos, y corre `npm ci` con la caché de npm. Si la rama o la carpeta ya existen, falla sin tocar nada. Para nombrar la sesión en el comentario, agregá `--sesion <identificador>`; si no, usa el identificador de la sesión de Claude Code o Codex.

Cada worktree recibe una de ocho ranuras de puertos, registradas en `~/.cache/truco/ranuras`, y las escribe en `.env.trabajo`: `WEB_PORT`, `OIDC_PORT`, `API_PORT`, `METRO_PORT`, `APP_WEB_PORT`, `TEST_PORT`, `TEST_WEB_PORT`, `TEST_OIDC_PORT` y `COMPOSE_PROJECT_NAME=truco-issue-42`. `npm run check`, `npm run check:stack` y Playwright leen ese archivo. Cada sesión conserva sus puertos para desarrollar, probar y esperar su turno de verificación. Una variable definida en el entorno tiene prioridad. El worktree también recibe un `.env` que apunta a `.env.trabajo`, por lo que `docker compose up` levanta la mesa local con sus propios puertos y volúmenes. Para Metro, usá `source scripts/trabajo-entorno.sh && npm --workspace app run ios -- --port "$METRO_PORT"`. Al borrar el worktree, su ranura queda libre. Sin `.env.trabajo`, todo usa los puertos predeterminados.

El comando sigue estos pasos. Para hacerlo a mano, ejecutá el bloque completo para que el worktree se cree solo si la reserva tuvo éxito.

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

Durante el piloto de [verificación en Linux](docs/verificacion-linux.md), registrá el resultado remoto para la comparación. La verificación que habilita pedir revisión e integrar sigue haciéndose en la computadora de quien abre el PR hasta #438. Con Node.js 24, npm, Python 3 y Docker en marcha, ejecutá desde la raíz del checkout, sobre el último commit del PR.

```sh
npm ci
npm exec -- playwright install --only-shell chromium
CHECK_STACK=1 npm run check
git diff --check
```

`npm run check` ejecuta las pruebas unitarias, compila la aplicación en `dist/` para la raíz del sitio y comprueba sus enlaces internos, anclas, cartas y recursos. Playwright recorre la interfaz en Chromium de escritorio y con emulación móvil. Instalá el navegador al preparar un checkout o actualizar Playwright. En Linux podés agregar `--with-deps` al comando de instalación. En un worktree creado con `npm run trabajo`, los puertos salen de `.env.trabajo`. En otro checkout, si otra sesión usa el puerto 4322, elegí uno libre con `TEST_PORT=4323 npm run check`. `CHECK_STACK=1` agrega la prueba de la aplicación completa con la API, PostgreSQL y el proveedor de identidad. Si no podés usar Docker, ejecutá `npm run check` e indicá en el PR que falta la prueba de la pila completa; no integres hasta que alguien la corra.

- **Reglas y datos.** Revisá el texto, las tablas, los ejemplos y las fuentes de los capítulos afectados. Calculá al menos una mano concreta y comprobá los empates, los límites del tanteador o las variantes que correspondan al cambio.
- **Interfaz y navegación.** Probá el comportamiento modificado en el navegador en un ancho móvil y otro de escritorio. Para controles interactivos, verificá teclado, foco y estados relevantes. Si cambia la búsqueda, probá un término con tilde, uno sin tilde, un resultado vacío y el enlace al capítulo.
- **Lógica e interacciones nuevas.** Agregá pruebas de regresión para el comportamiento observable, con casos normales, límites y errores aplicables. Usá pruebas unitarias para cálculos y pruebas de navegador para flujos que dependan del DOM. Incorporá su ejecución a `npm run check`.

### Niveles de verificación

Varias sesiones comparten la misma computadora. Elegí el nivel según el momento:

| Nivel | Cuándo | Qué corre |
|---|---|---|
| `npm run check:rapido` | Mientras trabajás. | Pruebas afectadas por el cambio respecto de `origin/main`. Muestra la selección con `-- --plan`. |
| `npm run check` | Antes de publicar un commit. | Unitarias, tipos, pruebas de despliegue, build, enlaces, cartas y todos los casos de Playwright. |
| `CHECK_STACK=1 npm run check` | Antes de pedir revisión y antes de integrar, sobre el último commit. | La verificación anterior y la pila de Docker, en el mismo turno. |

La Mac comparte **un turno de verificación pesada** entre los worktrees del mismo usuario. `npm run check`, `npm run check:stack` y `npm run check:production` esperan en orden de llegada. El turno empieza antes de la primera prueba y termina al salir el comando. La cola muestra la posición y el checkout que está verificando. Podés seguir editando, levantar la app o correr pruebas dirigidas mientras esperás. Si la selección rápida se amplía a todas las pruebas unitarias o de navegador, también espera un turno y vuelve a seleccionar las pruebas al entrar, para incluir lo que hayas editado durante la espera. Consultar el plan es inmediato.

En desarrollo local, las unitarias usan dos procesos y Playwright un worker. Para una prueba puntual podés elegir otros valores con `TEST_CONCURRENCY` y `PLAYWRIGHT_WORKERS`. En CI, Node usa su concurrencia habitual y Playwright usa dos workers. Los puertos de `.env.trabajo` conservan prioridad sobre los puertos asignados por puesto. Para interrumpir una corrida o abandonar la fila, usá Ctrl-C desde esa sesión.

La cola usa `~/.cache/truco/cola-verificacion`. `TRUCO_COLA_DIR` y `TRUCO_COLA_PILAS` permiten configurar otro entorno. Todas las sesiones de una máquina deben compartir directorio y cantidad de puestos. En esta Mac usá los valores predeterminados.

Una rama anterior incorpora la cola al actualizarse desde `main`. Si todavía estás verificando un commit anterior, desde **el checkout de esa rama** podés usar la cola del checkout actualizado. Por ejemplo, con `COLA_MAC` apuntando a la ruta absoluta de su `scripts/cola-pila.py`:

```sh
env -u TRUCO_COLA_DIR TEST_CONCURRENCY=2 PLAYWRIGHT_WORKERS=1 CHECK_STACK=1 python3 "$COLA_MAC" bash .github/scripts/check_site.sh
```

El comando ejecuta los scripts y dependencias de la rama bajo prueba. La cola antigua de Docker usa otro directorio, de modo que ese paso puede ejecutarse dentro del turno. Las verificaciones que ya empezaron siguen hasta terminar.

## Pull requests

- Abrí un PR acotado contra `main` y enlazá el issue. Usá `Closes #42` si el cambio resuelve el issue. Usá `Refs #42` si el debate o el trabajo sigue abierto. [Enlace y cierre de issues en GitHub](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- Describí el cambio y cómo verificarlo. Incluí los comandos y resultados reales, los casos manuales, las fuentes de reglas y capturas si cambia la interfaz. Indicá cualquier comprobación pendiente antes de marcar el PR como listo.
- Actualizá la rama desde `main` cuando corresponda, resolvé los comentarios y repetí la verificación local tras el último cambio. En el piloto, enlazá la corrida remota que estés midiendo y registrá por separado los comandos y resultados locales que habilitan la integración. La persona responsable de la revisión o del repositorio confirma la integración. Preferí squash merge y eliminá la rama y el worktree cuando el PR esté integrado y el checkout esté limpio.

## Configuración recomendada en GitHub

En un repositorio privado del plan gratuito de GitHub, los rulesets no se aplican. Si el repositorio pasa a ser público o a un plan que los admita, creá un ruleset activo para `main` que requiera PR, una rama actualizada y la resolución de conversaciones, y que bloquee el borrado y los force pushes de `main`. La adopción del job remoto `check` como evidencia para integrar se decide en #438. Cuando haya otra persona habilitada para revisar, requerí una aprobación independiente. Si solo hay una cuenta mantenedora, puede revisar y autorizar la integración con la verificación local registrada en el PR. [Reglas disponibles en GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)

## Etiquetas, hito y puntos de conflicto

Los issues de tareas se crean con la plantilla `tarea.md` (problema, alcance, rutas que toca, `Depende de #n`, verificación y terminado). Las etiquetas y el hito dicen de qué se trata, si se puede tomar y quién espera a quién.

### Etiquetas

- `area:infra`, `area:app`, `area:mesa`, `area:api`, `area:motor`: la parte del producto que toca el issue (herramientas y despliegue, app Expo, mesa y juego en la app, API y autenticación, paquete del motor). Cada issue lleva una.
- `mvp`: necesario para el MVP de iOS, Android y web. Los issues del MVP también van en el hito **MVP**.
- `listo`: no tiene dependencias abiertas y lo puede tomar una sesión. Antes de reservar, comprobá que no exista ya la rama `codex/issue-<número>`.
- `bloqueado`: espera otro issue o una decisión. Nadie lo toma hasta que cambie.

Un issue pasa de `bloqueado` a `listo` cuando todos los `Depende de #n` están cerrados, o sea integrados en `main`, y la decisión pendiente, si la había, quedó registrada en un comentario. Quien integra el último PR del que depende hace el cambio: quita `bloqueado`, agrega `listo` y avisa en el issue. Un issue no puede tener las dos etiquetas a la vez.

### Puntos de conflicto

Son los archivos que muchas sesiones tocan a la vez y que git no sabe fusionar bien.

- **Dependencias.** Los cambios en `package-lock.json`, `app/package.json` y `app.json` van en un PR propio y chico, que se integra antes de la funcionalidad que los necesita. El issue de la funcionalidad declara `Depende de #n` con ese PR. No mezcles una dependencia nueva con otros cambios.
- **Migraciones de SQL.** Las de `api/migrations/` llevan un número correlativo. Si dos PR eligen el mismo número, el que se integra segundo renombra la suya al siguiente libre y actualiza lo que la referencia antes de integrar: actualizá la rama desde `main`, revisá el último número y volvé a correr las pruebas de la API. No edites una migración ya integrada: agregá una nueva.
