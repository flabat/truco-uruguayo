import { pathToFileURL } from "node:url";
import { mazo } from "@eltruco/motor/cartas.ts";
import { aDecidir, aplicarOnline, elegirAccionOnline, iniciarOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { crearAzar, type Asiento, type RepartoOnline } from "@eltruco/motor/reparto.ts";

function legacyDeal(random: () => number, mano: 0 | 1): RepartoOnline {
  const deck = [...mazo];
  for (let i = 0; i < 7; i++) {
    const j = i + Math.floor(random() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const even = [deck[0], deck[2], deck[4]] as const;
  const odd = [deck[1], deck[3], deck[5]] as const;
  return {versionReparto:"online-1", mano, dador: mano === 0 ? 1 : 0,
    manos: mano === 0 ? [even, odd] : [odd, even], muestra:deck[6]};
}

export function legacyOpenings(count = 20000) {
  const random = crearAzar(20261118);
  let offered = 0, accepted = 0, won = 0;
  for (let i = 0; i < count; i++) {
    const state = iniciarOnline(legacyDeal(random, 0));
    const offer = elegirAccionOnline(vistaOnline(state, 0));
    if (offer?.tipo !== "falta-envido") continue;
    offered++;
    const step = aplicarOnline(state, offer);
    if (!step.ok) throw new Error(step.error);
    const response = elegirAccionOnline(vistaOnline(step.estado, 1));
    if (response?.tipo !== "quiero") continue;
    accepted++;
    const result = aplicarOnline(step.estado, response);
    if (!result.ok) throw new Error(result.error);
    if (result.estado.resultado?.equipo === 0) won++;
  }
  return {deals: count, offered, accepted, won};
}

export function legacyTournament(first = 310000, count = 2500) {
  let won = 0, hands = 0;
  for (let seed = first; seed < first + count; seed++) {
    for (const challengerSeat of [0, 1]) {
      const random = crearAzar(seed);
      const score: [number, number] = [0, 0];
      let mano: 0 | 1 = 0;
      while (Math.max(...score) < 40) {
        let state = iniciarOnline(legacyDeal(random, mano), score);
        while (!state.resultado) {
          const seat: Asiento = aDecidir(state)[0];
          const view = vistaOnline(state, seat);
          let action = elegirAccionOnline(view)!;
          if (seat === challengerSeat && view.acciones.length === 1 && view.acciones[0].tipo === "falta-envido"
              && view.tantosPropios.total < 35 && view.legales.includes("no-quiero")) {
            action = {tipo:"no-quiero", asiento:seat};
          }
          const step = aplicarOnline(state, action);
          if (!step.ok) throw new Error(step.error);
          state = step.estado;
        }
        for (const award of state.cobros) score[award.equipo] += award.tantos;
        mano = mano === 0 ? 1 : 0;
        hands++;
      }
      if (score[challengerSeat] >= 40) won++;
    }
  }
  return {matches: 2 * count, hands, won};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({openings: legacyOpenings(), tournament: legacyTournament()}, null, 2));
}
