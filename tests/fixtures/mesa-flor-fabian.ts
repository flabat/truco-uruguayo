import type { RepartoOnline } from "../../src/motor/reparto.ts";

// Primer reparto de la mesa de Fabián. Computadora 4 es mano y Computadora 3 es pareja de Fabián.
export const mesaFabian: RepartoOnline = {
  versionReparto: "online-1", reglaFlor: "inmediata-v2", dador: 2, mano: 3, muestra: "copas-04",
  manos: [
    ["bastos-06", "espadas-01", "bastos-02"], ["bastos-05", "oros-12", "copas-06"],
    ["oros-04", "copas-11", "oros-10"], ["copas-12", "bastos-12", "espadas-11"],
  ],
};
