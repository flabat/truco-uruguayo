# Funciones en gestión · Piloto de Tercetos

La persona responsable del panel decide quién puede estrenar una mesa de seis o aceptar su invitación. Abre **Gestión → Funciones → Tercetos**, elige la audiencia y guarda. El panel identifica el sitio que se está configurando, permite buscar jugadores por nombre, distingue homónimos por ID y muestra la consecuencia antes de guardar. La revisión guardada queda disponible para las siguientes solicitudes en todas las instancias.

| Quién puede jugar | Crear o aceptar un asiento nuevo |
| --- | --- |
| Desactivado (inicial) | Nadie |
| Jugadores seleccionados | Cuentas de la lista |
| Todos los jugadores | Cualquier cuenta con sesión |

Los asientos existentes conservan acceso por invitación, enlace directo y reconexión. El anfitrión puede completar con computadoras. El listado del salón público sigue limitado a duelo y parejas. La invitación de seis es privada y el servidor verifica la admisión incluso cuando la sala estaba abierta antes del cambio.

## Operación

1. Desplegar migración, API y panel de la misma entrega. Comprobar que todas las instancias sirven la API nueva antes de abrir la prueba. La migración inicial cierra las altas aunque el despliegue anterior las ofreciera. La variable histórica TERCETOS_HABILITADOS se retira.
2. Desde la cuenta configurada en GESTION_SUJETO, buscar las cuentas de prueba y guardar **Jugadores seleccionados**. Verificar con una cuenta incluida y una excluida. Las modificaciones posteriores usan el mismo panel.
3. La persona a cargo de Tercetos revisa partidas sin terminar, reconexiones y reportes de turnos trabados o puntajes incorrectos antes de ampliar la audiencia. Si falla la admisión o el juego, elegir **Desactivado**. Ante una reversión del binario, configurar previamente TERCETOS_HABILITADOS=0 para la versión antigua y recordar que ese código permite unirse a mesas existentes.
4. Tras aprobar las reglas y la interfaz y completar una ventana estable de disponibilidad general, el responsable registra la decisión de retirar la bandera, elimina los puntos de evaluación y archiva el historial según la política del proyecto.

## Plan de implementación y aceptación

1. Incorporar [las decisiones de arquitectura](adr/0001-configuracion-funciones.md) y la [política de admisión](adr/0002-admision-tercetos.md) después del panel de #224.
2. Migrar la configuración y exponer lectura y guardado autenticados. Una edición concurrente recibe un conflicto y conserva la revisión vigente. Un cambio inválido deja configuración y auditoría intactas.
3. Usar la política en la oferta de modalidades y en las dos escrituras de admisión. Verificar los tres estados, usuarios con y sin acceso, invitación reenviada, asientos previos y modalidades estables.
4. Incorporar el editor, selector de jugadores, vista previa e historial en gestión. Probar guardado, conflicto y navegación en móvil y escritorio.
5. Ejecutar la suite local y la integración con PostgreSQL y Keycloak. Revisar el PR después del panel base. El despliegue y la selección de cuentas corresponden al operador.

[Editor en escritorio](capturas/funciones-desktop.png) · [Editor en móvil](capturas/funciones-mobile.png)
