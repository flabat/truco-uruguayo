# Trabajo en El Truco

- Antes de editar, buscá el issue, los PR (incluidos los borradores) y las ramas relacionadas. Para cualquier cambio versionado, reservá el issue en GitHub creando `codex/issue-<número>` desde `main` con una operación exclusiva de creación. Si la rama existe, coordiná la continuación con quien la lleva. Si GitHub no está disponible, podés investigar y preparar el plan.
- Usá un worktree o checkout aislado por sesión. Conservá los cambios ajenos y actualizá el PR existente si estás retomando un trabajo. Integrá cambios en `main` mediante PR.
- Durante el desarrollo, agregá las pruebas del cambio, usá `npm run check:rapido` y hacé las pruebas nativas de iOS en la Mac cuando correspondan.
- Antes de pedir revisión y de nuevo justo antes de integrar, ejecutá `python3 infra/ci/verificar_pr.py NUMERO` desde un checkout confiable. Registrá en el PR la corrida exitosa de **Verificar el sitio**, la cabeza del PR, la base y el commit de integración probado. Si siguen vigentes, esa corrida satisface la suite de Linux para Claude y Codex en ambos pasos y evita repetirla en la Mac. Ante cambios, fallas o una caída del proveedor, seguí [el procedimiento de contribución](CONTRIBUTING.md#verificación-remota-del-pr).
- Para los pasos de reserva, traspaso, revisión y publicación, seguí [CONTRIBUTING.md](CONTRIBUTING.md).
- Entrená y evaluá solo entre computadoras. En toda corrida nueva o reanudada con señas, usá `pairs-private-senas`: solo quien hace la seña y su compañero la ven. Los rivales reciben la misma jugada e historial que si hubo silencio.
