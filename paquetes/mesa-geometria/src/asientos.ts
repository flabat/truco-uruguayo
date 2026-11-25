import type { EntradaMesa, Forma, Lugar, Modalidad } from "./tipos.ts";

/** Lugares por cantidad de jugadores, en sentido antihorario desde abajo (como `posiciones` de Tapete.tsx). */
const lugares: Readonly<Record<2 | 4 | 6, readonly Lugar[]>> = {
  2: ["abajo", "frente"],
  4: ["abajo", "derecha", "frente", "izquierda"],
  6: ["abajo", "cerca-derecha", "lejos-derecha", "frente", "lejos-izquierda", "cerca-izquierda"],
};

export function jugadores(m: Modalidad): 2 | 4 | 6 {
  return m === "1v1" ? 2 : m === "2v2" ? 4 : 6;
}

export function asientoDeAbajo(e: EntradaMesa): number {
  return e.propio ?? e.vistaDesde ?? 0;
}

export function lugarDe(asiento: number, abajo: number, n: 2 | 4 | 6): Lugar {
  return lugares[n][(asiento - abajo + n) % n];
}

function activosDelPico(e: EntradaMesa): readonly [number, number] | null {
  return e.modalidad === "3v3" && e.lance?.tipo === "pico" ? e.lance.activos : null;
}

/** En el pico a pico, el activo del equipo contrario al de abajo: va arriba, grande. */
export function rivalDelDuelo(e: EntradaMesa): number | null {
  const activos = activosDelPico(e);
  if (!activos) return null;
  const abajo = asientoDeAbajo(e);
  return activos.find(a => a % 2 !== abajo % 2) ?? null;
}

export function formaDe(e: EntradaMesa, asiento: number): { forma: Forma; activo: boolean } {
  const activos = activosDelPico(e);
  if (activos) {
    return activos.includes(asiento) ? { forma: "completo", activo: true } : { forma: "punto", activo: false };
  }
  if (e.modalidad === "3v3" && asiento !== asientoDeAbajo(e)) return { forma: "circulo", activo: true };
  return { forma: "completo", activo: true };
}

function esAsiento(valor: unknown, n: number): boolean {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor < n;
}

function positivo(valor: number): boolean {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}

export function validar(e: EntradaMesa): void {
  if (!positivo(e.ancho) || !positivo(e.alto)) throw new RangeError("El ancho y el alto tienen que ser positivos.");
  if (e.modalidad !== "1v1" && e.modalidad !== "2v2" && e.modalidad !== "3v3") {
    throw new RangeError("Modalidad desconocida: " + String(e.modalidad) + ".");
  }
  const n = jugadores(e.modalidad);
  if (e.lance && e.modalidad !== "3v3") throw new RangeError("Solo tercetos tiene lance.");
  for (const [nombre, valor] of [["propio", e.propio ?? 0], ["vistaDesde", e.vistaDesde ?? 0], ["dador", e.dador], ["mano", e.mano]] as const) {
    if (!esAsiento(valor, n)) throw new RangeError(`${nombre} no es un asiento de esta mesa: ${String(valor)}.`);
  }
  if (!Array.isArray(e.cartas) || e.cartas.length !== n) throw new RangeError(`cartas tiene que tener ${n} elementos.`);
  if (!e.cartas.every(c => Number.isInteger(c) && c >= 0 && c <= 3)) throw new RangeError("Cada asiento tiene de 0 a 3 cartas.");
  if (e.lance?.tipo === "pico") {
    const [a, b] = e.lance.activos;
    if (!esAsiento(a, n) || !esAsiento(b, n)) throw new RangeError("Los activos del duelo tienen que ser asientos.");
    if (a % 2 === b % 2) throw new RangeError("El duelo es entre dos rivales.");
  }
  if (e.hoja && !(Number.isFinite(e.hoja.alto) && e.hoja.alto >= 0)) throw new RangeError("El alto de la hoja no puede ser negativo.");
}
