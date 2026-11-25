// Los conteos anónimos de /jugar/ (`src/lib/eventos.ts`): un archivo público de `/eventos/` por
// interacción, sin enlaces, nombres ni ID. Ver docs/comunidad-y-compartir.md.
export type Evento = "discord" | "compartir-mesa" | "ingreso-mesa";

type Pedir = (ruta: string, opciones: RequestInit & { keepalive?: boolean }) => Promise<unknown>;

/**
 * Solo en la web, donde reemplaza a `/jugar/`: las apps no suman conteos nuevos a lo que declaran
 * en las tiendas. Un conteo perdido no es un error.
 */
export function crearContador({ web, pedir }: { web: boolean; pedir?: Pedir }) {
  return (evento: Evento) => {
    if (!web || !pedir) return;
    try {
      void pedir(`/eventos/${evento}.txt`, { cache: "no-store", keepalive: true, referrerPolicy: "no-referrer" })
        .catch(() => {});
    } catch {
      /* Sin red ni fetch, el conteo se pierde. */
    }
  };
}
