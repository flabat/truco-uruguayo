// Consulta periódica del salón y del visor, la misma que `useConsultaSalon` de la web, sin DOM:
// quien la usa la suspende cuando la app pasa a segundo plano y la reanuda al volver.
export type Lectura<T> = { estado: 200; datos: T; etag: string | null } | { estado: 304 | 401 | 404 };
export type EstadoConsulta = "cargando" | "listo" | "error" | "no-disponible" | "sin-sesion";
export interface VistaConsulta<T> {
  datos: T | null;
  estado: EstadoConsulta;
}

export function crearConsulta<T>({ leer, intervalo, alCambiar, programar = globalThis }: {
  leer: (etag: string | null, signal: AbortSignal) => Promise<Lectura<T>>;
  intervalo: number;
  alCambiar: (vista: VistaConsulta<T>) => void;
  programar?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
}) {
  let vista: VistaConsulta<T> = { datos: null, estado: "cargando" };
  let etag: string | null = null;
  let pendiente: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let final = false;
  let suspendida = false;

  const mostrar = (nueva: VistaConsulta<T>) => {
    vista = nueva;
    alCambiar(vista);
  };

  async function consultar() {
    programar.clearTimeout(timer);
    timer = undefined;
    if (final || suspendida || pendiente) return;
    const solicitud = new AbortController();
    pendiente = solicitud;
    try {
      const lectura = await leer(etag, solicitud.signal);
      if (solicitud.signal.aborted) return;
      if (lectura.estado === 401 || lectura.estado === 404) {
        final = true;
        mostrar({ datos: null, estado: lectura.estado === 401 ? "sin-sesion" : "no-disponible" });
      } else if (lectura.estado === 304) {
        mostrar({ ...vista, estado: "listo" });
      } else if (lectura.estado === 200) {
        etag = lectura.etag ?? etag;
        mostrar({ datos: lectura.datos, estado: "listo" });
      }
    } catch {
      if (!solicitud.signal.aborted) mostrar({ ...vista, estado: "error" });
    } finally {
      if (pendiente === solicitud) {
        pendiente = undefined;
        if (!final && !suspendida) timer = programar.setTimeout(() => void consultar(), intervalo);
      }
    }
  }

  function cortar() {
    programar.clearTimeout(timer);
    timer = undefined;
    pendiente?.abort();
    pendiente = undefined;
  }

  return {
    iniciar() {
      mostrar(vista);
      void consultar();
    },
    suspender() {
      suspendida = true;
      cortar();
    },
    /** Lee de inmediato, salvo que ya haya una lectura o un temporizador en curso. */
    reanudar() {
      const enCurso = !suspendida && (pendiente || timer);
      suspendida = false;
      if (!enCurso) void consultar();
    },
    reintentar() {
      final = false;
      suspendida = false;
      void consultar();
    },
    detener() {
      final = true;
      cortar();
    },
  };
}
