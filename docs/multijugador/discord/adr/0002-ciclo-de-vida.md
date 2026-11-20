# ADR 0002 · Un canal por mesa, con creación bajo demanda

Estado: aceptada para el piloto.

## Decisión

La identidad de la sala sigue a la mesa del juego entre manos y reconexiones. Se guarda en PostgreSQL una asociación única entre mesa y canal. La primera solicitud autorizada inicia la creación. Dos solicitudes simultáneas, incluso atendidas por procesos distintos, deben converger en el mismo canal. Persistir un identificador de aprovisionamiento antes de llamar a Discord permite reconciliar el resultado si Discord crea un canal y el proceso pierde la respuesta. Una respuesta ambigua no habilita una segunda creación a ciegas. La recuperación debe reconocer inequívocamente la categoría y el canal administrado. Nunca adoptar o borrar un canal solo porque su nombre coincide con el de una mesa.

El enlace puede caducar antes que el canal. Se renueva para el mismo destino. Un canal eliminado manualmente puede reemplazarse tras confirmar su ausencia. Un fallo de permisos, una demora o un límite temporal del proveedor permite reintentar respetando Retry-After. Las credenciales, invitaciones y cuerpos sensibles se excluyen de registros y de errores para el jugador.

## Cierre y recuperación

Una partida terminada admite sobremesa. Usar una gracia inicial de 30 minutos desde el final registrado. Para mesas abandonadas, tomar como referencia la actividad de la mesa y de las solicitudes de voz, con una caducidad conservadora documentada. El piloto no mide ocupación de Discord. Esta caducidad puede cerrar una conversación y debe ser visible para quien opera el servicio. La limpieza confirma la asociación guardada, el servidor y la categoría y tolera bajas manuales, reinicios y fallos temporales. Una mesa habilitada que vuelve a tener actividad puede abrir una sala de nuevo. Una lista de canales de la categoría nunca basta para autorizar un borrado.

## Aplicación en el piloto

PostgreSQL conserva el intento antes del alta. Si Discord pierde la respuesta, la prueba de autoría es la entrada de creación del bot con ese intento en el registro de auditoría. La recuperación automática comprueba también el ID del destino, el servidor, la categoría y el tipo de voz. El operador puede acreditar la misma entrada con los permisos mínimos del piloto. Las invitaciones duran diez minutos y se renuevan bajo demanda.

La inactividad vence a las 24 horas de la última alta de asiento, turno de juego o solicitud de voz. Un cierre registrado prevalece sobre la actividad y fija 30 minutos de sobremesa. La limpieza revisa hasta ocho vínculos por minuto e instancia. [Procedimiento de operación](../implementacion.md)

## Alternativas

Un conjunto de canales preasignados reduce las llamadas de creación, pero obliga a decidir cuándo reutilizar una sala posiblemente ocupada. Una sala por mano interrumpe conversaciones y multiplica recursos. Escuchar eventos de voz permitiría esperar a que todos salgan y requiere mantener una conexión adicional y reconstruir su estado tras cortes. Este piloto usa llamadas HTTP bajo demanda y limpieza periódica.

[Límites de Discord](https://docs.discord.com/developers/topics/rate-limits) · [Administración de canales](https://docs.discord.com/developers/resources/channel)
