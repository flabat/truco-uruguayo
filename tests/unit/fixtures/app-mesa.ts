import type { Mesa, Partida } from "@eltruco/cliente/cliente.ts";
import type { VistaOnline } from "@eltruco/motor/mesa-online.ts";
import type { Asiento } from "@eltruco/motor/reparto.ts";

type Cambios<T> = { -readonly [K in keyof T]?: T[K] };

const nombres1v1 = ["Ana", "Diego"];
const nombresParejas = ["Clara", "Diego", "Ana", "Beto"];

export function mesaDe(modo: "1v1" | "2v2", miAsiento: number, meta = modo === "1v1" ? 20 : 30): Mesa {
  const nombres = modo === "1v1" ? nombres1v1 : nombresParejas;
  return {
    id: "m1", modo, meta, publica: false, creadorId: "j0", miAsiento, invitacion: "i", lista: true,
    asientos: nombres.map((nombre, asiento) => ({ asiento, equipo: (asiento % 2) as 0 | 1, tipo: "humano", nombre })),
  };
}

/** Una vista completa con todos los campos obligatorios; las pruebas cambian solo lo que miran. */
export function vistaDe(jugadores: 2 | 4, asiento: Asiento, cambios: Cambios<VistaOnline> = {}): VistaOnline {
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
