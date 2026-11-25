// Qué mesa se puede crear y con qué cuerpo se pide. Nunca se ofrece la seña elegida a mano:
// 2 contra 2 va siempre con las señas automáticas al pie.
import type { Modo } from "@eltruco/cliente/cliente.ts";
import { esMetaDeChico, metaPorModalidad, mitadesDelChico } from "@eltruco/motor/chico.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";

const orden: Modo[] = ["1v1", "2v2", "3v3"];

/** 1 y 2 contra 2 siempre; 3 contra 3 solo si el servidor la ofrece (admisión a Tercetos). */
export function modalidadesOfrecidas(modos: Modo[]): Modo[] {
  return orden.filter(modo => modo !== "3v3" || modos.includes("3v3"));
}

export function cuerpoDeMesaNueva({ modo, meta, publica, salonHabilitado, senasPie }: {
  modo: Modo; meta: number; publica: boolean; salonHabilitado: boolean; senasPie: Modo[];
}): Record<string, unknown> {
  return {
    modo,
    publica: salonHabilitado && modo !== "3v3" && publica,
    ...(meta !== metaPorModalidad[modo] && { meta }),
    ...(modo === "2v2" && { formato: "pairs-private-senas", versionSenas: versionSenasPie }),
    ...(modo === "3v3" && { formato: "triples", ...(senasPie.includes("3v3") && { versionSenas: versionSenasPie }) }),
  };
}

export function textoDeMeta(texto: string): { meta: number; valida: boolean; ayuda: string } {
  const meta = texto.trim() === "" ? Number.NaN : Number(texto);
  const valida = esMetaDeChico(meta);
  return { meta, valida, ayuda: valida ? mitadesDelChico(meta) : "Elegí un número par desde 2." };
}

export const textoVisibilidad = (publica: boolean) => publica
  ? "Mesa pública. Quienes ingresen al salón pueden ver las jugadas."
  : "Mesa privada por invitación.";
