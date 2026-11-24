import type { CardId } from "@eltruco/motor/cartas.ts";
import { aDecidir, aplicarOnline, iniciarOnline } from "@eltruco/motor/mesa-online.ts";
import { observe } from "../seat/index.ts";
import { commitTurn } from "../signals/index.ts";
import type { PublicTurn } from "../contracts/index.ts";
import { loadPartnerPolicy, type Actor } from "./policy.ts";
import type { TresCartas } from "@eltruco/motor/reparto.ts";

/** Juego reducido a 39–39: todos ya jugaron su primera carta. El equipo 0 elige, desde
 * la información común, dos prescripciones para la segunda vuelta. Cada una mapea las
 * dos posibles tenencias privadas del asiento a una de sus dos cartas restantes.
 * Los rivales juegan en orden fijo; la tercera vuelta queda forzada. Solo se admiten cartas. */
const opens: CardId[] = ["copas-07", "bastos-12", "copas-05", "copas-12"];
const left = [["espadas-06", "copas-03"], ["oros-06", "copas-11"]] as const;
const right = [["bastos-01", "bastos-04"], ["oros-04", "espadas-10"]] as const;
export type Prescription = readonly [0 | 1, 0 | 1];
const options: Prescription[] = [[0, 0], [0, 1], [1, 0], [1, 1]];

function position(a: 0 | 1, c: 0 | 1) {
  const manos: TresCartas[] = [
    [opens[0], ...left[a]], [opens[1], "bastos-05", "espadas-03"],
    [opens[2], ...right[c]], [opens[3], "oros-10", "oros-11"],
  ];
  return iniciarOnline({versionReparto: "online-1", mano: 0, dador: 3, muestra: "espadas-05", manos}, [39, 39]);
}
export function prescriptionValue(first: Prescription, third: Prescription) {
  let wins = 0;
  for (const a of [0, 1] as const) for (const c of [0, 1] as const) {
    let state = position(a, c);
    while (!state.resultado) {
      const seat = aDecidir(state)[0], cards = state.mano.restantes[seat];
      const index = cards.length === 2 ? [first[a], 0, third[c], 0][seat] : 0;
      const step = aplicarOnline(state, { tipo: "carta", asiento: seat, carta: cards[index] });
      if (!step.ok) throw new Error("La posición reducida debe admitir cada jugada prescrita.");
      state = step.estado;
    }
    if (state.resultado.equipo === 0) wins++;
  }
  return wins / 4;
}
export function solveEndgame() {
  let best = -1, prescriptions: [Prescription, Prescription][] = [];
  for (const p of options) for (const q of options) {
    const score = prescriptionValue(p, q);
    if (score > best) { best = score; prescriptions = []; }
    if (score === best) prescriptions.push([p, q]);
  }
  return { value: best, prescriptions };
}


// Las prescripciones estocásticas se muestrean independientemente por asiento y tenencia.
// Cada actor conoce sus dos cartas y la primera vuelta pública al comprometer su jugada.
export function compareEndgame(actor: Actor) {
  const odds = [];
  for (const seat of [0, 2] as const) {
    const policy = loadPartnerPolicy(actor, seat);
    const probabilities = [];
    for (const holding of [0, 1] as const) {
      let state = position(seat === 0 ? holding : 0, seat === 2 ? holding : 0);
      const history: PublicTurn[] = [];
      for (const opening of [0, 1, 2, 3] as const) {
        const step = commitTurn(state, opening, actor.format, opens[opening]);
        state = step.state;
        history.push(step.turn);
      }
      const obs = observe(state, seat, actor.format, history);
      probabilities.push(policy.decide({ ...obs, legalActions: obs.view.cartas }, obs.view.cartas));
    }
    odds.push(options.map(p => probabilities[0][p[0]] * probabilities[1][p[1]]));
  }
  let value = 0;
  for (const [i,p] of options.entries()) for (const [j,q] of options.entries()) {
    value += odds[0][i] * odds[1][j] * prescriptionValue(p,q);
  }
  return { value, optimum: solveEndgame().value };
}
