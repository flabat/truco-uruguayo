import { Platform } from "react-native";

/** CanvasKit se sirve junto a la exportación web, en /app/canvaskit.wasm (lo copia scripts/copiar-canvaskit.mjs). */
export const opcionesCanvasKit = { locateFile: (archivo: string) => "/app/" + archivo };

let carga: Promise<void> | undefined;

/** En la web descarga y arranca CanvasKit una sola vez; en las apps Skia ya viene en el binario. */
export function cargarCanvasKit(): Promise<void> {
  if (Platform.OS !== "web") return Promise.resolve();
  carga ??= import("@shopify/react-native-skia/lib/module/web")
    .then(({ LoadSkiaWeb }) => LoadSkiaWeb(opcionesCanvasKit))
    .catch(error => {
      carga = undefined;
      throw error;
    });
  return carga;
}
