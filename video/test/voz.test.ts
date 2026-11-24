import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { leerEntorno } from "../src/lib/entorno.ts";
import { claveVoz, generarVoz, importarVoz, palabrasDesdeAlineacion } from "../src/lib/voz.ts";
import type { LineaGuion } from "../src/lib/linea.ts";
import respuesta from "./fixtures/alineacion.json" with { type: "json" };
import envido03 from "./fixtures/envido-03.json" with { type: "json" };

const lineas: LineaGuion[] = [{ id: "saludo", texto: "Hola che." }, { id: "cierre", texto: "Probá otra." }];
const entorno = { ELEVENLABS_API_KEY: "clave-de-prueba", ELEVENLABS_VOICE_ID: "voz-de-prueba" };

/** Una carpeta video/ de mentira: public/ propio y node_modules del paquete real (para ffmpeg). */
function raizTemporal() {
  const raiz = mkdtempSync(path.join(tmpdir(), "voz-"));
  mkdirSync(path.join(raiz, "public"));
  symlinkSync(path.resolve("node_modules"), path.join(raiz, "node_modules"));
  return raiz;
}
function fetchFalso() {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(respuesta), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, llamadas };
}

test("palabrasDesdeAlineacion agrupa por espacios", () => {
  const palabras = palabrasDesdeAlineacion(respuesta.alignment);
  assert.deepEqual(palabras.map((p) => p.text), ["Hola", "che.", "Probá", "otra."]);
  assert.equal(palabras[1].start, 0.2);
  assert.equal(palabras[1].end, 0.36);
});

test("genera la voz y la segunda llamada usa la caché sin red ni clave", async () => {
  const raiz = raizTemporal();
  const { fetch, llamadas } = fetchFalso();
  const voz = await generarVoz(lineas, { raiz, fetch, entorno });
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0].url, /\/v1\/text-to-speech\/voz-de-prueba\/with-timestamps\?output_format=mp3_44100_128$/);
  assert.equal((llamadas[0].init.headers as Record<string, string>)["xi-api-key"], "clave-de-prueba");
  assert.deepEqual(JSON.parse(String(llamadas[0].init.body)), { text: "Hola che. Probá otra.", model_id: "eleven_v4" });
  assert.match(voz.archivo, /^voz\/[0-9a-f]{64}\.wav$/);
  assert.ok(existsSync(path.join(raiz, "public", voz.archivo)));
  assert.equal(voz.palabras.length, 4);

  const otra = await generarVoz(lineas, { raiz, fetch, entorno: { ELEVENLABS_VOICE_ID: "voz-de-prueba" } });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(otra, voz);
});

test("sin clave falla nombrando solo la variable faltante", async () => {
  const { fetch } = fetchFalso();
  await assert.rejects(generarVoz(lineas, { raiz: raizTemporal(), fetch, entorno: { ELEVENLABS_VOICE_ID: "secreto-id" } }),
    (e: Error) => e.message.includes("ELEVENLABS_API_KEY") && !e.message.includes("secreto-id"));
  await assert.rejects(generarVoz(lineas, { raiz: raizTemporal(), fetch, entorno: { ELEVENLABS_API_KEY: "secreta" } }),
    (e: Error) => e.message.includes("ELEVENLABS_VOICE_ID") && !e.message.includes("secreta"));
});

test("importar una voz que no coincide nombra la línea", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "codex-"));
  writeFileSync(path.join(dir, "words.json"), JSON.stringify(envido03.palabras));
  const otras: LineaGuion[] = [{ id: "pregunta", texto: "¿Cuánto tenés de envido?" }, ...envido03.lineas.slice(1)];
  await assert.rejects(importarVoz(otras, path.join(dir, "noemi-master.wav"), path.join(dir, "words.json"), raizTemporal()), /pregunta/);
});

test("la clave cambia si cambia el texto", () => {
  const ajustes = { vozId: "v", modelo: "eleven_v4" };
  assert.notEqual(claveVoz(lineas, ajustes), claveVoz([lineas[0], { id: "cierre", texto: "Probá otra mano." }], ajustes));
  assert.equal(claveVoz(lineas, ajustes), claveVoz(lineas.map((l) => ({ ...l, pausa: true })), ajustes));
});

test("leerEntorno toma el .env y deja que el entorno del proceso mande", () => {
  // Nombres propios de la prueba: una ELEVENLABS_VOICE_ID exportada en la terminal no la altera.
  const [soloArchivo, ambos] = ["TRUCO_PRUEBA_SOLO_ARCHIVO", "TRUCO_PRUEBA_AMBOS"];
  const raiz = mkdtempSync(path.join(tmpdir(), "repo-"));
  writeFileSync(path.join(raiz, ".env"), `# comentario\n${soloArchivo}="de-archivo"\n${ambos}=1\n`);
  const antes = { [soloArchivo]: process.env[soloArchivo], [ambos]: process.env[ambos] };
  delete process.env[soloArchivo];
  process.env[ambos] = "del-proceso";
  try {
    const e = leerEntorno(raiz);
    assert.equal(e[soloArchivo], "de-archivo");
    assert.equal(e[ambos], "del-proceso");
  } finally {
    for (const [nombre, valor] of Object.entries(antes)) {
      if (valor === undefined) delete process.env[nombre]; else process.env[nombre] = valor;
    }
  }
});
