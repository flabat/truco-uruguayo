# Editar la baraja Tatú

En [arte/tatu](../../arte/tatu/) hay una fuente SVG por cada una de las 48 cartas de palo, los dos comodines y el reverso. Cada dibujo usa un lienzo de 740 × 1144. El sitio sirve las copias WebP de 384 × 596 en `public/img/cartas/tatu/`.

## De una edición al sitio

Con Node.js 24, ejecutá `npm ci` al preparar el proyecto. Editá la carta o el componente compartido, guardá el SVG y ejecutá desde la raíz del repositorio:

```sh
npm run cartas:generar
npm run cartas:verificar
```

Por ejemplo, para mover una copa en el cuatro, cambiá su posición en [copas-04.svg](../../arte/tatu/copas-04.svg). Para modificar el borde de las doce copas, editá el trazado con ID `marco-copas` en [comun.svg](../../arte/tatu/comun.svg). Los cuatro marcos conservan las pintas del palo: oros tiene el borde continuo, copas tiene un corte, espadas dos y bastos tres. Los índices, las tintas y varios motivos repetidos también están en ese archivo. Las figuras y los adornos propios de cada carta están en su SVG, organizados en grupos que se pueden seleccionar en un editor vectorial.

El exportador incorpora las referencias de cada carta, incluidas las tintas que usa cada motivo. Solo actualiza los WebP afectados. Incluí en el mismo commit las fuentes editadas, los WebP generados y `scripts/tatu/derivados.json`, que registra las huellas de entrada y salida. `npm run check` detecta fuentes o copias desactualizadas. Al ejecutar `npm run build`, también se regeneran los WebP que lo necesiten antes de compilar el sitio.

Para revisar las cartas en un visor sin soporte de componentes externos, o para entregar los dibujos a otra persona, generá un SVG autónomo y un PNG de 740 × 1144 por carta en un directorio aparte:

```sh
npm run cartas:exportar -- /tmp/tatu-exportado
```

Mantené los SVG de trabajo junto a `comun.svg` para conservar sus vínculos al editar. El reverso y el conejo contienen más trazados porque reproducen la trama de tinta. Los SVG autónomos y los PNG son copias de entrega.

## Lámina de referencia

Los contornos y las tintas parten de [Cartas Tatú 50, de GlyphEnjoyer](https://commons.wikimedia.org/wiki/File:Cartas_Tat%C3%BA_50.png), revisión del 21 de marzo de 2026 a las 00:47 UTC, de 10 240 × 4 800 píxeles. La ficha identifica la digitalización como CC0 1.0. La lámina muestra las espadas, bastos, oros y copas, con doce valores por fila. En la última columna están el comodín del tatú, el comodín del conejo y el reverso rojo. [Ejemplar de referencia en Atlas de Naipes](https://www.atlasdenaipes.com/2026/07/naipes-tatu-estilo-paris.html)

Para comparar el dibujo con el escaneo, podés recuperar los PNG originales con Python 3.11 o posterior y Pillow. El extractor comprueba la huella SHA-1 de la lámina y endereza cada carta a partir de las esquinas registradas en `recortes.json`. Si cambia el archivo de Wikimedia, usá la revisión del historial indicada arriba.

```sh
curl -fL 'https://upload.wikimedia.org/wikipedia/commons/0/05/Cartas_Tat%C3%BA_50.png' -o /tmp/tatu-50.png
python3 scripts/tatu/extraer.py /tmp/tatu-50.png --masters /tmp/tatu-escaneado
```

`--samples` limita la extracción a las cinco muestras. Con `--output /tmp/tatu-webp-escaneado` también podés obtener WebP de referencia.
