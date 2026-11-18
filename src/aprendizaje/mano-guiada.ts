import { esCardId, type CardId } from "../motor/cartas.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano } from "../motor/mano.ts";
import { avanzarHastaAprendiz } from "../motor/parejas.ts";
import { repartir } from "../motor/reparto.ts";
import { capturarReplay, reproducirReplay } from "../motor/replay.ts";
import { evaluarTantos } from "../motor/tantos.ts";
import { claveSituacion, evaluarRespuesta } from "./generadores/index.ts";
import { pertenece } from "./generadores/familias.ts";
import { reconocerFlor, temas, type Tema } from "./lecciones/index.ts";
import { crearFuenteProgreso } from "./progreso.ts";
import { iniciarSesion, type Continuacion, type Sesion } from "./sesion.ts";
import type { Respuesta, SituacionVisible } from "./tipos.ts";

const claveMesa = "truco-oriental.mano-guiada.v1";
type Pausa = "flor" | "cuenta" | null;
type Almacen = Pick<Storage, "getItem" | "setItem">;

function temaDe(pausa: Exclude<Pausa, null>, estado: EstadoMano): Tema {
  if (pausa === "flor") return reconocerFlor;
  const { modalidad } = evaluarTantos(estado.reparto.manos[0], estado.reparto.muestra);
  return temas.find((tema) => tema.habilidad === "contar-" + modalidad)!;
}

function esContinuacion(valor: unknown, tema: Tema): valor is Continuacion {
  if (!valor || typeof valor !== "object") return false;
  const { indice, independiente, pista, ayudaAlError } = valor as Partial<Continuacion>;
  return typeof indice === "number" && Number.isInteger(indice) && indice >= 0 && indice < tema.pasos.length &&
    typeof independiente === "boolean" && (pista === undefined || typeof pista === "string") &&
    (ayudaAlError === undefined || typeof ayudaAlError === "string");
}

function recuperar(texto: string) {
  const dato = JSON.parse(texto);
  if (dato?.version !== 1 || ![null, "flor", "cuenta"].includes(dato.pausa)) return;
  const replay = reproducirReplay(dato.replay);
  if (!replay.ok) return;
  const { estado } = replay;
  const pausa: Pausa = dato.pausa;
  if (pausa && (dato.replay.jugadas.length || !esContinuacion(dato.continuacion, temaDe(pausa, estado)))) return;
  if (!pausa && estado.turno !== 0 && estado.turno !== null) return;
  const cursor: number | null = dato.cursor;
  if (cursor !== null && (estado.turno !== null || !Number.isInteger(cursor) || cursor < 0 || cursor > dato.replay.jugadas.length)) return;
  if (typeof dato.mensaje !== "string" || !Array.isArray(dato.seleccion) ||
      !dato.seleccion.every((c: unknown) => esCardId(c) && estado.reparto.manos[0].includes(c))) return;
  return { estado, pausa, cursor, continuacion: dato.continuacion as Continuacion | undefined,
    seleccion: dato.seleccion as CardId[], mensaje: dato.mensaje as string };
}

export function crearMesaGuiada({
  semilla = () => crypto.getRandomValues(new Uint32Array(1))[0],
  fuente = crearFuenteProgreso(),
  obtenerAlmacen = (): Almacen | undefined => globalThis.sessionStorage,
} = {}) {
  let almacen: Almacen | undefined;
  let guardado: ReturnType<typeof recuperar>;
  try {
    almacen = obtenerAlmacen();
    const texto = almacen?.getItem(claveMesa);
    if (texto) guardado = recuperar(texto);
  } catch { /* Una pestaña con el almacenamiento bloqueado o ilegible puede jugar igual. */ }

  let estado = guardado?.estado ?? iniciarMano(repartir(semilla(), 3));
  let pausa: Pausa = guardado ? guardado.pausa : "flor";
  let cursor = guardado?.cursor ?? null;
  let seleccion: CardId[] = guardado?.seleccion ?? [];
  let mensaje = guardado?.mensaje ?? "";
  let sesion: Sesion<SituacionVisible> | undefined;

  function abrirPausa(continuacion?: Continuacion) {
    if (!pausa) return;
    const tema = temaDe(pausa, estado);
    const { cartas, muestra } = vistaPara(estado, 0);
    const familia = tema.familias.find((f) => pertenece(f as Parameters<typeof pertenece>[0], cartas, muestra))!;
    const clave = claveSituacion(muestra, cartas);
    sesion = iniciarSesion(tema, { id: tema.id + "/" + clave, clave, habilidad: tema.habilidad,
      familia, cartas, muestra, explicacion: "" }, evaluarRespuesta, fuente, continuacion);
  }

  function guardar() {
    if (!almacen) return;
    try {
      almacen.setItem(claveMesa, JSON.stringify({ version: 1, replay: capturarReplay(estado),
        pausa, continuacion: sesion?.continuacion, seleccion, cursor, mensaje }));
    } catch { almacen = undefined; }
  }

  abrirPausa(guardado?.continuacion);
  guardar();

  return {
    vista() {
      let mesa = estado;
      let reproduccion = null;
      if (cursor !== null) {
        const registro = capturarReplay(estado);
        const prefijo = reproducirReplay({ ...registro, jugadas: registro.jugadas.slice(0, cursor) });
        if (!prefijo.ok) throw new Error("No se pudo reconstruir la jugada.");
        mesa = prefijo.estado;
        reproduccion = { posicion: cursor, total: registro.jugadas.length };
      }
      return { mesa: vistaPara(mesa, 0), paso: sesion?.pasoActual, tema: sesion?.leccion.titulo,
        pista: sesion?.pista, seleccion: [...seleccion], mensaje, reproduccion };
    },
    pedirPista() {
      if (sesion) { sesion.pedirPista(); guardar(); }
    },
    responder(respuesta: Respuesta) {
      if (!sesion) return;
      const intento = sesion.responder(respuesta);
      mensaje = intento.explicacion;
      if (intento.correcta && respuesta.tipo === "elegir-cartas") seleccion = [...respuesta.cartas];
      if (sesion.completada) {
        if (pausa === "flor") {
          pausa = "cuenta";
          abrirPausa();
        } else {
          pausa = null;
          sesion = undefined;
          seleccion = [];
          estado = avanzarHastaAprendiz(estado);
        }
      }
      guardar();
      return intento.correcta;
    },
    jugar(carta: CardId) {
      if (pausa || cursor !== null) return false;
      const paso = jugarCarta(estado, { asiento: 0, carta });
      if (!paso.ok) return false;
      estado = avanzarHastaAprendiz(paso.estado);
      mensaje = "";
      guardar();
      return true;
    },
    reproducir(posicion: number | null) {
      if (estado.turno !== null) return;
      const cantidad = estado.vueltas.length * 4;
      if (posicion !== null && (!Number.isInteger(posicion) || posicion < 0 || posicion > cantidad)) return;
      cursor = posicion;
      guardar();
    },
    repartirDeNuevo() {
      if (estado.turno !== null) return;
      const anterior = estado.reparto;
      const claveAnterior = claveSituacion(anterior.muestra, anterior.manos[0]);
      let candidata = semilla();
      let reparto = repartir(candidata, anterior.mano);
      while (reparto.semilla === anterior.semilla || claveSituacion(reparto.muestra, reparto.manos[0]) === claveAnterior) {
        candidata = (candidata + 1) >>> 0;
        reparto = repartir(candidata, anterior.mano);
      }
      estado = iniciarMano(reparto);
      pausa = "flor";
      cursor = null;
      seleccion = [];
      mensaje = "";
      abrirPausa();
      guardar();
    },
  };
}

export type VistaGuiada = ReturnType<ReturnType<typeof crearMesaGuiada>["vista"]>;
