# ADR 3 · Persistencia y vistas privadas por asiento

**Estado.** Propuesta para PostgreSQL, API y cliente.

## Decisión

Extender el flujo actual de invitación y comandos. Crear con `POST /api/mesas` y un cuerpo como `{"modo":"3v3","meta":50}`. Omitir `meta` selecciona el valor del modo. Validar modo, formato y meta antes de insertar. Confirmar la reserva del sexto asiento bajo el bloqueo de la mesa. La lectura de sala devuelve asientos, equipos, modalidad y meta desde antes del primer reparto. El primer participante que consulta una mesa completa abre la primera mano bajo el mismo bloqueo que hoy. [Gestión de mesas](../../../../api/mesas.ts) · [Partidas](../../../../api/partidas.ts)

| Registro | Cambio necesario |
| --- | --- |
| `juego.mesas` | Extender el dominio de `modo` a `3v3` y guardar la meta de creación. Vincular cada mesa nueva de seis al perfil de reglas aprobado. Migrar las mesas existentes con su meta histórica de 40. |
| `juego.asientos` | Admitir 0–5. Validar que el asiento esté dentro de la capacidad de **su** mesa en todos los escritores y en la base, por ejemplo con un trigger de restricción. Conservar claves únicas por mesa/asiento y mesa/jugador. |
| `juego.manos` | Una fila por reparto. El campo entero `version_reglas` selecciona el lector. La nueva versión persiste distribución de seis, tipo de reparto, marcador de inicio, perfil y comandos ordenados con asiento absoluto e índice de lance. El registro de la meta debe ser recuperable también al exportar ese reparto. |
| `juego.comandos` | Reusar la clave mesa/jugador/id y la respuesta privada confirmada. La versión pública aumenta una vez por comando aceptado, incluso cuando ese comando cierra un duelo y abre el siguiente. |
| `juego.turnos_bot` e inferencias | Reanudar a partir del último reparto, lance, versión y asiento habilitado. Descartar una decisión obsoleta al revalidarla bajo el lock de la mesa. |

Reconstruir con un reductor determinista. La entrada es perfil, meta, reparto, marcador de inicio y acciones ordenadas. La salida incluye turno, tanteador, cobros, resultado y próximo duelo. Cada cambio automático de duelo forma parte de la acción que lo disparó. Una caída después del commit y antes de la confirmación produce el mismo estado al reintentar. Leer V1 con su lector histórico y despachar los registros nuevos a la nueva versión. Una versión desconocida devuelve error explícito con la mesa recuperable para un servidor compatible. [Reconstrucción actual](../../../../api/turnos.ts)

## Contrato observable

La lectura autenticada de partida añade modalidad del reparto, número de duelo cuando corresponda, asientos activos, mano, dador, marcador con meta, estado de turno e historial público con el resultado de cada lance. Definir una unión de estados **esperando**, **jugando** y **terminado** para que el cliente pueda representar una espera sin fabricar cartas. Con mano 5, la proyección del asiento 4 durante el segundo duelo incluiría estos campos.

```json
{
  "manoNumero": 2,
  "version": 18,
  "puntos": [24, 25],
  "meta": 50,
  "ganadorPartida": null,
  "lance": {"tipo": "pico-a-pico", "duelo": 2, "activos": [0, 3]},
  "vista": {"estado": "esperando", "asiento": 4, "legales": []}
}
```

- **Redondilla.** Cada jugador ve únicamente sus tres cartas iniciales y luego sus cartas restantes. La muestra, las jugadas, los cantos declarados y los tantos ya acreditados son públicos.
- **Pico a pico.** Antes de su duelo, un asiento recibe la información pública y su lugar en el orden. Sus cartas, tantos propios, indicios de flor y opciones privadas se omiten de la respuesta. Durante su duelo recibe su vista jugable. Después puede consultar el historial público y esperar el reparto siguiente. El proyector decide qué serializar antes de que los datos lleguen al navegador, también en reingresos y confirmaciones idempotentes.
- **Comando.** El servidor toma el asiento de la sesión, verifica que esté entre los habilitados y aplica el comando con id y versión. Un comando con versión anterior se rechaza con 409. Un id conocido con igual petición devuelve su respuesta original al mismo jugador. Reutilizar ese id con otra acción se rechaza. Un mismo «quiero» concurrente de dos compañeros sólo puede resolver el canto una vez.
- **Actualización.** Confirmar bajo una transacción la acción, los cobros, el ganador y la transición. Después del commit, emitir el aviso `actualizar`. Cada cliente relee su proyección autenticada. El WebSocket puede entregar la confirmación privada sólo a la conexión del autor. [Canal en vivo](../../../../api/vivo.ts)

## Alternativas y consecuencias

Persistir seis copias del estado simplificaría algunas lecturas pero permitiría divergencias entre clientes. Guardar sólo un estado mutable dificultaría auditar un cambio de duelo o comparar una versión nueva del motor. La bitácora por reparto reutiliza las tablas y la protección contra reintentos, a cambio de introducir un lector versionado y pruebas de proyección. Comparar byte por byte las vistas autorizadas antes y después de reiniciar API y PostgreSQL, incluyendo los asientos cuarto y quinto en espera.
