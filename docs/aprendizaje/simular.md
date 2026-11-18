# Simular una mano de parejas

Desde la raíz del repositorio, con Node.js 24, ejecutá este comando. Muestra la mano completa en la terminal y guarda su historial en `mano.json`.

```sh
node scripts/simular-mano.ts --semilla 217 --dador 3 --guardar mano.json
```

El aprendiz ocupa el asiento 0 y juega sus cartas en el orden en que las recibió. Así podés repetir sus decisiones. Su compañero ocupa el 2 y los rivales el 1 y el 3. Cada uno de esos tres jugadores elige su carta con la política de parejas, a partir de su mano y las cartas visibles en la mesa. [Política de los jugadores](adr/0001-motor-y-replay.md)

En el ejemplo, el asiento 3 reparte y el aprendiz es mano. La muestra es la sota de bastos, por lo que el rey de bastos hace de sota y vale 27 para el envido. Con el 6 de espadas llega a 33. La pareja 1 y 3 gana la primera vuelta y la segunda sale parda, así que esa pareja gana la mano.

Podés cambiar `--semilla` por cualquier entero de 0 a 4294967295 y `--dador` por un asiento de 0 a 3. Con el mismo dador, probá la semilla 0 para ver una flor y la 1 para llegar a la tercera vuelta. Los valores por defecto son 217 y 3. Omití `--guardar` si solo querés leer las jugadas.

## Reproducir un historial

El replay V1 guarda la semilla, el dador y cada carta en el orden en que se jugó. Para volver a ver la misma mano, ejecutá lo siguiente.

```sh
node scripts/simular-mano.ts --replay mano.json
```

También podés pasar el JSON por una tubería. Con `--guardar -` la salida estándar contiene únicamente el replay. Con `--replay -` el programa lo lee de la entrada estándar.

```sh
node scripts/simular-mano.ts --semilla 1 --dador 0 --guardar - | node scripts/simular-mano.ts --replay -
```

Si conservás solo las primeras entradas de `jugadas` en el archivo, el relato se detiene en ese punto y muestra a qué asiento le toca jugar. Un arreglo vacío muestra la salida de la primera vuelta. Una jugada ilegal indica su posición en el historial, contando desde 1.
