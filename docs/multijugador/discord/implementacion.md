# Operación y verificación de la voz de la mesa

## Activación

La API ofrece el control de Discord en la vista autenticada de cada mesa cuando arranca con los tres valores configurados. El navegador obtiene la disponibilidad al cargar la sala. La creación del canal y del enlace empieza cuando alguien pulsa **Abrir voz de la mesa**. **Entrar a Discord** es un enlace que se puede abrir con teclado, en otra pestaña o con la aplicación móvil.

| Variable del servicio `api` | Valor para el piloto |
| --- | --- |
| `DISCORD_GUILD_ID` | `1573148175718555679` |
| `DISCORD_CATEGORY_ID` | `1573157722885718046` |
| `DISCORD_BOT_TOKEN` | Credencial del bot de eltru.co, en el entorno privado de despliegue |
| `DISCORD_BOT_TOKEN_FILE` | Alternativa al valor anterior. Ruta absoluta de un archivo montado de solo lectura y legible **dentro del contenedor**. Tiene prioridad. |

En producción, configurar los valores en el archivo privado de despliegue y recrear la API. El bot necesita ver canales, gestionar canales y crear invitaciones en Mesas. Las salas de voz heredan el acceso de la categoría. Para desactivar la función, retirar la configuración y recrear la API. La limpieza queda en pausa hasta volver a configurar el mismo servidor y categoría. Antes de cambiar de categoría, retirar las salas administradas en la anterior. [Ejemplo de entorno](../../../infra/produccion/env.ejemplo)

## Creación, reintentos y cierre

`POST /api/mesas/{id}/voz` comprueba el origen del juego, la cookie de sesión y el asiento. Devuelve un enlace y su caducidad con `Cache-Control: no-store`. La API pide a Discord invitaciones de diez minutos reutilizables. Una nueva solicitud verifica el ID del canal y permite renovar el enlace. Ninguna invitación se guarda en PostgreSQL.

La migración 011 añade un registro por mesa en `juego.voz_discord`. Un bloqueo de sesión en PostgreSQL serializa las operaciones de voz de esa mesa entre instancias. La API confirma el identificador del intento antes del primer POST a Discord y guarda el ID de canal antes de pedir la invitación. Un grupo separado de tres conexiones por instancia atiende la voz. Las llamadas HTTP a Discord tienen un plazo de seis segundos. Ante un 429, el servicio registra la pausa en PostgreSQL y comunica `Retry-After` al navegador.

El cierre registrado del chico deja **30 minutos de sobremesa**. Durante la partida y la espera, un asiento nuevo, un turno registrado o una solicitud de voz extienden la vigencia a **24 horas**. La caducidad puede interrumpir una conversación porque el piloto desconoce la ocupación del canal. Tras una baja por inactividad, una mesa vigente puede solicitar voz otra vez.

Una vez por minuto, cada instancia selecciona hasta ocho vínculos vencidos de su servidor y categoría. Confirma el tipo de voz, los IDs de servidor, categoría y canal y vuelve a comprobar la vigencia antes de iniciar la baja. Guarda la baja en curso para poder terminarla tras un corte. Un fallo deja el vínculo para otro intento a partir de quince minutos después. Una respuesta de canal desconocido de Discord permite descartar un ID eliminado manualmente. Un cambio de categoría o un fallo de permisos requiere revisar el vínculo.

## Recuperar un alta con respuesta perdida

Discord conserva en su auditoría el motivo `eltru-voz-<intento>` del alta. Si falta el ID en PostgreSQL, la API busca ese motivo en las cien altas más recientes del bot y comprueba el canal por ID antes de usarlo. Esa lectura requiere el permiso de servidor **Ver registro de auditoría**. Con los permisos de categoría del piloto, la solicitud puede quedar pendiente de un operador. El juego sigue disponible. [Registro de auditoría de Discord](https://docs.discord.com/developers/resources/audit-log)

1. Consultar los campos `mesa, servidor, categoria, intento, canal, retirando, vence, reintentar` en `juego.voz_discord`. Buscar el motivo exacto en el registro de auditoría del servidor y comprobar autor, operación de creación e ID de destino. El motivo se conserva durante el plazo de retención de Discord.
2. Si aparece el alta, habilitar temporalmente la lectura de auditoría para el bot y reintentar. También se puede recuperar una entrada antigua o mantener los permisos mínimos con una reparación puntual. Detener todas las instancias que usen el bot, verificar el ID en la auditoría y el tipo de voz y categoría actuales del canal, y ejecutar en `psql` la actualización siguiente con los tres valores comprobados. Debe actualizar exactamente una fila.
3. Si se confirmó que el alta nunca se ejecutó o que su destino acreditado ya fue eliminado, con las instancias detenidas se puede retirar únicamente la fila del intento pendiente. Si la evidencia es insuficiente, conservar el vínculo para investigar. Reiniciar la API tras la intervención.

```sql
UPDATE juego.voz_discord
   SET canal = :'canal_verificado', reintentar = '-infinity'
 WHERE mesa = :'mesa'::uuid AND intento = :'intento'::uuid AND canal IS NULL
 RETURNING mesa;
```

## Repetir las comprobaciones

- `npm ci` y `npm run check` cubren el cliente HTTP, los estados de la interfaz en Chromium de escritorio y móvil y el uso de las cartas durante un fallo de voz.
- `CHECK_STACK=1 npm run check` añade la API, PostgreSQL e identidad en un proyecto descartable. El proveedor simulado ejercita solicitudes simultáneas desde dos asientos, acceso ajeno, enlace vencido, canal eliminado o movido, 403, 429, alta perdida, recuperación con otra instancia, baja interrumpida, gracia de cierre y tamaño del lote de limpieza.
- Para probar el bot instalado, ejecutar desde la raíz `DISCORD_BOT_TOKEN_FILE=/ruta/privada/del/bot bash scripts/verificar-voz-real.sh`. Requiere Docker. El ensayo levanta la API de juego y una base descartable, crea dos mesas mediante HTTP, valida las invitaciones directamente con Discord y usa la limpieza del servicio solo sobre sus propios vínculos. Comprueba la ausencia de sus canales y la conservación de Mesa 1 por ID. Si falla, conserva el proyecto local y sus vínculos para completar la recuperación. Las sesiones son automáticas. El recorrido verifica el acceso al canal y su ciclo de vida.
- La integración en `main` requiere la confirmación del responsable del repositorio. La activación en el servidor de producción se gestiona por separado. [PR del piloto y resultados](https://github.com/flabat/truco-uruguayo/pull/218)
