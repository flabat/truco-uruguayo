import { elegirJugada } from "./jugadores.ts";
import { jugarCarta, vistaPara, type EstadoMano } from "./mano.ts";

/** El asiento 0 decide su carta. Los otros tres juegan hasta devolverle el turno o cerrar la mano. */
export function avanzarHastaAprendiz(estado: EstadoMano): EstadoMano {
  while (estado.turno !== null && estado.turno !== 0) {
    const asiento = estado.turno;
    const carta = elegirJugada(vistaPara(estado, asiento));
    const paso = jugarCarta(estado, { asiento, carta });
    if (!paso.ok) throw new Error(`Jugada del asiento ${asiento} rechazada (${paso.error}).`);
    estado = paso.estado;
  }
  return estado;
}
