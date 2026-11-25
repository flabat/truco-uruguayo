export const retornoApp = "eltruco://ingreso";

/** Código de canje del retorno `eltruco://ingreso?codigo=…`; cualquier otra URL se descarta. */
export function codigoDeRetorno(url: string): string | null {
  const prefijo = retornoApp + "?";
  if (!url.startsWith(prefijo)) return null;
  const codigo = new URLSearchParams(url.slice(prefijo.length)).get("codigo");
  return codigo !== null && /^[A-Za-z0-9_-]{43}$/.test(codigo) ? codigo : null;
}
