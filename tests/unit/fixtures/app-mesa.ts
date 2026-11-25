import type { Mesa, Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import type { VistaOnline, VistaTercetos } from "@eltruco/motor/mesa-online.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";

type Cambios<T> = { -readonly [K in keyof T]?: T[K] };

const nombres1v1 = ["Ana", "Diego"];
const nombresParejas = ["Clara", "Diego", "Ana", "Beto"];
// Tercetos: el equipo 0 es 0, 2 y 4; el equipo 1 es 1, 3 y 5.
const nombresTercetos = ["Clara", "Diego", "Ana", "Beto", "Eli", "Fede"];

export function mesaDe(modo: "1v1" | "2v2", miAsiento: number, meta = modo === "1v1" ? 20 : 30): Mesa {
  const nombres = modo === "1v1" ? nombres1v1 : nombresParejas;
  return {
    id: "m1", modo, meta, publica: false, creadorId: "j0", miAsiento, invitacion: "i", lista: true,
    asientos: nombres.map((nombre, asiento) => ({ asiento, equipo: (asiento % 2) as 0 | 1, tipo: "humano", nombre })),
  };
}

/** Una vista completa con todos los campos obligatorios; las pruebas cambian solo lo que miran. */
export function vistaDe(jugadores: 2 | 4 | 6, asiento: Asiento, cambios: Cambios<VistaOnline> = {}): VistaOnline {
  return {
    asiento,
    cartas: ["espadas-01", "oros-07", "copas-04"],
    muestra: "bastos-05",
    dador: 1,
    mano: 0,
    equipoPorAsiento: Array.from({ length: jugadores }, (_, i) => (i % 2) as 0 | 1),
    turno: null,
    vueltaActual: { salida: 0, jugadas: [] },
    vueltas: [],
    equipoGanador: null,
    apuesta: "sin-canto",
    acciones: [],
    legales: [],
    resultado: null,
    valorTruco: 1,
    pendiente: null,
    trucoPendiente: null,
    porDeclararFlor: null,
    cobros: [],
    tantosPropios: { modalidad: "envido", total: 27 },
    ...cambios,
  };
}

export function partidaDe(vista: VistaOnline, cambios: Cambios<Omit<Partida, "vista">> = {}): Partida {
  return {
    version: 1,
    manoNumero: 1,
    puntos: [0, 0],
    meta: vista.equipoPorAsiento.length === 2 ? 20 : 30,
    ganadorPartida: null,
    contexto: { versionVista: 1, fase: "en-juego" },
    lance: { tipo: "simple", duelo: null, activos: vista.equipoPorAsiento.map((_, i) => i as Asiento) },
    vista,
    ...cambios,
  };
}

export function mesaTercetosDe(miAsiento: number, meta = 30): Mesa {
  return {
    ...mesaDe("2v2", miAsiento, meta), modo: "3v3", formato: "triples",
    asientos: nombresTercetos.map((nombre, asiento) => ({ asiento, equipo: (asiento % 2) as 0 | 1, tipo: "humano", nombre })),
  };
}

type CambiosTercetos = Cambios<Omit<PartidaTercetos, "vista" | "formato">> & {
  estado?: "jugando" | "esperando" | "terminado";
  faltaPorEquipo?: readonly [number, number];
};

/** Una partida de tercetos en redondilla salvo que el cambio traiga otro lance. Sin «jugando» no hay mano propia. */
export function partidaTercetosDe(vista: VistaOnline, cambios: CambiosTercetos = {}): PartidaTercetos {
  const { estado = "jugando", faltaPorEquipo = [30, 30], ...resto } = cambios;
  const { cartas: _cartas, tantosPropios: _tantos, ...publica } = vista;
  const tercetos: VistaTercetos = estado === "jugando"
    ? { ...vista, estado, faltaPorEquipo }
    : { ...publica, estado, legales: [], faltaPorEquipo };
  return {
    version: 1,
    manoNumero: 1,
    puntos: [0, 0],
    meta: 30,
    ganadorPartida: null,
    contexto: { versionVista: 1, fase: "en-juego" },
    formato: "triples",
    lance: { tipo: "redondilla", duelo: null, activos: [0, 1, 2, 3, 4, 5] },
    historialLances: [],
    vista: tercetos,
    ...resto,
  };
}
