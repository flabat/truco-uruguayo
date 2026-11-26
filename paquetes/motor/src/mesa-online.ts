import { resumirTantos, type ResumenTantos } from "./resumen-tantos.ts";
import { enteroAleatorio } from "./azar.ts";
import { esMetaDeChico, metaPorModalidad } from "./chico.ts";
import { esCardId, mazo, pieza, type CardId } from "./cartas.ts";
import { evaluarTantos, type Desglose } from "./tantos.ts";
import { faltaDelGanador, tipoDeReparto } from "./reglas-tercetos.ts";
import { compararCartas } from "./jerarquia.ts";
import { elegirJugada } from "./jugadores.ts";
import { iniciarMano, jugarCarta, vistaPublicaPara, type VistaAsiento, type ErrorJugada } from "./mano.ts";
import { esAsientoOnline, esRepartoOnline, sonAsientosDeMesa, type Asiento, type AsientoV1, type RepartoOnline, type TresCartas } from "./reparto.ts";
import {
  aDecidir, cobrarVueltas, legalesOnline, marcadorOnline, resolverCanto, tantosPropios, type AccionOnline, type AccionOnlineV1, type Cobro,
  type EstadoOnline, type LanceTercetos, type ResumenLance, type Oferta, type TipoAccionOnline, type TipoAccionOnlineV1,
} from "./cantos-online.ts";

export { aDecidir };
export { marcadorOnline } from "./cantos-online.ts";
export { versionReglasTercetos } from "./reglas-tercetos.ts";
export type { AccionOnline, AccionOnlineV1, Cobro, EstadoOnline, LanceTercetos, ResumenLance, RepartoOnline, TipoAccionOnline, TipoAccionOnlineV1 };
export const versionReglasOnline = 1;

/** Reparte en el servidor una carta por asiento en cada una de las tres rondas. */
export function repartirOnline(cantidad: 2 | 4 | 6, dador?: number, computadoras: readonly Asiento[] = []): RepartoOnline {
  if (cantidad !== 2 && cantidad !== 4 && cantidad !== 6) throw new RangeError("La mesa requiere dos, cuatro o seis asientos.");
  if (!sonAsientosDeMesa(computadoras, cantidad)) throw new RangeError("Las computadoras deben ocupar asientos distintos de la mesa.");
  dador ??= enteroAleatorio(cantidad);
  if (!esAsientoOnline(dador) || dador >= cantidad) throw new RangeError("El dador debe ocupar un asiento de la mesa.");
  const mano = ((dador + 1) % cantidad) as Asiento;
  const mazoMezclado = [...mazo];
  // Fisher–Yates parcial: solo se precisan las tres rondas y la muestra.
  for (let i = 0; i <= 3 * cantidad; i++) {
    const j = enteroAleatorio(i, mazoMezclado.length);
    [mazoMezclado[i], mazoMezclado[j]] = [mazoMezclado[j], mazoMezclado[i]];
  }
  const manos = Array.from({ length: cantidad }, (_, asiento): TresCartas => {
    const primera = (asiento - mano + cantidad) % cantidad;
    return [mazoMezclado[primera], mazoMezclado[primera + cantidad], mazoMezclado[primera + cantidad * 2]];
  });
  return { reglaFlor: "inmediata-v2", ...(computadoras.length && { respondenSinFlor: [...computadoras], respuestaSinFlor: "antes-de-actuar" as const }),
    versionReparto: cantidad === 6 ? "online-2" : "online-1", dador, mano, manos, muestra: mazoMezclado[cantidad * 3] };
}

function dueloDelPico(mano: Asiento, duelo: 1 | 2 | 3): LanceTercetos {
  const primero = ((mano + duelo - 1) % 6) as Asiento;
  return { tipo: "pico-a-pico", duelo, activos: [primero, ((primero + 3) % 6) as Asiento] };
}

export function iniciarOnline(reparto: RepartoOnline, puntosInicio: readonly [number, number] = [0, 0],
    metaElegida?: number, numeroReparto = 1): EstadoOnline {
  if (!esRepartoOnline(reparto)) throw new TypeError("Se necesita un reparto de mesa en línea válido.");
  const meta = metaElegida === undefined ? metaPorModalidad[reparto.manos.length === 6 ? "3v3" : reparto.manos.length === 2 ? "1v1" : "2v2"] : metaElegida;
  if ((reparto.versionReparto === "online-2" && !esMetaDeChico(meta)) || !Number.isSafeInteger(meta) || meta <= 0 || puntosInicio.length !== 2
    || !puntosInicio.every(p => Number.isSafeInteger(p) && p >= 0 && p < meta)) {
    throw new RangeError("La meta y los tantos de inicio deben corresponder a un partido en juego.");
  }
  let lance: LanceTercetos | undefined;
  if (reparto.versionReparto === "online-2") {
    lance = tipoDeReparto(numeroReparto, puntosInicio, meta) === "pico-a-pico"
      ? dueloDelPico(reparto.mano, 1)
      : { tipo: "redondilla", duelo: null, activos: reparto.manos.map((_, i) => ((reparto.mano + i) % 6) as Asiento) };
  }
  return abrirLance(reparto, puntosInicio, meta, lance, []);
}

function abrirLance(reparto: RepartoOnline, puntosInicio: readonly [number, number], meta: number,
    lance: LanceTercetos | undefined, historialLances: readonly ResumenLance[]): EstadoOnline {
  return {
    ...(lance && { lance, historialLances }),
    mano: iniciarMano(reparto, lance?.tipo === "pico-a-pico" ? lance.activos : undefined),
    puntosInicio: [...puntosInicio], meta, acciones: [], cobros: [], resultado: null,
    valorTruco: 1, ultimoCantorTruco: null, trucoPendiente: null, lateral: null, lateralCerrado: false,
    flores: [], consultaFlor: [], respuestaEnvido: null, rechazoTruco: false,
  };
}

/** Transición atómica tras el último cobro de un lance, reproducible con la misma acción. */
function cerrarLance(estado: EstadoOnline): EstadoOnline {
  const { lance, resultado } = estado;
  if (!lance || !resultado) return estado;
  const puntos = marcadorOnline(estado);
  const resumen: ResumenLance = { ...lance, resultado, puntos, acciones: estado.acciones,
    cobros: estado.cobros, vueltas: estado.mano.vueltas,
    ...(estado.indiceCobroLateral !== undefined && { indiceCobroLateral: estado.indiceCobroLateral }),
    ...(estado.comparacionEnvido && { comparacionEnvido: estado.comparacionEnvido }) };
  const historial = [...estado.historialLances!, resumen];
  if (!puntos.includes(estado.meta) && lance.tipo === "pico-a-pico" && lance.duelo < 3) {
    const proximo = dueloDelPico(estado.mano.reparto.mano, lance.duelo === 1 ? 2 : 3);
    return abrirLance(estado.mano.reparto, puntos, estado.meta, proximo, historial);
  }
  return { ...estado, historialLances: historial, trucoPendiente: null, lateral: null, consultaFlor: [],
    respuestaEnvido: null, rechazoTruco: false, retiro: undefined,
    mano: { ...estado.mano, turno: null, vueltaActual: null } };
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

/** Solo las cartas propias y los hechos públicos pueden justificar interrumpir la salida rival. */
export function anticiparAnteFlor(estado: EstadoOnline, humanos: readonly number[]): EstadoOnline {
  const { mano, flores } = estado;
  const primera = mano.vueltas[0];
  if (estado.resultado || estado.lateral || estado.trucoPendiente || estado.consultaFlor.length
      || mano.reparto.manos.length !== 2 || mano.vueltas.length !== 1 || mano.vueltaActual?.jugadas.length !== 0
      || primera.resultado.tipo !== "ganada" || !flores.includes(primera.resultado.asiento)) return estado;
  const rival = primera.resultado.asiento;
  const asiento = rival === 0 ? 1 : 0;
  if (humanos.includes(asiento)) return estado;

  const muestra = mano.reparto.muestra;
  const propias = mano.restantes[asiento];
  const expuesta = primera.jugadas.find(j => j.asiento === rival)!.carta;
  const vistas = [muestra, ...propias, ...primera.jugadas.map(j => j.carta)];
  const [menor, mayor] = [...propias].sort((a, b) => compararCartas(a, b, muestra));
  const posibles = mazo.filter(carta => !vistas.includes(carta) && compararCartas(mayor, carta, muestra) > 0);
  const totalRival = estado.comparacionFlor?.participantes.find(p => p.asiento === rival)?.total;
  const comparacion = estado.cobros.find(c => c.motivo === "flor" && c.tantoGanador !== undefined);
  // Basta un par compatible que permita ganar ambas vueltas para dejar salir al rival.
  for (const [i, a] of posibles.entries()) {
    for (const b of posibles.slice(i + 1)) {
      if (compararCartas(menor, a, muestra) <= 0 && compararCartas(menor, b, muestra) <= 0) continue;
      const tantos = evaluarTantos([expuesta, a, b], muestra);
      if (tantos.modalidad !== "flor" || (totalRival !== undefined && tantos.total !== totalRival)) continue;
      if (totalRival === undefined && comparacion?.tantoGanador !== undefined) {
        const ganador = comparacion.asiento === rival;
        const maximo = comparacion.tantoGanador;
        if (ganador ? tantos.total !== maximo
            : tantos.total > maximo || (tantos.total === maximo && mano.reparto.mano === rival)) continue;
      }
      return estado;
    }
  }
  return { ...estado, antesDeSalida: asiento };
}

export function aplicarOnline(estado: EstadoOnline, accion: AccionOnline): PasoOnline {
  if (estado.resultado) return { ok: false, error: "mano-cerrada" };
  if (!accion || !esAsientoOnline(accion.asiento) || accion.asiento >= estado.mano.reparto.manos.length) {
    return { ok: false, error: "accion-invalida" };
  }
  const { tipo, asiento } = accion;
  const legales = legalesOnline(estado, asiento);
  const permitida = legales.includes(tipo)
    || (tipo === "mazo" && legales.includes("carta") && segundaPerdidaEnDuelo(estado, asiento));
  if (!permitida) {
    return { ok: false, error: !aDecidir(estado).includes(asiento) ? "fuera-de-turno" : "accion-no-permitida" };
  }
  const siguiente = { ...estado };
  delete siguiente.antesDeSalida;
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
  return { ok: true, estado: cerrarLance(siguiente) };
}

export interface PruebaDeTantos {
  readonly asiento: Asiento;
  readonly motivo: "flor" | "envido";
  readonly total: number;
  readonly cartas: readonly CardId[];
  readonly duelo?: 1 | 2 | 3;
}

export interface VistaOnline extends VistaAsiento {
  readonly resumenTantos?: ResumenTantos;
  readonly resumenReparto?: ResumenTantos;
  readonly apuesta: "sin-canto" | "pendiente" | "querido" | "rechazado";
  readonly acciones: readonly AccionOnline[];
  readonly legales: readonly TipoAccionOnline[];
  readonly resultado: EstadoOnline["resultado"];
  readonly valorTruco: number;
  readonly pendiente: Oferta | null;
  readonly trucoPendiente: EstadoOnline["trucoPendiente"];
  readonly porDeclararFlor: Asiento | null;
  readonly cobros: readonly (Cobro & Pick<EstadoOnline, "comparacionFlor" | "comparacionEnvido">)[];
  readonly indiceCobroLateral?: number;
  readonly pruebasDeTantos?: readonly PruebaDeTantos[];
  readonly tantosPropios: ReturnType<typeof tantosPropios>;
}

function vistaPublicaOnline(estado: EstadoOnline, asiento: Asiento) {
  const mesa = vistaPublicaPara(estado.mano, asiento);
  const proximo = estado.consultaFlor[0];
  // Solo el asiento consultado ve que le toca declarar o contestar.
  const porDeclararFlor = estado.mano.reparto.reglaFlor && proximo !== asiento ? null : proximo ?? null;
  const { resultado, valorTruco } = estado;
  const trucoPendiente = resultado ? null : estado.trucoPendiente;
  const pendiente = resultado ? null : estado.lateral ?? trucoPendiente;
  const apuesta: VistaOnline["apuesta"] = resultado?.motivo === "rechazo" ? "rechazado" : trucoPendiente ? "pendiente"
    : valorTruco > 1 ? "querido" : "sin-canto";
  return {
    ...mesa, turno: resultado ? null : estado.antesDeSalida ?? mesa.turno, vueltaActual: resultado ? null : mesa.vueltaActual,
    equipoGanador: resultado?.equipo ?? null, apuesta, valorTruco,
    resultado: resultado && { ...resultado }, pendiente: pendiente && { tipo: pendiente.tipo, asiento: pendiente.asiento },
    trucoPendiente: trucoPendiente && { ...trucoPendiente }, porDeclararFlor,
    acciones: structuredClone(estado.acciones), cobros: structuredClone(estado.cobros),
  };
}

function privadaJugable(estado: EstadoOnline, asiento: Asiento): VistaOnline {
  return { ...vistaPublicaOnline(estado, asiento), cartas: [...estado.mano.restantes[asiento]],
    legales: legalesOnline(estado, asiento), tantosPropios: tantosPropios(estado, asiento) };
}

function cantosPublicos(estado: EstadoOnline): Pick<VistaOnline, "indiceCobroLateral" | "pruebasDeTantos"> {
  const indice = estado.indiceCobroLateral === undefined ? {} : { indiceCobroLateral: estado.indiceCobroLateral };
  if (!estado.resultado) return indice;

  // El pico conserva el reparto en los tres duelos. Las pruebas de los duelos anteriores
  // también se muestran recién al cerrar ese reparto.
  const lances = estado.historialLances ?? [{ cobros: estado.cobros, acciones: estado.acciones, duelo: null }];
  const pruebasDeTantos: PruebaDeTantos[] = [];
  const { manos, muestra } = estado.mano.reparto;
  for (const { cobros, duelo, acciones } of lances) {
    const jugadas = new Set(acciones.flatMap(a => a.tipo === "carta" ? [a.carta] : []));
    const porMostrar = (d: Desglose) => d.aportes.filter(a => !jugadas.has(a.carta)).length;
    for (const { motivo, asiento, tantoGanador } of cobros) {
      if (motivo === "truco" || asiento === undefined || tantoGanador === undefined) continue;
      const { desgloses } = evaluarTantos(manos[asiento], muestra);
      const prueba = desgloses.reduce((mejor, otra) => porMostrar(otra) < porMostrar(mejor) ? otra : mejor);
      pruebasDeTantos.push({ asiento, motivo, total: tantoGanador, cartas: prueba.aportes.map(a => a.carta),
        ...(duelo !== null && { duelo }) });
    }
  }
  return pruebasDeTantos.length ? { ...indice, pruebasDeTantos } : indice;
}

export function vistaOnline(estado: EstadoOnline, asiento: Asiento): VistaOnline {
  if (estado.lance && (estado.resultado || !estado.lance.activos.includes(asiento))) {
    throw new RangeError("Ese asiento necesita la proyección pública de tercetos.");
  }
  const vista = { ...privadaJugable(estado, asiento), ...cantosPublicos(estado),
    resumenTantos: resumirTantos(estado.cobros, estado.puntosInicio, estado.meta) };
  return conComparaciones(vista, estado);
}

type Comparaciones = Pick<EstadoOnline, "comparacionFlor" | "comparacionEnvido">;

/** El desglose del historial es público. El registro de cobros del árbitro conserva su formato V1. */
function conComparaciones<V extends { cobros: readonly Cobro[] }>(vista: V, { comparacionFlor, comparacionEnvido }: Comparaciones):
    V & { cobros: VistaOnline["cobros"] } {
  if (!comparacionFlor && !comparacionEnvido) return vista;
  return { ...vista, cobros: vista.cobros.map(c =>
    c.motivo === "flor" && comparacionFlor ? { ...c, comparacionFlor: structuredClone(comparacionFlor) }
    : c.motivo === "envido" && comparacionEnvido ? { ...c, comparacionEnvido: structuredClone(comparacionEnvido) } : c) };
}

/** Los duelos archivados de tercetos, con lo que dijo cada uno en el envido querido junto a su cobro. */
export function historialPublico(historial: readonly ResumenLance[]): ResumenLance[] {
  return historial.map(({ comparacionEnvido, ...resumen }) => conComparaciones(resumen, { comparacionEnvido }));
}

export interface VistaOnlineV1 extends VistaOnline {
  readonly asiento: AsientoV1;
  readonly mano: AsientoV1;
  readonly dador: AsientoV1;
  readonly turno: AsientoV1 | null;
  readonly acciones: readonly AccionOnlineV1[];
  readonly legales: readonly TipoAccionOnlineV1[];
}

export function vistaOnlineV1(estado: EstadoOnline, asiento: Asiento): VistaOnlineV1 {
  if (estado.mano.reparto.versionReparto !== "online-1") throw new RangeError("La liga usa un reparto V1.");
  return privadaJugable(estado, asiento) as VistaOnlineV1;
}

type FaltaPorEquipo = { faltaPorEquipo: readonly [number, number] };
export type VistaTercetos = FaltaPorEquipo & (
  | (VistaOnline & { estado: "jugando" })
  | (Omit<VistaOnline, "cartas" | "legales" | "tantosPropios"> & { estado: "esperando" | "terminado"; legales: [] })
);

export function vistaTercetos(estado: EstadoOnline, asiento: Asiento): VistaTercetos {
  if (!estado.lance) throw new RangeError("Se necesita una mesa de tercetos.");
  const archivados = estado.historialLances ?? [];
  const actualArchivado = archivados.some(l => l.tipo === estado.lance!.tipo && l.duelo === estado.lance!.duelo);
  const cobrosReparto = [...archivados.flatMap(l => l.cobros), ...(actualArchivado ? [] : estado.cobros)];
  const comunes = { resumenTantos: resumirTantos(estado.cobros, estado.puntosInicio, estado.meta),
    resumenReparto: resumirTantos(cobrosReparto), faltaPorEquipo: estado.puntosInicio.map(p => faltaDelGanador(p, estado.meta)) as [number, number],
    ...cantosPublicos(estado) };
  if (estado.resultado || !estado.lance.activos.includes(asiento)) {
    return { ...conComparaciones(vistaPublicaOnline(estado, asiento), estado), ...comunes,
      estado: estado.resultado ? "terminado" : "esperando", legales: [] };
  }
  return { ...conComparaciones(privadaJugable(estado, asiento), estado), ...comunes, estado: "jugando" };
}

/** Las políticas ya entrenadas expresan la entrega eligiendo una de sus cartas. */
export function vistaParaPolitica(estado: EstadoOnline, asiento: Asiento): VistaOnlineV1 {
  const vista = vistaOnlineV1(estado, asiento);
  return vista.legales.includes("mazo")
    ? { ...vista, legales: vista.legales.map(tipo => tipo === "mazo" ? "carta" : tipo) }
    : vista;
}

/** El bot recibe la misma vista que un humano en ese asiento y elige entre sus acciones legales. */
export function elegirAccionOnline(vista: VistaOnline): AccionOnlineV1 | null {
  const { asiento, cartas, muestra, legales, tantosPropios: { total } } = vista;
  if (!legales.length) return null;
  const fuertes = cartas.filter(carta => compararCartas(carta, "oros-03", muestra) >= 0);
  const primera = vista.vueltas[0]?.resultado;
  const ventaja = primera?.tipo === "ganada" && primera.equipo === vista.equipoPorAsiento[asiento];
  const ofertas: TipoAccionOnlineV1[] = [];
  if (total >= 42) ofertas.push("contraflor-al-resto");
  if (total >= 33) ofertas.push("con-flor-envido");
  if (total >= 33) ofertas.push("con-flor-quiero");
  ofertas.push("flor", "paso-flor");
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
