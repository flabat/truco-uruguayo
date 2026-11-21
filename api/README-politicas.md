# Servir un actor en el entorno local

La API usa el actor V1 al crear una mesa. Un operador puede registrar un actor y activarlo para las mesas nuevas de un formato en su Compose local. Guardá el archivo del actor y su manifiesto de entrenamiento fuera de Git. Usá el formato que declara el archivo.

```sh
docker compose exec -T api node policyctl.ts register duel < /ruta/al/run/actor.json
docker compose exec -T api node policyctl.ts activate duel PIN
docker compose exec -T api node policyctl.ts rollback duel
```

El primer comando devuelve el PIN que necesita el segundo. Se calcula con SHA-256 sobre JSON UTF-8 compacto, con claves de objetos ordenadas y el orden de arrays preservado. Las mesas nuevas de parejas usan `pairs` o `pairs-private-senas`. El formato histórico `pairs-senas` conserva la versión pública para reproducir partidas guardadas. `rollback` vuelve a asignar V1 a las mesas que se creen después. Cada mesa conserva su formato y PIN hasta el final del chico. El registro valida la exportación para todos los asientos del formato. Registrar un actor y activarlo son operaciones independientes.

El servicio entrega al actor únicamente la observación del asiento y su máscara. El árbitro muestrea la distribución con azar local. La API aplica por defecto un plazo de 200 ms para resolver una decisión con modelo. Si el actor falta, es incompatible o vence el plazo, confirma una jugada legal de V1. La tabla privada `juego.inferencias` registra el pin solicitado, la política aplicada, el motivo y la latencia. La medición usa el reloj monotónico desde el pedido del servicio hasta su decisión; incluye carga y arranque del worker. Los pesos instalados, el reparto completo y los diagnósticos quedan en el servidor.

PostgreSQL conserva el trabajo pendiente y la jugada confirmada. Al recomenzar, la API reintenta una inferencia pendiente con la misma política. Antes de escribir, compara mesa, mano, versión, actor y política con la foto original bajo el mismo bloqueo que HTTP. La transacción confirma la acción, el diagnóstico y la siguiente tarea juntos. Una respuesta duplicada de una inferencia vencida pierde esa carrera y la notificación al cliente se emite después del commit. Una operación HTTP o WS repetida con el mismo identificador conserva la respuesta ya confirmada por esa operación.

Medí el formato en tu máquina con un actor y pares de chicos locales. El informe incluye los percentiles, la primera decisión, la tasa de fallback y la huella canónica del modelo.

```sh
node scripts/medir-inferencia.ts pairs-private-senas /ruta/al/run/actor.json 24 8010131
```

El campeonato puede usar `playMatchAsync` de `training/arena/index.ts` con un respondedor por asiento. Este recibe la observación y el número uniforme generado por el árbitro para ese asiento. Una llamada a `servicio.decide(pin, observacion, uniforme)` usa el mismo lector de pesos, la misma selección y el mismo plazo que la API. El entrenamiento y los contadores del árbitro quedan fuera del servicio.

## Nombre y fecha que ve el jugador

Para publicar un modelo registrado, ejecutá `policyctl.ts activate <formato> <PIN>`. Al activarlo por primera vez, PostgreSQL le asigna un nombre según la modalidad y el número de edición, y guarda la fecha de ese día en Uruguay. Por ejemplo, el sucesor de Ceibo Duelo se muestra como **Duelo 2**. La publicación se confirma en la misma transacción que la activación, también cuando se activan varios modelos directamente en SQL.

Cada mesa muestra la edición correspondiente a su PIN. Si cambiás el campeón, revertís la activación o volvés a activar uno anterior, la mesa conserva ese nombre y la fecha original. Para consultar o copiar el PIN completo, abrí el nombre en el pie.

Las primeras ediciones documentadas son **Ceibo Duelo**, **Ceibo Parejas** y **Ceibo Parejas con señas**, publicadas el 20 de noviembre de 2026. Para las ediciones anteriores con fecha desconocida, el pie indica «Fecha sin registrar». Los bots integrados conservan sus fechas documentadas: Práctica v1 el 18 de noviembre de 2026, y Clásico v1 y Clásico de tercetos v1 el 19. [Activación de Ceibo](https://github.com/flabat/truco-uruguayo/issues/251#issuecomment-7043360261) · [Publicación de la práctica](https://github.com/flabat/truco-uruguayo/actions/runs/44367361710) · [Despliegue de los bots integrados](https://github.com/flabat/truco-uruguayo/issues/214#issuecomment-7027835056)

## Actores AlphaZero

Exportá un candidato después de completar su evaluación. El exportador comprueba las huellas del plan, del actor y del Ceibo utilizado. La exportación incluye el Ceibo de referencia, la tabla de continuación y el presupuesto fijo de búsqueda. El contenedor sirve el actor en CPU. El servicio inicia su worker al arrancar y lo deja terminar de cargar si vence un plazo durante ese inicio.

```sh
node scripts/exportar-alphazero.ts /ruta/a/corrida > /ruta/a/actor.json
node scripts/medir-inferencia.ts duel /ruta/a/actor.json 24 8010131
```

Medí con el contenedor y la carga previstos antes de activar. En parejas con señas, usá `pairs-private-senas`; la API conserva la misma proyección privada que la arena.

La búsqueda AlphaZero se entrenó a 40. Otras metas usan la política de Ceibo incluida en la exportación. Para evaluar a 40 con la preparación de turnos y la confirmación de jugadas del servicio, corré un contraste pareado entre computadoras:

```sh
node scripts/medir-alphazero-en-mesa.ts /ruta/a/actor.json 128 2981007
```
