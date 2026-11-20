# Decidir si abrir el salón a más jugadores

Registrar por separado la capacidad del servidor, la experiencia de quien llega por primera vez y la comprensión de la visibilidad. Guardar el commit, los interruptores y el período de cada observación. Un recorrido funcional corto verifica el flujo. Para estimar capacidad sostenida se necesita el ensayo completo.

## Evidencia disponible

En una pila local descartable con PostgreSQL, Keycloak y Chromium, hubo seis exhibiciones elegibles a los 4,973 segundos del arranque de la API. Una cuenta nueva encontró tres duelos y tres parejas. Las seis filas indicaban «Exhibición · Solo computadoras». En una partida de parejas la cuenta vio una carta y un retruco nuevos, volvió por teclado y mantuvo cero asientos y cero entradas de última mesa. Los pedidos de voz se probaron con Discord simulado. [Recorrido y comprobaciones](https://github.com/flabat/truco-uruguayo/pull/240) · [Voz](https://github.com/flabat/truco-uruguayo/pull/241)

## Orden de apertura

1. En una pila de ensayo comparable a producción, medir la carga de referencia y después las seis exhibiciones y 50 lectores durante 24 horas. Guardar series por minuto, versiones, tamaño inicial y final y presupuesto de copias. Probar que se puede suspender la reposición y que un lector con la página abierta pierde acceso al apagar el salón.
2. Antes de abrir el piloto, registrar abajo el período de ingreso, la asignación, el tamaño previsto y los márgenes de demora y disco que acepta quien opera el VPS. Dejar transcurrir 24 horas o siete días completos después del último ingreso para el resultado correspondiente. Comparar personas asignadas a cada grupo, incluidas quienes nunca abrieron el visor.
3. Abrir a la cohorte pequeña y revisar diariamente la disponibilidad, los turnos de jugador y los problemas de acceso. Ante una exposición de datos privados, cerrar de inmediato las lecturas y la voz espectadora. Una presión de recursos permite suspender la reposición y observar cómo terminan los chicos. [Interruptores y recuperación](../../produccion.md)
4. Registrar los resultados y la decisión de mantener, ampliar, ajustar o cerrar. Los resultados de uso y comprensión requieren personas reales y observaciones maduras.

## Comprensión de quien mira por primera vez

Con el consentimiento de la persona, pedirle que encuentre una partida, siga una vuelta y localice la voz. Presentar una mesa con personas y una exhibición, alternando el orden. Preguntar después de cada una, antes de explicar la interfaz:

- ¿Quiénes estaban jugando? ¿Qué te lo indicó?
- ¿Qué cartas alcanzaste a ver? ¿Qué esperabas que pasara con las demás?
- Si entraras al Discord de esta mesa, ¿quién podría escucharte? ¿Qué esperarías oír en una exhibición?
- ¿Cómo volverías al salón o empezarías una partida propia?

Anotar por tipo de mesa si identificó a las computadoras, distinguió las cartas jugadas de las que siguen en mano y entendió la audiencia de Discord. Registrar el tiempo hasta la primera jugada visible y las palabras o controles que dieron lugar a dudas. Resumir los casos por categoría. Evitar nombres, audio, enlaces de Discord, manos e identificadores de cuenta en las notas.

## Registro de decisión

| Evidencia | Resultado pendiente de registrar |
| --- | --- |
| Capacidad | Recursos del entorno, referencia y serie de 24 h, p95 de comandos, atraso de bot, disponibilidad por minuto y recuperación. |
| Almacenamiento | Crecimiento observado, tamaño de copias, política de retención y presupuesto de 30 días aprobado por el operador. |
| Primera jugada | Ingresos maduros por grupo, personas con primera jugada confirmada en 24 h, proporciones y diferencia con incertidumbre. |
| Retorno | Ingresos con siete días completos por grupo y personas que volvieron a jugar según la definición del informe. |
| Comprensión | Personas observadas, tareas completadas, confusiones recurrentes por tipo de mesa y cambios necesarios. |
| Decisión | Fecha, responsable, alcance acordado y próximo punto de revisión. |

Los umbrales iniciales de disponibilidad son cinco mesas antes de un minuto, seis al segundo minuto y al menos cinco en el 99 % de las muestras por minuto en régimen. Si cae la primera jugada, se confunden personas con computadoras o no se comprende la audiencia de voz, revisar el recorrido antes de extenderlo. [Plan y criterios del piloto](implementacion.md)
