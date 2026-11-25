@AGENTS.md

# Notas para Claude Code

- `AGENTS.md` es la fuente única de las reglas para Codex y Claude Code. Si cambia una regla compartida, editá `AGENTS.md` o `CONTRIBUTING.md`, no este archivo. Acá van solo las diferencias propias de Claude Code.
- Claude Code y Codex trabajan en paralelo con el mismo protocolo. Reservá con el nombre exacto `codex/issue-<número>` aunque la sesión sea de Claude: la rama remota es la reserva que ven ambas herramientas. Antes de editar, revisá `git worktree list` y las ramas remotas. No toques un worktree ni una rama que lleve otra sesión.
- Empezá con `npm run trabajo -- <número>` desde el checkout principal, como indica [CONTRIBUTING.md](CONTRIBUTING.md): crea `../truco-issue-<número>` con sus propios puertos. No trabajes en el checkout principal sobre `main`.
- Claude Code usa el Node.js del sistema. Con nvm, ejecutá `nvm install` y `nvm use` en la raíz: `.nvmrc` fija Node.js 24. Codex trae su propio runtime y no lo necesita.
- Escribí los issues, los PR, los commits y los textos de la interfaz en español rioplatense, como el resto del repositorio.
