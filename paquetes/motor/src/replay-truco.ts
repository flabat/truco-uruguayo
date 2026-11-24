import { esCardId } from "./cartas.ts";
import { esAsiento, esSemilla, versionReparto } from "./reparto.ts";
import { aplicarAccion, iniciarTruco, type AccionTruco, type ErrorTruco, type EstadoTruco } from "./truco.ts";

const versiones = { version: 2, versionReglas: 2, versionReparto } as const;

export function capturarTruco({ mano: { reparto: { semilla, dador } }, acciones }: EstadoTruco) {
  return { ...versiones, semilla, dador, acciones: acciones.map((accion) => ({ ...accion })) };
}

type Resultado =
  | { ok: true; estado: EstadoTruco }
  | { ok: false; error: "json-invalido" | "formato-invalido" }
  | { ok: false; error: "version-desconocida"; campo: keyof typeof versiones }
  | { ok: false; error: ErrorTruco; posicion: number };

function esObjeto(dato: unknown): dato is Record<string, unknown> {
  return typeof dato === "object" && dato !== null && !Array.isArray(dato);
}

function leerAccion(dato: unknown): AccionTruco | null {
  if (!esObjeto(dato) || !esAsiento(dato.asiento)) return null;
  const { tipo, asiento, carta } = dato;
  if (tipo === "carta" && esCardId(carta)) return { tipo, asiento, carta };
  if (tipo === "truco" || tipo === "quiero" || tipo === "no-quiero") return { tipo, asiento };
  return null;
}

/** Restaura también prefijos con la palabra pendiente. Ningún paso invoca a un bot. */
export function reproducirTruco(datos: unknown): Resultado {
  if (typeof datos === "string") {
    try { datos = JSON.parse(datos); } catch { return { ok: false, error: "json-invalido" }; }
  }
  if (!esObjeto(datos)) return { ok: false, error: "formato-invalido" };
  for (const campo of ["version", "versionReglas", "versionReparto"] as const) {
    if (!Number.isInteger(datos[campo])) return { ok: false, error: "formato-invalido" };
    if (datos[campo] !== versiones[campo]) return { ok: false, error: "version-desconocida", campo };
  }
  const { semilla, dador, acciones } = datos;
  if (!esSemilla(semilla) || !esAsiento(dador) || !Array.isArray(acciones)) return { ok: false, error: "formato-invalido" };

  let estado = iniciarTruco(semilla, dador);
  for (const [indice, dato] of acciones.entries()) {
    const accion = leerAccion(dato);
    if (!accion) return { ok: false, error: "accion-invalida", posicion: indice + 1 };
    const paso = aplicarAccion(estado, accion);
    if (!paso.ok) return { ...paso, posicion: indice + 1 };
    estado = paso.estado;
  }
  return { ok: true, estado };
}
