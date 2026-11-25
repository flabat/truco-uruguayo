import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import { cuentaDelChico, mitadesDelChico } from "@eltruco/motor/chico.ts";
import { canto, respuestaConFlor, verboDeCanto } from "./cantos.ts";
import type { Mesa, Partida, PartidaTercetos } from "./cliente.ts";

export function tituloDeRespuesta(mesa: Mesa, vista: Pick<VistaOnline, "pendiente" | "legales">, participantes: readonly number[]) {
  if (vista.legales.length) return "Podés responder";
  const cantor = vista.pendiente!.asiento;
  if (participantes.length === 2) {
    const rival = participantes.find(asiento => asiento !== cantor)!;
    return "Responde " + mesa.asientos[rival].nombre;
  }
  return mesa.asientos[cantor].equipo === mesa.asientos[mesa.miAsiento].equipo
    ? "Responde el equipo rival" : "Responde tu equipo";
}

export function estadoDelTurno(mesa: Mesa, partida: Partida, vista: VistaOnline) {
  const { resultado, pendiente, porDeclararFlor, turno, legales } = vista;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  if (resultado) {
    const fin = partida.contexto.fase === "chico-terminado";
    const victoria = resultado.equipo === propio;
    const motivos = { mazo: "el retiro al mazo", vueltas: "las vueltas", rechazo: "el rechazo", envido: "el envido", flor: "la flor" };
    return {
      titulo: fin
        ? victoria
          ? "Ganaste la partida"
          : "Ganó el rival"
        : victoria
          ? "Ganaste la mano"
          : "El rival ganó la mano",
      indicacion: resultado.motivo === "mazo"
        ? `${mesa.asientos[1 - resultado.equipo].nombre} se fue al mazo.`
        : `El cierre fue por ${motivos[resultado.motivo]}.`,
    };
  }
  if (porDeclararFlor !== null) {
    const esTuTurno = porDeclararFlor === mesa.miAsiento;
    if (legales.includes("con-flor-quiero")) return { titulo: "Te toca declarar", indicacion: respuestaConFlor };
    return {
      titulo: esTuTurno ? "Te toca declarar" : "Declara " + mesa.asientos[porDeclararFlor].nombre,
      indicacion: esTuTurno
        ? legales.includes("paso-flor") ? "No tenés flor en esta mano." : "Cantá tu flor."
        : "Esperando su declaración de flor.",
    };
  }
  if (pendiente) {
    const cantor = mesa.asientos[pendiente.asiento];
    const indicacion = cantor.nombre + " " + verboDeCanto(pendiente.tipo) + " " + canto[pendiente.tipo].toLowerCase() + ".";
    return { titulo: tituloDeRespuesta(mesa, vista, mesa.asientos.map(a => a.asiento)),
      indicacion: legales.includes("flor") ? indicacion + " Cantá tu flor para responder." : indicacion };
  }
  if (turno === mesa.miAsiento) {
    let indicacion = "Elegí una carta en el tapete.";
    if (legales.length > 1) indicacion = "Elegí una carta en el tapete o hacé un canto.";
    if (legales.includes("mazo") && !legales.includes("carta")) indicacion = "Podés irte al mazo.";
    if (legales.includes("flor")) indicacion = "Cantá tu flor antes de tirar la primera carta.";
    return { titulo: "Tu turno", indicacion };
  }
  return {
    titulo: turno === null ? "Esperando la jugada" : "Turno de " + mesa.asientos[turno].nombre,
    indicacion: "Esperando la jugada.",
  };
}

/** El título de la mesa de tercetos. */
export function palabraDeTercetos(mesa: Mesa, partida: PartidaTercetos) {
  const { vista, lance, contexto, ganadorPartida } = partida;
  const propio = mesa.asientos[mesa.miAsiento].equipo;
  const nombre = (a: number) => mesa.asientos[a].nombre;
  if (contexto.fase === "chico-terminado") return ganadorPartida === propio ? "Tu equipo ganó el chico" : "El rival ganó el chico";
  if (contexto.fase === "reparto-cerrado") return "Reparto terminado";
  if (vista.porDeclararFlor != null) {
    return vista.porDeclararFlor === mesa.miAsiento ? "Te toca declarar" : `Declara ${nombre(vista.porDeclararFlor)}`;
  }
  if (vista.pendiente) return tituloDeRespuesta(mesa, vista, lance.activos);
  if (vista.turno === mesa.miAsiento) return "Tu turno";
  return vista.turno == null ? "Esperando la jugada" : "Turno de " + nombre(vista.turno);
}

export interface Tanteador {
  meta: string;
  detalle: string;
  /** Primero el equipo propio. */
  equipos: { equipo: number; nombre: string; puntos: number; cuenta: string }[];
}

export function tanteador(meta: number, puntos: readonly [number, number], propio: number, equipo: (n: number) => string): Tanteador {
  return {
    meta: "Chico a " + meta,
    detalle: "Acumulado · " + mitadesDelChico(meta),
    equipos: [propio, 1 - propio].map(e => ({ equipo: e, nombre: equipo(e), puntos: puntos[e], cuenta: cuentaDelChico(puntos[e], meta) })),
  };
}
