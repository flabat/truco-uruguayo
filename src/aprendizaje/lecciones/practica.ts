import { claveSituacion, generarSituacion, proveedorSituaciones } from "../generadores/index.ts";
import type { FuenteProgreso } from "../progreso.ts";
import { generarSesion } from "../sesion.ts";
import type { Tema } from "./index.ts";

export function generarPractica(tema: Tema, semilla: number, fuente: FuenteProgreso) {
  const ejemplos = tema.ejemplos.map(({ muestra, cartas }) => claveSituacion(muestra, cartas));
  return generarSesion(tema, semilla, {
    ...proveedorSituaciones,
    generar: (solicitud) => generarSituacion({ ...solicitud, recientes: [...solicitud.recientes, ...ejemplos] }),
  }, fuente);
}
