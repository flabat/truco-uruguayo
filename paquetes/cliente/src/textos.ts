import type { CardId } from "@eltruco/motor/cartas.ts";
import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import { textoDeIndicacion, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { cantoEnHistorial } from "./cantos.ts";
import { cartasPorId } from "./cartas.ts";

export type Nombre = (asiento: number) => string;

export const nombrar = (id: CardId) => cartasPorId.get(id)!.nombre;
export const tantos = (n: number) => n + (n === 1 ? " tanto" : " tantos");

export function descripcionDeJugada(acciones: readonly VistaOnline["acciones"][number][], indice: number, nombre: Nombre) {
  const accion = acciones[indice];
  const quien = nombre(accion.asiento);
  if (accion.tipo === "carta") return quien + " jugó " + nombrar(accion.carta).toLowerCase() + ".";
  if (accion.tipo === "mazo") return quien + " se fue al mazo.";
  return quien + " dijo «" + cantoEnHistorial(acciones, indice) + "».";
}

export function vozDeIndicacion(i: IndicacionPie, nombre: Nombre) {
  const texto = textoDeIndicacion(i);
  return nombre(i.destinatario) + ", " + texto[0].toLocaleLowerCase("es-UY") + texto.slice(1);
}

export function descripcionDeIndicacion(i: IndicacionPie, nombre: Nombre) {
  return nombre(i.emisor) + " le dijo a " + nombre(i.destinatario) + " «" + textoDeIndicacion(i) + "».";
}
