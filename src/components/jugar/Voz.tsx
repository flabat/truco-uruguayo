import { canto } from "../../lib/cantos";
import type { VistaOnline } from "../../motor/mesa-online";

export interface Voz {
  asiento: number;
  texto: string;
  indice: number;
}

interface LancePublico {
  acciones: VistaOnline["acciones"];
  cobros: VistaOnline["cobros"];
  indiceCobroLateral?: number;
  resultado?: VistaOnline["resultado"];
}

export const pausaDeVoz = 1500;

export function vocesEnAccion(lance: LancePublico, i: number): Voz[] {
  const accion = lance.acciones[i];
  if (!accion || accion.tipo === "carta") return [];
  const voces = [{ asiento: accion.asiento, texto: accion.tipo === "mazo" ? "Me voy al mazo" : canto[accion.tipo], indice: 0 }];
  const cobro = lance.cobros.find(c => c.motivo !== "truco");
  if (!cobro || i !== (lance.indiceCobroLateral ?? cobro.comparacionFlor?.indiceAccion)) return voces;
  const cuentas = cobro.comparacionFlor?.participantes ??
    (cobro.asiento != null && cobro.tantoGanador != null ? [{ asiento: cobro.asiento, total: cobro.tantoGanador }] : []);
  return [...voces, ...cuentas.map(({ asiento, total }, i) => ({ asiento, texto: total + " de " + cobro.motivo, indice: i + 1 }))];
}

/** Al volver se ve la última voz. Un cierre conserva la comparación pública entre quienes cantaron. */
export function vocesEnReposo(lance: LancePublico): Voz[] {
  const ultimo = lance.acciones.length - 1;
  if (lance.resultado) {
    const indice = lance.indiceCobroLateral ?? lance.cobros.find(c => c.comparacionFlor)?.comparacionFlor?.indiceAccion;
    if (indice != null) {
      const cuentas = vocesEnAccion(lance, indice).slice(1);
      if (cuentas.length) return cuentas;
    }
  }
  const voces = vocesEnAccion(lance, ultimo);
  return voces.length > 1 ? voces.slice(1) : voces;
}

export function GloboDeVoz({ voz }: { voz?: Voz }) {
  return voz && <span className="j-voz">{voz.texto}</span>;
}
