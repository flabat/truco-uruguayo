import { useEffect, useState } from "react";
import type { IndicacionPie } from "../../motor/senas-pie";
import { vozDeIndicacion } from "./HistorialDeMano";
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

// Las palabras nuevas pueden llegar juntas antes de la misma carta. Se muestran
// en orden sin bloquear la jugada del destinatario ni hacerle esperar al pie.
export function useVozDelPie(mano: number, indicaciones: readonly IndicacionPie[] = [], acciones: number,
    llegada?: { llegadaEnVivo?: boolean; reconexion?: number }) {
  const cantidad = indicaciones.length;
  const ultima = indicaciones.at(-1);
  const reconexion = llegada?.reconexion;
  function alRecibirMano(viva: boolean) {
    return { mano, reconexion, vistas: cantidad, cola: viva ? [...indicaciones] : [] as IndicacionPie[] };
  }
  const [estado, cambiar] = useState(() => alRecibirMano(Boolean(llegada?.llegadaEnVivo)));
  if (estado.reconexion !== reconexion || cantidad < estado.vistas && mano === estado.mano) {
    cambiar(alRecibirMano(false));
  } else if (estado.mano !== mano) {
    cambiar(alRecibirMano(llegada?.llegadaEnVivo ?? !llegada));
  } else if (cantidad > estado.vistas) {
    cambiar({ ...estado, vistas: cantidad, cola: [...estado.cola, ...indicaciones.slice(estado.vistas)] });
  }
  const actual = estado.cola[0];
  useEffect(() => {
    if (!actual) return;
    const timer = window.setTimeout(() => {
      cambiar(s => s.cola[0] === actual ? { ...s, cola: s.cola.slice(1) } : s);
    }, pausaDeVoz);
    return () => window.clearTimeout(timer);
  }, [actual]);
  return actual ?? (ultima?.indiceAccion === acciones ? ultima : undefined);
}

export function PalabraDelPie({ indicacion, asiento, nombre }: {
  indicacion?: IndicacionPie; asiento:number; nombre:(a:number)=>string;
}) {
  if (indicacion?.emisor !== asiento) return null;
  return <span className="j-voz" role="status" aria-label={nombre(asiento)+" dice"}>
    {vozDeIndicacion(indicacion,nombre)}
  </span>;
}
