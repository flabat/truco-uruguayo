# Chicos entre computadoras

Con Node 24, desde la raíz del checkout, `npm ci` instala las dependencias. Guardá el directorio de resultados fuera del árbol versionado. Una muestra de todos los formatos usa dos chicos por formato.

```sh
npm run arena -- smoke --formats all --seed 42 --output /tmp/truco-smoke
npm run arena -- tournament --formats duel,pairs --pairs 500 --seed 20261119 --output /tmp/truco-torneo
npm run arena -- tournament --resume /tmp/truco-torneo
npm run arena -- verify --manifest /tmp/truco-torneo/manifest.json
npm run arena -- replay --manifest /tmp/truco-torneo/manifest.json --match duel-0-0
```

Cada par juega dos mangas. Para el duelo el desafiante de la falta ocupa primero el equipo 0 y luego el 1. En parejas sin señas V1 ocupa los cuatro asientos. En parejas con señas un equipo usa V1 con una seña determinista visible para sus dos asientos y el otro guarda silencio. Esta comprobación ejercita el protocolo. No mide el aprendizaje ni justifica una promoción.

El plan fija el SHA del checkout, huellas del código y políticas, formatos, semilla, cantidad de pares y versión del generador. El azar de reparto usa SHA-256 en modo contador con dominio, formato, semilla, par y número de mano. Ocho palabras big-endian por bloque alimentan Fisher–Yates parcial con rechazo para cada índice uniforme. Cada asiento muestrea las acciones desde otra corriente, que también distingue la manga. Los actores reciben la vista privada por asiento y su máscara de acciones. El árbitro selecciona el primer asiento elegible del reductor. El mano inicial es el índice de par módulo el número de asientos y rota una posición por mano.

`playMatch({format, seed, pair, leg, policies, onDecision?})` construye una política por asiento al inicio del chico. La función `policies(asiento)` decide la alineación, incluidos los cambios de equipo entre mangas. `onDecision` corresponde al entrenador o árbitro local e incluye el estado privado para etiquetas de entrenamiento. `replayMatch(record, seed)` lee solo los comandos confirmados y compara todas las adjudicaciones, tanteadores y cartas programadas. Los índices de par, manga y mano empiezan en cero.

`plan.json` y `matches/*.json.gz` son privados del árbitro e incluyen la semilla local o los repartos completos. En cada chico terminado se publica atómicamente su archivo con checksum SHA-256. `--resume` vuelve a verificar los chicos ya guardados y repite desde el principio cualquier chico interrumpido. `--limit-matches N` permite ensayar la pausa. El manifiesto final enumera los identificadores y las huellas de los chicos. La salida de `replay` solo muestra la muestra, los comandos públicos y los tantos anotados. El árbitro conserva los gestos de equipo en el registro privado. Para repetir un resultado usá el SHA del plan y conservá sus archivos privados. Para torneos sellados, mantené las semillas bajo custodia del evaluador.
