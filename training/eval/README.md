# Evaluación local por chico

Se juega a 40 con computadoras en todos los asientos. Cada adversario recibe las mismas secuencias de cartas en los cuatro chicos del par. Dos chicos intercambian los equipos del candidato y otros dos hacen lo mismo para V1 contra ese adversario. El informe compara sus fracciones de victorias. Cada familia tiene el mismo peso en la cifra global. Las réplicas de bootstrap muestrean pares completos y mantienen la correspondencia entre familias. La prueba contra V1 y las diferencias por familia usan intervalos percentiles al 95% con corrección de Bonferroni. La variación entre semillas de aprendizaje se informa por separado.

## Perfil histórico y corrida de desarrollo

Con Node 24 desde la raíz del checkout:

```sh
node training/eval/legacy.ts
npm run arena -- evaluate --format duel --pairs 16 --output runs/dev-duel-plan
npm run arena -- evaluate --plan runs/dev-duel-plan/plan.json --output runs/dev-duel-games
npm run arena -- evaluate --plan runs/dev-duel-plan/plan.json --output runs/dev-duel-games --verify
```

El diagnóstico legado usa Fisher–Yates parcial y el azar original. Los conteos de referencia son 1103 faltas, 499 aceptaciones y 484 victorias del cantor en 20000 repartos. El desafiante gana 2840 de 5000 chicos, con 81515 manos en total. El evaluador nuevo usa la agenda por par/mano de la arena. Las corridas de desarrollo miden el circuito y permiten estimar varianza para fijar un presupuesto. La prueba de regresión no decide una promoción.

## Campo y custodia

`--freeze campo.json --output <directorio-nuevo>` fija un campo antes de abrir sus repartos. El JSON lleva `format`, `pool`, `pairs`, `candidate` y `opponents`. Cada entrada lleva `id` y `lineage`. Para un actor exportado agregar `file` (relativo a plan.json), `sha256` y `kind` (duel o partners). Incluir `incumbent-online-v1` para el contraste directo. Los perfiles de prueba disponibles incluyen caller, folder, frequent-bluff, rare-bluff y strong-cards. El código de cada política incorporada queda fijado en el hash de fuentes del plan. En promoción y final se requiere un candidato exportado y al menos un checkpoint oponente de otro linaje.

Cada plan usa una clave aleatoria privada con su compromiso SHA-256. El árbitro deriva el reparto por pool y formato. El evaluador independiente custodia los directorios de promoción/final y designa los linajes aparte de entrenamiento y desarrollo. La política recibe exclusivamente su vista de asiento. El archivo referee-key y los archivos comprimidos con repartos sin mostrar permanecen en almacenamiento privado del árbitro. El informe incluye el presupuesto, hashes de todos los archivos y sus incertidumbres. Para reanudar, repetir el comando con el mismo plan y directorio; solo se publican pares completos de forma atómica. --verify reproduce los cuatro chicos de cada par, recalcula las estadísticas y compara la evidencia con el manifiesto.

Antes del campeonato, registrar por formato los hashes, el presupuesto elegido con los datos de desarrollo, la latencia y proporción de fallback admisibles y el campo independiente con sus contrajugadores. La puerta de fuerza exige un límite inferior mayor a 0,50 frente a V1 y mayor a −0,02 para cada diferencia prespecificada. El servicio, la integridad, la latencia, los compañeros desconocidos y los fallbacks se verifican en el campeonato de #132 antes de activar un candidato.

## Señas automáticas al pie

`node training/eval/senas-pie.ts 314 64` compara cuatro condiciones del bot determinista en `pairs-private-senas`. En cada par se repite la secuencia de repartos del chico a 40 intercambiando los equipos. El rival siempre juega sin gestos ni facultad de dar órdenes, y oye todas las palabras públicas. La política recibe sólo la proyección de su asiento. Las opciones de cada vuelta cuentan como oportunidades aunque el bot guarde silencio o la mano termine antes de la carta del destinatario.

Con la semilla 314, la política completa ganó 65 de 128 chicos. Dijo «Vení» 1.023 veces, «Jugá» 904 y «Voy a vos» 172 en 2.647 oportunidades. En 644 de las 1.601 decisiones de carta que llegaron con un pedido, la carta cambió al omitir sólo esa palabra de la misma observación. Los tres controles ganaron 64 de 128 chicos cada uno. Este bot usa las señas para elegir el consejo y se abstiene al ocultarle los gestos. Por eso dar acceso sólo a señas o sólo a palabras produjo las mismas jugadas que el silencio con esta política.
