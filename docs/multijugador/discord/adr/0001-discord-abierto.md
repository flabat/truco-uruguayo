# ADR 0001 · Voz abierta con el bot de eltru.co

Estado: aceptada para el piloto de mesas abiertas.

## Contexto y opciones

Una sala estática permite probar audio, pero mezcla conversaciones cuando dos mesas juegan a la vez. WebRTC con señalización y TURN o un SFU permitirían controlar el acceso y la interfaz dentro del juego. Ambas opciones requieren operar o contratar transporte de audio, probar permisos del navegador y manejar reconexiones. El servidor de Discord de eltru.co ya reúne a los jugadores y tiene un bot instalado.

## Decisión

La API del juego crea canales de voz con la API HTTP de Discord en la categoría configurada. Usa invitaciones con caducidad y el permiso del bot para gestionar canales en Mesas. Los jugadores aceptan la invitación voluntariamente, con cuentas de Discord independientes de sus cuentas del juego. El control para abrir Discord se ofrece a quien tiene asiento. Otros miembros con acceso a esa categoría pueden escuchar o participar, y las invitaciones se pueden compartir. El texto de la interfaz comunica ese alcance.

## Consecuencias

Discord se ocupa de voz, controles de audio y moderación del servidor. eltru.co no recibe ni graba el audio. Un webhook de mensajes serviría para anunciar mesas si el producto incorporara esa función. El bot usa HTTP para crear canales e invitaciones y no necesita leer mensajes ni conectarse a voz. Una modalidad futura que prometa acceso exclusivo por asiento requiere otra decisión sobre identidad y permisos.

[Creación de canales](https://docs.discord.com/developers/resources/guild#create-guild-channel) · [Invitaciones](https://docs.discord.com/developers/resources/channel#create-channel-invite)
