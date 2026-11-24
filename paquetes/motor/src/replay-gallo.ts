import { esCardId, type CardId } from "./cartas.ts";
import { esMetaDeChico } from "./chico.ts";
import type { Cobro } from "./cantos-online.ts";
import type { Equipo } from "./reparto.ts";

// Perfil de prueba para el descarte y una mano que termina por rechazo del truco o retruco.
type AsientoGallo = 0 | 1 | 2;
const asientos = [0, 1, 2] as const;
const esAsientoGallo = (n: unknown): n is AsientoGallo => n === 0 || n === 1 || n === 2;

export interface RepartoGallo {
  versionReparto: "gallo-sintetico-1";
  gallo: AsientoGallo;
  dador: AsientoGallo;
  mano: AsientoGallo;
  muestra: CardId;
  manos: readonly (readonly CardId[])[];
}

export type AccionGallo =
  | { tipo: "descarte"; asiento: AsientoGallo; carta: CardId }
  | { tipo: "truco" | "retruco" | "no-quiero"; asiento: AsientoGallo };

export interface EstadoGallo {
  reparto: RepartoGallo;
  meta: number;
  puntos: readonly [number, number];
  acciones: readonly AccionGallo[];
  habilitados: readonly AsientoGallo[];
  cobros: readonly Cobro[];
  terminada: boolean;
}

function esRepartoGallo(dato: unknown): dato is RepartoGallo {
  if (!dato || typeof dato !== "object") return false;
  const { versionReparto, dador, mano, gallo, muestra, manos } = dato as Partial<RepartoGallo>;
  if (versionReparto !== "gallo-sintetico-1" || !esAsientoGallo(dador) || mano !== (dador + 1) % 3
      || !esAsientoGallo(gallo) || !esCardId(muestra) || !Array.isArray(manos) || manos.length !== 3) return false;
  const cartas = [muestra];
  for (const asiento of asientos) {
    const propias = manos[asiento];
    if (!Array.isArray(propias) || propias.length !== (asiento === gallo ? 4 : 3)) return false;
    cartas.push(...propias);
  }
  return cartas.every(esCardId) && new Set(cartas).size === cartas.length;
}

export function iniciarGallo(reparto: unknown, puntosInicio: readonly number[], meta: number): EstadoGallo {
  if (!esRepartoGallo(reparto)) throw new Error("Reparto inválido para gallo-sintetico-1.");
  if (!esMetaDeChico(meta) || !Array.isArray(puntosInicio) || puntosInicio.length !== 2
      || !puntosInicio.every(p => Number.isInteger(p) && p >= 0 && p < meta)) throw new Error("Tanteador inicial inválido.");
  return { reparto: structuredClone(reparto), meta, puntos: [puntosInicio[0], puntosInicio[1]],
    acciones: [], habilitados: [reparto.gallo], cobros: [], terminada: false };
}

export function decidirGallo(estado: EstadoGallo, dato: unknown): EstadoGallo {
  if (estado.terminada || !dato || typeof dato !== "object") throw new Error("Decisión de gallo no permitida.");
  const { tipo, asiento, carta } = dato as Record<string, unknown>;
  if (!esAsientoGallo(asiento) || !estado.habilitados.includes(asiento)) throw new Error("Asiento de gallo fuera de turno.");
  const { reparto, acciones } = estado;
  const anterior = acciones.at(-1);
  const equipo: Equipo = asiento === reparto.gallo ? 0 : 1;
  if (!anterior) {
    if (tipo !== "descarte" || Object.keys(dato).length !== 3 || !esCardId(carta) || !reparto.manos[asiento].includes(carta)) {
      throw new Error("El gallo debe devolver una de sus cuatro cartas.");
    }
    return { ...estado, acciones: [{ tipo, asiento, carta }], habilitados: [reparto.mano] };
  }
  if (Object.keys(dato).length !== 2) throw new Error("Campos de canto inválidos.");
  if ((tipo === "truco" && anterior.tipo === "descarte") || (tipo === "retruco" && anterior.tipo === "truco")) {
    const rivales = asientos.filter(s => (s === reparto.gallo) !== (asiento === reparto.gallo));
    return { ...estado, acciones: [...acciones, { tipo, asiento }], habilitados: rivales };
  }
  if (tipo === "no-quiero" && (anterior.tipo === "truco" || anterior.tipo === "retruco")) {
    const ganador: Equipo = equipo === 0 ? 1 : 0;
    const puntos: [number, number] = [...estado.puntos];
    const tantos = Math.min(anterior.tipo === "truco" ? 1 : 2, estado.meta - puntos[ganador]);
    puntos[ganador] += tantos;
    return { ...estado, acciones: [...acciones, { tipo, asiento }], puntos, habilitados: [],
      cobros: [{ equipo: ganador, tantos, motivo: "truco" }], terminada: true };
  }
  throw new Error("Acción fuera del perfil gallo-sintetico-v1.");
}

export function vistaGallo(estado: EstadoGallo, asiento: number) {
  if (!esAsientoGallo(asiento)) throw new RangeError("El asiento debe pertenecer al reparto de gallo.");
  const { gallo, dador, mano, muestra, manos } = estado.reparto;
  const descarte = estado.acciones[0];
  const cartas = manos[asiento].filter(c => descarte?.tipo !== "descarte" || c !== descarte.carta);
  const acciones = estado.acciones.map(accion => accion.tipo === "descarte" && asiento !== gallo
    ? { tipo: accion.tipo, asiento: accion.asiento } : accion);
  return structuredClone({ asiento, gallo, dador, mano, muestra, cartas, acciones, meta: estado.meta,
    habilitados: estado.habilitados, puntos: estado.puntos, cobros: estado.cobros, terminada: estado.terminada });
}
