import { asientoDeAbajo, formaDe, jugadores, lugarDe, rivalDelDuelo, validar } from "./asientos.ts";
import { cajaDeCarta, seCortan, unir } from "./rect.ts";
import type { Carta, EntradaMesa, Forma, Geometria, GeometriaAsiento, Lugar, Punto, Rect } from "./tipos.ts";

/** Alto sobre ancho de las cartas Tatú (384 × 596). */
const proporcion = 596 / 384;
const corteEscritorio = 1024;
const aire = 4;
const anchoMinimoMano = 56;
const jugadaMinima = 26;

interface Medidas {
  margen: number;
  barra: number;
  lance: number;
  estado: number;
  fila: number;
  tira: number;
  rotulo: { ancho: number; alto: number };
  circulo: { ancho: number; alto: number };
  punto: { ancho: number; alto: number };
  rotuloPropio: { ancho: number; alto: number };
  cantos: { ancho: number; alto: number };
  rotuloMazo: number;
}

const telefono: Medidas = {
  margen: 8, barra: 44, lance: 24, estado: 48, fila: 48, tira: 56,
  rotulo: { ancho: 104, alto: 32 },
  circulo: { ancho: 76, alto: 44 },
  punto: { ancho: 64, alto: 30 },
  rotuloPropio: { ancho: 160, alto: 32 },
  cantos: { ancho: 116, alto: 40 },
  rotuloMazo: 22,
};

const escritorio: Medidas = {
  ...telefono,
  margen: 16, barra: 52, estado: 56, fila: 56, tira: 0,
  rotulo: { ancho: 132, alto: 36 },
};

type Fila = 0 | 1 | 2 | 3;
type Columna = "izquierda" | "centro" | "derecha";

/** Un asiento ubicado en una celda del paño. */
interface Pieza {
  asiento: number;
  forma: Forma;
  fila: Fila;
  columna: Columna;
}

interface Contexto {
  e: EntradaMesa;
  n: 2 | 4 | 6;
  abajo: number;
  med: Medidas;
  /** Asientos del paño (todos menos el de abajo), con su celda. */
  piezas: Pieza[];
  /** Si el de abajo tiene su carta jugada en la fila 3. */
  jugadaDeAbajo: boolean;
}

const celdas: Readonly<Record<Exclude<Lugar, "abajo">, readonly [Fila, Columna]>> = {
  frente: [1, "centro"],
  "lejos-izquierda": [1, "izquierda"],
  "lejos-derecha": [1, "derecha"],
  derecha: [2, "derecha"],
  izquierda: [2, "izquierda"],
  "cerca-derecha": [2, "derecha"],
  "cerca-izquierda": [2, "izquierda"],
};

function armarContexto(e: EntradaMesa, med: Medidas): Contexto {
  const n = jugadores(e.modalidad);
  const abajo = asientoDeAbajo(e);
  const rival = rivalDelDuelo(e);
  const piezas: Pieza[] = [];
  for (let asiento = 0; asiento < n; asiento++) {
    if (asiento === abajo) continue;
    const { forma } = formaDe(e, asiento);
    const lugar = lugarDe(asiento, abajo, n) as Exclude<Lugar, "abajo">;
    let [fila, columna] = celdas[lugar];
    if (rival != null) {
      if (asiento === rival) [fila, columna] = [1, "centro"];
      else if (forma === "completo") [fila, columna] = [3, "centro"]; // el compañero que juega el duelo
      else if (fila === 1) fila = 0;
    }
    piezas.push({ asiento, forma, fila, columna });
  }
  return { e, n, abajo, med, piezas, jugadaDeAbajo: formaDe(e, abajo).activo };
}

// Medidas de cada cosa a partir de la carta jugada `j`.

function tamanoJugada(forma: Forma, j: number): number {
  return forma === "circulo" ? 0.72 * j : j;
}

function tamanoDorso(forma: Forma, j: number): number {
  return forma === "circulo" ? 0.45 * j : 0.6 * j;
}

function anchoDorsos(dorso: number, cantidad: number): number {
  return cantidad === 0 ? 0 : dorso * (1 + 0.55 * (cantidad - 1));
}

function tamanoRotulo(forma: Forma, med: Medidas): { ancho: number; alto: number } {
  return forma === "completo" ? med.rotulo : forma === "circulo" ? med.circulo : med.punto;
}

function tamanoPieza(forma: Forma, j: number, med: Medidas): { ancho: number; alto: number } {
  const rotulo = tamanoRotulo(forma, med);
  if (forma === "punto") return rotulo;
  const jugada = tamanoJugada(forma, j);
  return {
    ancho: Math.max(rotulo.ancho, jugada, anchoDorsos(tamanoDorso(forma, j), 3)),
    alto: rotulo.alto + aire + jugada * proporcion,
  };
}

function tamanoMazo(j: number, med: Medidas): { ancho: number; alto: number; muestra: number } {
  const muestra = 0.8 * j;
  return {
    muestra,
    ancho: Math.max(muestra * (0.35 + proporcion), 72),
    alto: muestra * proporcion + 2 + med.rotuloMazo,
  };
}

/** Alto de cada fila del paño; null si la fila queda vacía. */
function altosDeFilas(ctx: Contexto, j: number): (number | null)[] {
  const altos: (number | null)[] = [null, null, null, null];
  for (const p of ctx.piezas) {
    altos[p.fila] = Math.max(altos[p.fila] ?? 0, tamanoPieza(p.forma, j, ctx.med).alto);
  }
  altos[3] = Math.max(altos[3] ?? 0, ctx.jugadaDeAbajo ? j * proporcion : 0, tamanoMazo(j, ctx.med).alto);
  return altos;
}

function altoDelPano(ctx: Contexto, j: number): number {
  const altos = altosDeFilas(ctx, j).filter((a): a is number => a != null);
  return altos.reduce((s, a) => s + a, 0) + aire * (altos.length + 1);
}

function entraDeAncho(ctx: Contexto, j: number, ancho: number): boolean {
  for (const fila of [0, 1, 2, 3] as const) {
    const anchos = { izquierda: 0, centro: 0, derecha: 0 };
    for (const p of ctx.piezas.filter(p => p.fila === fila)) anchos[p.columna] = tamanoPieza(p.forma, j, ctx.med).ancho;
    if (fila === 3 && ctx.jugadaDeAbajo) anchos.centro = Math.max(anchos.centro, j);
    const lado = Math.max(anchos.izquierda, anchos.derecha);
    const necesario = anchos.centro > 0 ? anchos.centro + 2 * (lado + (lado > 0 ? aire : 0)) : anchos.izquierda + anchos.derecha + aire;
    if (necesario > ancho) return false;
  }
  return true;
}

// La mano en abanico.

const rotaciones: Readonly<Record<number, readonly number[]>> = { 0: [], 1: [0], 2: [-5, 5], 3: [-9, 0, 9] };

function abanico(cantidad: number, ancho: number, centroX: number, centroY: number): Carta[] {
  const alto = ancho * proporcion;
  return rotaciones[cantidad].map((rotacion, i) => {
    const cx = centroX + (i - (cantidad - 1) / 2) * 0.72 * ancho;
    const cy = centroY + (rotacion === 0 ? 0 : 0.06 * ancho);
    return { x: cx - ancho / 2, y: cy - alto / 2, ancho, alto, rotacion };
  });
}

/** La caja del abanico de tres alrededor de (0, 0): fija el lugar aunque queden menos cartas. */
function cajaDelAbanico(ancho: number): Rect {
  return unir(abanico(3, ancho, 0, 0).map(cajaDeCarta));
}

/** Alto de la franja de abajo: la mano del jugador, o el asiento de abajo para el espectador. */
function altoDeFranja(ctx: Contexto, ancho: number): number {
  if (ctx.e.propio == null) {
    const j = 0.45 * ancho;
    return formaDe(ctx.e, ctx.abajo).activo
      ? ctx.med.rotulo.alto + aire + tamanoDorso("completo", j) * proporcion + 2 * aire
      : ctx.med.punto.alto + 2 * aire;
  }
  return cajaDelAbanico(ancho).alto + 2 * aire;
}

function topeDeMano(escritorioActivo: boolean, util: number): number {
  return escritorioActivo ? Math.min(140, 0.24 * util) : Math.min(150, 0.27 * util, util / 2.7);
}

/** El mayor valor en [desde, hasta] que cumple `sirve` (monótono), o `desde` si ninguno cumple. */
function mayorQueSirve(desde: number, hasta: number, sirve: (v: number) => boolean): number {
  if (hasta <= desde || sirve(hasta)) return Math.max(desde, hasta);
  let bajo = desde;
  let alto = hasta;
  for (let i = 0; i < 20; i++) {
    const medio = (bajo + alto) / 2;
    if (sirve(medio)) bajo = medio;
    else alto = medio;
  }
  return bajo;
}

// Ubicación de las piezas del paño.

interface Ubicado {
  geometria: GeometriaAsiento;
  caja: Rect;
}

function ubicarPieza(ctx: Contexto, p: Pieza, x: number, y: number, j: number, tamano: { ancho: number; alto: number }): Ubicado {
  const rotulo = tamanoRotulo(p.forma, ctx.med);
  const caja = { x, y, ...tamano };
  const geo: GeometriaAsiento = {
    asiento: p.asiento,
    lugar: lugarDe(p.asiento, ctx.abajo, ctx.n),
    forma: p.forma,
    activo: formaDe(ctx.e, p.asiento).activo,
    rotulo: { x: x + (tamano.ancho - rotulo.ancho) / 2, y, ...rotulo },
    dorsos: [],
    jugada: null,
    ancla: { x: x + tamano.ancho / 2, y: y + tamano.alto / 2 },
  };
  if (p.forma !== "punto") {
    const arriba = y + rotulo.alto + aire;
    const jugada = tamanoJugada(p.forma, j);
    geo.jugada = { x: x + (tamano.ancho - jugada) / 2, y: arriba, ancho: jugada, alto: jugada * proporcion, rotacion: 0 };
    geo.dorsos = dorsos(ctx.e.cartas[p.asiento], tamanoDorso(p.forma, j), x + tamano.ancho / 2, arriba);
  }
  return { geometria: geo, caja };
}

function dorsos(cantidad: number, ancho: number, centroX: number, arriba: number): Carta[] {
  const inicio = centroX - anchoDorsos(ancho, cantidad) / 2;
  return Array.from({ length: cantidad }, (_, i) => ({
    x: inicio + i * 0.55 * ancho, y: arriba, ancho, alto: ancho * proporcion, rotacion: 0,
  }));
}

interface Pano {
  ubicados: Ubicado[];
  jugadaDeAbajo: Carta | null;
}

function ubicarPano(ctx: Contexto, pano: Rect, j: number): Pano {
  const altos = altosDeFilas(ctx, j);
  const presentes = altos.filter((a): a is number => a != null);
  const hueco = (pano.alto - presentes.reduce((s, a) => s + a, 0)) / (presentes.length + 1);
  const arribaDeFila: number[] = [];
  let y = pano.y + hueco;
  for (const alto of altos) {
    arribaDeFila.push(y);
    if (alto != null) y += alto + hueco;
  }
  const ubicados = ctx.piezas.map(p => {
    const tamano = tamanoPieza(p.forma, j, ctx.med);
    const x = p.columna === "izquierda" ? pano.x
      : p.columna === "derecha" ? pano.x + pano.ancho - tamano.ancho
      : pano.x + (pano.ancho - tamano.ancho) / 2;
    return ubicarPieza(ctx, p, x, arribaDeFila[p.fila], j, tamano);
  });
  const fila3 = altos[3] ?? 0;
  const jugadaDeAbajo = ctx.jugadaDeAbajo
    ? { x: pano.x + (pano.ancho - j) / 2, y: arribaDeFila[3] + (fila3 - j * proporcion) / 2, ancho: j, alto: j * proporcion, rotacion: 0 }
    : null;
  return { ubicados, jugadaDeAbajo };
}

// El mazo.

function inflar(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, ancho: r.ancho + 2 * d, alto: r.alto + 2 * d };
}

function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Busca el hueco más cercano a quien dio, a su derecha, del lado de quien es mano. */
function buscarMazo(pano: Rect, tamano: { ancho: number; alto: number }, obstaculos: readonly Rect[], dador: Punto, mano: Punto): Rect | null {
  const centro = { x: pano.x + pano.ancho / 2, y: pano.y + pano.alto / 2 };
  const largo = distancia(centro, dador) || 1;
  const derecha = { x: -(centro.y - dador.y) / largo, y: (centro.x - dador.x) / largo };
  const paso = 4;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = pano.x; x <= pano.x + pano.ancho - tamano.ancho; x += paso) xs.push(x);
  for (let y = pano.y; y <= pano.y + pano.alto - tamano.alto; y += paso) ys.push(y);
  xs.push(pano.x + pano.ancho - tamano.ancho);
  ys.push(pano.y + pano.alto - tamano.alto);
  const conAire = obstaculos.map(o => inflar(o, aire));
  let mejor: Rect | null = null;
  let puntaje = Infinity;
  for (const y of ys) {
    for (const x of xs) {
      if (x < pano.x || y < pano.y) continue;
      const caja = { x, y, ...tamano };
      const c = { x: x + tamano.ancho / 2, y: y + tamano.alto / 2 };
      if ((c.x - dador.x) * derecha.x + (c.y - dador.y) * derecha.y <= 1) continue;
      const p = distancia(c, dador) + 0.5 * distancia(c, mano);
      if (p >= puntaje || conAire.some(o => seCortan(o, caja))) continue;
      mejor = caja;
      puntaje = p;
    }
  }
  return mejor;
}

function armarMazo(caja: Rect, j: number, med: Medidas): Geometria["mazo"] {
  const { muestra: m } = tamanoMazo(j, med);
  const visual = m * (0.35 + proporcion);
  const izquierda = caja.x + (caja.ancho - visual) / 2;
  const muestra = { x: izquierda, y: caja.y, ancho: m, alto: m * proporcion, rotacion: 0 };
  // El mazo cruzado: su caja visual (m·1,552 × m) arranca corrida 0,35 m y 0,55 m.
  const cx = izquierda + 0.35 * m + (m * proporcion) / 2;
  const cy = caja.y + 0.55 * m + m / 2;
  const mazo = { x: cx - m / 2, y: cy - (m * proporcion) / 2, ancho: m, alto: m * proporcion, rotacion: 90 };
  const rotulo = { x: caja.x, y: caja.y + m * proporcion + 2, ancho: caja.ancho, alto: med.rotuloMazo };
  return { muestra, mazo, rotulo };
}

function cajaDeAsiento(a: GeometriaAsiento): Rect | null {
  const partes = [a.rotulo, a.jugada && cajaDeCarta(a.jugada), ...a.dorsos.map(cajaDeCarta)].filter((r): r is Rect => r != null);
  return partes.length > 0 ? unir(partes) : null;
}

// La mesa entera.

export function calcularMesa(e: EntradaMesa): Geometria {
  validar(e);
  const esEscritorio = e.ancho >= corteEscritorio;
  const med = esEscritorio ? escritorio : telefono;
  const ctx = armarContexto(e, med);
  const pantalla = { x: 0, y: 0, ancho: e.ancho, alto: e.alto };

  const anchoPanel = esEscritorio ? Math.min(320, Math.max(240, 0.2 * e.ancho)) : 0;
  const columna = { x: anchoPanel, y: 0, ancho: e.ancho - 2 * anchoPanel, alto: e.alto };
  const paneles = esEscritorio
    ? { izquierdo: { x: 0, y: 0, ancho: anchoPanel, alto: e.alto }, derecho: { x: e.ancho - anchoPanel, y: 0, ancho: anchoPanel, alto: e.alto } }
    : null;
  const x0 = columna.x + med.margen;
  const util = columna.ancho - 2 * med.margen;

  const barra = { x: columna.x, y: 0, ancho: columna.ancho, alto: med.barra };
  let arriba = med.barra;
  const lance = e.modalidad === "3v3" ? { x: x0, y: arriba, ancho: util, alto: med.lance } : null;
  if (lance) arriba += med.lance;
  const tira = esEscritorio ? null : { x: columna.x, y: e.alto - med.tira, ancho: columna.ancho, alto: med.tira };

  // Sin hoja: mano, fila inferior y tira. Con hoja: la mano chica apoyada sobre la hoja.
  const debajoSinHoja = med.fila + (tira ? tira.alto : 0);
  const panoPara = (ancho: number, abajoLibre: number) => e.alto - arriba - med.estado - altoDeFranja(ctx, ancho) - abajoLibre - aire;
  const entra = (j: number, altoPano: number) => altoDelPano(ctx, j) <= altoPano && entraDeAncho(ctx, j, util);

  const tope = topeDeMano(esEscritorio, util);
  let anchoMano = mayorQueSirve(anchoMinimoMano, tope, w => entra(0.45 * w, panoPara(w, debajoSinHoja)));
  const jMaxima = 0.45 * anchoMano;

  let hoja: Rect | null = null;
  let abajoLibre = debajoSinHoja;
  if (e.hoja) {
    anchoMano = Math.min(84, Math.max(anchoMinimoMano, 0.62 * anchoMano));
    const libre = panoPara(anchoMano, 0) - altoDelPano(ctx, jugadaMinima);
    const alto = Math.max(0, Math.min(e.hoja.alto, libre));
    hoja = { x: columna.x, y: e.alto - alto, ancho: columna.ancho, alto };
    abajoLibre = alto;
  }

  const altoFranja = altoDeFranja(ctx, anchoMano);
  const franja = { x: x0, y: e.alto - abajoLibre - altoFranja, ancho: util, alto: altoFranja };
  const estado = { x: x0, y: franja.y - med.estado, ancho: util, alto: med.estado };
  const pano = { x: x0, y: arriba + aire, ancho: util, alto: estado.y - arriba - aire };

  // La carta jugada más grande que entra; si el mazo no encuentra hueco, se achica.
  let j = mayorQueSirve(jugadaMinima, jMaxima, v => entra(v, pano.alto));
  const asientoAbajo = armarAbajo(ctx, franja, anchoMano);
  const anclaDe = (asiento: number, ubicados: Ubicado[]) =>
    asiento === ctx.abajo ? asientoAbajo.ancla : ubicados.find(u => u.geometria.asiento === asiento)!.geometria.ancla;
  let colocado: { pano: Pano; mazo: Rect } | null = null;
  for (; ; j = Math.max(jugadaMinima, j - 2)) {
    const ubicacion = ubicarPano(ctx, pano, j);
    const obstaculos = [
      ...ubicacion.ubicados.map(u => cajaDeAsiento(u.geometria)!),
      ...(ubicacion.jugadaDeAbajo ? [ubicacion.jugadaDeAbajo] : []),
    ];
    const lugar = buscarMazo(pano, tamanoMazo(j, med), obstaculos, anclaDe(e.dador, ubicacion.ubicados), anclaDe(e.mano, ubicacion.ubicados));
    if (lugar || j === jugadaMinima) {
      const tamano = tamanoMazo(j, med);
      colocado = { pano: ubicacion, mazo: lugar ?? { x: pano.x + (pano.ancho - tamano.ancho) / 2, y: pano.y, ...tamano } };
      break;
    }
  }

  asientoAbajo.jugada = colocado.pano.jugadaDeAbajo;
  const asientos: GeometriaAsiento[] = [];
  for (const u of colocado.pano.ubicados) asientos[u.geometria.asiento] = u.geometria;
  asientos[ctx.abajo] = asientoAbajo;

  const filaY = tira ? tira.y - med.fila : e.alto - med.fila;
  const jugador = e.propio != null;
  const cantos = jugador && !hoja
    ? { x: x0 + util - med.cantos.ancho, y: filaY + (med.fila - med.cantos.alto) / 2, ...med.cantos }
    : null;
  if (jugador) {
    asientoAbajo.rotulo = hoja ? null : {
      x: x0,
      y: filaY + (med.fila - med.rotuloPropio.alto) / 2,
      ancho: Math.min(med.rotuloPropio.ancho, util - med.cantos.ancho - 2 * aire),
      alto: med.rotuloPropio.alto,
    };
  }
  const espectador = !jugador && !hoja ? { x: x0, y: filaY + (med.fila - 40) / 2, ancho: util, alto: 40 } : null;

  const cajaAbanico = cajaDelAbanico(anchoMano);
  const mano = jugador
    ? abanico(e.cartas[ctx.abajo], anchoMano, x0 + util / 2, franja.y + aire - cajaAbanico.y)
    : [];

  return {
    disposicion: esEscritorio ? "escritorio" : "telefono",
    pantalla, columna, barra, lance, pano, asientos,
    mazo: armarMazo(colocado.mazo, j, med),
    estado, mano, cantos, espectador, tira, paneles, hoja,
  };
}

/** El asiento de abajo: la mano del jugador o, para el espectador, su rótulo con los dorsos. */
function armarAbajo(ctx: Contexto, franja: Rect, anchoMano: number): GeometriaAsiento {
  const { forma, activo } = formaDe(ctx.e, ctx.abajo);
  const ancla = { x: franja.x + franja.ancho / 2, y: franja.y + franja.alto / 2 };
  const base: GeometriaAsiento = { asiento: ctx.abajo, lugar: "abajo", forma, activo, rotulo: null, dorsos: [], jugada: null, ancla };
  if (ctx.e.propio != null) return base;
  if (!activo) {
    const p = ctx.med.punto;
    return { ...base, forma: "punto", rotulo: { x: ancla.x - p.ancho / 2, y: ancla.y - p.alto / 2, ...p } };
  }
  const rotulo = ctx.med.rotulo;
  const arriba = franja.y + aire;
  return {
    ...base,
    rotulo: { x: ancla.x - rotulo.ancho / 2, y: arriba, ...rotulo },
    dorsos: dorsos(ctx.e.cartas[ctx.abajo], tamanoDorso("completo", 0.45 * anchoMano), ancla.x, arriba + rotulo.alto + aire),
  };
}
