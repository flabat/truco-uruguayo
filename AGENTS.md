# Trabajo en El Truco

- Antes de editar, buscá el issue, los PR (incluidos los borradores) y las ramas relacionadas. Para cualquier cambio versionado, reservá el issue en GitHub creando `codex/issue-<número>` desde `main` con una operación exclusiva de creación. Si la rama existe, coordiná la continuación con quien la lleva. Si GitHub no está disponible, podés investigar y preparar el plan.
- Usá un worktree o checkout aislado por sesión. Conservá los cambios ajenos y actualizá el PR existente si estás retomando un trabajo. Integrá cambios en `main` mediante PR.
- Antes de pedir revisión y antes de integrar, ejecutá `npm ci` y `CHECK_STACK=1 npm run check` (con Docker) sobre el último commit. Durante el piloto #436–437, las sesiones que llevan la medición pueden lanzar y consultar sus corridas de GitHub Actions según la [guía de Linux](docs/verificacion-linux.md). La aprobación del PR sigue usando la verificación local hasta #438. Agregá las pruebas o comprobaciones del comportamiento que cambia y registrá los resultados en el PR.
- Para los pasos de reserva, traspaso, revisión y publicación, seguí [CONTRIBUTING.md](CONTRIBUTING.md).
- Entrená y evaluá solo entre computadoras. En toda corrida nueva o reanudada con señas, usá `pairs-private-senas`: solo quien hace la seña y su compañero la ven. Los rivales reciben la misma jugada e historial que si hubo silencio.
