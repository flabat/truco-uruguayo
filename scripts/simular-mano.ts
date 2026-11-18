import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { cartasPorId } from "../src/lib/cartas.ts";
import type { CardId } from "../src/motor/cartas.ts";
import { elegirJugada } from "../src/motor/jugadores.ts";
import { iniciarMano, jugarCarta, vistaPara, type EstadoMano, type Jugada } from "../src/motor/mano.ts";
import { repartir } from "../src/motor/reparto.ts";
import { capturarReplay, reproducirReplay } from "../src/motor/replay.ts";
import { evaluarTantos } from "../src/motor/tantos.ts";

const uso = `node scripts/simular-mano.ts [--semilla N] [--dador 0..3] [--guardar ARCHIVO|-]
node scripts/simular-mano.ts --replay ARCHIVO|-`;
const roles = ["aprendiz", "rival", "compañero", "rival"] as const;
const parejas = ["0 y 2", "1 y 3"] as const;

function simular(semilla: number, dador: number): EstadoMano {
  let estado = iniciarMano(repartir(semilla, dador));
  while (estado.turno !== null) {
    const asiento = estado.turno;
    const vista = vistaPara(estado, asiento);
    const carta = asiento === 0 ? vista.cartas[0] : elegirJugada(vista);
    const paso = jugarCarta(estado, { asiento, carta });
    if (!paso.ok) throw new Error(`Jugada del asiento ${asiento} rechazada (${paso.error}).`);
    estado = paso.estado;
  }
  return estado;
}

function leerReplay(archivo: string): EstadoMano {
  const texto = readFileSync(archivo === "-" ? 0 : archivo, "utf8");
  const resultado = reproducirReplay(texto);
  if (resultado.ok) return resultado.estado;
  if ("posicion" in resultado) throw new Error(`Jugada ${resultado.posicion} rechazada (${resultado.error}).`);
  if ("campo" in resultado) throw new Error(`Versión desconocida en ${resultado.campo}.`);
  throw new Error(`Replay inválido (${resultado.error}).`);
}

function nombre(carta: CardId): string {
  return cartasPorId.get(carta)!.nombre.toLowerCase();
}

function relatar(estado: EstadoMano): string {
  const { reparto, vueltas, vueltaActual, equipoGanador } = estado;
  const cartas = reparto.manos[0];
  const { modalidad, total } = evaluarTantos(cartas, reparto.muestra);
  const lineas = [
    `Semilla ${reparto.semilla} · Dador ${reparto.dador} · Mano ${reparto.mano}`,
    `Muestra · ${nombre(reparto.muestra)}`,
    `Cartas del aprendiz · ${cartas.map(nombre).join(", ")}`,
    `El aprendiz tiene ${total} de ${modalidad}.`,
  ];

  function relatarJugadas(jugadas: readonly Jugada[]) {
    for (const { asiento, carta } of jugadas) {
      lineas.push(`  Asiento ${asiento} (${roles[asiento]}) juega ${nombre(carta)}.`);
    }
  }
  for (const [indice, vuelta] of vueltas.entries()) {
    lineas.push("", `Vuelta ${indice + 1}`);
    relatarJugadas(vuelta.jugadas);
    const { resultado } = vuelta;
    lineas.push(resultado.tipo === "parda" ? "  Parda." : `  Gana la pareja ${parejas[resultado.equipo]}.`);
  }
  if (vueltaActual !== null) {
    lineas.push("", `Vuelta ${vueltas.length + 1} en curso`);
    relatarJugadas(vueltaActual.jugadas);
    lineas.push(`Sigue el asiento ${estado.turno}.`);
  } else if (equipoGanador !== null) {
    lineas.push("", `La pareja ${parejas[equipoGanador]} gana la mano.`);
  }
  return lineas.join("\n");
}

function argumentos() {
  try {
    return parseArgs({
      options: {
        semilla: { type: "string" }, dador: { type: "string" },
        guardar: { type: "string" }, replay: { type: "string" },
      },
    }).values;
  } catch {
    throw new Error(`Revisá las opciones y sus valores.\n${uso}`);
  }
}

function entero(valor: string, campo: string): number {
  if (!/^\d+$/.test(valor)) throw new Error(`El valor de --${campo} debe ser un entero decimal sin signo.`);
  return Number(valor);
}

function principal() {
  const { semilla, dador, guardar, replay } = argumentos();
  if (replay !== undefined) {
    if (semilla !== undefined || dador !== undefined || guardar !== undefined) {
      throw new Error(`Usá --replay solo. El historial ya contiene el reparto y las jugadas.\n${uso}`);
    }
    console.log(relatar(leerReplay(replay)));
    return;
  }

  const estado = simular(entero(semilla ?? "217", "semilla"), entero(dador ?? "3", "dador"));
  if (guardar !== undefined) {
    const json = JSON.stringify(capturarReplay(estado)) + "\n";
    if (guardar === "-") {
      process.stdout.write(json);
      return;
    }
    writeFileSync(guardar, json);
  }
  console.log(relatar(estado));
}

try {
  principal();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
