# Recortes de la baraja Tatú

La fuente es [Cartas Tatú 50, de GlyphEnjoyer](https://commons.wikimedia.org/wiki/File:Cartas_Tat%C3%BA_50.png), revisión del 21 de marzo de 2026 a las 00:47 UTC, de 10 240 × 4 800 píxeles. La ficha identifica la digitalización como CC0 1.0. La lámina muestra las espadas, bastos, oros y copas, con doce valores por fila. En la última columna están el comodín del tatú, el comodín del conejo y el reverso rojo. La tercera casilla de esa columna está vacía. [Ejemplar de referencia en Atlas de Naipes](https://www.atlasdenaipes.com/2026/07/naipes-tatu-estilo-paris.html)

Desde la raíz del proyecto, con Python 3.11 o posterior y Pillow con soporte WebP (exportación verificada con Pillow 13.0.0), ejecutá los siguientes comandos.

```sh
curl -fL 'https://upload.wikimedia.org/wikipedia/commons/0/05/Cartas_Tat%C3%BA_50.png' -o /tmp/tatu-50.png
python3 scripts/tatu/extraer.py /tmp/tatu-50.png --samples --masters /tmp/tatu-png
python3 scripts/tatu/extraer.py /tmp/tatu-50.png --masters /tmp/tatu-png
```

El exportador comprueba la huella SHA-1 de la edición antes de escribir. Si cambia el archivo de Wikimedia, descargá la revisión indicada desde el historial de la ficha. En `recortes.json` cada entrada contiene las cuatro esquinas del papel en píxeles de la lámina, desde la superior izquierda en sentido antihorario. Las coordenadas medidas dejan un margen de dos píxeles hacia dentro para retirar el halo del fondo. El exportador endereza cada carta, hace transparente el fondo exterior y la centra conservando sus proporciones en un lienzo WebP de 384 × 596. Los PNG maestros conservan la resolución de cada recorte.

La primera ejecución escribe el 4, el 5 y el rey de copas, el as de espadas y el reverso. La segunda produce los 51 archivos en `public/img/cartas/tatu/`. Usá `--output` para comparar una exportación en otro directorio. Los archivos web se sirven directamente. El sitio se compila sin descargar la lámina ni ejecutar el exportador.
