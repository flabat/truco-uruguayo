/** CanvasKit se sirve junto a la exportación web, en /jugar/canvaskit.wasm (lo copia scripts/copiar-canvaskit.mjs). */
export const opcionesCanvasKit = { locateFile: (archivo: string) => "/jugar/" + archivo };

let carga: Promise<void> | undefined;

/** Descarga y arranca CanvasKit una sola vez. */
export function cargarCanvasKit(): Promise<void> {
  carga ??= import("@shopify/react-native-skia/lib/module/web")
    .then(({ LoadSkiaWeb }) => LoadSkiaWeb(opcionesCanvasKit))
    .catch(error => {
      carga = undefined;
      throw error;
    });
  return carga;
}
