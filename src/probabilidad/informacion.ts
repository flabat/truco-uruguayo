import { esCardId, mazo, type CardId } from "@eltruco/motor/cartas.ts";
import type { Jugada, VistaAsiento } from "@eltruco/motor/mano.ts";
import { esAsiento, type Asiento } from "@eltruco/motor/reparto.ts";

export interface PosicionPublicaV1 {
  readonly version: 1;
  readonly asiento: Asiento;
  readonly dador: Asiento;
  readonly muestra: CardId;
  readonly cartas: readonly CardId[];
  readonly jugadas: readonly Jugada[];
}

function canonica({ asiento, dador, muestra, cartas, jugadas }: PosicionPublicaV1): PosicionPublicaV1 {
  return {
    version: 1, asiento, dador, muestra,
    cartas: [...cartas].sort((a, b) => mazo.indexOf(a) - mazo.indexOf(b)),
    jugadas: jugadas.map(({ asiento, carta }) => ({ asiento, carta })),
  };
}

export function posicionPublica(vista: VistaAsiento): PosicionPublicaV1 {
  const jugadas = vista.vueltas.flatMap(vuelta => vuelta.jugadas).concat(vista.vueltaActual?.jugadas ?? []);
  return canonica({ ...vista, version: 1, jugadas });
}

export function clavePosicion(posicion: PosicionPublicaV1): string {
  return JSON.stringify(canonica(posicion));
}

/** Valida y copia el mensaje público antes de interpretar su historial con el motor. */
export function leerPosicion(entrada: unknown): PosicionPublicaV1 | null {
  if (!entrada || typeof entrada !== "object") return null;
  const { version, asiento, dador, muestra, cartas, jugadas } = entrada as Partial<Record<keyof PosicionPublicaV1, unknown>>;
  if (version !== 1 || !esAsiento(asiento) || !esAsiento(dador) || !esCardId(muestra)) return null;
  if (!Array.isArray(cartas) || cartas.length > 3 || !Array.isArray(jugadas) || jugadas.length > 12) return null;

  const vistas = new Set<CardId>([muestra]);
  for (const carta of cartas) {
    if (!esCardId(carta) || vistas.has(carta)) return null;
    vistas.add(carta);
  }
  const cantidades = [0, 0, 0, 0];
  cantidades[asiento] = cartas.length;
  for (const paso of jugadas) {
    if (!paso || !esAsiento(paso.asiento) || !esCardId(paso.carta) || vistas.has(paso.carta)) return null;
    vistas.add(paso.carta);
    if (++cantidades[paso.asiento] > 3) return null;
  }
  return cantidades[asiento] === 3 ? canonica({ version, asiento, dador, muestra, cartas, jugadas }) : null;
}
