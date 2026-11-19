import type { Registro } from "../../api/turnos.ts";

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
