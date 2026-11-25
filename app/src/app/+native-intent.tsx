// Expo Router consulta este módulo antes de abrir un enlace del sistema (solo en iOS y Android): el
// retorno del ingreso, `eltruco://…` y los enlaces de https://eltru.co que el sistema asocia a la app.
import { rutaDelSistema } from "../ingreso/retorno.ts";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return rutaDelSistema(path);
}
