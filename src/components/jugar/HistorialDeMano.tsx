import type { ReactNode } from "react";
import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { descripcionDeIndicacion, descripcionDeJugada, tantos, type Nombre } from "@eltruco/cliente/textos.ts";

export function AvisoFlor({ pendiente, porDeclararFlor, nombre }:
  Pick<VistaOnline, "pendiente" | "porDeclararFlor"> & { nombre: Nombre }) {
  if (porDeclararFlor == null || pendiente?.tipo !== "flor") return null;
  return <p className="j-flor-anunciada">{nombre(pendiente.asiento)} cantó flor.</p>;
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
    entradas.push(descripcionDeJugada(acciones, i, nombre));
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
