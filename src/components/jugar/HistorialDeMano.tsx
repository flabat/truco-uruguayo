import type { ReactNode } from "react";
import { cartasPorId } from "../../lib/cartas";
import type { CardId } from "../../motor/cartas";
import type { VistaOnline } from "../../motor/mesa-online";
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

export function HistorialDeMano({ acciones, cobros, nombre, titulo = "Historial de la mano" }:
  Pick<VistaOnline, "acciones" | "cobros"> & { nombre: Nombre; titulo?: string }) {
  const entradas: ReactNode[] = acciones.map(a => descripcionDeJugada(a, nombre));
  const flor = cobros.find(c => c.comparacionFlor);
  if (flor?.comparacionFlor && flor.comparacionFlor.indiceAccion < acciones.length) {
    const { indiceAccion, participantes } = flor.comparacionFlor;
    entradas.splice(indiceAccion + 1, 0, <>
      <strong>Flor querida.</strong>{" "}
      {new Intl.ListFormat("es-UY").format(participantes.map(p => nombre(p.asiento) + " cantó " + p.total))}.
      {" "}Ganó {nombre(flor.asiento!)} con {flor.tantoGanador} de flor. El equipo {flor.equipo + 1} sumó {tantos(flor.tantos)} al tanteador.
    </>);
  }
  const anteriores = Math.max(0, entradas.length - 3);
  const filas = entradas.map((entrada, i) => <li key={i}>{entrada}</li>);
  return <section className="j-historia j-historia-actual" aria-label={titulo}>
    <h3>{titulo}</h3>
    {anteriores > 0 && <details>
      <summary>{anteriores === 1 ? "Ver 1 jugada anterior" : `Ver ${anteriores} jugadas anteriores`}</summary>
      <ol>{filas.slice(0, anteriores)}</ol>
    </details>}
    {filas.length ? <ol className="j-recientes" start={anteriores + 1}>{filas.slice(anteriores)}</ol>
      : <p>Todavía no hay jugadas.</p>}
  </section>;
}
