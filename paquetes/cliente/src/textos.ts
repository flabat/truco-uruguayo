import type { CardId } from "@eltruco/motor/cartas.ts";
import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import { textoFrasePie, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { canto } from "./cantos.ts";
import { cartasPorId } from "./cartas.ts";

export type Nombre = (asiento: number) => string;

export const nombrar = (id: CardId) => cartasPorId.get(id)!.nombre;
export const tantos = (n: number) => n + (n === 1 ? " tanto" : " tantos");

export function descripcionDeJugada(accion: VistaOnline["acciones"][number], nombre: Nombre) {
  const quien = nombre(accion.asiento);
  if (accion.tipo === "carta") return quien + " jugó " + nombrar(accion.carta).toLowerCase() + ".";
  if (accion.tipo === "mazo") return quien + " se fue al mazo.";
  return quien + " dijo «" + canto[accion.tipo] + "».";
}

export function vozDeIndicacion(i: IndicacionPie, nombre: Nombre) {
  return nombre(i.destinatario) + ", " + textoFrasePie[i.frase].toLocaleLowerCase("es-UY");
}

export function descripcionDeIndicacion(i: IndicacionPie, nombre: Nombre) {
  return nombre(i.emisor) + " le dijo a " + nombre(i.destinatario) + " «" + textoFrasePie[i.frase] + "».";
}
