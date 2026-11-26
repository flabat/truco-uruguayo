import type { MesaRetomable } from "@eltruco/cliente/salon.ts";

const semana = 7 * 24 * 60 * 60 * 1000;
const capacidad = { "1v1": 2, "2v2": 4, "3v3": 6 };

export function estadoDeMiMesa({ mano, participantes, modo }: MesaRetomable) {
  if (mano !== null) return "Mano " + mano;
  return participantes.length + 1 === capacidad[modo] ? "Lista para jugar" : "Esperando jugadores";
}

/** La API entrega las mesas de más a menos recientes. Conservá ese orden dentro de cada grupo. */
export function agruparMisMesas(mesas: MesaRetomable[], ahora: number) {
  if (mesas.length <= 1) return { visibles: mesas, anteriores: [] };
  const conTurno: MesaRetomable[] = [];
  const sinTurno: MesaRetomable[] = [];
  const anteriores: MesaRetomable[] = [];
  for (const mesa of mesas) {
    const actividad = mesa.ultimaActividad && Date.parse(mesa.ultimaActividad);
    if (!actividad || actividad <= ahora - semana) anteriores.push(mesa);
    else if (mesa.teToca) conTurno.push(mesa);
    else sinTurno.push(mesa);
  }
  return { visibles: [...conTurno, ...sinTurno], anteriores };
}
