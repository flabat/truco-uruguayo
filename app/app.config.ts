/// <reference types="node" />
// Completa app.json con el número de build de las tiendas. La versión visible
// (`version`) sigue en app.json; el número de build es la cantidad de commits
// del repositorio, que solo crece en main. TRUCO_BUILD lo fija a mano, por
// ejemplo en un checkout sin historia.
import { execFileSync } from "node:child_process";
import type { ConfigContext, ExpoConfig } from "expo/config";

export function numeroDeBuild(entorno: NodeJS.ProcessEnv = process.env, git: () => string = commitsDelRepositorio): number {
  const fijo = entorno.TRUCO_BUILD?.trim();
  if (fijo) {
    const numero = Number(fijo);
    if (!Number.isInteger(numero) || numero < 1) throw new Error(`TRUCO_BUILD debe ser un entero positivo: ${fijo}`);
    return numero;
  }
  try {
    const numero = Number(git().trim());
    if (Number.isInteger(numero) && numero > 0) return numero;
  } catch {
    // Sin git (por ejemplo, la imagen de Docker que exporta la web): el número no se usa.
  }
  return 1;
}

function commitsDelRepositorio(): string {
  const git = (...argumentos: string[]) =>
    execFileSync("git", argumentos, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (git("rev-parse", "--is-shallow-repository").trim() === "true") throw new Error("Checkout sin historia completa");
  return git("rev-list", "--count", "HEAD");
}

export default function configuracion({ config }: ConfigContext): ExpoConfig {
  const build = numeroDeBuild();
  return {
    ...(config as ExpoConfig),
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build },
  };
}
