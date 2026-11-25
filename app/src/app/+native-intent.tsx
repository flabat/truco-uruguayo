// Expo Router consulta este módulo antes de abrir un enlace del sistema (solo en iOS y Android).
import { rutaDelSistema } from "../ingreso/retorno.ts";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return rutaDelSistema(path);
}
