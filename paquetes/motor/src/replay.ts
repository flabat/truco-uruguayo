import { esCardId } from "./cartas.ts";
import { iniciarMano, jugarCarta, type ErrorJugada, type EstadoMano, type Jugada } from "./mano.ts";
import { esAsiento, esSemilla, repartir, versionReparto, type AsientoV1 } from "./reparto.ts";

const versionesV1 = { version: 1, versionReglas: 1, versionReparto } as const;

export type ReplayV1 = typeof versionesV1 & {
  readonly semilla: number;
  readonly dador: AsientoV1;
  readonly jugadas: readonly Jugada[];
};

export type ResultadoReplay =
  | { readonly ok: true; readonly estado: EstadoMano }
  | { readonly ok: false; readonly error: "json-invalido" | "formato-invalido" }
  | { readonly ok: false; readonly error: "version-desconocida"; readonly campo: keyof typeof versionesV1 }
  | { readonly ok: false; readonly error: ErrorJugada; readonly posicion: number };

/** Captura un estado del motor, parcial o cerrado, para guardarlo con JSON.stringify. */
export function capturarReplay(estado: EstadoMano): ReplayV1 {
  const { reparto, vueltas, vueltaActual } = estado;
  const { semilla, dador } = reparto;
  const esperado = repartir(semilla, dador);
  // Un escenario armado a mano puede ser legal y diferir en una sola carta aún oculta.
  if (reparto.muestra !== esperado.muestra || !esperado.manos.every((terna, asiento) =>
    terna.every((carta, indice) => carta === reparto.manos[asiento][indice]))) {
    throw new RangeError("El reparto de la mano difiere del que generan su semilla y dador.");
  }

  const jugadas = vueltas.flatMap((vuelta) => vuelta.jugadas).concat(vueltaActual?.jugadas ?? []);
  return { ...versionesV1, semilla, dador, jugadas: jugadas.map(({ asiento, carta }) => ({ asiento, carta })) };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Lee el texto JSON o su valor ya decodificado. Devuelve el estado reanudable o final
 * al validar todo el historial. La posición de una jugada rechazada empieza en 1.
 */
export function reproducirReplay(datos: unknown): ResultadoReplay {
  if (typeof datos === "string") {
    try {
      datos = JSON.parse(datos);
    } catch {
      return { ok: false, error: "json-invalido" };
    }
  }
  if (!esObjeto(datos)) return { ok: false, error: "formato-invalido" };
  for (const campo of ["version", "versionReglas", "versionReparto"] as const) {
    if (!Number.isInteger(datos[campo])) return { ok: false, error: "formato-invalido" };
    if (datos[campo] !== versionesV1[campo]) return { ok: false, error: "version-desconocida", campo };
  }
  const { semilla, dador, jugadas } = datos;
  if (!esSemilla(semilla) || !esAsiento(dador) || !Array.isArray(jugadas)) {
    return { ok: false, error: "formato-invalido" };
  }

  let estado = iniciarMano(repartir(semilla, dador));
  for (const [indice, jugada] of jugadas.entries()) {
    const posicion = indice + 1;
    if (!esObjeto(jugada) || !esAsiento(jugada.asiento) || !esCardId(jugada.carta)) {
      return { ok: false, error: "jugada-invalida", posicion };
    }
    const paso = jugarCarta(estado, { asiento: jugada.asiento, carta: jugada.carta });
    if (!paso.ok) return { ok: false, error: paso.error, posicion };
    estado = paso.estado;
  }
  return { ok: true, estado };
}
