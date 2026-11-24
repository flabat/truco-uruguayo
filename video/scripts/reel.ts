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
import { leerEpisodio, resolverManos, type Episodio, type Mano } from "../src/lib/episodio.ts";
import { armarLinea, type Linea } from "../src/lib/linea.ts";
import { generarVoz, importarVoz, type Voz } from "../src/lib/voz.ts";
import { crearSobrescritura } from "../src/webpack.ts";
import { guionContarTantos } from "../src/plantillas/contar-tantos/guion.ts";
import { medirSalida, verificarSalida } from "./controles.ts";
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

function momentos(ep: Episodio, manos: Mano[], L: Linea): [string, number][] {
  const hay = (id: string) => L.tramos.some((t) => t.id === id);
  const lista: [string, number][] = [["pregunta", L.inicio("pregunta") + 1]];
  if (hay("cartas")) lista.push(["cartas", L.fin("cartas") - 0.3]);
  L.pausas.forEach((p) => lista.push([`pausa ${p.id}`, p.desde + 1]));
  for (const id of ["respuesta1", "respuesta2", "respuesta3"]) if (hay(id)) lista.push([id, L.inicio(id) + 1]);
  if (hay("cambio")) lista.push(["cambio", L.fin("cambio") - 0.2]);
  if (hay("tercera")) lista.push(["tercera", L.fin("tercera") - 0.3]);
  if (hay("valores")) lista.push(["valores", L.inicio("valores") + 1]);
  if (hay("cierre")) lista.push(["cierre", L.inicio("cierre") + 0.6]);
  return lista.sort((a, b) => a[1] - b[1]).slice(0, 10);
}

function publicacion(ep: Episodio, manos: Mano[]): string {
  const sinPrefijo = (c: string) => c.replace(/-0?(\d+)$/, " $1").replace(/^(\w+) (\d+)$/, "$2 de $1");
  const descripcion = manos.map((m, i) => `Mano ${i + 1}: ${m.cartas.map(sinPrefijo).join(", ")}. Da ${m.tantos.total}.`).join(" ");
  return `# ${ep.serie} ${ep.id}

Borrador para publicar. Revisalo antes de subirlo.

## Texto

${ep.gancho} 🧉

Contá las tres manos antes de que aparezca el resultado.

Probá otra mano en eltru.co/aprender/ #TrucoUruguayo

## Texto alternativo

Lección de ${ep.modalidad} con la muestra ${sinPrefijo(ep.muestra)}. ${descripcion}

## Enlace

https://eltru.co/aprender/
`;
}

async function principal() {
  const ruta = path.resolve(desde, positionals[0]);
  const ep = leerEpisodio(ruta);
  const manos = resolverManos(ep);
  const lineas = guionContarTantos(ep, manos);

  let voz: Voz;
  if (values.importar) {
    const carpeta = path.resolve(desde, values.importar);
    voz = await importarVoz(lineas, path.join(carpeta, "noemi-master.wav"), path.join(carpeta, "words.json"), video);
  } else {
    voz = await generarVoz(lineas, { raiz: video, entorno: leerEntorno(repo) });
  }
  const L = armarLinea(lineas, voz.palabras);
  const props = { modalidad: ep.modalidad, muestra: ep.muestra, gancho: ep.gancho, manos, lineas, voz };
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
  const nombre = `Contar ${ep.modalidad} ${ep.id}`;
  const mp4 = path.join(salida, nombre + ".mp4");
  const srt = path.join(salida, nombre + ".es.srt");
  let textoSrt = "";

  console.log("Empaquetando…");
  const serveUrl = await bundle({ entryPoint: path.join(video, "src", "index.ts"), webpackOverride: crearSobrescritura(video),
    publicDir: path.join(video, "public") });
  const composition = await selectComposition({ serveUrl, id: "ContarTantos", inputProps: props });
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

  const lista = momentos(ep, manos, L);
  const respuesta = lista.find(([id]) => id === "respuesta1") ?? lista[0];
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
  writeFileSync(path.join(salida, "publicacion.md"), publicacion(ep, manos));

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
