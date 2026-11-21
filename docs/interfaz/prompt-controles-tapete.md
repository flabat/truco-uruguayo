# Prompt para implementar los controles del tapete

Copiá el bloque en una nueva sesión de Codex abierta en el repositorio. La rama de documentación indicada sirve para leer estos archivos si el PR documental sigue en revisión.

```text
Implementá el diseño de controles dentro del tapete de Truco Oriental y la sugerencia de jugar en horizontal. Primero leé AGENTS.md, CONTRIBUTING.md y los documentos en docs/interfaz/ del main actualizado o de la rama documental codex/issue-286 si sigue en revisión.

- diseno-controles-tapete.md
- adr/0002-controles-en-el-tapete.md
- adr/0003-orientacion-en-celulares.md
- plan-controles-tapete.md

Trabajá con agentes en paralelo. Organizá tres subagentes para los paquetes A (composición y tamaños), B (acciones y foco) y C (sugerencia horizontal). Conservá como coordinador el paquete D (adaptadores, integración y pruebas). Fijá las firmas de los tres contratos antes de conectar los adaptadores. Asigná cada archivo compartido a un solo agente.

Antes de editar, verificá issues, PR abiertos y borradores, y ramas. Abrí o reutilizá los issues de implementación y reservá cada rama codex/issue-<número> con creación exclusiva desde main. Usá checkouts aislados. Revisá #249/#253 y #250/#255, y acordá el orden con sus responsables si siguen abiertos. Usá #286 para referenciar el diseño.

Entregá duelo, parejas con y sin señas y tercetos en ambas orientaciones. Integrá la mano y todas las acciones legales en la zona de juego, mantené el historial debajo y ofrecé el aviso descartable en la espera de parejas y tercetos. Conservá las proyecciones autorizadas de espectadores y señas. Usá fixtures o computadoras y el formato pairs-private-senas en las partidas nuevas con señas.

Verificá teclado, foco, reintento y reconexión de red, giro durante el juego, variante de seis puestos y criterios de tamaño. Ejecutá npm ci, npm run check y git diff --check antes de pedir revisión. Publicá las capturas, los resultados de la matriz y cualquier verificación manual pendiente en un PR integrado contra main. Seguí el flujo de revisión del repositorio.
```

[Diseño](diseno-controles-tapete.md) · [Plan de implementación](plan-controles-tapete.md).
