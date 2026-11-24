---
name: reel
description: Usala para hacer un reel para las redes sociales de El Truco (una lección corta de envido, flor u otra regla) o para crear una plantilla nueva de reel. El reel sale de un archivo de episodio YAML con `npm run reel`; no hace falta dibujar ni editar video a mano.
---

# Reels de El Truco

Los reels se generan en `video/` con Remotion, a partir de un archivo de episodio. La conversación sirve para decidir la idea. El resto lo hace el comando.

## Reel nuevo

1. **Acordá la idea con la persona**: qué enseña, la muestra, las tres manos (la segunda es un cambio de una carta de la primera) y la frase de gancho. Si la persona pide «otra como esta», cambiá las manos o usá `{ familia, semilla }` para que el motor elija una mano del tipo pedido.
2. **Escribí el episodio** en `video/episodios/<serie>/<id>.yaml`. Ejemplo (`video/episodios/contar-envido/07.yaml`):

   ```yaml
   plantilla: contar-tantos
   serie: contar-envido
   id: "07"
   modalidad: envido          # o flor
   muestra: bastos-06
   gancho: "¿Cuánto tenés de envido?"
   manos:
     - [copas-04, copas-07, espadas-01]
     - cambio: { de: copas-04, a: bastos-04 }
     - { familia: tres-palos-distintos, semilla: 7 }
   ```

   No escribas totales ni explicaciones: el guion sale del motor (`src/motor/tantos.ts`). Para reescribir una línea, usá `lineas: { <id>: "texto" }`; `null` la quita. Los ids son `pregunta`, `cartas`, `respuesta1`, `cambio`, `respuesta2`, `tercera`, (`respuesta3` en flor), `valores` y `cierre`. Si una `respuesta*` reescrita dice un total distinto del que calcula el motor, el comando falla antes de gastar voz.
3. **Generá el reel** desde la raíz: `npm run reel -- video/episodios/<serie>/<id>.yaml`. La voz de ElevenLabs se pide una sola vez por texto y queda guardada. Hacen falta `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` en el `.env` de la raíz. Nunca muestres ni escribas sus valores.
4. **Revisá `video/salida/<serie>/<id>/prueba.jpg`** (diez cuadros con su momento). Si algo no está bien, ajustá el YAML y volvé a generar. Mandale a la persona el MP4 y la hoja.
5. **Publicar es manual.** `publicacion.md` trae un borrador de texto, texto alternativo y enlace. No crees cuentas ni publiques en las redes.

Para previsualizar y ajustar tiempos con Remotion Studio: `npm run reel -- <episodio> --studio`.

## Plantilla nueva

1. Copiá `video/src/plantillas/contar-tantos/` con otro nombre.
2. Adaptá `guion.ts` (las líneas, sus ids y cuáles llevan `pausa: true`) con pruebas en `video/test/`: el texto tiene que salir del motor.
3. Adaptá la composición. Usá las piezas de `video/src/piezas/` y los componentes del sitio con `@site/...`. Todo movimiento sale de `useCurrentFrame()` y de `linea.cuando(id, palabra)`, nunca de animaciones CSS. No pongas nada legible debajo de y = 512 (20 % inferior): ahí van los botones de la red.
4. Registrala en `video/src/Root.tsx` y agregá su tipo al esquema de `video/src/lib/episodio.ts`.
5. Probá con `npm run reel -- <episodio> --studio`, después `cd video && npm test && npm run typecheck`.
