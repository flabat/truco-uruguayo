import { iniciarMano, jugarCarta, type ErrorJugada, type EstadoMano, type Jugada } from "./mano.ts";
import { equipoPorAsiento, esAsiento, repartir, type Asiento } from "./reparto.ts";

export type AccionTruco =
  | ({ readonly tipo: "carta" } & Jugada)
  | { readonly tipo: "truco" | "quiero" | "no-quiero"; readonly asiento: Asiento };

export interface EstadoTruco {
  readonly mano: EstadoMano;
  readonly apuesta: "sin-canto" | "pendiente" | "querido" | "rechazado";
  readonly acciones: readonly AccionTruco[];
}

export function iniciarTruco(semilla: number, dador: Asiento): EstadoTruco {
  return { mano: iniciarMano(repartir(semilla, dador)), apuesta: "sin-canto", acciones: [] };
}

export function resultadoTruco({ mano, apuesta }: EstadoTruco) {
  // Mientras se espera la respuesta, el turno de carta identifica al cantor.
  if (apuesta === "rechazado") return { equipo: equipoPorAsiento[mano.turno!], tantos: 1, motivo: "rechazo" } as const;
  if (mano.equipoGanador === null) return null;
  return { equipo: mano.equipoGanador, tantos: apuesta === "querido" ? 2 : 1, motivo: "vueltas" } as const;
}

export type ErrorTruco = ErrorJugada | "accion-invalida" | "falta-respuesta" | "truco-ya-querido"
  | "sin-oferta" | "responde-el-rival";

type PasoTruco = { ok: true; estado: EstadoTruco } | { ok: false; error: ErrorTruco };

export function aplicarAccion(estado: EstadoTruco, accion: AccionTruco): PasoTruco {
  if (resultadoTruco(estado)) return { ok: false, error: "mano-cerrada" };
  let { mano, apuesta } = estado;
  const { tipo, asiento } = accion;
  if (!esAsiento(asiento)) return { ok: false, error: "accion-invalida" };
  switch (tipo) {
    case "carta": {
      if (apuesta === "pendiente") return { ok: false, error: "falta-respuesta" };
      const paso = jugarCarta(mano, { asiento, carta: accion.carta });
      if (!paso.ok) return paso;
      mano = paso.estado;
      break;
    }
    case "truco":
      if (apuesta === "pendiente") return { ok: false, error: "falta-respuesta" };
      if (apuesta === "querido") return { ok: false, error: "truco-ya-querido" };
      if (asiento !== mano.turno) return { ok: false, error: "fuera-de-turno" };
      apuesta = "pendiente";
      break;
    case "quiero":
    case "no-quiero":
      if (apuesta !== "pendiente") return { ok: false, error: "sin-oferta" };
      if (equipoPorAsiento[asiento] === equipoPorAsiento[mano.turno!]) return { ok: false, error: "responde-el-rival" };
      apuesta = tipo === "quiero" ? "querido" : "rechazado";
      break;
    default:
      return { ok: false, error: "accion-invalida" };
  }
  return { ok: true, estado: { mano, apuesta, acciones: [...estado.acciones, { ...accion }] } };
}
