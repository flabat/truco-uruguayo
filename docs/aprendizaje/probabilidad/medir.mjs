import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { iniciarMano } from "@eltruco/motor/mano.ts";
import { repartir } from "@eltruco/motor/reparto.ts";
import { capturarReplay } from "@eltruco/motor/replay.ts";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:4322/");
const repeticiones = 10;
const viewport = { width: 360, height: 780 };
const mano = {
  version: 1, replay: capturarReplay(iniciarMano(repartir(217, 3))),
  pausa: null, seleccion: [], cursor: null, mensaje: "",
};
const navegador = await chromium.launch();
const recursos = new Map();
const porPagina = new WeakMap();
let renderizadorReact;
const tiempos = {};
function anotar(nombre, valor) {
  (tiempos[nombre] ??= []).push(valor);
}

// Se mide desde la entrega del clic al control hasta el cambio del DOM y
// hasta el segundo frame (una oportunidad de repintar entre ambos).
function accionar(control, selector, aparece = true) {
  return control.evaluate((boton, { selector, aparece }) => new Promise((resolve, reject) => {
    const inicio = performance.now();
    let encontrado = false;
    const observar = () => {
      if (encontrado || Boolean(document.querySelector(selector)) !== aparece) return;
      encontrado = true;
      observer.disconnect();
      const dom = performance.now() - inicio;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(tope);
        resolve({ dom, visual: performance.now() - inicio });
      }));
    };
    const observer = new MutationObserver(observar);
    const tope = setTimeout(() => { observer.disconnect(); reject(new Error(selector)); }, 20000);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    boton.click();
    observar();
  }), { selector, aparece });
}

async function pagina(escena, ruta) {
  const contexto = await navegador.newContext({ viewport, reducedMotion: "reduce" });
  const pagina = await contexto.newPage();
  const urls = new Set();
  porPagina.set(pagina, urls);
  const cdp = await contexto.newCDPSession(pagina);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  pagina.on("request", req => {
    const url = new URL(req.url());
    if (/\.(js|css)$/.test(url.pathname)) {
      urls.add(url.href);
      if (!recursos.has(escena)) recursos.set(escena, new Set());
      recursos.get(escena).add(url.href);
    }
  });
  await pagina.addInitScript(dato => {
    sessionStorage.setItem("truco-oriental.mano-guiada.v1", JSON.stringify(dato));
    window.pedidos = [];
    window.Worker = class extends Worker {
      constructor(url, opciones) {
        super(url, opciones);
        const pedido = { url: new URL(url, location.href).href, inicio: performance.now() };
        window.pedidos.push(pedido);
        this.addEventListener("message", ({ data }) => {
          if (data.tipo === "resultado") {
            pedido.ms = performance.now() - pedido.inicio;
            pedido.mundos = data.resultado.mundos;
          }
        });
      }
    };
  }, mano);
  await pagina.goto(new URL(ruta, base).href, { waitUntil: "load" });
  const carga = await pagina.evaluate(() => performance.getEntriesByType("navigation")[0].loadEventEnd);
  anotar(escena + ".carga", carga);
  return pagina;
}

async function pruebaMano() {
  const p = await pagina("mano", "aprender/mano/");
  try {
    const comparar = p.locator("#comparar-mis-cartas");
    await comparar.waitFor({ state: "visible" });
    assert.equal(await p.evaluate(() => window.pedidos.length), 0);
    recursos.set("mano antes de consultar", new Set(porPagina.get(p)));
    const selector = "#panel-chances:not([hidden]) tbody tr";
    const frio = await accionar(comparar, selector);
    const [pedido] = await p.evaluate(() => window.pedidos);
    assert.equal(pedido.mundos, 4096);
    anotar("practica.worker", pedido.ms);
    anotar("practica.frio", frio.dom);
    await comparar.click();
    const cache = await accionar(comparar, selector);
    assert.equal(await p.evaluate(() => window.pedidos.length), 1);
    anotar("practica.cache", cache.dom);
  } finally { await p.context().close(); }
}

async function pruebaLeccion() {
  const p = await pagina("leccion", "aprender/probabilidad/");
  try {
    await p.locator("astro-island:not([ssr])").first().waitFor({ state: "attached" });
    renderizadorReact = new URL(await p.locator("astro-island").getAttribute("renderer-url"), p.url()).href;
    await p.waitForFunction(() => window.pedidos.length === 1);
    const boton = name => p.getByRole("button", { name, exact: true });
    await boton("Ver chances").click();
    const cancelar = boton("Cancelar el cálculo");
    await cancelar.evaluate(el => el.dataset.midiendo = "cancelar");
    const cancelacion = await accionar(cancelar, '[data-midiendo="cancelar"]', false);
    anotar("cancelar.visual", cancelacion.visual);
    assert.ok(await boton("Ocultar chances").evaluate(el => el === document.activeElement));

    const segunda = boton("La segunda vuelta");
    const inicio = await segunda.evaluate(el => {
      const inicio = performance.now();
      el.click();
      return inicio;
    });
    const opciones = p.getByRole("group", { name: "Tus cartas en mano" }).getByRole("button");
    const seleccion = await accionar(opciones.first(), ".mesa-naipes button[aria-pressed='true']");
    anotar("seleccionar.visual", seleccion.visual);
    await boton("Ver chances").click();
    const filas = ".prob-interactiva .prob-resultados tbody tr";
    await p.locator(filas).first().waitFor();
    const pedido = await p.evaluate(() => window.pedidos.at(-1));
    assert.equal(pedido.mundos, 1175);
    anotar("segunda.worker", pedido.ms);
    anotar("segunda.desdeEntrada", pedido.inicio + pedido.ms - inicio);
    await segunda.click();
    const cache = await accionar(boton("Ver chances"), filas);
    anotar("segunda.cache", cache.dom);
    assert.equal(await p.evaluate(() => window.pedidos.length), 2);
    const worker = new URL(pedido.url);
    assert.ok(worker.pathname.startsWith(base.pathname));
    recursos.get("leccion").add(worker.href);
  } finally { await p.context().close(); }
}

try {
  for (let i = 0; i < repeticiones; i++) {
    await pruebaMano();
    await pruebaLeccion();
  }
  const general = await pagina("aprender", "aprender/");
  try { assert.equal(await general.evaluate(() => window.pedidos.length), 0); }
  finally { await general.context().close(); }
  assert.ok(recursos.get("leccion").has(renderizadorReact));
  assert.ok(!recursos.get("mano").has(renderizadorReact));
  assert.ok(!recursos.get("aprender").has(renderizadorReact));
  const pedido = await navegador.newContext();
  const comprimidos = {};
  try {
    for (const [escena, urls] of recursos) {
      comprimidos[escena] = {};
      for (const url of [...urls].sort()) {
        const respuesta = await pedido.request.get(url);
        assert.ok(respuesta.ok(), url);
        comprimidos[escena][new URL(url).pathname.split("/").pop()] = gzipSync(await respuesta.body()).length;
      }
    }
  } finally { await pedido.close(); }
  const resumen = Object.fromEntries(Object.entries(tiempos).map(([clave, muestra]) => {
    const orden = [...muestra].sort((a, b) => a - b);
    return [clave, { mediana: (orden[Math.floor((orden.length - 1) / 2)] + orden[Math.floor(orden.length / 2)]) / 2,
      p95: orden[Math.ceil(0.95 * orden.length) - 1] }];
  }));
  console.log(JSON.stringify({ chromium: navegador.version(), viewport, cpu: "CDP 4× al target de página", repeticiones, resumen, comprimidos }, null, 2));
} finally { await navegador.close(); }
