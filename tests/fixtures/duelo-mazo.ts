import { restaurar, type ManoPublicable, type Registro } from "../../api/turnos.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";

// Mano 5 del reporte, hasta que Ana abre la segunda vuelta.
export const dueloMazo: Registro = {
  numero: 5, version: 49, version_reglas: 1, version_senas: null, puntos_inicio: [0, 0],
  reparto: {
    versionReparto: "online-1", dador: 0, mano: 1, muestra: "copas-10",
    manos: [["oros-03", "espadas-01", "bastos-06"], ["oros-02", "bastos-01", "oros-07"]],
  },
  acciones: [
    { tipo: "envido", asiento: 1 }, { tipo: "no-quiero", asiento: 0 },
    { tipo: "carta", asiento: 1, carta: "oros-02" }, { tipo: "carta", asiento: 0, carta: "oros-03" },
    { tipo: "truco", asiento: 0 }, { tipo: "quiero", asiento: 1 },
    { tipo: "carta", asiento: 0, carta: "espadas-01" },
  ],
};

export const dueloFlor: Registro = {
  numero: 4, version: 5, version_reglas: 1, version_senas: null, puntos_inicio: [11, 0],
  reparto: {
    versionReparto: "online-1", dador: 1, mano: 0, muestra: "oros-05",
    manos: [["oros-06", "oros-02", "oros-10"], ["copas-02", "bastos-06", "espadas-05"]],
  },
  acciones: [
    { tipo: "flor", asiento: 0 }, { tipo: "paso-flor", asiento: 1 },
    { tipo: "carta", asiento: 0, carta: "oros-06" }, { tipo: "carta", asiento: 1, carta: "espadas-05" },
  ],
};

// Mano 6 del reporte #451. Las cartas sin jugar completan un reparto compatible con las jugadas públicas.
export const florAlMazo = {
  reparto: {
    versionReparto: "online-1", reglaFlor: "inmediata-v2", dador: 0, mano: 1, muestra: "oros-07",
    manos: [["oros-11", "copas-02", "espadas-03"], ["bastos-10", "bastos-04", "bastos-06"]],
  },
  acciones: [
    { tipo: "flor", asiento: 1 },
    { tipo: "carta", asiento: 1, carta: "bastos-10" }, { tipo: "carta", asiento: 0, carta: "oros-11" },
    { tipo: "carta", asiento: 0, carta: "copas-02" }, { tipo: "mazo", asiento: 1 },
  ],
} as const;

// Secuencia pública del reporte #449, con cartas de ejemplo para las que quedaron tapadas.
export const primeraParda: Registro = {
  ...dueloMazo, puntos_inicio: [5, 11],
  reparto: { versionReparto: "online-1", mano: 0, dador: 1, muestra: "copas-10", reglaFlor: "inmediata-v2",
    manos: [["copas-03", "bastos-03", "espadas-04"], ["oros-03", "bastos-06", "oros-04"]] },
  acciones: [
    { tipo: "real-envido", asiento: 0 }, { tipo: "no-quiero", asiento: 1 },
    { tipo: "carta", asiento: 0, carta: "copas-03" }, { tipo: "truco", asiento: 1 }, { tipo: "quiero", asiento: 0 },
    { tipo: "carta", asiento: 1, carta: "oros-03" }, { tipo: "carta", asiento: 0, carta: "bastos-03" },
  ],
};

// Mano 16 del reporte #460: muestra el 7 de oros, así que el 4 de oros es pieza.
export const dueloVale: Registro = {
  numero: 16, version: 1, version_reglas: 1, version_senas: null, puntos_inicio: [23, 24],
  reparto: {
    versionReparto: "online-1", reglaFlor: "inmediata-v2", dador: 0, mano: 1, muestra: "oros-07",
    manos: [["bastos-07", "bastos-12", "oros-04"], ["bastos-01", "espadas-06", "espadas-01"]],
  },
  acciones: [
    { tipo: "envido", asiento: 1 }, { tipo: "flor", asiento: 0 },
    { tipo: "carta", asiento: 1, carta: "bastos-01" }, { tipo: "carta", asiento: 0, carta: "bastos-07" },
    { tipo: "carta", asiento: 1, carta: "espadas-06" }, { tipo: "carta", asiento: 0, carta: "bastos-12" },
    { tipo: "truco", asiento: 0 }, { tipo: "quiero", asiento: 1 },
    { tipo: "carta", asiento: 0, carta: "oros-04" }, { tipo: "retruco", asiento: 1 },
    { tipo: "vale-cuatro", asiento: 0 },
  ],
};

/** La mano del #460 hasta sus primeras `n` acciones, con otras cartas de ejemplo si hacen falta. */
export function hasta(n: number, manoA1?: readonly CardId[], manoA0?: readonly CardId[]): ManoPublicable {
  const { manos } = dueloVale.reparto;
  return restaurar({ ...dueloVale, acciones: dueloVale.acciones.slice(0, n),
    reparto: { ...dueloVale.reparto, manos: [manoA0 ?? manos[0], manoA1 ?? manos[1]] } }, "duel");
}
