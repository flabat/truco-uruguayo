# Voz de la mesa en Discord

En duelo, parejas y tercetos, una persona sentada puede abrir Discord desde la sala de espera o durante el juego. Todas las personas de esa mesa llegan al mismo canal. La conversación es pública para quienes pueden entrar en la categoría Mesas del servidor de eltru.co. El control debe decirlo antes de abrir el enlace. Discord gestiona el micrófono, el silencio y la salida de voz. Volver al navegador conserva el asiento.

El botón **Abrir voz de la mesa** solicita un enlace cuando alguien lo usa. La API comprueba la sesión, el origen y el asiento, identifica la mesa por su ID persistente y obtiene su canal. El backend usa la credencial del bot para crear salas e invitaciones. El navegador recibe una invitación de Discord. La sala permanece disponible si cambia el dispositivo, se recarga la página o caduca el enlace. La expiración de una invitación requiere renovar el enlace al canal existente.

Una mesa vecina tiene un canal propio. El nombre visible distingue las mesas y su formato sin revelar nombres, cartas, señas ni el código de invitación al juego. Las señas conservan su audiencia actual y los botones del juego registran los cantos. El audio viaja entre el cliente de Discord y Discord. Un fallo de Discord deja todos los controles de cartas disponibles.

La categoría Mesas contiene también canales creados a mano. El bot solo limpia los canales que creó para esta función. La configuración de despliegue provee el servidor, la categoría y el token secreto. Al desactivar la integración, las mesas siguen disponibles. El piloto no agrega anuncios ni requiere vincular identidades.

- [Decisión sobre el proveedor y el acceso](adr/0001-discord-abierto.md)
- [Decisión sobre identidad y vida de la sala](adr/0002-ciclo-de-vida.md)
- [Plan de implementación y aceptación](implementacion.md)
- [Seguimiento de producto](https://github.com/flabat/truco-uruguayo/issues/102)
