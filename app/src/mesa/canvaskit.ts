// Versión de las apps: Skia ya trae su motor en el binario. La web usa canvaskit.web.ts (Metro elige por extensión).
export const opcionesCanvasKit = { locateFile: (archivo: string) => "/app/" + archivo };

export function cargarCanvasKit(): Promise<void> {
  return Promise.resolve();
}
