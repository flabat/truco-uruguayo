import { esCardId, type CardId } from "./cartas.ts";
import { legalesOnline, type EstadoOnline, type TipoAccionOnline } from "./cantos-online.ts";
import { desenlaceSeguro, jugadasGanadoras } from "./desenlace.ts";
import { segundaPerdidaEnDuelo } from "./mesa-online.ts";
import type { Asiento } from "./reparto.ts";

/** Una carta o un canto, como los propone la computadora. */
export type Decision = CardId | Exclude<TipoAccionOnline, "carta">;

export type Correccion = {
  nombre: string;
  corregir(estado: EstadoOnline, asiento: Asiento, decision: string): Decision | null;
};

const subidas = ["truco", "retruco", "vale-cuatro"] as const;
const trucoAbierto = (e: EstadoOnline) => e.lateral === null && e.trucoPendiente !== null;
const sinCanto = (e: EstadoOnline) => e.lateral === null && e.trucoPendiente === null;
const subidaLegal = (e: EstadoOnline, asiento: Asiento) =>
  legalesOnline(e, asiento).find((t): t is (typeof subidas)[number] => (subidas as readonly string[]).includes(t));

/** En orden: se aplica la primera que corrige. Solo usan lo que ve el asiento. */
export const correcciones: readonly Correccion[] = [
  {
    // #452: la computadora expresa la entrega eligiendo una carta.
    nombre: "entregar-mazo",
    corregir: (e, asiento, decision) => esCardId(decision) && e.mano.restantes[asiento].includes(decision)
      && (e.antesDeSalida === asiento || segundaPerdidaEnDuelo(e, asiento)) ? "mazo" : null,
  },
  {
    // #460: querer con la mano perdida solo agrega un tanto al rival. Las subidas quedan: pueden ser faroles.
    nombre: "nunca-querer-perdida",
    corregir: (e, asiento, decision) =>
      decision === "quiero" && trucoAbierto(e) && desenlaceSeguro(e, asiento) === "perdida" ? "no-quiero" : null,
  },
  {
    // Con la mano ganada, subir nunca rinde menos que querer: si el rival no quiere, cobra lo mismo.
    nombre: "subir-ganada",
    corregir(e, asiento, decision) {
      const responde = trucoAbierto(e) && (decision === "quiero" || decision === "no-quiero");
      const juega = sinCanto(e) && esCardId(decision);
      if (!responde && !juega) return null;
      const subida = subidaLegal(e, asiento);
      if (juega && !subida) return null;
      if (desenlaceSeguro(e, asiento) !== "ganada") return null;
      return subida ?? "quiero";
    },
  },
  {
    // Subir solo rinde si después se juega la línea ganadora: una carta que deja la mano abierta se cambia.
    nombre: "jugar-ganadora",
    corregir(e, asiento, decision) {
      if (!sinCanto(e) || !esCardId(decision)) return null;
      const ganadoras = jugadasGanadoras(e, asiento);
      return ganadoras.length && !ganadoras.includes(decision) ? ganadoras[0] : null;
    },
  },
];

/** Aplica la primera corrección que devuelve una acción distinta. Fuera del duelo, la decisión no cambia. */
export function corregirDecision<D extends string>(estado: EstadoOnline, asiento: Asiento, decision: D):
    { decision: D | Decision; correccion?: string } {
  for (const { nombre, corregir } of correcciones) {
    const corregida = corregir(estado, asiento, decision);
    if (corregida !== null && corregida !== decision) return { decision: corregida, correccion: nombre };
  }
  return { decision };
}
