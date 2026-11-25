import type { IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import type { Vuelta, VueltaCerrada } from "@eltruco/motor/mano.ts";
import type { AccionOnline, EstadoOnline } from "@eltruco/motor/mesa-online.ts";

/** Los pases anteriores a la respuesta pública de las computadoras eran consultas privadas. */
export function esAccionPublica(accion: AccionOnline, respondenSinFlor: readonly number[] | null | undefined) {
  return accion.tipo !== "paso-flor" || respondenSinFlor?.includes(accion.asiento) === true;
}

function vueltaPublica(vuelta: Vuelta): Vuelta {
  return { salida: vuelta.salida, jugadas: vuelta.jugadas.map(({ asiento, carta }) => ({ asiento, carta })) };
}

/** El tablero se arma campo a campo, sin elegir un jugador como punto de vista. */
export function tableroEspectador(estado: EstadoOnline, indicaciones?: readonly IndicacionPie[]) {
  const { mano, resultado } = estado;
  // El visor oculta ciertas consultas de flor. Traducir el ancla al índice que el espectador ve.
  const esPublica = (accion: AccionOnline) => esAccionPublica(accion, mano.reparto.respondenSinFlor);
  const palabras = indicaciones?.map(({ emisor, destinatario, frase, carta, vuelta, indiceAccion }) => ({
    emisor, destinatario, frase, ...(carta && { carta }), vuelta, indiceAccion: estado.acciones.slice(0, indiceAccion).filter(esPublica).length,
  }));
  return {
    ...(palabras && { indicaciones: palabras }),
    dador: mano.reparto.dador, mano: mano.reparto.mano, muestra: mano.reparto.muestra,
    vueltas: mano.vueltas.map((v): VueltaCerrada => ({
      ...vueltaPublica(v), resultado: v.resultado.tipo === "parda" ? { tipo: "parda" } :
        { tipo: "ganada", asiento: v.resultado.asiento, equipo: v.resultado.equipo },
    })),
    vueltaActual: mano.vueltaActual ? vueltaPublica(mano.vueltaActual) : null,
    // Orden de cartas del tapete. La palabra para flor o una respuesta puede ser privada.
    turnoDeCartas: resultado ? null : mano.turno, valorTruco: estado.valorTruco,
    acciones: estado.acciones.filter(esPublica).map(a => a.tipo === "carta"
      ? { tipo: a.tipo, asiento: a.asiento, carta: a.carta } : { tipo: a.tipo, asiento: a.asiento }),
    cobros: estado.cobros.map(({ equipo, tantos, motivo, asiento, tantoGanador }) =>
      ({ equipo, tantos, motivo, asiento, tantoGanador })),
    comparacionFlor: estado.comparacionFlor?.participantes.map(({ asiento, total }) => ({ asiento, total })),
    resultado: resultado && { equipo: resultado.equipo, tantos: resultado.tantos, motivo: resultado.motivo },
  };
}
