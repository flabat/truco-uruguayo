import { elegirAccionOnline, type vistaTercetos } from "./mesa-online.ts";

/** La política sólo consume la misma proyección que se entrega al asiento por HTTP. */
export function elegirAccionTercetos(vista: ReturnType<typeof vistaTercetos>) {
  if (vista.estado !== "jugando" || !vista.legales.length) return null;
  return elegirAccionOnline(vista);
}
