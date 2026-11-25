import { compararCartas } from "./jerarquia.ts";
import { elegirAccionConPie, politicaPie } from "./bot-pie.ts";
import type { AccionOnline, VistaOnline } from "./mesa-online.ts";
import { catalogoGestosPie, type IndicacionPie, type VistaPie } from "./senas-pie.ts";

export interface ModeloPie {
  envido: number;
  real: number;
  falta: number;
  aceptar: number;
  aceptarFalta: number;
  cubrir: number;
}

export const politicaPieParejas = "pie-parejas-v2";
export const modeloPieParejas: Readonly<ModeloPie> = Object.freeze({
  envido: 26, real: 31, falta: 32, aceptar: 29, aceptarFalta: 45, cubrir: -1,
});

export function elegirAccionPoliticaPie(politica: string | undefined, vista: VistaOnline, pie: VistaPie | undefined,
  indicaciones: readonly IndicacionPie[]): AccionOnline | null {
  if (politica === politicaPieParejas) return elegirAccionModeloPie(modeloPieParejas, vista, pie, indicaciones);
  if (politica === politicaPie || politica === undefined) return elegirAccionConPie(vista, pie, indicaciones);
  throw new Error("La política no admite el contrato de señas al pie.");
}

const gestos = Object.keys(catalogoGestosPie);

export function elegirAccionModeloPie(modelo: ModeloPie, vista: VistaOnline, pie: VistaPie | undefined,
  indicaciones: readonly IndicacionPie[]): AccionOnline | null {
  const clasica = elegirAccionConPie(vista, pie, indicaciones);
  const { asiento, legales, tantosPropios: { total } } = vista;
  if (!clasica) return null;
  const apuesta = vista.pendiente?.tipo;
  if (apuesta === "envido" || apuesta === "real-envido" || apuesta === "falta-envido") {
    const umbral = apuesta === "falta-envido" ? modelo.aceptarFalta : modelo.aceptar;
    if (clasica.tipo === "quiero" || clasica.tipo === "no-quiero") {
      return { asiento, tipo: total >= umbral ? "quiero" : "no-quiero" };
    }
    return clasica;
  }
  const canto = (["falta-envido", "real-envido", "envido"] as const).find((tipo, i) =>
    legales.includes(tipo) && total >= [modelo.falta, modelo.real, modelo.envido][i]);
  if (clasica.tipo === "envido" || clasica.tipo === "real-envido" || clasica.tipo === "falta-envido") {
    return canto ? { asiento, tipo: canto } : elegirAccionConPie({
      ...vista, legales: legales.filter(tipo => tipo !== "envido" && tipo !== "real-envido" && tipo !== "falta-envido"),
    }, pie, indicaciones);
  }
  if (canto && (clasica.tipo === "carta" || clasica.tipo === "truco")) return { asiento, tipo: canto };
  if (clasica.tipo !== "carta" || pie?.pie !== asiento || vista.vueltaActual?.jugadas.length !== 0) return clasica;
  const seña = pie.grupos.find(grupo => grupo.emisor !== asiento)?.gestos[0];
  if (!seña || gestos.indexOf(seña) > modelo.cubrir) return clasica;
  const menor = vista.cartas.reduce((a, b) => compararCartas(a, b, vista.muestra) <= 0 ? a : b);
  return { asiento, tipo: "carta", carta: menor };
}
