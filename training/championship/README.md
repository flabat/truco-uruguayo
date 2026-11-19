# Campeonato de computadoras

Un árbitro independiente recibe tres bundles congelados de la liga, uno por formato. Cada bundle identifica por SHA-256 de archivo el candidato, un checkpoint independiente y un contrajugador entrenado específicamente contra el candidato. En parejas incluye un cuarto artefacto para el compañero desconocido. Al registrar se verifican los archivos, se prueban con el lector del servicio y se copian a la carpeta del árbitro. Los modelos se sirven con el mismo pin canónico que la API.

Sobre el checkout registrado con Node 24:

```sh
node training/championship/event.ts register --bundle runs/league/championship-input/duel/bundle.json --output runs/final-duel/plan
node training/championship/event.ts run --plan runs/final-duel/plan/plan.json --expected "$PLAN_SHA256" --output runs/final-duel/games
node training/championship/event.ts verify --plan runs/final-duel/plan/plan.json --expected "$PLAN_SHA256" --output runs/final-duel/games
```

Repetir para pairs y pairs-senas con directorios independientes. La ruta de entrada real queda en el registro de la liga. Registrar el hash del plan antes de correr el evento. Asigná a PLAN_SHA256 ese valor del registro independiente al correr o verificar los resultados. El campo se fija por código: V1, el cambio de falta en duelo, cinco estilos, el oponente independiente y el contrajugador. Los compañeros desconocidos rotan de asiento. Cada miembro del campo juega los cuatro chicos por secuencia (control y candidato, con ambos equipos). El servicio recibe la observación ordinaria y un uniforme del árbitro para muestrear la política. El actor nunca recibe la semilla de los repartos.

El registro usa 12 pares de desarrollo por familia para estimar varianza y costo; después genera una clave final nueva. El tamaño se fija con la mayor varianza observada, objetivo de detectar seis puntos porcentuales y presupuesto aproximado de treinta minutos locales por formato. El plan registra el tamaño realizable y el efecto detectable correspondiente. Se remuestrean secuencias completas conjuntamente en todas las familias. El triunfo directo se calcula con compañeros propios contra V1. Las comparaciones de cambios incluyen explícitamente los compañeros desconocidos. Los intervalos simultáneos y el plazo de 200 ms y fallback del 0,5% se fijaron en #132 antes de abrir los repartos finales.

El manifiesto conserva los hashes de los cuatro chicos por par, latencias y fallbacks efectivos, puntos por canto y un resumen de marcador. El resumen por banda toma una observación por chico y banda y permite contrastar la tasa observada con la referencia descriptiva basada en puntos faltantes. La calibración de la continuación aprendida y la decisión sobre búsqueda se registran aparte en #129. Los archivos de árbitro y las claves de repartos se conservan localmente. Para recuperar un evento interrumpido, repetir run en el mismo directorio. verify reproduce las jugadas confirmadas y recalcula el informe.

Se exige un límite inferior directo mayor que 0,50 y un límite inferior del cambio por familia mayor que −0,02, junto con el límite de fallback y los controles de integridad. Un resultado fallido o inconcluso conserva V1. La activación local y la reversión se verifican con el registro del servicio de #131. Cada torneo solamente mide el campo informático registrado.
