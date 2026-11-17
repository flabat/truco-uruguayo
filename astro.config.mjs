import { defineConfig } from "astro/config";

// GitHub Pages reports the full published URL, including any project subpath.
const pagesUrl = process.env.PAGES_URL ? new URL(process.env.PAGES_URL) : undefined;

export default defineConfig({
  output: "static",
  site: pagesUrl?.origin,
  base: pagesUrl?.pathname ?? "/",
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
