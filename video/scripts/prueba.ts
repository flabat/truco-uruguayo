// Hoja de prueba: cuadros del video en momentos con nombre, para revisarlo de un vistazo.
import sharp from "sharp";

const ancho = 216, alto = 384, margen = 6, rotulo = 22;

export async function hojaDePrueba(cuadros: { imagen: string; etiqueta: string }[], salida: string, columnas = 5) {
  const filas = Math.ceil(cuadros.length / columnas);
  const piezas = await Promise.all(cuadros.map(async ({ imagen, etiqueta }, i) => {
    const x = (i % columnas) * (ancho + margen), y = Math.floor(i / columnas) * (alto + rotulo + margen);
    const texto = etiqueta.replace(/[<&>]/g, "");
    const svg = Buffer.from(`<svg width="${ancho}" height="${rotulo}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="4" y="16" font-family="Helvetica, Arial" font-size="13" fill="#fff">${texto}</text></svg>`);
    return [
      { input: await sharp(imagen).resize(ancho, alto).toBuffer(), left: x, top: y },
      { input: svg, left: x, top: y + alto },
    ];
  }));
  await sharp({ create: { width: columnas * (ancho + margen), height: filas * (alto + rotulo + margen), channels: 3, background: "#333" } })
    .composite(piezas.flat()).jpeg({ quality: 88 }).toFile(salida);
}
