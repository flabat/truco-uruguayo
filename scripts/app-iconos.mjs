// Genera los íconos y la pantalla de inicio de la app desde public/favicon.svg
// (el 2 de oro de la marca). Usa sharp, sin servicios externos.
//   npm run app:iconos
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "app/assets/icono");
const LADO = 1024;

// Colores de la marca (app/src/tema.ts).
const PANO_CLARO = "#3a614a";
const PANO_OSCURO = "#1c392d";

/** Contenido del favicon (defs y carta) sin la etiqueta <svg> ni el <title>. */
export async function cartaDeLaMarca() {
  const svg = await readFile(join(raiz, "public/favicon.svg"), "utf8");
  const cuerpo = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
  if (!cuerpo) throw new Error("public/favicon.svg no tiene el formato esperado");
  return cuerpo.replace(/<title>[\s\S]*?<\/title>/, "");
}

const lienzo = (contenido) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${LADO}" height="${LADO}" viewBox="0 0 ${LADO} ${LADO}">${contenido}</svg>`;

/**
 * La carta de 80×80 unidades, escalada a `lado` píxeles y centrada. Girada, la
 * carta asoma medio punto por arriba y por abajo de la caja: se deja ver.
 */
const carta = (cuerpo, lado) => {
  const borde = (LADO - lado) / 2;
  return `<svg x="${borde}" y="${borde}" width="${lado}" height="${lado}" viewBox="0 0 80 80" overflow="visible">${cuerpo}</svg>`;
};

const pano = `<defs><radialGradient id="pano" cx="50%" cy="42%" r="70%">
  <stop offset="0" stop-color="${PANO_CLARO}"/><stop offset="1" stop-color="${PANO_OSCURO}"/>
</radialGradient></defs><rect width="${LADO}" height="${LADO}" fill="url(#pano)"/>`;

// Silueta de una sola tinta para el ícono monocromático de Android 13: la carta
// llena y, calados, el filete, los dos oros y los dos números.
const silueta = `<defs><mask id="calado" maskUnits="userSpaceOnUse" x="-5" y="-5" width="90" height="90">
  <g transform="rotate(-8 40 40)">
    <rect x="12.2" y="2.2" width="55.6" height="75.6" rx="6.8" fill="#fff"/>
    <rect x="18" y="8" width="44" height="64" rx="1.7" fill="none" stroke="#000" stroke-width="1.6"/>
    <g fill="#000"><circle cx="40" cy="24" r="12.5"/><circle cx="40" cy="56" r="12.5"/></g>
    <g fill="none" stroke="#fff" stroke-width="1.6"><circle cx="40" cy="24" r="8"/><circle cx="40" cy="56" r="8"/></g>
    <g fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.5 13.2c.2-3.4 5.1-3.7 5.1-.4 0 1.9-2.5 3.7-5.1 6h5.4"/>
      <path d="M20.5 13.2c.2-3.4 5.1-3.7 5.1-.4 0 1.9-2.5 3.7-5.1 6h5.4" transform="rotate(180 40 40)"/>
    </g>
  </g>
</mask></defs><rect x="-5" y="-5" width="90" height="90" fill="#fff" mask="url(#calado)"/>`;

/**
 * Cada archivo de app/assets/icono. `lado` es el tamaño de la caja de 80×80 de
 * la carta: en el adaptativo de Android la carta girada entra en el círculo
 * seguro de 66 dp sobre 108 dp (61 % del lado).
 */
export function iconos(cuerpo) {
  return [
    { archivo: "ios.png", svg: lienzo(pano + carta(cuerpo, 800)), opaco: true },
    { archivo: "android-fondo.png", svg: lienzo(pano), opaco: true },
    { archivo: "android-frente.png", svg: lienzo(carta(cuerpo, 560)) },
    { archivo: "android-monocromo.png", svg: lienzo(carta(silueta, 560)) },
    { archivo: "inicio.png", svg: lienzo(carta(cuerpo, 980)) },
    { archivo: "favicon.png", svg: lienzo(carta(cuerpo, 980)), lado: 196 },
  ];
}

export async function generar() {
  await mkdir(salida, { recursive: true });
  const cuerpo = await cartaDeLaMarca();
  for (const { archivo, svg, opaco, lado } of iconos(cuerpo)) {
    let imagen = sharp(Buffer.from(svg), { density: 72 });
    if (lado) imagen = imagen.resize(lado, lado);
    imagen = opaco ? imagen.flatten({ background: PANO_OSCURO }).removeAlpha() : imagen.ensureAlpha();
    await imagen.png({ compressionLevel: 9 }).toFile(join(salida, archivo));
    console.log(`app/assets/icono/${archivo}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generar();
