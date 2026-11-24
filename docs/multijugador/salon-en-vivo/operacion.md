# Operar el salón en producción

El lanzamiento abre **Mesas en juego**, el visor y la entrada a Discord por mesa a las cuentas autenticadas. En horas tranquilas, la configuración normal busca tres duelos y tres mesas de parejas entre computadoras. Las mesas públicas con personas aparecen primero y cuentan para la misma meta. [Decisión de lanzamiento directo](https://github.com/flabat/truco-uruguayo/issues/244)

## Ajustes de la API

| Variable | Producción | Efecto al recrear la API |
| --- | --- | --- |
| `SALON_HABILITADO` | `1` | Abre el directorio y el visor. Con `0` cierra las lecturas y las solicitudes de voz espectadora, incluidos los enlaces directos. Las nuevas mesas se crean privadas. |
| `VOZ_ESPECTADORA_HABILITADA` | `1` | Permite pedir el enlace desde el visor si el salón está abierto y Discord está configurado. Con `0` quedan disponibles el tapete, la voz de los jugadores y la limpieza de canales. |
| `EXHIBICIONES_HABILITADAS` | `1` | Repone exhibiciones cuando faltan mesas. Con `0` las exhibiciones en curso terminan sus chicos si el avance está habilitado. |
| `EXHIBICIONES_OBJETIVO` | `6` | Total buscado de mesas públicas, entero de `0` a `10`. Subirlo abre exhibiciones al faltar mesas. Bajarlo deja terminar las que ya están en curso. Con `0` se drenan todas las exhibiciones. |
| `EXHIBICIONES_PAUSADAS` | `0` | Con `1` se detienen las altas y todos los pasos de exhibición, incluidos los repartos y turnos pendientes. Al volver a `0` se retoma el último estado confirmado. |

La meta regula partidas simultáneas. PostgreSQL permite **un solo paso de exhibición a la vez entre todas las instancias**. Los cupos se reponen en una transacción serializada. Aumentar la meta conserva ese límite de trabajo simultáneo. Los turnos de computadora en mesas humanas usan su propio trabajador y tienen prioridad. Las exhibiciones se juegan como `duel` o `pairs-private-senas`. Las señas de pareja quedan entre quien hace la seña y su compañero.

## Publicar la versión

1. Para una instalación nueva, prepará el dominio, las copias y el archivo protegido de entorno según la guía del VPS. En una instalación existente, revisá los cinco ajustes en `/etc/truco-oriental/production.env` antes de la publicación. Un `0` explícito de una versión anterior tiene precedencia sobre el nuevo valor predeterminado. Conservá los ajustes que correspondan a una pausa intencional. Para habilitar el funcionamiento normal usá los valores de la tabla. [Instalación y publicación automática](../../produccion.md)
2. La voz necesita `DISCORD_GUILD_ID`, `DISCORD_CATEGORY_ID` y un token de bot válido en `DISCORD_BOT_TOKEN` o en el archivo que indica `DISCORD_BOT_TOKEN_FILE` dentro del contenedor. Verificá el acceso del bot a la categoría Mesas. Los enlaces se crean a pedido desde cada mesa. [Operación de Discord](../discord/README.md)
3. Tras integrar la versión, esperá el workflow **Verificar el sitio** del evento **push** de `main` para el SHA exacto. El temporizador del VPS consulta cada tres minutos. También podés iniciar la comprobación desde el VPS fuera de una sesión de mantenimiento. El enlace `current` pasa a la nueva revisión después de la comprobación de salud.

```sh
systemctl start truco-deploy.service
journalctl -u truco-deploy.service -n 30
readlink -f /opt/truco-oriental/current
```

Comprobá que el último componente de esa ruta coincide con el SHA publicado. Un SHA en `staged` indica solamente que se prepararon sus imágenes. Para código nuevo usá siempre la publicación del SHA verificado. Para cambiar los ajustes de una versión que ya está en `current`, seguí los pasos de mantenimiento.

## Cambiar la capacidad o pausar

En el VPS con publicación automática, abrí una shell de administrador. El siguiente bloque suspende el temporizador, espera la ejecución en curso mediante el mismo archivo de bloqueo que usa systemd y abre una shell para trabajar. Al salir, restablece el temporizador si estaba activo.

```bash
(
  reactivar=0
  if systemctl is-active --quiet truco-deploy.timer; then reactivar=1; fi
  trap 'if [ "$reactivar" = 1 ]; then systemctl start truco-deploy.timer; fi' EXIT
  systemctl stop truco-deploy.timer || exit 1
  flock /var/lib/truco-deploy/lock bash --noprofile --norc -i
)
```

En esa shell, fijá Compose a la revisión activa y a sus imágenes etiquetadas. Si hay una publicación pendiente, salí con `exit` y revisá el registro del servicio antes de intervenir sobre una versión parcialmente aplicada.

```bash
test ! -e /var/lib/truco-deploy/pendiente || { echo "Hay una publicación pendiente"; exit 1; }
cd -P /opt/truco-oriental/current || exit 1
export TRUCO_RELEASE="${PWD##*/}"
ajustes=/etc/truco-oriental/production.env
unset SALON_HABILITADO VOZ_ESPECTADORA_HABILITADA EXHIBICIONES_HABILITADAS EXHIBICIONES_OBJETIVO EXHIBICIONES_PAUSADAS
if [ -f /etc/truco-oriental/copias-pausadas ]; then
  export RESTIC_REPOSITORY=/dev/null RESTIC_PASSWORD=unused
fi
dc() {
  docker compose -p truco-produccion --env-file "$ajustes" \
    -f compose.production.yaml -f infra/despliegue/imagenes.yaml "$@"
}
dc config --quiet && dc ps
docker inspect --format '{{.Config.Image}}' "$(dc ps -q api)"
```

La imagen activa debe ser `truco-oriental/api:<SHA de current>`. Anotá el valor previo de los cinco ajustes antes del cambio. Esta consulta imprime exclusivamente los controles del salón y un indicador de configuración de Discord.

```bash
controles() {
  dc exec -T api node --input-type=module -e '
    import { configDiscord } from "./discord.ts";
    for (const nombre of ["SALON_HABILITADO", "VOZ_ESPECTADORA_HABILITADA",
      "EXHIBICIONES_HABILITADAS", "EXHIBICIONES_OBJETIVO", "EXHIBICIONES_PAUSADAS"]) {
      console.log(nombre + "=" + (process.env[nombre] ?? "(sin definir)"));
    }
    console.log("Configuración de Discord presente: " + Boolean(configDiscord()));
  '
}
controles
```

Editá las asignaciones correspondientes en el archivo protegido. Para pasar de seis a dos mesas, por ejemplo, cambiá únicamente `EXHIBICIONES_OBJETIVO=2`. Para una pausa inmediata de las exhibiciones, cambiá únicamente `EXHIBICIONES_PAUSADAS=1`. Mantené una sola asignación por variable. Aplicá el cambio sobre la API con la imagen activa y comprobá sus valores.

```bash
vi "$ajustes"
dc config --quiet && dc up -d --no-build --no-deps --force-recreate --wait --wait-timeout 120 api
dc ps api
controles
```

Si compartís la base entre varias instancias de API, aplicá los mismos valores en todas. La pausa entra en vigor cuando la última instancia con avance habilitado se detiene. Recrear el contenedor puede provocar una reconexión breve de los clientes. Los asientos, las invitaciones y los turnos de las mesas humanas se conservan.

## Comprobar el resultado

Consultá el directorio y los cupos abiertos por separado. Una exhibición pausada, recién creada o en recuperación puede conservar su cupo después de salir de la lista visible.

```bash
cuenta() {
  dc exec -T db psql -X -v ON_ERROR_STOP=1 -U postgres -d truco <<'SQL'
SELECT count(*) AS visibles,
       count(*) FILTER (WHERE origen='humana') AS con_personas,
       count(*) FILTER (WHERE origen='exhibicion' AND modo='1v1') AS duelos_exhibicion,
       count(*) FILTER (WHERE origen='exhibicion' AND modo='2v2') AS parejas_exhibicion
FROM juego.mesas_en_juego;

SELECT count(*) AS exhibiciones_en_curso,
       count(*) FILTER (WHERE modo='1v1') AS duelos,
       count(*) FILTER (WHERE modo='2v2') AS parejas,
       max(ultimo_hecho_publico) AS ultima_actividad_publica
FROM juego.mesas
WHERE cupo_exhibicion IS NOT NULL AND fin_publico IS NULL AND NOT exhibicion_retirada;
SQL
}
cuenta
```

- **Reposición normal.** Sin mesas humanas y con meta seis, esperá tres exhibiciones por formato tras los primeros repartos. Con mesas humanas recientes, el trabajador revisa el faltante cada 15 segundos. Si entran personas o se reduce la meta, el total visible puede superarla mientras terminan los chicos en curso. Todas las mesas humanas públicas elegibles conservan su lugar.
- **Drenaje.** Con reposición apagada o meta cero y avance habilitado, seguí la segunda consulta hasta que terminen las exhibiciones. Pueden seguir jugando después del primer recuento.
- **Pausa.** Repetí `cuenta` después de 65 segundos. Con todas las instancias pausadas, los cupos abiertos conservan su estado y la última actividad de exhibición permanece fija. El directorio deja de listar una exhibición al superar 60 segundos de inactividad. Para mesas humanas, la ventana de actividad es de cinco minutos.
- **Recorrido del usuario.** Ingresá con una cuenta a `/jugar/`. Abrí **Mirar mesa**, verificá una carta o canto nuevo y volvé al salón. Las exhibiciones llevan **Exhibición · Solo computadoras**. Con Discord configurado, usá **Abrir voz de la mesa** y comprobá que aparece **Entrar a Discord** para esa mesa. Si el proveedor falla, el tapete debe seguir actualizándose.

Ejecutá `exit` para liberar el bloqueo y terminar la sesión de mantenimiento.

## Recuperar el servicio

- Si la API está saludable pero **ninguna exhibición avanza**, revisá los cinco valores con `controles`. Una meta fuera de rango o un valor de pausa distinto de `0` o `1` suspenden el trabajador de exhibiciones. Corregí la entrada en el archivo protegido y recreá la API. Podés confirmar el diagnóstico con `dc logs --since=10m api | grep -F 'Exhibiciones en pausa'`.
- Para **reanudar**, restaurá los valores anotados en `production.env`, recreá la API con el procedimiento anterior y volvé a ejecutar `controles` y `cuenta`. Una exhibición en curso vuelve a aparecer al registrar actividad pública. Para reponer además las que faltan, la reposición debe estar habilitada y la meta debe ser mayor que cero.
- Si **falla Discord**, podés cerrar solo las nuevas solicitudes de enlace desde el visor con `VOZ_ESPECTADORA_HABILITADA=0`. Los enlaces ya emitidos conservan el vencimiento que les asignó Discord. La aplicación sigue atendiendo a quienes juegan y limpiando sus canales.
- Para **retirar el acceso espectador**, establecé `SALON_HABILITADO=0`. Para detener a la vez el consumo de las exhibiciones, establecé también `EXHIBICIONES_PAUSADAS=1`. Recreá la API, verificá que una sesión nueva ofrece crear una mesa privada y que un enlace de espectador deja de mostrar cartas.
- Si la nueva imagen impide recuperar el servicio, integrá la corrección o reversión en `main` mediante PR. El despliegue automático vuelve a verificar el SHA y la salud de los servicios. La guía del VPS cubre recuperación de datos en volúmenes nuevos y restauración de una copia cuando corresponda. [Recuperación del VPS](../../produccion.md)
