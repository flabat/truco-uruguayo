import { mazo, type CardId } from "../motor/cartas.ts";
import { elegirJugada } from "../motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano, type VistaAsiento } from "../motor/mano.ts";
import { versionReparto, type Asiento, type RepartoV1 } from "../motor/reparto.ts";
import { leerPosicion, type PosicionPublicaV1 } from "./informacion.ts";

const asientos = [0, 1, 2, 3] as const;
type Azar = () => number;
interface DecisionPrevia {
  vista: VistaAsiento;
  carta: CardId;
  conocidasEnTurno: readonly CardId[];
}

export interface MundosDisponibles {
  readonly tipo: "disponible";
  readonly posicion: PosicionPublicaV1;
  /** Cota superior, antes de descartar cartas compartidas por dos asientos. */
  readonly producto: number;
  proponer(azar: Azar): EstadoMano | null;
  enumerar(limite?: number): Iterable<EstadoMano>;
}

type Preparacion = MundosDisponibles | {
  readonly tipo: "entrada-invalida" | "fuera-de-turno" | "mano-terminada" | "incompatible";
};

function iniciar(posicion: PosicionPublicaV1, manos: readonly (readonly CardId[])[]): EstadoMano {
  const tres = (i: Asiento): RepartoV1["manos"][number] => [manos[i][0], manos[i][1], manos[i][2]];
  return iniciarMano({
    versionReparto, semilla: 0, dador: posicion.dador, mano: ((posicion.dador + 1) % 4) as Asiento,
    muestra: posicion.muestra, manos: [tres(0), tres(1), tres(2), tres(3)],
  });
}

/** Cada subconjunto aparece una vez, en orden canónico. */
function* combinaciones(cartas: readonly CardId[], cantidad: number, inicio = 0): Generator<CardId[]> {
  if (cantidad === 0) {
    yield [];
    return;
  }
  for (let i = inicio; i <= cartas.length - cantidad; i++) {
    for (const resto of combinaciones(cartas, cantidad - 1, i + 1)) yield [cartas[i], ...resto];
  }
}

export function prepararMundos(entrada: unknown): Preparacion {
  const posicion = leerPosicion(entrada);
  if (!posicion) return { tipo: "entrada-invalida" };

  const conocidas = asientos.map((): CardId[] => []);
  for (const { asiento, carta } of posicion.jugadas) conocidas[asiento].push(carta);
  conocidas[posicion.asiento].push(...posicion.cartas);
  const fijas = new Set([posicion.muestra, ...conocidas.flat()]);
  const libres = mazo.filter(carta => !fijas.has(carta));
  const ajenos = asientos.filter(asiento => asiento !== posicion.asiento);

  // Una distribución de relleno permite derivar todos los turnos y pardas con
  // el motor. Al evaluar cada hipótesis sustituimos la mano privada de esa vista.
  const relleno = [...libres];
  const ejemplo = conocidas.map(vistas => [...vistas, ...relleno.splice(0, 3 - vistas.length)]);
  let mesa = iniciar(posicion, ejemplo);
  const decisiones = asientos.map((): DecisionPrevia[] => []);
  for (const jugada of posicion.jugadas) {
    const { asiento, carta } = jugada;
    const paso = jugarCarta(mesa, jugada);
    if (!paso.ok) return { tipo: "entrada-invalida" };
    if (asiento !== posicion.asiento) {
      const anteriores = decisiones[asiento].length;
      decisiones[asiento].push({
        vista: vistaPara(mesa, asiento), carta, conocidasEnTurno: conocidas[asiento].slice(anteriores),
      });
    }
    mesa = paso.estado;
  }
  if (mesa.turno === null) return { tipo: "mano-terminada" };
  if (mesa.turno !== posicion.asiento) return { tipo: "fuera-de-turno" };

  const apertura = posicion.jugadas.length === 0;
  function posibilidades(asiento: Asiento): CardId[][] {
    const admisibles = [];
    for (const restantes of combinaciones(libres, 3 - conocidas[asiento].length)) {
      const explica = decisiones[asiento].every(({ vista, carta, conocidasEnTurno }) =>
        elegirJugada({ ...vista, cartas: [...conocidasEnTurno, ...restantes] }) === carta);
      if (explica) admisibles.push(restantes);
    }
    return admisibles;
  }
  // Al abrir el sorteo directo evita materializar las tres listas de 7.140 ternas.
  const listas = apertura ? [] : ajenos.map(posibilidades);
  const ternasIniciales = libres.length * (libres.length - 1) * (libres.length - 2) / 6;
  const producto = apertura ? ternasIniciales ** 3 : listas.reduce((n, lista) => n * lista.length, 1);
  if (producto === 0) return { tipo: "incompatible" };

  const reconstruir = (faltantes: readonly (readonly CardId[])[]): EstadoMano => {
    const manos = [...conocidas];
    ajenos.forEach((asiento, i) => { manos[asiento] = [...conocidas[asiento], ...faltantes[i]]; });
    let estado = iniciar(posicion, manos);
    for (const jugada of posicion.jugadas) {
      const paso = jugarCarta(estado, jugada);
      if (!paso.ok) throw new Error("El mundo no reproduce el historial público validado.");
      estado = paso.estado;
    }
    return estado;
  };

  function compartenCartas(manos: readonly (readonly CardId[])[]): boolean {
    const cartas = manos.flat();
    return new Set(cartas).size !== cartas.length;
  }

  return {
    tipo: "disponible", posicion, producto,
    proponer(azar) {
      if (apertura) {
        const mazoLibre = [...libres];
        const sacar = () => mazoLibre.splice(Math.floor(azar() * mazoLibre.length), 1)[0];
        return reconstruir(ajenos.map(() => [sacar(), sacar(), sacar()]));
      }
      // Las listas se sortean independientemente. Si colisionan, se descarta
      // toda la propuesta para conservar el mismo peso para cada mundo válido.
      const elegidas = listas.map(lista => lista[Math.floor(azar() * lista.length)]);
      return compartenCartas(elegidas) ? null : reconstruir(elegidas);
    },
    *enumerar(limite = 32768) {
      if (!Number.isSafeInteger(limite) || limite < producto) throw new RangeError("La enumeración supera el límite.");
      const [primera, segunda, tercera] = apertura ? ajenos.map(posibilidades) : listas;
      for (const a of primera) {
        for (const b of segunda) {
          for (const c of tercera) {
            const elegidas = [a, b, c];
            if (!compartenCartas(elegidas)) yield reconstruir(elegidas);
          }
        }
      }
    },
  };
}
