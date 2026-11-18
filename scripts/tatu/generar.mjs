import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { cartasPorId } from "../../src/lib/cartas.ts";
import { loadLibrary, standalone } from "./svg.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sources = path.join(root, "arte/tatu");
const published = path.join(root, "public/img/cartas/tatu");
const manifestFile = path.join(root, "scripts/tatu/derivados.json");
const ids = [...cartasPorId.keys()].sort();
const size = { width: 384, height: 596, fit: "contain", background: "#00000000" };
const encoding = { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true };
const recipe = JSON.stringify([size, encoding, sharp.versions.sharp, sharp.versions.vips, sharp.versions.webp]);
const hash = (data) => createHash("sha256").update(data).digest("hex");

async function optionalRead(file) {
  try { return await readFile(file); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function replace(file, data) {
  const temp = file + "." + randomUUID() + ".tmp";
  await writeFile(temp, data);
  await rename(temp, file);
}

async function main(args) {
  const mode = args[0] ?? "--generar";
  if (!(["--generar", "--verificar", "--exportar"].includes(mode))
      || (mode === "--exportar" ? args.length !== 2 : args.length > 1))
    throw new Error("Uso: generar.mjs [--generar | --verificar | --exportar DIRECTORIO]");
  const exportDir = mode === "--exportar" ? path.resolve(args[1]) : undefined;
  if (exportDir) {
    for (const reserved of [sources, published]) {
      if (exportDir === reserved || exportDir.startsWith(reserved + path.sep))
        throw new Error("Elegí un directorio de exportación separado de las fuentes y del sitio.");
    }
    await mkdir(exportDir, { recursive: true });
  }

  const names = (await readdir(sources)).filter((f) => f.endsWith(".svg")).sort();
  const expected = [...ids.map((id) => id + ".svg"), "comun.svg"].sort();
  if (names.join() !== expected.join()) throw new Error("Las fuentes SVG no coinciden con el catálogo.");
  if (mode === "--generar") await mkdir(published, { recursive: true });
  const library = loadLibrary(await readFile(path.join(sources, "comun.svg"), "utf8"));
  const previous = JSON.parse((await optionalRead(manifestFile))?.toString() ?? "{}");
  const manifest = {};
  const changed = [];
  for (const id of ids) {
    try {
      const source = await readFile(path.join(sources, id + ".svg"), "utf8");
      const svg = Buffer.from(standalone(source, library));
      if (exportDir) {
        await replace(path.join(exportDir, id + ".svg"), svg);
        await replace(path.join(exportDir, id + ".png"), await sharp(svg).png().toBuffer());
        continue;
      }
      const input = hash(Buffer.concat([Buffer.from(recipe), svg]));
      const file = path.join(published, id + ".webp");
      const webp = await optionalRead(file);
      const output = webp && hash(webp);
      if (output && previous[id]?.fuente === input && previous[id]?.webp === output) {
        manifest[id] = previous[id];
        continue;
      }
      changed.push(id);
      if (mode === "--generar") {
        const data = await sharp(svg).resize(size).webp(encoding).toBuffer();
        await replace(file, data);
        manifest[id] = { fuente: input, webp: hash(data) };
      }
    } catch (error) { throw new Error(id + ": " + error.message, { cause: error }); }
  }

  if (exportDir) return console.log("51 SVG autónomos y 51 PNG en " + exportDir);
  if (mode === "--verificar") {
    if (changed.length || Object.keys(previous).length !== ids.length)
      throw new Error("Derivados desactualizados. Ejecutá npm run cartas:generar. " + changed.join(", "));
    return console.log("51 WebP verificados contra sus fuentes SVG.");
  }
  if (changed.length || Object.keys(previous).length !== ids.length)
    await replace(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(changed.length + " de 51 WebP actualizados." + (changed.length ? " " + changed.join(", ") : ""));
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
