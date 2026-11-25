# Ficha de Google Play

Límites de Play Console entre paréntesis, en caracteres.

## Ficha principal

**Nombre de la app** (30): El Truco: truco uruguayo

**Descripción breve** (80):

> Truco uruguayo en línea: parejas con señas, tercetos, flor y computadoras.

**Descripción completa** (4000): la misma de la [ficha de App Store](app-store.md#información-de-la-app), cambiando la última línea por:

> Sin publicidad y sin compras. Ingresás con Google, Discord o con tu correo.

Play no pide Sign in with Apple. Si la pantalla de ingreso lo muestra también en Android, dejar la línea igual que en App Store.

**Categoría:** Juegos › Cartas. **Etiquetas:** Cartas, Multijugador, Clásicos (elegir en la consola las que existan).

**Correo de contacto:** el del responsable. **Sitio:** https://eltru.co/. **Política de privacidad:** https://eltru.co/privacidad/

**Gráfico de funciones** (1024×500, obligatorio): el tapete verde con cuatro cartas de la baraja y el nombre «El Truco». Se genera desde la marca del sitio y las cartas Tatú, sin texto pequeño.

## Contenido de la app

| Formulario | Respuesta sugerida |
| --- | --- |
| Política de privacidad | https://eltru.co/privacidad/ |
| Anuncios | La app no contiene anuncios |
| Acceso a la app | Algunas funciones requieren acceso: cargar la cuenta de prueba (ver la [ficha de App Store](app-store.md#información-para-la-revisión)) con las mismas instrucciones |
| Clasificación de contenido (IARC) | Categoría «Juego». Violencia, sexo, lenguaje, drogas: no. Apuestas con dinero real o simuladas: no, se juega por tantos. Interacción entre usuarios: los jugadores comparten mesa y ven sus nombres, sin chat. Compras digitales: no. Esperado: PEGI 3 / E (Everyone) |
| Público objetivo | 13 años o más. No está dirigida a niños |
| App de noticias | No |
| Apps de gobierno, financieras, de salud | No |
| Eliminación de cuenta | Sí, dentro de la app y en https://eltru.co/eliminacion-de-datos/ |

## Seguridad de los datos

**¿La app recolecta o comparte alguno de los tipos de datos obligatorios?** Sí.

**¿Todos los datos se encriptan en tránsito?** Sí.

**¿Los usuarios pueden pedir que se borren sus datos?** Sí, desde la app (Tu perfil › Eliminar mi cuenta) y en https://eltru.co/eliminacion-de-datos/

| Categoría › tipo | Recolectado | Compartido | Opcional | Propósito |
| --- | --- | --- | --- | --- |
| Información personal › Nombre | Sí | No | No | Funcionalidad de la app, administración de la cuenta |
| Información personal › Dirección de correo | Sí | No | No | Administración de la cuenta |
| Información personal › ID de usuario | Sí | No | No | Funcionalidad de la app, administración de la cuenta |
| Actividad en la app › Otras acciones (partidas y jugadas) | Sí | No | No | Funcionalidad de la app |
| Información y rendimiento de la app › Registros de fallas | No | | | Los registros del servidor no salen de la app ni identifican al jugador |

«Compartido» es «No» porque los proveedores de ingreso actúan a pedido del jugador y GitHub recibe el reporte de jugada solo cuando el jugador lo envía, lo que Play no considera compartir.

## Prueba cerrada

Las cuentas personales de Play creadas después de noviembre de 2023 tienen que pasar por una prueba cerrada con al menos 12 testers inscriptos durante 14 días seguidos antes de pedir acceso a producción.

1. Crear el segmento «Testers» con una lista de correos (cuentas de Google) o un grupo de Google.
2. Subir el primer `.aab` al segmento de prueba cerrada.
3. Compartir el enlace de inscripción. Cada tester tiene que aceptar la invitación y descargar la app.
4. Contar los 14 días desde que hay 12 inscriptos. Si alguno se da de baja, el conteo puede reiniciarse: conviene invitar a 15 o más.
5. Al terminar, completar en Play Console el cuestionario de acceso a producción (cómo se reclutó a los testers, qué cambió con sus comentarios).

**Texto para invitar testers:**

> Estoy por publicar El Truco en Google Play y necesito gente que lo pruebe dos semanas. Te sumás con tu cuenta de Google en este enlace: <enlace>. Instalá la app, jugá alguna mano cuando puedas y no te des de baja hasta el <fecha>. Si algo anda mal, avisame. ¡Gracias!

## Novedades de la primera versión

> Primera versión de El Truco para Android.
