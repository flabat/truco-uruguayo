// Única entrada a la mesa y al visor de espectador. El resto de la app solo usa `entrarALaMesa`,
// `mirarMesa`, `MesaEnJuego` y `VisorDeEspectador`.
import { router, type Href } from "expo-router";
import { registrarPrecargaWeb } from "../precarga/usePrecargaDeMesa.ts";
import { cargarCanvasKit } from "./canvaskit.ts";
import { anotarPresenciada } from "./presenciadas.ts";

export { MesaEnJuego } from "./MesaEnJuego.tsx";
export { Visor as VisorDeEspectador } from "./Visor.tsx";
export { volverAlSalon } from "./salir.ts";

registrarPrecargaWeb(cargarCanvasKit);

/** Cuando la mesa empieza, la sala de espera deja su lugar a la mesa, que anima el primer reparto. */
export function entrarALaMesa(id: string) {
  anotarPresenciada(id);
  router.replace(`/mesa?id=${encodeURIComponent(id)}` as Href);
}

export function mirarMesa(id: string) {
  router.push(`/mirar/${encodeURIComponent(id)}` as Href);
}
