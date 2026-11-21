import type { Vuelta, VueltaCerrada } from "../src/motor/mano.ts";
import type { EstadoOnline } from "../src/motor/mesa-online.ts";

function vueltaPublica(vuelta: Vuelta): Vuelta {
  return { salida: vuelta.salida, jugadas: vuelta.jugadas.map(({ asiento, carta }) => ({ asiento, carta })) };
}

/** El tablero se arma campo a campo, sin elegir un jugador como punto de vista. */
export function tableroEspectador(estado: EstadoOnline) {
  const { mano, resultado } = estado;
  return {
    dador: mano.reparto.dador, mano: mano.reparto.mano, muestra: mano.reparto.muestra,
    vueltas: mano.vueltas.map((v): VueltaCerrada => ({
      ...vueltaPublica(v), resultado: v.resultado.tipo === "parda" ? { tipo: "parda" } :
        { tipo: "ganada", asiento: v.resultado.asiento, equipo: v.resultado.equipo },
    })),
    vueltaActual: mano.vueltaActual ? vueltaPublica(mano.vueltaActual) : null,
    // Orden de cartas del tapete. La palabra para flor o una respuesta puede ser privada.
    turnoDeCartas: resultado ? null : mano.turno, valorTruco: estado.valorTruco,
    acciones: estado.acciones.filter(a => a.tipo !== "paso-flor").map(a => a.tipo === "carta"
      ? { tipo: a.tipo, asiento: a.asiento, carta: a.carta } : { tipo: a.tipo, asiento: a.asiento }),
    cobros: estado.cobros.map(({ equipo, tantos, motivo, asiento, tantoGanador }) =>
      ({ equipo, tantos, motivo, asiento, tantoGanador })),
    comparacionFlor: estado.comparacionFlor?.participantes.map(({ asiento, total }) => ({ asiento, total })),
    resultado: resultado && { equipo: resultado.equipo, tantos: resultado.tantos, motivo: resultado.motivo },
  };
}
