import { randomInt } from "node:crypto";
import { esCardId, mazo, pieza } from "./cartas.ts";
import { compararCartas } from "./jerarquia.ts";
import { elegirJugada } from "./jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara, type VistaAsiento, type ErrorJugada } from "./mano.ts";
import { esAsiento, esRepartoOnline, type Asiento, type RepartoOnline, type TresCartas } from "./reparto.ts";
import {
  aDecidir, cobrarVueltas, legalesOnline, resolverCanto, tantosPropios, type AccionOnline, type Cobro,
  type EstadoOnline, type Oferta, type TipoAccionOnline,
} from "./cantos-online.ts";

export { aDecidir };
export type { AccionOnline, Cobro, EstadoOnline, RepartoOnline, TipoAccionOnline };
export const versionReglasOnline = 1;

/** Reparte en el servidor una carta por asiento en cada una de las tres rondas. */
export function repartirOnline(cantidad: 2 | 4, dador?: number): RepartoOnline {
  if (cantidad !== 2 && cantidad !== 4) throw new RangeError("La mesa requiere dos o cuatro asientos.");
  dador ??= randomInt(cantidad);
  if (!esAsiento(dador) || dador >= cantidad) throw new RangeError("El dador debe ocupar un asiento de la mesa.");
  const mano = ((dador + 1) % cantidad) as Asiento;
  const mazoMezclado = [...mazo];
  // Fisher–Yates parcial: solo se precisan las tres rondas y la muestra.
  for (let i = 0; i <= 3 * cantidad; i++) {
    const j = randomInt(i, mazoMezclado.length);
    [mazoMezclado[i], mazoMezclado[j]] = [mazoMezclado[j], mazoMezclado[i]];
  }
  const manos = Array.from({ length: cantidad }, (_, asiento): TresCartas => {
    const primera = (asiento - mano + cantidad) % cantidad;
    return [mazoMezclado[primera], mazoMezclado[primera + cantidad], mazoMezclado[primera + cantidad * 2]];
  });
  return { versionReparto: "online-1", dador, mano, manos, muestra: mazoMezclado[cantidad * 3] };
}

export function iniciarOnline(reparto: RepartoOnline, puntosInicio: readonly [number, number] = [0, 0], meta = 40): EstadoOnline {
  if (!esRepartoOnline(reparto)) throw new TypeError("Se necesita un reparto de mesa en línea válido.");
  if (!Number.isSafeInteger(meta) || meta <= 0 || puntosInicio.length !== 2
    || !puntosInicio.every(p => Number.isSafeInteger(p) && p >= 0 && p < meta)) {
    throw new RangeError("La meta y los tantos de inicio deben corresponder a un partido en juego.");
  }
  return {
    mano: iniciarMano(reparto), puntosInicio: [...puntosInicio], meta, acciones: [], cobros: [], resultado: null,
    valorTruco: 1, ultimoCantorTruco: null, trucoPendiente: null, lateral: null, lateralCerrado: false,
    flores: [], consultaFlor: [], respuestaEnvido: null, rechazoTruco: false,
  };
}

type PasoOnline = { ok: true; estado: EstadoOnline } | { ok: false; error: ErrorJugada | "accion-invalida" | "accion-no-permitida" };

/** La parda en la segunda también le da la mano a quien ganó la primera. */
export function segundaPerdidaEnDuelo({ mano }: EstadoOnline, asiento: Asiento): boolean {
  const primera = mano.vueltas[0]?.resultado;
  const salida = mano.vueltaActual?.jugadas[0];
  return mano.reparto.manos.length === 2 && mano.vueltas.length === 1
    && primera?.tipo === "ganada" && primera.asiento !== asiento
    && mano.turno === asiento && salida?.asiento === primera.asiento
    && mano.restantes[asiento].every(carta => compararCartas(carta, salida.carta, mano.reparto.muestra) <= 0);
}

export function aplicarOnline(estado: EstadoOnline, accion: AccionOnline): PasoOnline {
  if (estado.resultado) return { ok: false, error: "mano-cerrada" };
  if (!accion || !esAsiento(accion.asiento) || accion.asiento >= estado.mano.reparto.manos.length) {
    return { ok: false, error: "accion-invalida" };
  }
  const { tipo, asiento } = accion;
  const legales = legalesOnline(estado, asiento);
  const permitida = tipo === "mazo"
    ? legales.includes("carta") && segundaPerdidaEnDuelo(estado, asiento)
    : legales.includes(tipo);
  if (!permitida) {
    return { ok: false, error: !aDecidir(estado).includes(asiento) ? "fuera-de-turno" : "accion-no-permitida" };
  }
  const siguiente = { ...estado };
  if (tipo === "carta") {
    if (!esCardId(accion.carta)) return { ok: false, error: "jugada-invalida" };
    const jugada = { asiento, carta: accion.carta };
    const paso = jugarCarta(estado.mano, jugada);
    if (!paso.ok) return paso;
    siguiente.mano = paso.estado;
    siguiente.acciones = [...estado.acciones, { tipo, ...jugada }];
    if (paso.estado.equipoGanador !== null) cobrarVueltas(siguiente, paso.estado.equipoGanador);
  } else {
    const canto = { tipo, asiento };
    siguiente.acciones = [...estado.acciones, canto];
    resolverCanto(siguiente, canto);
  }
  return { ok: true, estado: siguiente };
}

export interface VistaOnline extends VistaAsiento {
  readonly apuesta: "sin-canto" | "pendiente" | "querido" | "rechazado";
  readonly acciones: readonly AccionOnline[];
  readonly legales: readonly TipoAccionOnline[];
  readonly resultado: EstadoOnline["resultado"];
  readonly valorTruco: number;
  readonly pendiente: Oferta | null;
  readonly trucoPendiente: EstadoOnline["trucoPendiente"];
  readonly porDeclararFlor: Asiento | null;
  readonly cobros: readonly Cobro[];
  readonly tantosPropios: ReturnType<typeof tantosPropios>;
}

export function vistaOnline(estado: EstadoOnline, asiento: Asiento): VistaOnline {
  const mesa = vistaPara(estado.mano, asiento);
  const { resultado, valorTruco } = estado;
  const trucoPendiente = resultado ? null : estado.trucoPendiente;
  const pendiente = resultado ? null : estado.lateral ?? trucoPendiente;
  const apuesta = resultado?.motivo === "rechazo" ? "rechazado" : trucoPendiente ? "pendiente"
    : valorTruco > 1 ? "querido" : "sin-canto";
  return {
    ...mesa, turno: resultado ? null : mesa.turno, vueltaActual: resultado ? null : mesa.vueltaActual,
    equipoGanador: resultado?.equipo ?? null, apuesta, valorTruco, legales: legalesOnline(estado, asiento),
    resultado: resultado && { ...resultado }, pendiente: pendiente && { tipo: pendiente.tipo, asiento: pendiente.asiento },
    trucoPendiente: trucoPendiente && { ...trucoPendiente }, porDeclararFlor: estado.consultaFlor[0] ?? null,
    acciones: structuredClone(estado.acciones), cobros: structuredClone(estado.cobros), tantosPropios: tantosPropios(estado, asiento),
  };
}

/** El bot recibe la misma vista que un humano en ese asiento y elige entre sus acciones legales. */
export function elegirAccionOnline(vista: VistaOnline): AccionOnline | null {
  const { asiento, cartas, muestra, legales, tantosPropios: { total } } = vista;
  if (!legales.length) return null;
  const fuertes = cartas.filter(carta => compararCartas(carta, "oros-03", muestra) >= 0);
  const primera = vista.vueltas[0]?.resultado;
  const ventaja = primera?.tipo === "ganada" && primera.equipo === vista.equipoPorAsiento[asiento];
  const ofertas: TipoAccionOnline[] = ["flor", "paso-flor"];
  if (total >= 42) ofertas.push("contraflor-al-resto");
  if (total >= 33) ofertas.push("con-flor-envido");
  if (total >= 35) ofertas.push("falta-envido");
  if (total >= 31) ofertas.push("real-envido");
  if (total >= 28) ofertas.push("envido");
  if (fuertes.length >= 2 || ventaja && fuertes.length > 0) ofertas.push("vale-cuatro", "retruco");
  if (fuertes.length >= 2 || cartas.some(carta => pieza(carta, muestra) !== null)) ofertas.push("truco");
  const oferta = ofertas.find(tipo => legales.includes(tipo));
  if (oferta && oferta !== "carta") return { tipo: oferta, asiento };
  if (legales.includes("quiero")) {
    let acepta: boolean;
    if (vista.pendiente?.tipo === "flor") acepta = true;
    else if (vista.pendiente?.tipo === "con-flor-envido" || vista.pendiente?.tipo === "contraflor-al-resto") acepta = total >= 33;
    else if (vista.pendiente && ["envido", "real-envido", "falta-envido"].includes(vista.pendiente.tipo)) acepta = total >= 25;
    else acepta = fuertes.length > 0 || ventaja;
    return { tipo: acepta ? "quiero" : "no-quiero", asiento };
  }
  return { tipo: "carta", asiento, carta: elegirJugada(vista) };
}
