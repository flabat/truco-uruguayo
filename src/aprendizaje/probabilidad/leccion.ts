import type { CardId } from "../../motor/cartas.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano, type Jugada, type VistaAsiento } from "../../motor/mano.ts";
import { avanzarHastaAprendiz } from "../../motor/parejas.ts";
import { repartir, type RepartoV1 } from "../../motor/reparto.ts";
import { segundaDelEstudioV1, semillaSalidaV1, type Escena } from "./escenas.ts";

interface Decision {
  prediccion: CardId | null;
  inspeccionada: CardId | null;
  revelada: boolean;
}

function nuevaDecision(): Decision {
  return { prediccion: null, inspeccionada: null, revelada: false };
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
  analizar?: (mesa: VistaAsiento) => void;
}

export function crearLeccionProbabilidad({
  azar = () => crypto.getRandomValues(new Uint32Array(1))[0],
  analizar,
}: Opciones = {}) {
  let escena: Escena = "salida";
  let presente = iniciarMano(repartir(semillaSalidaV1, 3));
  let cursor: number | null = null;
  let repaso: EstadoMano | null = null;
  let decisionViva = nuevaDecision();
  let decisionRepaso = nuevaDecision();

  function visible() {
    return repaso ?? presente;
  }
  function decision() {
    return repaso ? decisionRepaso : decisionViva;
  }
  function elegible(carta: CardId) {
    const estado = visible();
    return estado.turno === 0 && estado.restantes[0].includes(carta);
  }

  return {
    vista() {
      const mesa = vistaPara(visible(), 0);
      const total = jugadasDe(presente).length;
      const posicion = cursor ?? total;
      const ejemplo = escena !== "practica" && posicion === 0 ? "salida"
        : escena === "segunda" && posicion === segundaDelEstudioV1.jugadas.length ? "segunda" : null;
      const eleccion = decision();
      const fase = repaso ? "repaso" : mesa.turno === null ? "resultado"
        : eleccion.revelada ? "comparacion" : "prediccion";
      return { escena, ejemplo, fase, mesa, ...eleccion, cursor, total } as const;
    },

    predecir(carta: CardId) {
      if (repaso || decisionViva.revelada || !elegible(carta)) return false;
      decisionViva.prediccion = carta;
      return true;
    },

    comparar() {
      const estado = visible();
      if (estado.turno !== 0) return false;
      const actual = decision();
      if (!repaso && !actual.prediccion && estado.restantes[0].length > 1) return false;
      actual.inspeccionada ??= actual.prediccion ?? estado.restantes[0][0];
      actual.revelada = true;
      analizar?.(vistaPara(estado, 0));
      return true;
    },

    inspeccionar(carta: CardId) {
      if (!decision().revelada || !elegible(carta)) return false;
      decision().inspeccionada = carta;
      return true;
    },

    confirmar() {
      if (repaso || !decisionViva.inspeccionada) return false;
      const paso = jugarCarta(presente, { asiento: 0, carta: decisionViva.inspeccionada });
      if (!paso.ok) return false;
      presente = avanzarHastaAprendiz(paso.estado);
      decisionViva = nuevaDecision();
      return true;
    },

    reproducir(posicion: number | null) {
      if (posicion === null) {
        cursor = null;
        repaso = null;
        return true;
      }
      const jugadas = jugadasDe(presente);
      if (!Number.isInteger(posicion) || posicion < 0 || posicion > jugadas.length) return false;
      repaso = reproducirPrefijo(presente.reparto, jugadas.slice(0, posicion));
      cursor = posicion;
      decisionRepaso = nuevaDecision();
      return true;
    },

    abrir(nueva: Escena) {
      if (nueva === "salida") presente = iniciarMano(repartir(semillaSalidaV1, 3));
      if (nueva === "segunda") presente = reproducirPrefijo(segundaDelEstudioV1.reparto, segundaDelEstudioV1.jugadas);
      if (nueva === "practica") presente = otraMano(presente.reparto, azar());
      escena = nueva;
      cursor = null;
      repaso = null;
      decisionViva = nuevaDecision();
    },
  };
}

export type VistaLeccionProbabilidad = ReturnType<ReturnType<typeof crearLeccionProbabilidad>["vista"]>;
