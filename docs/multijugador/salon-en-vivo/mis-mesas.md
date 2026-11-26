# Mis mesas en todos los dispositivos

## Experiencia

Ana deja un duelo en el teléfono y crea una mesa de parejas en la computadora. Al ingresar desde otro navegador, encuentra el duelo con su tanteador y la sala de parejas que espera jugadores. Puede abrir cualquiera y seguir jugando desde los dos dispositivos. La cuenta ya conserva los asientos. El cambio consiste en que el salón permite encontrarlos. [Issue de diseño](https://github.com/flabat/truco-uruguayo/issues/448)

| Mesas que puede retomar | Al entrar al salón |
| --- | --- |
| Ninguna | Crear mesa y las opciones habituales del salón. |
| Una | **Volver a mi mesa** abre el asiento en un toque. La modalidad, los participantes disponibles y el estado permiten reconocerla, incluso si quedó pendiente hace tiempo. |
| Varias | **Mis mesas** permite elegir. Las partidas recientes en las que la persona tiene una decisión aparecen primero. Dentro de cada grupo se usa la última actividad. |

Una sala con asientos libres dice **Esperando jugadores**. Cuando se ocupa el último asiento y queda pendiente el primer reparto, dice **Lista para jugar**. Una partida empezada muestra el número de mano y el tanteador desde el equipo del jugador. **Te toca** indica que tiene una decisión en esa mano. Para varias mesas, **Mesas anteriores** agrupa las que llevan al menos siete días sin actividad o tienen fecha desconocida. El grupo se puede desplegar. El plazo ordena la pantalla y conserva el asiento.

## Implementación

1. Consultar en el servidor los asientos vigentes de la sesión. Incluir duelo, parejas y tercetos, mesas privadas y públicas, desde la sala de espera hasta el cierre del chico. Excluir las mesas canceladas, los asientos cedidos y los chicos terminados. El historial del perfil conserva su función.
2. Entregar un resumen por mesa con su identificador, modalidad, otros participantes, mano, tantos, meta, posibilidad de actuar y última actividad. Las señales privadas, las cartas y los enlaces de invitación quedan en sus flujos de juego. Consultar o mirar una mesa no cuenta como actividad de juego.
3. Mostrar esos resúmenes en el salón de web, iOS y Android. Actualizarlos al volver al salón y durante la espera. Si falla la consulta, ofrecer reintentar y permitir crear una mesa. La cuenta puede recuperar sus mesas privadas incluso con el directorio público cerrado.
4. Abrir la ruta de sala existente al elegir una mesa. Esa ruta comprueba el asiento y lleva al tapete tras el reparto. Una invitación, un enlace a una mesa o un enlace para mirar conservan su destino al ingresar. Abrir el mismo asiento en dos dispositivos usa la sincronización existente del juego.

## Verificación

Capturas de Eva al ingresar desde un navegador nuevo con un duelo, una sala en espera y una mesa de parejas. [Teléfono](../capturas/mis-mesas-movil.png) · [Escritorio](../capturas/mis-mesas-escritorio.png)

- Ingresar con la misma cuenta en dos navegadores con almacenamiento independiente. Crear o abrir una mesa en uno, recuperarla en el otro y comprobar que ambos ven las jugadas.
- Probar cero, una y varias mesas, una sala sin reparto, un chico terminado y una mesa anterior. Verificar que se puede elegir el destino por teclado y a ancho de teléfono.
- Comprobar que otra cuenta solo ve sus propios asientos en **Mis mesas**. Mirar una mesa pública no agrega un asiento. Un ingreso mediante invitación sigue llevando a la invitación.
- Ejecutar las pruebas del proyecto y la pila local de Docker sobre el commit que se presenta a revisión.
