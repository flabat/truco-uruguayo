import type { AccionOnline, RepartoOnline } from "@eltruco/motor/mesa-online.ts";

export const reparto: RepartoOnline = {
  versionReparto: "online-1", dador: 0, mano: 1, muestra: "oros-01",
  manos: [
    ["copas-01", "copas-05", "copas-06"],
    ["oros-03", "espadas-12", "bastos-10"],
    ["bastos-02", "bastos-03", "bastos-05"],
    ["espadas-03", "espadas-06", "espadas-07"],
  ],
};

export const hastaLaSubida: readonly AccionOnline[] = [
  { asiento: 1, tipo: "truco" },
  { asiento: 0, tipo: "flor" },
  { asiento: 2, tipo: "flor" },
  { asiento: 3, tipo: "flor" },
  { asiento: 3, tipo: "con-flor-envido" },
];
