import { leerPosicion, type PosicionPublicaV1 } from "./informacion.ts";
import { claveAnalisis, perfilAnalisis, referenciaEditorial, type ResultadoAnalisis, type ResultadoCompleto } from "./perfil.ts";
import type { Mensaje, Pedido } from "./worker.ts";

export type EstadoConsulta =
  | { tipo: "calculando"; mundos: number; propuestas: number }
  | { tipo: "resultado"; resultado: ResultadoAnalisis; origen: "calculo" | "referencia" }
  | { tipo: "error" };

const capacidadCache = 16;
const esperaSinRespuesta = 60_000;

function abrirWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}

export function crearClienteAnalisis(crearWorker: () => Worker = abrirWorker) {
  const cache = new Map<string, ResultadoCompleto>();
  let secuencia = 0;
  let activo: Worker | null = null;
  let espera: ReturnType<typeof setTimeout> | undefined;

  function cancelar() {
    secuencia++;
    clearTimeout(espera);
    if (activo) {
      activo.onmessage = null;
      activo.onerror = null;
      activo.onmessageerror = null;
      activo.terminate();
      activo = null;
    }
  }

  function consultar(entrada: PosicionPublicaV1, recibir: (estado: EstadoConsulta) => void) {
    cancelar();
    const requestId = secuencia;
    // Copiar sólo los campos públicos, aun cuando un consumidor entregue un objeto extendido.
    const posicion = leerPosicion(entrada);
    if (!posicion) {
      recibir({ tipo: "resultado", resultado: { tipo: "entrada-invalida" }, origen: "calculo" });
      return;
    }
    const clave = claveAnalisis(posicion);
    const perfil = perfilAnalisis(posicion);
    const guardado = cache.get(clave);
    if (guardado) {
      cache.delete(clave);
      cache.set(clave, guardado);
      recibir({ tipo: "resultado", resultado: structuredClone(guardado), origen: "calculo" });
      return;
    }

    function resolverFallo(agotado?: Extract<ResultadoAnalisis, { tipo: "presupuesto-agotado" }>) {
      if (requestId !== secuencia) return;
      cancelar();
      const referencia = referenciaEditorial(posicion);
      if (referencia && referencia.clave === clave && referencia.perfil === perfil && referencia.version === 1) {
        recibir({ tipo: "resultado", resultado: referencia, origen: "referencia" });
      } else if (agotado) {
        recibir({ tipo: "resultado", resultado: agotado, origen: "calculo" });
      } else {
        recibir({ tipo: "error" });
      }
    }

    function esperar() {
      clearTimeout(espera);
      espera = setTimeout(resolverFallo, esperaSinRespuesta);
    }

    recibir({ tipo: "calculando", mundos: 0, propuestas: 0 });
    if (requestId !== secuencia) return;

    try {
      activo = crearWorker();
      activo.onerror = () => resolverFallo();
      activo.onmessageerror = () => resolverFallo();
      activo.onmessage = ({ data }: MessageEvent<Mensaje>) => {
        if (requestId !== secuencia || data?.requestId !== requestId || data.clave !== clave) return;
        if (data.tipo === "progreso") {
          esperar();
          recibir({ tipo: "calculando", mundos: data.avance.mundos, propuestas: data.avance.propuestas });
          return;
        }
        if (data.tipo !== "resultado") return resolverFallo();
        const resultado = data.resultado;
        if (resultado.tipo === "presupuesto-agotado") return resolverFallo(resultado);
        if (resultado.tipo === "completo") {
          if (resultado.clave !== clave || resultado.perfil !== perfil || resultado.version !== 1) return resolverFallo();
          cache.set(clave, structuredClone(resultado));
          if (cache.size > capacidadCache) cache.delete(cache.keys().next().value!);
        }
        cancelar();
        recibir({ tipo: "resultado", resultado, origen: "calculo" });
      };
      esperar();
      const pedido: Pedido = { requestId, clave, perfil, posicion };
      activo.postMessage(pedido);
    } catch {
      resolverFallo();
    }
  }

  return { consultar, cancelar };
}
