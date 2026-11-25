# Sonido de la mesa

Voces por asiento y efectos, guardados dentro de la app. Durante el juego no hay llamadas a ningún servicio.

## Para la mesa (4d)

```ts
import { precargarSonidos, reproducirEfecto, reproducirVoz, useSonidoActivado } from "../sonido/index.ts";

await precargarSonidos([0, 1, 2, 3]);                          // al entrar a la mesa, con los asientos ocupados
reproducirVoz(2, { tipo: "canto", canto: "truco" });            // cualquier acción que no sea carta, incluidos «paso-flor» y «mazo»
reproducirVoz(1, { tipo: "pie", frase: "veni" });               // frases del pie: veni, juga, voy-a-vos
reproducirVoz(3, { tipo: "tantos", motivo: "envido", total: 33 });
reproducirEfecto("naipe");                                      // tu carta
reproducirEfecto("naipe", { volumen: 0.5 });                    // carta de otro jugador
reproducirEfecto("reparto");                                    // una vez por carta repartida
reproducirEfecto("ficha");                                      // se cobran tantos
reproducirEfecto("festejo");                                    // se gana el chico
const [sonido, cambiarSonido] = useSonidoActivado();            // interruptor de la hoja Más
```

Tipos (`frases.ts` y `efectos.ts`):

- `FraseVoz = { tipo: "canto"; canto: CantoVoz } | { tipo: "pie"; frase: FrasePie } | { tipo: "tantos"; motivo: "envido" | "flor"; total: number }`.
- `CantoVoz` es `TipoAccionOnline` sin `"carta"`. `mazo` dice «Me voy al mazo» y `paso-flor`, «Yo no canto».
- `Efecto = "naipe" | "reparto" | "ficha" | "festejo"`.

Comportamiento:

- La voz depende del número de asiento (0 a 5), no de la cuenta.
- Las frases del mismo asiento se encolan; las de asientos distintos pueden sonar a la vez. La pausa entre voces de la cola de presentación (`pausaDeVoz`) la sigue manejando la mesa.
- Una frase sin clip (por ejemplo, un total imposible) no suena ni lanza.
- Con el sonido apagado no suena nada y se corta lo que estaba sonando. La elección se guarda en `truco.sonido` (almacenamiento seguro en iOS y Android, `localStorage` en la web).
- En la web nada suena hasta el primer toque o tecla. Lo pedido antes se descarta.
- En el iPhone respeta el interruptor de silencio y se mezcla con la música de otras apps.

## Voces

Seis voces rioplatenses de la biblioteca de ElevenLabs, una por asiento, alternando mujeres y hombres (ver `scripts/voces/voces.ts`). El usuario aprobó una muestra el 24 de noviembre de 2026 y eligió grabar las declaraciones enteras («treinta y tres de envido») en vez de unir número y canto.

Los clips están en `app/assets/sonido/voces/<asiento>/<clave>.mp3`. Las claves salen de `clavesDeFrase`: `truco`, `real-envido`, `pie-veni`, `envido-33`, `flor-29`. `recursos.ts` es el manifiesto de `require` que necesita Metro; lo genera el script.

Para regenerarlos (la caché en `scripts/voces/.cache/` evita pagar dos veces el mismo clip):

```sh
ELEVENLABS_API_KEY=… npm run voces:generar -- --muestra   # muestra para aprobar
ELEVENLABS_API_KEY=… npm run voces:generar               # lote completo y manifiesto
```

El script busca el ffmpeg de Remotion en `video/node_modules` (`npm run reel:instalar`) o usa el de `FFMPEG`. Recorta el silencio de los bordes, lleva la voz a −18 dBFS de RMS sin pasar −1 dBFS de pico y codifica MP3 mono de 24 kHz y 48 kbps.

## Efectos

`scripts/voces/efectos.ts` los sintetiza (ruido filtrado para el naipe y el reparto, parciales cortos para la ficha, un arpegio para el festejo). No usan grabaciones de terceros, así que no llevan licencia aparte. `npm run voces:generar -- --efectos` los regenera solos.
