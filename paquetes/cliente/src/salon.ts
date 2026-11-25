import type { Format } from "@eltruco/motor/contratos.ts";

export interface ResumenMesa {
  id: string;
  modo: "1v1" | "2v2";
  formato: Format;
  origen: "humana" | "exhibicion";
  humanos: number;
  computadoras: number;
  manoNumero: number;
  puntos: [number, number];
  meta: number;
  ultimaActividad: string;
}

export function participantesMesa(mesa: Pick<ResumenMesa, "origen" | "humanos" | "computadoras">) {
  if (mesa.origen === "exhibicion") return "Exhibición · Solo computadoras";
  const personas = mesa.humanos === 1 ? "1 persona" : `${mesa.humanos} personas`;
  const computadoras = mesa.computadoras === 1 ? "1 computadora" : `${mesa.computadoras} computadoras`;
  return `${personas} y ${computadoras}`;
}
