import { spawnSync } from "node:child_process";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

const release = process.env.TRUCO_RELEASE || spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim();
// `npm run vps` publica árboles con cambios sin commit como `<commit>-sucio`.
if (release && !/^[0-9a-f]{40}(-sucio)?$/.test(release)) {
  throw new Error("La revisión de la interfaz debe ser un hash de commit completo, con -sucio opcional.");
}
// Los reportes de jugadas guardan sólo el commit.
const revision = release?.slice(0, 40);

export default defineConfig({
  vite: {
    define: { "import.meta.env.INTERFAZ_COMMIT": JSON.stringify(revision || "") },
  },
  integrations: [react()],
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
