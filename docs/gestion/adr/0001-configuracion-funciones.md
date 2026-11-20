# ADR 1 · Configuración de funciones desde gestión

Estado aceptado para el piloto.

El panel de Tabler ya identifica a la cuenta operadora y ofrece un directorio de jugadores. El interruptor de despliegue anterior requería recrear la API y solo admitía una audiencia global. Elegimos un catálogo definido por el código, con una entrada inicial para Tercetos. Cada instalación conserva su configuración en su propia base PostgreSQL. Solo la cuenta autorizada puede leer o actualizar la configuración desde el panel. Cada escritura comprueba origen y versión y registra responsable, fecha, audiencia y selección en la misma transacción.

Consideramos un proveedor externo y una lista de IDs en variables de entorno. Un proveedor aporta segmentos y distribución multirregión, pero implicaría integrar otra fuente de configuración con gestión. Las variables dificultan cambios durante una sesión de prueba y la atribución de cambios. PostgreSQL permite activar y revertir sin reiniciar, con el costo de una lectura al evaluar la admisión. Revisar la decisión si aparecen múltiples servicios consumidores, experimentos porcentuales o necesidades de aprobación entre varios operadores.
