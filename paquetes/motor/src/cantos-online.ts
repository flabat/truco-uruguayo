import { equipoDelAsiento, type Asiento, type Equipo, type RepartoOnline } from "./reparto.ts";
import { participantesDe, type EstadoMano, type Jugada, type VueltaCerrada } from "./mano.ts";
import { faltaDelGanador, restoQuerido, tantosAcreditados } from "./reglas-tercetos.ts";
import { evaluarTantos } from "./tantos.ts";

type CantoTruco = "truco" | "retruco" | "vale-cuatro";
type CantoEnvido = "envido" | "real-envido" | "falta-envido";
type CantoFlor = "flor" | "con-flor-envido" | "contraflor-al-resto";
type CantoLateral = CantoEnvido | CantoFlor;
type Canto = CantoTruco | CantoLateral;
export type TipoAccionOnline = Canto | "con-flor-quiero" | "quiero" | "no-quiero" | "paso-flor" | "carta" | "mazo";
export type AccionOnline = ({ tipo: "carta" } & Jugada)
  | { tipo: Exclude<TipoAccionOnline, "carta">; asiento: Asiento };
export type TipoAccionOnlineV1 = TipoAccionOnline;
export type AccionOnlineV1 = AccionOnline;

export interface Oferta<T extends Canto = Canto> { tipo: T; asiento: Asiento }
interface Envite extends Oferta<CantoLateral> {
  valor: number;
  anterior: number;
  querido?: true;
  rechazaron?: readonly Asiento[];
}
export interface Cobro {
  equipo: Equipo;
  tantos: number;
  /** Valor pactado antes de aplicar el tope del chico de tercetos. */
  valor?: number;
  motivo: "truco" | "flor" | "envido";
  asiento?: Asiento;
  tantoGanador?: number;
}

export type LanceTercetos =
  | { tipo: "redondilla"; duelo: null; activos: readonly Asiento[] }
  | { tipo: "pico-a-pico"; duelo: 1 | 2 | 3; activos: readonly Asiento[] };

export type ResumenLance = LanceTercetos & {
  resultado: NonNullable<EstadoOnline["resultado"]>;
  acciones: readonly AccionOnline[];
  cobros: readonly Cobro[];
  indiceCobroLateral?: number;
  vueltas: readonly VueltaCerrada[];
  puntos: readonly [number, number];
};

export interface EstadoOnline {
  /** Acción pública que terminó de resolver el envite o la flor, incluidas las consultas. */
  indiceCobroLateral?: number;
  comparacionFlor?: {
    indiceAccion: number;
    participantes: readonly { asiento: Asiento; total: number }[];
  };
  /**
   * Lo que dijo cada uno al comparar un envido querido, en el orden en que habló. Quien no le
   * gana a lo ya dicho dice «son buenas» (`total: null`) y su tanto no se publica.
   */
  comparacionEnvido?: {
    indiceAccion: number;
    participantes: readonly { asiento: Asiento; total: number | null }[];
  };
  lance?: LanceTercetos;
  historialLances?: readonly ResumenLance[];
  mano: EstadoMano<RepartoOnline>;
  puntosInicio: readonly [number, number];
  meta: number;
  acciones: readonly AccionOnline[];
  cobros: readonly Cobro[];
  resultado: { equipo: Equipo; tantos: number; motivo: "vueltas" | "rechazo" | "mazo" | "flor" | "envido" } | null;
  valorTruco: number;
  trucoPendiente: Oferta<CantoTruco> | null;
  ultimoCantorTruco: Asiento | null;
  /** Oportunidad de cantar o entregar antes de que el rival abra la segunda vuelta. */
  antesDeSalida?: Asiento;
  lateral: Envite | null;
  lateralCerrado: boolean;
  flores: readonly Asiento[];
  consultaFlor: readonly Asiento[];
  respuestaEnvido: "quiero" | "no-quiero" | null;
  rechazoTruco: boolean;
  retiro?: Asiento;
}

const nivelesTruco = ["truco", "retruco", "vale-cuatro"] as const;
const inicioEnvido = ["envido", "real-envido", "falta-envido"] as const;

export function tantosPropios(estado: EstadoOnline, asiento: Asiento) {
  const { manos, muestra } = estado.mano.reparto;
  const { modalidad, total } = evaluarTantos(manos[asiento], muestra);
  return { modalidad, total };
}

function esTerceto(estado: EstadoOnline) {
  return estado.mano.reparto.versionReparto === "online-2";
}

export function aDecidir(estado: EstadoOnline): Asiento[] {
  if (estado.resultado) return [];
  if (estado.consultaFlor.length) return [estado.consultaFlor[0]];
  const oferta = estado.lateral ?? estado.trucoPendiente;
  if (!oferta) {
    const asiento = estado.antesDeSalida ?? estado.mano.turno;
    return asiento === null ? [] : [asiento];
  }
  let posibles = participantesDe(estado.mano);
  if (estado.flores.length && estado.lateral) {
    posibles = esTerceto(estado) ? posibles.filter(a => estado.flores.includes(a)) : estado.flores;
  }
  return posibles.filter(a => equipoDelAsiento(a) !== equipoDelAsiento(oferta.asiento) && !estado.lateral?.rechazaron?.includes(a));
}

function subidasEnvido(estado: EstadoOnline, tipo: CantoLateral): CantoEnvido[] {
  if (tipo === "falta-envido") return [];
  if (tipo === "real-envido") return ["falta-envido"];
  return estado.acciones.filter(a => a.tipo === "envido").length === 1
    ? ["envido", "real-envido", "falta-envido"] : ["real-envido", "falta-envido"];
}

function subidasFlor(tipo: CantoLateral = "flor"): CantoFlor[] {
  if (tipo === "flor") return ["con-flor-envido", "contraflor-al-resto"];
  return tipo === "con-flor-envido" ? ["contraflor-al-resto"] : [];
}

/** Solo se inspeccionan las cartas del asiento que pide su lista de acciones. */
export function legalesOnline(estado: EstadoOnline, asiento: Asiento): TipoAccionOnline[] {
  if (!aDecidir(estado).includes(asiento)) return [];
  const debeFlor = !estado.lateralCerrado && !estado.flores.includes(asiento)
    && tantosPropios(estado, asiento).modalidad === "flor";
  const lado = estado.lateral;
  if (debeFlor) {
    const regla = estado.mano.reparto.reglaFlor;
    if (regla === "inmediata-v2") {
      const oferta = estado.flores.length ? lado : null;
      const opciones: TipoAccionOnline[] = ["flor", ...subidasFlor(oferta?.tipo)];
      if (oferta && oferta.tipo !== "flor" && !oferta.querido && equipoDelAsiento(oferta.asiento) !== equipoDelAsiento(asiento)) {
        opciones.push("con-flor-quiero");
      }
      return opciones;
    }
    if (regla && lado && estado.flores.length && (lado.tipo === "flor" || equipoDelAsiento(lado.asiento) !== equipoDelAsiento(asiento))) {
      return ["flor", ...subidasFlor(lado.tipo)];
    }
    return ["flor"];
  }
  if (estado.consultaFlor.length) return ["paso-flor"];

  if (lado) {
    if (!estado.flores.length) return ["quiero", "no-quiero", ...subidasEnvido(estado, lado.tipo)];
    return ["quiero", "no-quiero", ...subidasFlor(lado.tipo)];
  }

  const oferta = estado.trucoPendiente;
  const legales: TipoAccionOnline[] = oferta ? ["quiero", "no-quiero"] : [estado.antesDeSalida === asiento ? "mazo" : "carta"];
  if (!oferta && esTerceto(estado)) legales.push("mazo");
  const proximo = nivelesTruco[estado.valorTruco - 1 + (oferta ? 1 : 0)];
  if (proximo && (estado.ultimoCantorTruco === null
      || equipoDelAsiento(estado.ultimoCantorTruco) !== equipoDelAsiento(asiento))) legales.push(proximo);
  if (!estado.lateralCerrado && estado.mano.restantes[asiento].length === 3
      && estado.valorTruco === 1 && (!oferta || oferta.tipo === "truco")) legales.push(...inicioEnvido);
  return legales;
}

export function marcadorOnline(estado: EstadoOnline): [number, number] {
  const puntos: [number, number] = [...estado.puntosInicio];
  for (const { equipo, tantos } of estado.cobros) puntos[equipo] = Math.min(estado.meta, puntos[equipo] + tantos);
  return puntos;
}

function cobrar(estado: EstadoOnline, cobro: Cobro, cierre?: "vueltas" | "rechazo" | "mazo") {
  const { equipo } = cobro;
  const puntos = marcadorOnline(estado)[equipo];
  if (esTerceto(estado)) {
    cobro = { ...cobro, valor: cobro.tantos, tantos: tantosAcreditados(cobro.tantos, puntos, estado.meta) };
  }
  estado.cobros = [...estado.cobros, cobro];
  const { tantos } = cobro;
  if (cierre) estado.resultado = { equipo, tantos, motivo: cierre };
  else if (puntos + tantos >= estado.meta && cobro.motivo !== "truco") estado.resultado = { equipo, tantos, motivo: cobro.motivo };
}

export function cobrarVueltas(estado: EstadoOnline, equipo: Equipo) {
  cobrar(estado, { equipo, tantos: estado.valorTruco, motivo: "truco" }, "vueltas");
}

function cobrarRechazoTruco(estado: EstadoOnline) {
  const equipo = equipoDelAsiento(estado.trucoPendiente!.asiento);
  cobrar(estado, { equipo, tantos: estado.valorTruco, motivo: "truco" }, "rechazo");
  estado.rechazoTruco = false;
  estado.trucoPendiente = null;
}

function cerrarRetiroORechazo(estado: EstadoOnline) {
  if (estado.resultado) return;
  if (estado.retiro !== undefined) {
    const equipo = equipoDelAsiento(estado.retiro) === 0 ? 1 : 0;
    cobrar(estado, { equipo, tantos: estado.valorTruco, motivo: "truco" }, "mazo");
    delete estado.retiro;
  } else if (estado.rechazoTruco) cobrarRechazoTruco(estado);
}

function plenaFlor(estado: EstadoOnline, equipo: Equipo) {
  return 3 * estado.flores.filter(a => equipoDelAsiento(a) === equipo).length;
}

function tantosEnOrden(estado: EstadoOnline, flor: boolean) {
  const participantes = participantesDe(estado.mano).filter(a => !flor || estado.flores.includes(a));
  return participantes.map(asiento => ({ asiento, total: tantosPropios(estado, asiento).total }));
}

/**
 * Habla el mano y siguen los demás en el orden del reparto. Quien le gana a lo ya dicho canta su
 * tanto. Si va ganando su equipo, calla. Si no, dice «son buenas». Ante igualdad gana el más mano,
 * así que alcanza con igualar a alguien que habló después. Los que callaron vuelven a hablar si
 * después pasó adelante el otro equipo.
 */
export function vocesDelEnvido(participantes: readonly { asiento: Asiento; total: number }[]) {
  const orden = new Map(participantes.map((p, i) => [p.asiento, i]));
  const voces: { asiento: Asiento; total: number | null }[] = [];
  const pendientes = new Set(participantes.map(p => p.asiento));
  let mejor: { asiento: Asiento; total: number } | null = null;
  const gana = (p: { asiento: Asiento; total: number }) => !mejor || p.total > mejor.total
    || (p.total === mejor.total && orden.get(p.asiento)! < orden.get(mejor.asiento)!);
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const p of participantes) {
      if (!pendientes.has(p.asiento)) continue;
      if (gana(p)) {
        voces.push({ ...p });
        mejor = p;
      } else if (equipoDelAsiento(mejor!.asiento) !== equipoDelAsiento(p.asiento)) {
        voces.push({ asiento: p.asiento, total: null });
      } else continue;
      pendientes.delete(p.asiento);
      cambio = true;
    }
  }
  return voces;
}

function liquidarLateral(estado: EstadoOnline, querido: boolean) {
  const oferta = estado.lateral!;
  const flor = estado.flores.length > 0;
  const participantes = querido ? tantosEnOrden(estado, flor) : null;
  // Ante igualdad queda el primero en el orden original de esta mano.
  const ganador = participantes?.reduce((mejor, otro) => otro.total > mejor.total ? otro : mejor);
  const equipo = equipoDelAsiento(ganador?.asiento ?? oferta.asiento);
  let tantos = querido ? oferta.valor : oferta.anterior;
  if (esTerceto(estado) && querido && oferta.tipo === "falta-envido") {
    tantos = faltaDelGanador(estado.puntosInicio[equipo], estado.meta);
  } else if (esTerceto(estado) && querido && oferta.tipo === "contraflor-al-resto") {
    const tipo = participantesDe(estado.mano).length === 2 ? "pico-a-pico" : "redondilla";
    tantos = restoQuerido(tipo, estado.puntosInicio[equipo], estado.meta);
  } else if (flor) {
    // El resto querido se lleva todas las flores. En los otros casos suman las propias.
    tantos += querido && oferta.tipo === "contraflor-al-resto" ? 3 * estado.flores.length : plenaFlor(estado, equipo);
  }
  estado.indiceCobroLateral = estado.acciones.length - 1;
  if (flor && participantes && !esTerceto(estado)) {
    estado.comparacionFlor = { indiceAccion: estado.indiceCobroLateral, participantes };
  } else if (participantes && !esTerceto(estado)) {
    estado.comparacionEnvido = { indiceAccion: estado.indiceCobroLateral, participantes: vocesDelEnvido(participantes) };
  }
  cobrar(estado, { equipo, tantos, motivo: flor ? "flor" : "envido",
    ...(ganador && { asiento: ganador.asiento, tantoGanador: ganador.total }) });
  estado.lateral = null;
  estado.lateralCerrado = true;
  estado.respuestaEnvido = null;
  cerrarRetiroORechazo(estado);
}

function faltaConsultarFlor(estado: EstadoOnline, asiento: Asiento): boolean {
  const { reglaFlor, respondenSinFlor, respuestaSinFlor } = estado.mano.reparto;
  const sinJugar = !estado.acciones.some(j => j.asiento === asiento);
  if (!reglaFlor) return sinJugar;

  const debeContestar = !!respondenSinFlor?.includes(asiento)
    && estado.flores.some(cantor => equipoDelAsiento(cantor) !== equipoDelAsiento(asiento));
  // Quien ya jugó una carta o cantó otra cosa no tiene flor: no contesta «Yo no canto».
  if (!sinJugar && (!debeContestar || respuestaSinFlor === "antes-de-actuar")) return false;
  // La flor se declara en la primera acción. Quien ya abrió envido aún puede contestar sin flor.
  if (tantosPropios(estado, asiento).modalidad === "flor") return sinJugar;
  return debeContestar && !estado.acciones.some(j => j.asiento === asiento && j.tipo === "paso-flor");
}

function terminarConsultas(estado: EstadoOnline) {
  if (estado.consultaFlor.length) return;
  if (estado.flores.length && estado.lateral) {
    if (estado.lateral.querido) liquidarLateral(estado, true);
    else if (!aDecidir(estado).length) {
      liquidarLateral(estado, false);
    }
    // Con flores en ambos equipos, el rival responde al último envite.
    return;
  }
  if (estado.respuestaEnvido) liquidarLateral(estado, estado.respuestaEnvido === "quiero");
  else cerrarRetiroORechazo(estado);
}

function consultarFlores(estado: EstadoOnline) {
  estado.consultaFlor = estado.lateralCerrado ? [] : participantesDe(estado.mano).filter(a => faltaConsultarFlor(estado, a));
  terminarConsultas(estado);
}

function declararFlor(estado: EstadoOnline, asiento: Asiento) {
  estado.respuestaEnvido = null;
  estado.flores = [...estado.flores, asiento];
  consultarFlores(estado);
}

/** Se trabaja sobre la copia del estado creada por aplicarOnline. */
export function resolverCanto(estado: EstadoOnline, accion: Exclude<AccionOnline, { tipo: "carta" }>) {
  const { tipo, asiento } = accion;
  const falta = estado.meta - Math.max(...estado.puntosInicio);
  switch (tipo) {
    case "mazo":
      estado.retiro = asiento;
      consultarFlores(estado);
      break;
    case "truco":
    case "retruco":
    case "vale-cuatro":
      estado.valorTruco = nivelesTruco.indexOf(tipo) + 1;
      estado.trucoPendiente = { tipo, asiento };
      estado.ultimoCantorTruco = asiento;
      break;
    case "envido":
    case "real-envido":
    case "falta-envido": {
      const apertura = estado.lateral === null;
      const anterior = estado.lateral?.valor ?? 0;
      const valor = tipo === "falta-envido" ? Math.max(falta, anterior) : anterior + (tipo === "real-envido" ? 3 : 2);
      estado.lateral = { tipo, asiento, anterior: Math.max(1, anterior), valor };
      if (apertura && estado.mano.reparto.reglaFlor) consultarFlores(estado);
      break;
    }
    case "flor":
      if (!estado.flores.length) estado.lateral = { tipo, asiento, anterior: 0, valor: 0 };
      else if (estado.mano.reparto.reglaFlor === "inmediata-v2" && estado.lateral && estado.lateral.tipo !== "flor"
          && !estado.lateral.querido && equipoDelAsiento(estado.lateral.asiento) !== equipoDelAsiento(asiento)) {
        estado.lateral = { ...estado.lateral, rechazaron: [...(estado.lateral.rechazaron ?? []), asiento] };
      }
      declararFlor(estado, asiento);
      break;
    case "con-flor-quiero":
      estado.lateral = { ...estado.lateral!, querido: true };
      declararFlor(estado, asiento);
      break;
    case "paso-flor":
      estado.consultaFlor = estado.consultaFlor.slice(1);
      terminarConsultas(estado);
      break;
    case "con-flor-envido":
    case "contraflor-al-resto": {
      // Una subida de flor descarta el envido ordinario. Revirar por el mismo equipo
      // tampoco convierte su envite anterior en tantos aceptados por el rival.
      const oferta = estado.flores.length ? estado.lateral : null;
      const anterior = oferta && (oferta.querido || equipoDelAsiento(oferta.asiento) !== equipoDelAsiento(asiento))
        ? oferta.valor : oferta?.anterior ?? 0;
      estado.lateral = { tipo, asiento, anterior, valor: tipo === "con-flor-envido" ? 2 : Math.max(falta, anterior) };
      if (!estado.flores.includes(asiento)) declararFlor(estado, asiento);
      break;
    }
    case "quiero":
    case "no-quiero":
      if (estado.lateral && estado.flores.length) liquidarLateral(estado, tipo === "quiero");
      else if (estado.lateral) {
        estado.respuestaEnvido = tipo;
        consultarFlores(estado);
      } else if (tipo === "quiero") {
        estado.valorTruco++;
        estado.trucoPendiente = null;
      } else {
        estado.rechazoTruco = true;
        consultarFlores(estado);
      }
      break;
  }
}
