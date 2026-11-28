import type { Pool, PoolClient } from "pg";
import { politicaPie } from "@eltruco/motor/bot-pie.ts";
import { elegirAccionPoliticaPie } from "@eltruco/motor/modelo-pie.ts";
import type { AccionOnline, EstadoOnline, VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { IndicacionPie, VistaPie } from "@eltruco/motor/senas-pie.ts";
import { openRegularizedPie, type RegularizedArtifact } from "../training/regularized/actor.ts";

/**
 * Modelos aprendidos al pie. Se registran y se activan con `policyctl.ts` bajo una clave propia, porque al pie las indicaciones
 * siguen la regla clásica y el actor solo elige cartas y cantos: no comparten activación con las parejas con señas de equipo.
 */
export const formatosPie = { "pairs-pie": "pairs-private-senas", "triples-pie": "triples" } as const;
export type FormatoPie = keyof typeof formatosPie;
export const esFormatoPie = (formato: string): formato is FormatoPie => Object.hasOwn(formatosPie, formato);
export const esPin = (politica: string | null | undefined): politica is string => /^[a-f0-9]{64}$/.test(politica ?? "");

export type DecisionPie = ReturnType<typeof openRegularizedPie>;

/** Valida que el artefacto corresponda a la clave y abre su decisión. */
export function abrirPoliticaPie(artifact: unknown, formato: FormatoPie): DecisionPie {
  const declarado = (artifact as Partial<RegularizedArtifact> | null)?.format;
  if (declarado !== formatosPie[formato]) throw new TypeError(`El artefacto no corresponde a ${formato}.`);
  return openRegularizedPie(artifact as RegularizedArtifact);
}

const abiertas = new Map<string, DecisionPie>();

/** Abre una sola vez por proceso el actor al pie de ese pin, desde el registro. */
export async function cargarPoliticaPie(db: Pool | PoolClient, pin: string): Promise<DecisionPie> {
  const abierta = abiertas.get(pin);
  if (abierta) return abierta;
  const { rows: [fila] } = await db.query<{ formato: string; contenido: unknown }>(
    "SELECT formato, contenido FROM juego.artefactos WHERE pin=$1", [pin]);
  if (!fila || !esFormatoPie(fila.formato)) throw new Error("El registro no tiene un actor al pie con ese pin.");
  const decision = abrirPoliticaPie(fila.contenido, fila.formato);
  abiertas.set(pin, decision);
  return decision;
}

/**
 * Jugada de la computadora al pie. Con un pin decide el actor aprendido, con el tanteador al empezar la mano y la meta del
 * chico como en el entrenamiento; con un nombre decide la política fija.
 */
export function decidirPie(politica: string | undefined, aprendida: DecisionPie | undefined, estado: EstadoOnline,
    vista: VistaOnline, pie: VistaPie | undefined, indicaciones: readonly IndicacionPie[], azar = Math.random): AccionOnline | null {
  if (!esPin(politica)) return elegirAccionPoliticaPie(politica, vista, pie, indicaciones);
  if (!aprendida) throw new Error("Falta abrir el actor al pie.");
  return aprendida(vista, pie, indicaciones, estado.puntosInicio, estado.meta, azar());
}

/**
 * Para anticipar si la computadora va a jugar una carta, y esperar entonces la seña de un pie humano, un actor aprendido se
 * aproxima con la política clásica: muestrea su jugada y la decide recién en su turno.
 */
export const politicaParaAnticipar = (politica: string | undefined) => esPin(politica) ? politicaPie : politica;
