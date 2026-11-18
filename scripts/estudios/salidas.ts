import { parseArgs } from "node:util";
import { mazo, type CardId } from "../../src/motor/cartas.ts";
import { elegirJugada } from "../../src/motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano, type Jugada } from "../../src/motor/mano.ts";
import { crearAzar, equipoPorAsiento, versionReparto, type RepartoV1 } from "../../src/motor/reparto.ts";

const aprendiz = 0;
const muestra = "copas-06";
const cartas = ["copas-02", "bastos-03", "oros-05"] as const;
const visibles = new Set<CardId>([muestra, ...cartas]);
const ocultas = mazo.filter(carta => !visibles.has(carta));

function repartoCondicionado(semilla: number): RepartoV1 {
  const azar = crearAzar(semilla);
  const disponibles = [...ocultas];
  function sacar(): CardId {
    const indice = Math.floor(azar() * disponibles.length);
    return disponibles.splice(indice, 1)[0];
  }
  function repartirTres(): RepartoV1["manos"][number] {
    return [sacar(), sacar(), sacar()];
  }
  return {
    versionReparto, semilla, dador: 3, mano: aprendiz, muestra,
    manos: [cartas, repartirTres(), repartirTres(), repartirTres()],
  };
}

function jugar(estado: EstadoMano, jugada: Jugada): EstadoMano {
  const paso = jugarCarta(estado, jugada);
  if (!paso.ok) throw new Error(`Jugada rechazada (${paso.error}).`);
  return paso.estado;
}

function ganaConSalida(inicial: EstadoMano, salida: CardId): boolean {
  let estado = jugar(inicial, { asiento: aprendiz, carta: salida });
  while (estado.turno !== null) {
    const asiento = estado.turno;
    const carta = elegirJugada(vistaPara(estado, asiento));
    estado = jugar(estado, { asiento, carta });
  }
  return estado.equipoGanador === equipoPorAsiento[aprendiz];
}

function estudiar(semillaInicial: number, repartos: number, conDetalle: boolean) {
  const salidas = cartas.map(carta => ({ carta, victorias: 0 }));
  const pares = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => ({ a, b, soloA: 0, soloB: 0 }));
  const detalle = [];
  for (let i = 0; i < repartos; i++) {
    const semilla = (semillaInicial + i) >>> 0;
    const reparto = repartoCondicionado(semilla);
    const inicial = iniciarMano(reparto);
    const victorias = cartas.map(salida => ganaConSalida(inicial, salida));
    for (const [indice, gana] of victorias.entries()) {
      if (gana) salidas[indice].victorias++;
    }
    for (const par of pares) {
      if (victorias[par.a] && !victorias[par.b]) par.soloA++;
      if (victorias[par.b] && !victorias[par.a]) par.soloB++;
    }
    if (conDetalle) detalle.push({ semilla, manos: reparto.manos, ganaPareja02: victorias });
  }

  const comparaciones = pares.map(({ a, b, soloA, soloB }) => {
    // D vale +1 si gana solo A, −1 si gana solo B o 0 si coinciden.
    const diferencia = (soloA - soloB) / repartos;
    const mediaCuadrados = (soloA + soloB) / repartos;
    const errorEstandar = repartos > 1
      ? Math.sqrt((mediaCuadrados - diferencia ** 2) / (repartos - 1))
      : null;
    // Cota bilateral de Hoeffding para la media de D en [−1, 1].
    const margen = Math.sqrt(2 * Math.log(2 / 0.05) / repartos);
    return {
      a: cartas[a], b: cartas[b], soloA, soloB, diferencia, errorEstandar,
      intervalo95: [Math.max(-1, diferencia - margen), Math.min(1, diferencia + margen)],
    };
  });
  return {
    semillaInicial, repartos, mano: aprendiz, muestra,
    salidas: salidas.map(salida => ({ ...salida, frecuencia: salida.victorias / repartos })),
    comparaciones, ...(conDetalle && { detalle }),
  };
}

function entero(valor: string, nombre: string, minimo: number, maximo: number): number {
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < minimo || numero > maximo) {
    throw new Error(`--${nombre} debe ser un entero entre ${minimo} y ${maximo}.`);
  }
  return numero;
}

try {
  const { values } = parseArgs({ options: {
    semilla: { type: "string", default: "29" },
    repartos: { type: "string", default: "20000" },
    detalle: { type: "boolean", default: false },
  } });
  const semilla = entero(values.semilla, "semilla", 0, 2 ** 32 - 1);
  const repartos = entero(values.repartos, "repartos", 1, 2 ** 32);
  console.log(JSON.stringify(estudiar(semilla, repartos, values.detalle), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
