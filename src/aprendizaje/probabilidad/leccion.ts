import type { CardId } from "../../motor/cartas.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano, type Jugada } from "../../motor/mano.ts";
import { avanzarHastaAprendiz } from "../../motor/parejas.ts";
import { repartir, type RepartoV1 } from "../../motor/reparto.ts";
import { segundaDelEstudioV1, semillaSalidaV1, type Escena } from "./escenas.ts";

function nuevaDecision(estado: EstadoMano) {
  return {
    mesa: vistaPara(estado, 0),
    seleccionada: null as CardId | null,
    prediccion: null as CardId | null,
    revelada: false,
  };
}

function jugadasDe(estado: EstadoMano) {
  return estado.vueltas.flatMap(vuelta => vuelta.jugadas).concat(estado.vueltaActual?.jugadas ?? []);
}

function reproducirPrefijo(reparto: RepartoV1, jugadas: readonly Jugada[]) {
  let estado = iniciarMano(reparto);
  for (const jugada of jugadas) {
    const paso = jugarCarta(estado, jugada);
    if (!paso.ok) throw new Error("El historial de la lección contiene una jugada ilegal: " + paso.error);
    estado = paso.estado;
  }
  return estado;
}

function otraMano(anterior: RepartoV1, semilla: number) {
  let nueva = repartir(semilla, anterior.mano);
  while (nueva.muestra === anterior.muestra || nueva.manos[0].every(carta => anterior.manos[0].includes(carta))) {
    nueva = repartir((nueva.semilla + 1) >>> 0, anterior.mano);
  }
  return avanzarHastaAprendiz(iniciarMano(nueva));
}

interface Opciones {
  azar?: () => number;
}

export function crearLeccionProbabilidad({
  azar = () => crypto.getRandomValues(new Uint32Array(1))[0],
}: Opciones = {}) {
  let escena: Escena = "salida";
  let presente = iniciarMano(repartir(semillaSalidaV1, 3));
  let cursor: number | null = null;
  let decisionViva = nuevaDecision(presente);
  let decisionRepaso: ReturnType<typeof nuevaDecision> | null = null;

  function decision() {
    return decisionRepaso ?? decisionViva;
  }

  return {
    vista() {
      const actual = decision();
      const total = jugadasDe(presente).length;
      const posicion = cursor ?? total;
      const ejemplo = escena !== "practica" && posicion === 0 ? "salida"
        : escena === "segunda" && posicion === segundaDelEstudioV1.jugadas.length ? "segunda" : null;
      return { escena, ejemplo, ...actual, cursor, total } as const;
    },

    seleccionar(carta: CardId) {
      const actual = decision();
      if (actual.mesa.turno !== 0 || !actual.mesa.cartas.includes(carta)) return false;
      actual.seleccionada = carta;
      return true;
    },

    alternarChances() {
      const actual = decision();
      if (actual.mesa.turno !== 0) return false;
      if (!actual.revelada) actual.prediccion = actual.seleccionada;
      actual.revelada = !actual.revelada;
      return true;
    },

    confirmar() {
      if (decisionRepaso || !decisionViva.seleccionada) return false;
      const paso = jugarCarta(presente, { asiento: 0, carta: decisionViva.seleccionada });
      if (!paso.ok) return false;
      presente = avanzarHastaAprendiz(paso.estado);
      decisionViva = nuevaDecision(presente);
      return true;
    },

    reproducir(posicion: number | null) {
      if (posicion === null) {
        cursor = null;
        decisionRepaso = null;
        return true;
      }
      const jugadas = jugadasDe(presente);
      if (!Number.isInteger(posicion) || posicion < 0 || posicion > jugadas.length) return false;
      decisionRepaso = nuevaDecision(reproducirPrefijo(presente.reparto, jugadas.slice(0, posicion)));
      cursor = posicion;
      return true;
    },

    abrir(nueva: Escena) {
      if (nueva === "salida") presente = iniciarMano(repartir(semillaSalidaV1, 3));
      if (nueva === "segunda") presente = reproducirPrefijo(segundaDelEstudioV1.reparto, segundaDelEstudioV1.jugadas);
      if (nueva === "practica") presente = otraMano(presente.reparto, azar());
      escena = nueva;
      cursor = null;
      decisionRepaso = null;
      decisionViva = nuevaDecision(presente);
    },
  };
}

export type VistaLeccionProbabilidad = ReturnType<ReturnType<typeof crearLeccionProbabilidad>["vista"]>;
