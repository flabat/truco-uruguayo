import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import { nombrar } from "./textos.ts";

export function vueltaEnMesa(v: Pick<VistaOnline, "vueltaActual" | "vueltas" | "resultado">,
    participantes: number, nombre: (asiento: number) => string) {
  const cerrada = !v.vueltaActual?.jugadas.length && (!v.resultado || v.resultado.motivo === "vueltas")
    ? v.vueltas.at(-1)
    : undefined;
  const numeroVuelta = v.vueltas.length + (cerrada ? 0 : 1);
  const vuelta = cerrada ?? v.vueltaActual;
  const ganador = cerrada?.resultado.tipo === "ganada" ? cerrada.resultado.asiento : undefined;
  const ganadora = cerrada?.jugadas.find(j => j.asiento === ganador);
  // La presentación mantiene la vuelta completa abierta mientras carga su último naipe.
  const cargandoCierre = v.vueltaActual?.jugadas.length === participantes;
  const ultima = cargandoCierre ? undefined : vuelta?.jugadas.at(-1);
  const jugadaVisible = ultima ? nombre(ultima.asiento) + " jugó " + nombrar(ultima.carta).toLowerCase() + "." : "";
  const detalleVuelta = cerrada && [
    ultima?.asiento !== ganador ? jugadaVisible : "",
    ganadora
      ? nombre(ganadora.asiento) + " ganó la vuelta con su " + nombrar(ganadora.carta).toLowerCase() + "."
      : "La vuelta fue parda.",
  ].filter(Boolean).join(" ");
  return { vuelta, cerrada, numeroVuelta, detalleVuelta, jugadaVisible };
}
