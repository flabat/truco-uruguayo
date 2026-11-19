# Ajustar las políticas de V1

Cada formato arranca con las decisiones exactas de V1. El buscador ajusta tres parámetros categóricos, uno por banda de tanteador (máximo de ambos equipos por debajo de 15, de 15 a 29 y de 30 a 39). Evalúa cada combinación propuesta en chicos completos entre computadoras, intercambia asientos y rota compañeros y rivales. En parejas con señas de equipo, solo el emisor y su compañero reciben el gesto. Los modelos históricos de parejas sin señas que participan como invitados reciben jugadas sin gestos.

Desde Node 24, prepará un directorio nuevo con adversarios congelados. Para reproducir una corrida, usá el mismo código, hashes de adversarios y argumento final de semilla registrado en su protocolo.

```sh
node training/anchored/prepare.ts runs/ciclo-nuevo runs/league-130-01/championship-input
for formato in duel pairs pairs-private-senas; do
  node training/anchored/cycle.ts runs/ciclo-nuevo "$formato" parity || exit 1
done
for formato in duel pairs pairs-private-senas; do
  node training/anchored/cycle.ts runs/ciclo-nuevo "$formato" fit &
done
wait
```

Para seguir cada proceso se puede abrir su archivo `events/<formato>.jsonl` durante la corrida. Allí se escriben los rivales, compañeros y jugadas junto con el progreso. Los tres recibos de paridad son obligatorios antes del ajuste. El checkpoint de cada formato y las propuestas terminadas se guardan de forma atómica. Ejecutá una sola instancia por formato. Reiniciar el comando sobre la misma carpeta retoma la última ronda o familia verificada.

La selección compara cada propuesta con la mejor política anterior sobre repartos nuevos. Una propuesta se adopta si el límite inferior bilateral aproximado al 95 % del cambio pareado es positivo y obtiene al menos 48 % directo contra V1 en desarrollo. Se detiene tras dos rondas consecutivas sin aceptar una mejora, al agotar el calendario o al alcanzar seis horas de ajuste. La prueba final usa repartos independientes para cada formato, compartidos entre sus rivales y ambos brazos de la comparación. Remuestrea secuencias completas y publica intervalos simultáneos al 95 %. Los campos `games` y `trainingAndValidationGames` cuentan chicos completos. El diagnóstico con señas además compara el mismo equipo contra V1 después de ocultar los gestos y obligar a jugar en silencio. Para promover un modelo al juego se aplica el campeonato de servicio del repositorio.
