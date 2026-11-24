import type { CardId } from "@eltruco/motor/cartas.ts";
import { elegirJugada } from "@eltruco/motor/jugadores.ts";
import { jugarCarta, vistaPara, type EstadoMano } from "@eltruco/motor/mano.ts";
import { crearAzar, equipoPorAsiento, type Asiento } from "@eltruco/motor/reparto.ts";
import { anotarMundo, crearConteo, sumarLote } from "./estadistica.ts";
import { prepararMundos, type MundosDisponibles } from "./mundos.ts";
import { perfilAnalisis, resultadoCompleto, semillaAnalisis, type Perfil, type ResultadoAnalisis } from "./perfil.ts";

const limiteExacto = 32768;
const objetivoPractica = 4096;
const limitePropuestas = 65536;
const objetivoEstudio = 20000;

function tirar(estado: EstadoMano, asiento: Asiento, carta: CardId): EstadoMano {
  const paso = jugarCarta(estado, { asiento, carta });
  if (!paso.ok) throw new Error(`El motor rechazó la carta simulada (${paso.error}).`);
  return paso.estado;
}

/** Cada alternativa parte del mismo estado inmutable, con cartas ajenas privadas por asiento. */
export function ganaConCarta(inicial: EstadoMano, carta: CardId): boolean {
  if (inicial.turno === null) throw new RangeError("La mano ya terminó.");
  const pareja = equipoPorAsiento[inicial.turno];
  let estado = tirar(inicial, inicial.turno, carta);
  while (estado.turno !== null) {
    const asiento = estado.turno;
    estado = tirar(estado, asiento, elegirJugada(vistaPara(estado, asiento)));
  }
  return estado.equipoGanador === pareja;
}

function* muestrear(fuente: MundosDisponibles, perfil: Perfil): Generator<EstadoMano | null> {
  const azar = crearAzar(semillaAnalisis);
  for (let i = 0; i < limitePropuestas; i++) {
    // El estudio publicado inicia una secuencia por reparto. La práctica mantiene un solo flujo.
    yield fuente.proponer(perfil === "apertura-20000-v1" ? crearAzar(semillaAnalisis + i) : azar);
  }
}

export interface AvanceCalculo {
  mundos: number;
  /** En enumeración no hay propuestas aleatorias. */
  propuestas: number;
}

export function* evaluarMundos(fuente: MundosDisponibles, tamanoLote: number): Generator<AvanceCalculo, ResultadoAnalisis> {
  if (!Number.isSafeInteger(tamanoLote) || tamanoLote < 1) throw new RangeError("El lote debe ser un entero positivo.");
  const { posicion } = fuente;
  const perfil = perfilAnalisis(posicion);
  const exacto = fuente.producto <= limiteExacto;
  const objetivo = perfil === "apertura-20000-v1" ? objetivoEstudio : objetivoPractica;
  const cartas = posicion.cartas;
  const total = crearConteo(cartas);
  let lote = crearConteo(cartas);
  let visitados = 0;
  const mundos = exacto ? fuente.enumerar(limiteExacto) : muestrear(fuente, perfil);
  for (const mundo of mundos) {
    visitados++;
    if (mundo !== null) anotarMundo(lote, cartas.map(carta => ganaConCarta(mundo, carta)));
    if (!exacto && total.mundos + lote.mundos === objetivo) break;
    if (visitados % tamanoLote === 0) {
      sumarLote(total, lote);
      lote = crearConteo(cartas);
      yield { mundos: total.mundos, propuestas: exacto ? 0 : visitados };
    }
  }
  sumarLote(total, lote);
  if (exacto && !total.mundos) return { tipo: "incompatible" };
  if (!exacto && total.mundos < objetivo) {
    return { tipo: "presupuesto-agotado", mundos: total.mundos, propuestas: visitados };
  }
  return resultadoCompleto(posicion, total, exacto ? "exacto" : "estimado", exacto ? null : visitados);
}

export function* calcularPorLotes(entrada: unknown, tamanoLote = 64): Generator<AvanceCalculo, ResultadoAnalisis> {
  const fuente = prepararMundos(entrada);
  if (fuente.tipo !== "disponible") return { tipo: fuente.tipo };
  return yield* evaluarMundos(fuente, tamanoLote);
}

export function calcularProbabilidades(entrada: unknown): ResultadoAnalisis {
  const calculo = calcularPorLotes(entrada);
  let paso = calculo.next();
  while (!paso.done) paso = calculo.next();
  return paso.value;
}
