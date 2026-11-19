# Servir un actor en el entorno local

La API usa el actor V1 al crear una mesa. Un operador puede registrar un actor y activarlo para las mesas nuevas de un formato en su Compose local. Guardá el archivo del actor y su manifiesto de entrenamiento fuera de Git. Usá el formato que declara el archivo.

```sh
docker compose exec -T api node policyctl.ts register duel < /ruta/al/run/actor.json
docker compose exec -T api node policyctl.ts activate duel PIN
docker compose exec -T api node policyctl.ts rollback duel
```

El primer comando devuelve el PIN que necesita el segundo. Se calcula con SHA-256 sobre JSON UTF-8 compacto, con claves de objetos ordenadas y el orden de arrays preservado. Los formatos de parejas se llaman `pairs` y `pairs-senas`. `rollback` vuelve a asignar V1 a las mesas que se creen después. Cada mesa conserva su formato y PIN hasta el final del chico. El registro valida la exportación para todos los asientos del formato. Registrar un actor y activarlo son operaciones independientes.

El servicio entrega al actor únicamente la observación del asiento y su máscara. El árbitro muestrea la distribución con azar local. La API aplica por defecto un plazo de 200 ms para resolver una decisión con modelo. Si el actor falta, es incompatible o vence el plazo, confirma una jugada legal de V1. La tabla privada `juego.inferencias` registra el pin solicitado, la política aplicada, el motivo y la latencia. La medición usa el reloj monotónico desde el pedido del servicio hasta su decisión; incluye carga y arranque del worker. Los pesos instalados, el reparto completo y los diagnósticos quedan en el servidor.

PostgreSQL conserva el trabajo pendiente y la jugada confirmada. Al recomenzar, la API reintenta una inferencia pendiente con la misma política. Antes de escribir, compara mesa, mano, versión, actor y política con la foto original bajo el mismo bloqueo que HTTP. La transacción confirma la acción, el diagnóstico y la siguiente tarea juntos. Una respuesta duplicada de una inferencia vencida pierde esa carrera y la notificación al cliente se emite después del commit. Una operación HTTP o WS repetida con el mismo identificador conserva la respuesta ya confirmada por esa operación.

Medí el formato en tu máquina con un actor y pares de chicos locales. El informe incluye los percentiles, la primera decisión, la tasa de fallback y la huella canónica del modelo.

```sh
node scripts/medir-inferencia.ts pairs-senas /ruta/al/run/actor.json 24 8010131
```

El campeonato puede usar `playMatchAsync` de `training/arena/index.ts` con un respondedor por asiento. Este recibe la observación y el número uniforme generado por el árbitro para ese asiento. Una llamada a `servicio.decide(pin, observacion, uniforme)` usa el mismo lector de pesos, la misma selección y el mismo plazo que la API. El entrenamiento y los contadores del árbitro quedan fuera del servicio.
