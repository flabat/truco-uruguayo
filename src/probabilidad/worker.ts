import { calcularPorLotes, type AvanceCalculo } from "./calcular.ts";
import { leerPosicion, type PosicionPublicaV1 } from "./informacion.ts";
import { claveAnalisis, perfilAnalisis, type Perfil, type ResultadoAnalisis } from "./perfil.ts";

export interface Pedido {
  requestId: number;
  clave: string;
  perfil: Perfil;
  posicion: PosicionPublicaV1;
}

export type Mensaje = Pick<Pedido, "requestId" | "clave"> & (
  { tipo: "progreso"; avance: AvanceCalculo } |
  { tipo: "resultado"; resultado: ResultadoAnalisis } |
  { tipo: "error" }
);

self.onmessage = ({ data }: MessageEvent<Pedido>) => {
  const { requestId, clave, perfil } = data;
  const enviar = (mensaje: Mensaje) => self.postMessage(mensaje);
  try {
    const posicion = leerPosicion(data.posicion);
    if (!posicion || claveAnalisis(posicion) !== clave || perfilAnalisis(posicion) !== perfil) {
      enviar({ requestId, clave, tipo: "error" });
      return;
    }
    const calculo = calcularPorLotes(posicion);
    let proximoInforme = performance.now() + 120;
    let paso = calculo.next();
    while (!paso.done) {
      const ahora = performance.now();
      if (ahora >= proximoInforme) {
        enviar({ requestId, clave, tipo: "progreso", avance: paso.value });
        proximoInforme = ahora + 120;
      }
      paso = calculo.next();
    }
    enviar({ requestId, clave, tipo: "resultado", resultado: paso.value });
  } catch {
    enviar({ requestId, clave, tipo: "error" });
  }
};
