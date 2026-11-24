import type { ReactNode } from "react";
import { cartasPorId } from "../../lib/cartas";
import type { CardId } from "../../motor/cartas";
import type { VistaOnline } from "../../motor/mesa-online";
import { textoFrasePie, type IndicacionPie } from "../../motor/senas-pie";
import { canto } from "../../lib/cantos";

export const nombrar = (id: CardId) => cartasPorId.get(id)!.nombre;
export const tantos = (n: number) => n + (n === 1 ? " tanto" : " tantos");

type Nombre = (asiento: number) => string;

export function AvisoFlor({ pendiente, porDeclararFlor, nombre }:
  Pick<VistaOnline, "pendiente" | "porDeclararFlor"> & { nombre: Nombre }) {
  if (porDeclararFlor == null || pendiente?.tipo !== "flor") return null;
  return <p className="j-flor-anunciada">{nombre(pendiente.asiento)} cantó flor.</p>;
}

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

export function HistorialDeMano({ acciones, cobros, nombre, indicaciones = [], titulo = "Historial de la mano", children }:
  Pick<VistaOnline, "acciones" | "cobros"> & { nombre: Nombre; titulo?: string; children?: ReactNode; indicaciones?: readonly IndicacionPie[] }) {
  const entradas: ReactNode[] = [];
  const flor = cobros.find(c => c.comparacionFlor);
  let cursor = 0;
  for (let i=0; i<=acciones.length; i++) {
    while (cursor < indicaciones.length && indicaciones[cursor].indiceAccion === i) {
      entradas.push(descripcionDeIndicacion(indicaciones[cursor++], nombre));
    }
    if (i === acciones.length) break;
    entradas.push(descripcionDeJugada(acciones[i], nombre));
    if (flor?.comparacionFlor?.indiceAccion !== i) continue;
    const { participantes } = flor.comparacionFlor;
    entradas.push(<>
      <strong>Flor querida.</strong>{" "}
      {new Intl.ListFormat("es-UY").format(participantes.map(p => nombre(p.asiento) + " cantó " + p.total))}.
      {" "}Ganó {nombre(flor.asiento!)} con {flor.tantoGanador} de flor. El equipo {flor.equipo + 1} sumó {tantos(flor.tantos)} al tanteador.
    </>);
  }
  const anteriores = Math.max(0, entradas.length - 3);
  const filas = entradas.map((entrada, i) => <li key={i}>{entrada}</li>);
  return <section className="j-historia j-historia-actual" aria-label={titulo}>
    <header className="j-cabecera-historial"><h3>{titulo}</h3>{children}</header>
    {anteriores > 0 && <details>
      <summary>{anteriores === 1 ? "Ver 1 jugada anterior" : `Ver ${anteriores} jugadas anteriores`}</summary>
      <ol>{filas.slice(0, anteriores)}</ol>
    </details>}
    {filas.length ? <ol className="j-recientes" start={anteriores + 1}>{filas.slice(anteriores)}</ol>
      : <p>Todavía no hay jugadas.</p>}
  </section>;
}
