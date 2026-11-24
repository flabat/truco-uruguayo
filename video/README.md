# Reels de El Truco

Este paquete genera los reels de las redes sociales (lecciones cortas de 9:16) a partir de un archivo de episodio. Usa [Remotion](https://www.remotion.dev/) e importa el motor, las cartas y los estilos del sitio desde `../src`. Tiene sus propias dependencias, así que no afecta `npm ci` ni `npm run check` del sitio.

El diseño y sus razones están en [`docs/superpowers/specs/2026-11-23-reels-programaticos-design.md`](../docs/superpowers/specs/2026-11-23-reels-programaticos-design.md).

## Preparar

Con Node.js 24, desde la raíz del repositorio:

```sh
npm run reel:instalar
```

La primera vez que renderiza, Remotion descarga Chrome Headless Shell (unos 140 MB). Trae su propio ffmpeg.

Para generar voz nueva, agregá al `.env` de la raíz tu clave de ElevenLabs y el id de la voz (Noemí Suave Reflexiva):

```sh
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

La voz queda guardada en `video/public/voz/` según el texto, así que volver a renderizar no gasta créditos.

## Generar un reel

```sh
npm run reel -- video/episodios/contar-envido/07.yaml
```

El resultado queda en `video/salida/<serie>/<id>/`:

- `Contar envido 07.mp4` (o `Comparar cartas 01.mp4`): 1080 × 1920, 30 fps, H.264 y AAC.
- `Contar envido 07.es.srt`: subtítulos en español.
- `portada.jpg`: el cuadro del primer resultado.
- `prueba.jpg`: diez cuadros en momentos con nombre, para revisar.
- `publicacion.md`: borrador del texto, texto alternativo y enlace.

Antes de terminar, el comando controla la duración, la pista de audio, las pausas para contar y que los subtítulos digan la narración. Si algo falla, lo informa y sale con código 1.

Opciones:

- `--studio`: abre Remotion Studio con el episodio para revisarlo cuadro por cuadro.
- `--sin-render`: prepara el guion y la voz, sin renderizar.
- `--importar <carpeta>`: usa una grabación existente (`noemi-master.wav` y `words.json`) en lugar de ElevenLabs. Las líneas del episodio tienen que coincidir palabra por palabra.

## El archivo de episodio

```yaml
plantilla: contar-tantos
serie: contar-envido
id: "07"
modalidad: envido                                # envido o flor
muestra: bastos-06
gancho: "¿Cuánto tenés de envido?"
manos:
  - [copas-04, copas-07, espadas-01]             # mano escrita
  - cambio: { de: copas-04, a: bastos-04 }       # la segunda cambia una carta de la primera
  - { familia: tres-palos-distintos, semilla: 7 } # mano generada por el motor
lineas:                                          # opcional
  valores: null                                  # quita una línea
```

### Comparar cartas

```yaml
plantilla: comparar-cartas
serie: comparar-cartas
id: "01"
muestra: bastos-06
gancho: "¿Cuál gana la vuelta?"
vueltas:                                         # de dos a cuatro vueltas con la misma muestra
  - [bastos-02, espadas-01]                      # vuelta escrita
  - [espadas-07, copas-07]
  - { familia: empate, semilla: 3 }              # vuelta generada por el motor
```

En cada vuelta la voz nombra las dos cartas y pregunta «¿Cuál gana?». Después de la pausa, la ganadora se resalta y la otra se apaga. En una parda las dos quedan resaltadas con el rótulo «Parda». La ganadora sale de `compararCartas` (`src/motor/jerarquia.ts`) y la explicación de una parda, de `explicarSituacion`. Las familias son `gana-el-mayor`, `gana-el-menor`, `empate` y `mismo-numero-distinta-fuerza`. Las líneas son `pregunta`, `vuelta1`, `respuesta1`, …, `escala` y `cierre`. Si una `respuesta*` reescrita no empieza con «Gana el …» o «Parda.» según el motor, el comando falla antes de pedir la voz.

### Familias

Las familias de contar tantos son las de las lecciones (`src/aprendizaje/generadores/familias.ts`): para envido, `dos-del-mismo-palo`, `tres-palos-distintos`, `una-pieza` y `selecciones-equivalentes`; para flor, `tres-del-mismo-palo`, `una-pieza-y-dos-del-mismo-palo`, `dos-piezas` y `tres-piezas`.

El guion sale del motor. Si reescribís una línea de respuesta con un total distinto del que calcula el motor, el comando falla antes de pedir la voz.

## Desarrollo

```sh
cd video
npm test          # lógica pura: números, línea de tiempo, episodios, guiones, voz, controles
npm run typecheck
npm run studio    # Studio con un ejemplo sin audio
```

La guía para agregar una plantilla está en [`.claude/skills/reel/SKILL.md`](../.claude/skills/reel/SKILL.md).
