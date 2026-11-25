import type { IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { vozDeIndicacion } from "@eltruco/cliente/textos.ts";
import type { Voz } from "@eltruco/cliente/voces.ts";

export function GloboDeVoz({ voz }: { voz?: Voz }) {
  return voz && <span className="j-voz">{voz.texto}</span>;
}

export function PalabraDelPie({ indicacion, asiento, nombre }: {
  indicacion?: IndicacionPie; asiento:number; nombre:(a:number)=>string;
}) {
  if (indicacion?.emisor !== asiento) return null;
  return <span className="j-voz" role="status" aria-label={nombre(asiento)+" dice"}>
    {vozDeIndicacion(indicacion,nombre)}
  </span>;
}
