// Lo comparten remotion.config.ts (Studio y CLI) y scripts/reel.ts (bundle()).
// remotion.config.ts se compila a CommonJS, así que quien llama pasa la carpeta video/.
import path from "node:path";
import type { WebpackOverrideFn } from "@remotion/bundler";

/** Apunta @site al src/ del sitio y deja un solo React para los componentes del sitio y Remotion. */
export function crearSobrescritura(carpetaVideo: string): WebpackOverrideFn {
  const modulo = (nombre: string) => path.join(carpetaVideo, "node_modules", nombre);
  return (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias as Record<string, string> | undefined),
        "@site": path.join(carpetaVideo, "..", "src"),
        react: modulo("react"),
        "react-dom": modulo("react-dom"),
      },
    },
  });
}
