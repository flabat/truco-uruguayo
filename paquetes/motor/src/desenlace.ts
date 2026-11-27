import { mazo, type CardId } from "./cartas.ts";
import type { EstadoOnline } from "./cantos-online.ts";
import { compararCartas } from "./jerarquia.ts";
import { jugarCarta, type EstadoMano } from "./mano.ts";
import { equipoDelAsiento, type Asiento, type RepartoOnline } from "./reparto.ts";

type Mano = EstadoMano<RepartoOnline>;
/** Cartas no vistas agrupadas por fuerza: dentro de una clase, cualquiera da el mismo resultado. */
type Clase = { carta: CardId; quedan: number };

/**
 * ¿La mano de duelo ya está ganada o perdida para este asiento, con lo que él ve?
 * Solo usa sus cartas, las jugadas y la muestra: de las cartas del rival lee la cantidad, no cuáles son.
 * El rival elige cada carta del pozo no visto al jugarla, lo que cubre cualquier mano oculta en cualquier orden.
 */
export function desenlaceSeguro(estado: EstadoOnline, asiento: Asiento): "ganada" | "perdida" | null {
  const juego = analizar(estado, asiento);
  if (!juego) return null;
  if (!juego.explorar(juego.inicio, false)) return "perdida";
  if (juego.explorar(juego.inicio, true)) return "ganada";
  return null;
}

/** Las cartas propias que, jugadas ahora, conservan la mano ganada contra cualquier carta del rival. */
export function jugadasGanadoras(estado: EstadoOnline, asiento: Asiento): CardId[] {
  const juego = analizar(estado, asiento);
  if (!juego || juego.inicio.turno !== asiento) return [];
  const { inicio, explorar, jugar } = juego;
  return inicio.restantes[asiento].filter(carta => explorar(jugar(inicio, asiento, carta), true));
}

function analizar(estado: EstadoOnline, asiento: Asiento) {
  const { mano } = estado;
  if (estado.resultado || mano.vueltaActual === null || mano.reparto.manos.length !== 2) return null;
  const rival = (asiento === 0 ? 1 : 0) as Asiento;
  const { muestra } = mano.reparto;
  const jugadas = [...mano.vueltas.flatMap(v => v.jugadas), ...mano.vueltaActual.jugadas].map(j => j.carta);
  const vistas = new Set<CardId>([muestra, ...mano.reparto.manos[asiento], ...jugadas]);
  const clases: Clase[] = [];
  for (const carta of mazo) {
    if (vistas.has(carta)) continue;
    const clase = clases.find(c => compararCartas(c.carta, carta, muestra) === 0);
    if (clase) clase.quedan++;
    else clases.push({ carta, quedan: 1 });
  }
  const equipo = equipoDelAsiento(asiento);
  const inicio: Mano = { ...mano, restantes: mano.restantes.map((cartas, i) => i === rival ? [] : cartas) };

  // `todas`: el rival elige en contra (ganar siempre); si no, a favor (poder ganar).
  function explorar(e: Mano, todas: boolean): boolean {
    if (e.equipoGanador !== null) return e.equipoGanador === equipo;
    if (e.turno === asiento) {
      return e.restantes[asiento].some(carta => explorar(jugar(e, asiento, carta), todas));
    }
    const opciones = clases.filter(c => c.quedan > 0);
    const prueba = (clase: Clase) => {
      clase.quedan--;
      const gana = explorar(jugar(e, rival, clase.carta), todas);
      clase.quedan++;
      return gana;
    };
    return todas ? opciones.every(prueba) : opciones.some(prueba);
  }

  function jugar(e: Mano, quien: Asiento, carta: CardId): Mano {
    const conCarta = quien === rival ? { ...e, restantes: e.restantes.map((c, i) => i === rival ? [carta] : c) } : e;
    const paso = jugarCarta(conCarta, { asiento: quien, carta });
    if (!paso.ok) throw new Error(`Jugada imposible al analizar el desenlace: ${paso.error}`);
    return paso.estado;
  }

  return { inicio, explorar, jugar };
}
