// PKCE S256 del ingreso de la app (RFC 7636). Sin dependencias de Expo para probarlo con node --test.
const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64url(bytes: Uint8Array): string {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const quedan = bytes.length - i;
    texto += alfabeto[(n >> 18) & 63] + alfabeto[(n >> 12) & 63]
      + (quedan > 1 ? alfabeto[(n >> 6) & 63] : "") + (quedan > 2 ? alfabeto[n & 63] : "");
  }
  return texto;
}

/** El verificador nunca sale del teléfono; el desafío viaja en la URL de ingreso. */
export async function crearPar(
  aleatorio: (n: number) => Uint8Array,
  sha256: (texto: string) => Promise<Uint8Array>,
): Promise<{ verificador: string; desafio: string }> {
  const verificador = base64url(aleatorio(32));
  return { verificador, desafio: base64url(await sha256(verificador)) };
}
