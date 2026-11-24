// npm run reel -- <episodio.yaml> [--importar <carpeta>] [--sin-render] [--studio]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { leerEntorno } from "../src/lib/entorno.ts";
import { leerEpisodio } from "../src/lib/episodio.ts";
import { armarLinea } from "../src/lib/linea.ts";
import { generarVoz, importarVoz, type Voz } from "../src/lib/voz.ts";
import { crearSobrescritura } from "../src/webpack.ts";
import { medirSalida, verificarSalida } from "./controles.ts";
import { preparar } from "./plantillas.ts";
import { hojaDePrueba } from "./prueba.ts";

const video = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.dirname(video);
// npm --prefix video cambia el directorio; las rutas del usuario se leen desde donde las escribió.
const desde = process.env.INIT_CWD ?? process.cwd();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { importar: { type: "string" }, "sin-render": { type: "boolean" }, studio: { type: "boolean" } },
});
if (positionals.length !== 1) {
  console.error("Uso: npm run reel -- <episodio.yaml> [--importar <carpeta con noemi-master.wav y words.json>] [--sin-render] [--studio]");
  process.exit(2);
}

async function principal() {
  const ruta = path.resolve(desde, positionals[0]);
  const ep = leerEpisodio(ruta);
  const plantilla = preparar(ep);
  const { lineas } = plantilla;

  let voz: Voz;
  if (values.importar) {
    const carpeta = path.resolve(desde, values.importar);
    voz = await importarVoz(lineas, path.join(carpeta, "noemi-master.wav"), path.join(carpeta, "words.json"), video);
  } else {
    voz = await generarVoz(lineas, { raiz: video, entorno: leerEntorno(repo) });
  }
  const L = armarLinea(lineas, voz.palabras);
  const lista = plantilla.momentos(L);
  const props = { ...plantilla.props, lineas, voz };
  const preparado = path.join(video, "public", "preparado", `${ep.serie}-${ep.id}.json`);
  mkdirSync(path.dirname(preparado), { recursive: true });
  writeFileSync(preparado, JSON.stringify(props));
  console.log(`Guion y voz listos (${L.duracion.toFixed(1)} s): ${path.relative(desde, preparado)}`);

  if (values.studio) {
    spawn("npx", ["remotion", "studio", "src/index.ts", `--props=${preparado}`], { cwd: video, stdio: "inherit" });
    return;
  }
  if (values["sin-render"]) return;

  const salida = path.join(video, "salida", ep.serie, ep.id);
  mkdirSync(salida, { recursive: true });
  const { nombre } = plantilla;
  const mp4 = path.join(salida, nombre + ".mp4");
  const srt = path.join(salida, nombre + ".es.srt");
  let textoSrt = "";

  console.log("Empaquetando…");
  const serveUrl = await bundle({ entryPoint: path.join(video, "src", "index.ts"), webpackOverride: crearSobrescritura(video),
    publicDir: path.join(video, "public") });
  const composition = await selectComposition({ serveUrl, id: plantilla.composicion, inputProps: props });
  let ultimo = -1;
  await renderMedia({
    composition, serveUrl, codec: "h264", outputLocation: mp4, inputProps: props, scale: 3, imageFormat: "jpeg",
    onArtifact: (a) => {
      if (a.filename.endsWith(".srt")) { textoSrt = String(a.content); writeFileSync(srt, a.content); }
    },
    onProgress: ({ progress }) => {
      const paso = Math.floor(progress * 10);
      if (paso !== ultimo) { ultimo = paso; process.stdout.write(`\rRenderizando ${paso * 10} %`); }
    },
  });
  process.stdout.write("\n");

  const respuesta = lista.find(([id]) => id === plantilla.portada) ?? lista[0];
  await renderStill({ composition, serveUrl, inputProps: props, output: path.join(salida, "portada.jpg"),
    frame: Math.round(respuesta[1] * 30), scale: 3, imageFormat: "jpeg" });
  const temporal = mkdtempSync(path.join(tmpdir(), "prueba-"));
  const cuadros = [];
  for (const [etiqueta, t] of lista) {
    const imagen = path.join(temporal, `${cuadros.length}.png`);
    await renderStill({ composition, serveUrl, inputProps: props, output: imagen, frame: Math.min(composition.durationInFrames - 1, Math.round(t * 30)) });
    cuadros.push({ imagen, etiqueta: `${t.toFixed(1)} s · ${etiqueta}` });
  }
  await hojaDePrueba(cuadros, path.join(salida, "prueba.jpg"));
  writeFileSync(path.join(salida, "publicacion.md"), plantilla.publicacion);

  const problemas = verificarSalida(await medirSalida(mp4, video), { linea: L, lineas, srt: textoSrt });
  console.log(`Listo: ${path.relative(desde, salida)}`);
  if (problemas.length) {
    console.error("Problemas en la salida:\n- " + problemas.join("\n- "));
    process.exit(1);
  }
}

principal().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
