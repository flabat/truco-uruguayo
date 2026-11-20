import { spawnSync } from "node:child_process";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

const revision = process.env.TRUCO_RELEASE || spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim();
if (revision && !/^[0-9a-f]{40}$/.test(revision)) {
  throw new Error("La revisión de la interfaz debe ser un hash de commit completo.");
}

export default defineConfig({
  vite: {
    define: { "import.meta.env.INTERFAZ_COMMIT": JSON.stringify(revision || "") },
  },
  integrations: [react()],
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
