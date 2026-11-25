// Enlaces de la app: `?invitacion=`, `?mesa=`, `?mirar=` y `?crear=1`, los mismos que comparte el servidor en /jugar/.
const esId = (valor: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(valor);
const esToken = (valor: string) => /^[A-Za-z0-9_-]{1,80}$/.test(valor);

export type Destino =
  | { tipo: "mirar"; id: string }
  | { tipo: "invitacion"; token: string }
  | { tipo: "mesa"; id: string }
  | { tipo: "crear" };

type Parametros = Record<string, string | string[] | undefined>;
const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);

/** Un enlace de espectador jamás se interpreta como una invitación ni como una mesa propia. */
export function destinoDeEnlace(parametros: Parametros): Destino | null {
  const mirar = primero(parametros.mirar);
  if (mirar !== undefined) return esId(mirar) ? { tipo: "mirar", id: mirar } : null;
  const token = primero(parametros.invitacion);
  if (token !== undefined) return esToken(token) ? { tipo: "invitacion", token } : null;
  const mesa = primero(parametros.mesa);
  if (mesa !== undefined && esId(mesa)) return { tipo: "mesa", id: mesa };
  // El ingreso del servidor acepta volver a `/jugar/?crear=1` (api/auth.ts).
  if (primero(parametros.crear) === "1") return { tipo: "crear" };
  return null;
}

export function rutaDe(destino: Destino): string {
  if (destino.tipo === "mirar") return "/mirar/" + destino.id;
  if (destino.tipo === "invitacion") return "/invitacion/" + destino.token;
  if (destino.tipo === "crear") return "/crear";
  return "/sala/" + destino.id;
}

/** La consulta de `/` que retoma el destino tras ingresar. */
export function consultaDe(destino: Destino): string {
  if (destino.tipo === "invitacion") return "?invitacion=" + destino.token;
  if (destino.tipo === "crear") return "?crear=1";
  return `?${destino.tipo}=${destino.id}`;
}

export function tokenDeInvitacion(enlace: string): string | null {
  try {
    const token = new URL(enlace).searchParams.get("invitacion");
    return token && esToken(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * En la web se comparte la dirección /jugar/ del mismo origen. En las apps, sin universal links,
 * se comparte el enlace del servidor (también /jugar/), que cualquiera abre en el navegador.
 */
export function enlaceParaCompartir(invitacion: string, origenWeb: string | null): string {
  const token = tokenDeInvitacion(invitacion);
  if (!origenWeb || !token) return invitacion;
  return origenWeb.replace(/\/+$/, "") + "/jugar/?invitacion=" + encodeURIComponent(token);
}

/**
 * En la web el ingreso sale de la app y vuelve a /jugar/: el destino del enlace se guarda antes y se
 * retoma una sola vez al volver.
 */
export function destinoPendiente(
  guardado: { leer(): string | null; guardar(valor: string | null): void },
  actual: Destino | null,
): Destino | null {
  if (actual) {
    guardado.guardar(JSON.stringify(actual));
    return actual;
  }
  const texto = guardado.leer();
  if (texto === null) return null;
  guardado.guardar(null);
  try {
    const valor = JSON.parse(texto) as Destino;
    const parametros = valor.tipo === "invitacion" ? { invitacion: valor.token }
      : valor.tipo === "crear" ? { crear: "1" } : { [valor.tipo]: valor.id };
    return destinoDeEnlace(parametros);
  } catch {
    return null;
  }
}
