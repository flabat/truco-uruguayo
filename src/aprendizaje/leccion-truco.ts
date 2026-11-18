import { elegirJugada } from "../motor/jugadores.ts";
import { vistaPara } from "../motor/mano.ts";
import { equipoPorAsiento, repartir, type Asiento, type RepartoV1 } from "../motor/reparto.ts";
import { capturarTruco, reproducirTruco } from "../motor/replay-truco.ts";
import { evaluarTantos } from "../motor/tantos.ts";
import { aplicarAccion, iniciarTruco, resultadoTruco, type AccionTruco, type EstadoTruco } from "../motor/truco.ts";
import { claveSituacion } from "./generadores/index.ts";

const ejemplo = 217;
const clave = "truco-oriental.leccion-truco.v2";

function envidoCobrado({ manos, muestra, mano }: RepartoV1) {
  const tantos = manos.map((cartas) => evaluarTantos(cartas, muestra));
  if (tantos.some((t) => t.modalidad === "flor")) return null;
  // En empate cobra quien está primero a partir del mano.
  let mejor = mano;
  for (let i = 1; i < 4; i++) {
    const asiento = ((mano + i) % 4) as Asiento;
    if (tantos[asiento].total > tantos[mejor].total) mejor = asiento;
  }
  return { equipo: equipoPorAsiento[mejor], total: tantos[mejor].total };
}

function otraSemilla(anterior: RepartoV1, inicio: number) {
  const propia = claveSituacion(anterior.muestra, anterior.manos[0]);
  // Dos repartos comprobados completan la búsqueda aun con una fuente de azar repetida.
  const candidatas = Array.from({ length: 24 }, (_, i) => (inicio + i) >>> 0).concat(2, 4);
  for (const semilla of candidatas) {
    const reparto = repartir(semilla, anterior.dador);
    if (claveSituacion(reparto.muestra, reparto.manos[0]) !== propia && envidoCobrado(reparto)) return semilla;
  }
  throw new Error("No se encontró otra mano sin flor.");
}

function avanzar(estado: EstadoTruco, accion: AccionTruco) {
  const paso = aplicarAccion(estado, accion);
  if (!paso.ok) throw new Error("Acción automática rechazada: " + paso.error);
  return paso.estado;
}

function empezar(semilla: number, dador: 0 | 3) {
  const estado = iniciarTruco(semilla, dador);
  return dador === 0 ? avanzar(estado, { tipo: "truco", asiento: 1 }) : estado;
}

function jugarAutomaticos(estado: EstadoTruco) {
  // En el papel de cantor, el rival siempre quiere para enseñar la reanudación.
  if (estado.apuesta === "pendiente") estado = avanzar(estado, { tipo: "quiero", asiento: 1 });
  while (!resultadoTruco(estado) && estado.mano.turno !== 0) {
    const asiento = estado.mano.turno!;
    const carta = elegirJugada(vistaPara(estado.mano, asiento));
    estado = avanzar(estado, { tipo: "carta", asiento, carta });
  }
  return estado;
}

type Almacen = Pick<Storage, "getItem" | "setItem">;
export function crearLeccionTruco({
  azar = () => crypto.getRandomValues(new Uint32Array(1))[0],
  obtenerAlmacen = (): Almacen | undefined => globalThis.sessionStorage,
} = {}) {
  let estado = empezar(ejemplo, 3);
  let cursor: number | null = null;
  function guardar() {
    try { obtenerAlmacen()?.setItem(clave, JSON.stringify({ replay: capturarTruco(estado), cursor })); }
    catch { /* Se puede jugar en memoria. */ }
  }

  function reanudar() {
    try {
      const dato = JSON.parse(obtenerAlmacen()?.getItem(clave) ?? "null");
      const paso = reproducirTruco(dato?.replay);
      if (!paso.ok) return false;
      const mesa = paso.estado;
      const { dador } = mesa.mano.reparto;
      if ((dador !== 3 && dador !== 0) || !envidoCobrado(mesa.mano.reparto)) return false;
      const final = resultadoTruco(mesa);
      if (!final && (mesa.apuesta === "pendiente" ? equipoPorAsiento[mesa.mano.turno!] === 0 : mesa.mano.turno !== 0)) return false;
      if (dato.cursor !== null && (!final || !Number.isInteger(dato.cursor) || dato.cursor < 0 || dato.cursor > mesa.acciones.length)) return false;
      estado = mesa;
      cursor = dato.cursor;
      return true;
    } catch { return false; }
  }
  reanudar();

  return {
    reanudar,
    actuar(accion: AccionTruco) {
      if (cursor !== null || accion.asiento !== 0) return false;
      const paso = aplicarAccion(estado, accion);
      if (!paso.ok) return false;
      estado = jugarAutomaticos(paso.estado);
      guardar();
      return true;
    },
    repetir(modo: "ejemplo" | "otro-papel" | "otro-reparto") {
      const { reparto } = estado.mano;
      const dador = reparto.dador === 0 ? 0 : 3;
      const semilla = modo === "ejemplo" ? ejemplo : modo === "otro-reparto" ? otraSemilla(reparto, azar()) : reparto.semilla;
      estado = empezar(semilla, modo === "otro-papel" ? (dador === 3 ? 0 : 3) : dador);
      cursor = null;
      guardar();
    },
    reproducir(posicion: number | null) {
      if (!resultadoTruco(estado)) return;
      if (posicion !== null && (!Number.isInteger(posicion) || posicion < 0 || posicion > estado.acciones.length)) return;
      cursor = posicion;
      guardar();
    },
    vista() {
      let visible = estado;
      if (cursor !== null) {
        const replay = capturarTruco(estado);
        const prefijo = reproducirTruco({ ...replay, acciones: replay.acciones.slice(0, cursor) });
        if (!prefijo.ok) throw new Error("No se pudo reproducir el prefijo.");
        visible = prefijo.estado;
      }
      return {
        mesa: vistaPara(visible.mano, 0), apuesta: visible.apuesta, resultado: resultadoTruco(visible),
        envido: envidoCobrado(visible.mano.reparto)!, acciones: visible.acciones.map((a) => ({ ...a })),
        cursor, total: estado.acciones.length,
      };
    },
  };
}
