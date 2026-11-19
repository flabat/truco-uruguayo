# Continuación y búsqueda local

El experimento congela una política para cada asiento. Ajusta una tabla a chicos completos y mide la calibración con otra secuencia de repartos. Después compara, en las dos posiciones de cada par, la misma política con y sin búsqueda contra el campo congelado. El actor sólo recibe su propia observación. Las semillas de ajuste, calibración y comparación quedan en el informe.

```sh
node --test tests/unit/training-search.test.ts
node training/search/cli.ts --output runs/search-a --seed 81029 --fit 64 --holdout 32 --pairs 8 --worlds 2 --deadline-ms 6
```

Los parámetros opcionales `--duel ARCHIVO`, `--pairs-actor ARCHIVO` y `--senas-actor ARCHIVO` fijan actores exportados. Cuando se omiten se usa V1. Cada archivo `<formato>-report.json` contiene el hash del actor, los conteos y latencias por brazo, el intervalo pareado del cambio y la calibración por tanteador. `<formato>-continuation.json` contiene las victorias y observaciones de cada celda. Los tiempos, vencimientos de plazo y partidos afectados por ellos dependen de la carga del equipo.

## Puntaje y creencias

`continuation(table, [puntos0, puntos1], siguienteDador)` retorna la probabilidad de victoria del equipo 0. Los extremos 40–x y x–40 son exactos. Cada celda suaviza sus pocos resultados con las otras observaciones de su banda de ocho puntos por equipo y el mismo próximo dador. El informe también compara probabilidades y resultados por bandas de 0–13, 14–27 y 28–39 del puntero.

`duelRange(observation, field)` enumera manos sin importar el orden en que se repartieron sus tres cartas. El estilo exacto utilizado debe ser invariante a ese orden. Para la falta del fixture hay 7.140 manos posibles y 5.918 compatibles con haber abierto con una falta. Ante V1 tienen peso positivo 403. La probabilidad de que los 27 del respondedor superen al cantor es cero ante V1 y 51,82 % ante el farolero frecuente. Un empate favorece al cantor que es mano aquí.

`drawDeal` muestrea sin reemplazo y conserva los bloqueos de las cartas jugadas, la muestra y la mano propia. Para parejas asigna las manos de los tres asientos desconocidos de forma conjunta. `inferWorld` reproduce las declaraciones, señas, jugadas y cobros en su orden y descarta repartos incompatibles. La probabilidad de una acción del rival o compañero usa su propia vista de ese momento. Si todos los estilos asignan probabilidad cero a lo observado, el posterior conserva peso uniforme sobre los repartos compatibles.

## Comparación con plazo

`boundedSearch(options)` devuelve una política. En el duelo, tras un canto antes de la primera carta, intenta completar la enumeración exacta de la gama y luego muestrea del posterior. Con historia vacía la distribución uniforme de manos ya es exacta. En parejas y posiciones posteriores, la búsqueda usa una muestra conjunta filtrada. Calcula todas las alternativas del asiento sobre los mismos repartos y flujos de azar. Cada asiento simulado continúa usando su observación efectivamente visible. Al final de la mano se usa la tabla del próximo dador, o el vencedor exacto si se alcanzó la meta.

En el subjuego de duelo se refinan las alternativas de la raíz contra continuaciones congeladas. Para cada tenencia compatible se calcula el valor contrafáctico de mantener la política de base. La acción candidata comparte peso con esa base en la medida que permite la tolerancia de pérdida por tenencia. En parejas se compara la utilidad media conjunta. La aproximación de duelo se limita a esta decisión y a las políticas de continuación ensayadas.

Al expirar el plazo, la política devuelve la distribución legal de base preparada al inicio. Se descarta cualquier cálculo parcial de alternativas. El verificador de plazo es cooperativo y puede retornar tarde por una llamada larga del motor o por carga del proceso. El informe registra el tiempo real. La habilitación se decide separadamente para cada formato en el campeonato.
