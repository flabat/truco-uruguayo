# Fichas de tienda de El Truco

Borradores para App Store Connect y Google Play Console (issue #408, parte de la etapa 5, #402). Son textos para revisar y copiar: ninguna sesión los carga en las consolas.

- [App Store](app-store.md): ficha, clasificación por edad, etiquetas de privacidad y notas para la revisión.
- [Google Play](google-play.md): ficha, clasificación de contenido, seguridad de los datos y prueba cerrada.
- [Capturas](capturas.md): tamaños que piden las tiendas y qué pantalla va en cada una.

## Datos comunes

| Dato | Valor |
| --- | --- |
| Nombre | El Truco |
| Identificador | `co.eltru.app` (iOS y Android) |
| Idioma principal | Español (México en App Store, `es-419` en Play; no hay variante para Uruguay) |
| Categoría | Juegos › Cartas |
| Precio | Gratis, sin compras dentro de la app ni publicidad |
| Sitio | https://eltru.co/ |
| Soporte | https://eltru.co/ (contacto al pie de la [política de privacidad](https://eltru.co/privacidad/)) |
| Política de privacidad | https://eltru.co/privacidad/ |
| Eliminación de cuenta | https://eltru.co/eliminacion-de-datos/ y, dentro de la app, Tu perfil › Eliminar mi cuenta |
| Correo de contacto | El del responsable, que figura en la política de privacidad |

## Qué guarda el juego

Las respuestas de privacidad de las dos tiendas salen de esta lista. Si cambia lo que guarda la API, hay que actualizar esta tabla, la política de privacidad y las dos consolas.

| Dato | De dónde sale | Para qué | ¿Se vincula al jugador? |
| --- | --- | --- | --- |
| Correo | Proveedor de ingreso (Google, Discord, Apple) o registro con contraseña; lo guarda Keycloak | Ingreso y recuperación de la cuenta | Sí |
| Nombre visible | Proveedor de ingreso o el jugador | Mostrarlo a los demás jugadores de la mesa | Sí |
| ID de jugador y referencia de la cuenta | La API | Reconocer al jugador entre visitas | Sí |
| Partidas: asientos, repartos, jugadas, tantos, resultado | La API | Continuar partidas e historial | Sí |
| Reportes de jugada (si el jugador los usa) | La API y un borrador en GitHub | Corregir errores del juego | Sí |
| Token de Apple, cifrado | Keycloak y la API | Revocar el acceso al eliminar la cuenta | Sí |
| Registros de errores del servidor | Caddy y la API | Diagnóstico | No se usan para identificar a nadie |
| Última mesa, preferencias de sonido, vibración y animaciones | Solo en el teléfono | Comodidad | No salen del teléfono |

No hay publicidad, ni rastreo entre apps, ni análisis de terceros, ni SDK de terceros que recolecte datos. La app no pide micrófono, ubicación, contactos, fotos ni notificaciones. Todo el tráfico va por HTTPS.
