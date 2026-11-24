import { aplicarOnline, iniciarOnline, type AccionOnline, type RepartoOnline } from "@eltruco/motor/mesa-online.ts";

// Sintético: mismas cartas y acciones públicas que el reporte #249.
export const reparto: RepartoOnline = {
  versionReparto: "online-1", reglaFlor: "inmediata-v2", dador: 0, mano: 1, muestra: "espadas-07",
  manos: [["espadas-11", "copas-12", "espadas-05"], ["bastos-01", "copas-03", "espadas-06"]],
};
export const acciones: AccionOnline[] = [
  { tipo: "truco", asiento: 1 }, { tipo: "con-flor-envido", asiento: 0 }, { tipo: "quiero", asiento: 0 },
  { tipo: "carta", asiento: 1, carta: "bastos-01" }, { tipo: "carta", asiento: 0, carta: "espadas-11" },
  { tipo: "retruco", asiento: 0 }, { tipo: "quiero", asiento: 1 },
  { tipo: "carta", asiento: 0, carta: "copas-12" }, { tipo: "carta", asiento: 1, carta: "copas-03" },
  { tipo: "carta", asiento: 1, carta: "espadas-06" }, { tipo: "carta", asiento: 0, carta: "espadas-05" },
];
export function manoReportada(puntos: readonly [number, number] = [0, 0], meta = 10) {
  return acciones.reduce((estado, accion) => {
    if (estado.resultado) return estado;
    const paso = aplicarOnline(estado, accion);
    if (!paso.ok) throw new Error(JSON.stringify({ accion, paso }));
    return paso.estado;
  }, iniciarOnline(reparto, puntos, meta));
}
