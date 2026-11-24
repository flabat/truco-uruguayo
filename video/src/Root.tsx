import { Composition } from "remotion";
import type { CardId } from "@site/motor/cartas";
import { evaluarTantos } from "@site/motor/tantos";
import { vozSilenciosa } from "./lib/escena.ts";
import { armarLinea } from "./lib/linea.ts";
import { compararCartas } from "@site/motor/jerarquia";
import type { EpisodioComparar, EpisodioTantos, Vuelta } from "./lib/episodio.ts";
import { guionCompararCartas } from "./plantillas/comparar-cartas/guion.ts";
import { LaminaComparar, type PropsComparar } from "./plantillas/comparar-cartas/Lamina";
import { guionContarTantos } from "./plantillas/contar-tantos/guion.ts";
import { Lamina, type PropsLamina } from "./plantillas/contar-tantos/Lamina";
import { Prueba } from "./plantillas/prueba/Prueba";

// Ejemplo sin audio para abrir Studio sin preparar un episodio. `npm run reel -- <ep> --studio` pasa uno real.
const muestra: CardId = "espadas-03";
const manos = ([["oros-05", "oros-07", "copas-02"], ["espadas-05", "oros-07", "copas-02"], ["copas-01", "oros-06", "bastos-11"]] as CardId[][])
  .map((cartas, i) => ({ cartas, tantos: evaluarTantos(cartas, muestra), ...(i === 1 ? { cambio: { de: "oros-05" as CardId, a: "espadas-05" as CardId } } : {}) }));
const episodio = { modalidad: "envido", muestra, gancho: "¿Cuánto tenés de envido?", lineas: {} } as unknown as EpisodioTantos;
const lineas = guionContarTantos(episodio, manos);
const ejemplo: PropsLamina = { modalidad: "envido", muestra, gancho: episodio.gancho, manos, lineas, voz: vozSilenciosa(lineas) };

const comparar: EpisodioComparar = {
  plantilla: "comparar-cartas", serie: "comparar-cartas", id: "ejemplo", muestra: "bastos-06", gancho: "¿Cuál gana la vuelta?",
  vueltas: [["bastos-02", "espadas-01"], ["espadas-07", "copas-07"], ["oros-03", "copas-03"]],
};
// episodio.ts lee archivos y no entra en el paquete del navegador: la ganadora sale del motor acá también.
const vueltas: Vuelta[] = (comparar.vueltas as [CardId, CardId][]).map(([a, b]) => {
  const orden = compararCartas(a, b, comparar.muestra);
  return { cartas: [a, b], ganadora: orden === 0 ? null : orden > 0 ? a : b };
});
const lineasComparar = guionCompararCartas(comparar, vueltas);
const ejemploComparar: PropsComparar = { muestra: comparar.muestra, gancho: comparar.gancho, vueltas, lineas: lineasComparar,
  voz: vozSilenciosa(lineasComparar) };

export const Root = () => (
  <>
    <Composition id="ContarTantos" component={Lamina} width={360} height={640} fps={30} durationInFrames={1}
      defaultProps={ejemplo}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(armarLinea(props.lineas, props.voz.palabras).duracion * 30) })} />
    <Composition id="CompararCartas" component={LaminaComparar} width={360} height={640} fps={30} durationInFrames={1}
      defaultProps={ejemploComparar}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(armarLinea(props.lineas, props.voz.palabras).duracion * 30) })} />
    <Composition id="Prueba" component={Prueba} width={360} height={640} fps={30} durationInFrames={30} />
  </>
);
