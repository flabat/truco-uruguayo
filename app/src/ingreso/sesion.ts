import type { Cliente, Jugador } from "../api/cliente.ts";
import type { AlmacenSesion } from "./almacen.ts";
import { codigoDeRetorno } from "./retorno.ts";

interface Contexto {
  cliente: Cliente;
  almacen: AlmacenSesion;
}

/** Lo que devuelve `openAuthSessionAsync` de expo-web-browser. */
export interface ResultadoDelNavegador {
  type: string;
  url?: string;
}

/** Canjea el retorno del navegador del sistema. `null` si la persona cerró el navegador o el retorno no sirve. */
export async function completarIngreso({ resultado, verificador, cliente, almacen }: Contexto & {
  resultado: ResultadoDelNavegador;
  verificador: string;
}): Promise<{ jugador: Jugador; bajaCancelada: boolean } | null> {
  const codigo = resultado.type === "success" && resultado.url ? codigoDeRetorno(resultado.url) : null;
  if (!codigo) return null;
  const { sesion, jugador, bajaCancelada } = await cliente.canjear(codigo, verificador);
  await almacen.guardar(sesion);
  return { jugador, bajaCancelada };
}

/** El jugador de la sesión. Una sesión vencida o eliminada en otro dispositivo se borra; un error de red no. */
export async function cargarJugador({ cliente, almacen }: Contexto): Promise<Jugador | null> {
  const jugador = await cliente.jugador();
  if (!jugador) await almacen.borrar();
  return jugador;
}

/** Cierra la sesión en el servidor si puede, y siempre en el teléfono. */
export async function cerrarSesion({ cliente, almacen }: Contexto): Promise<void> {
  try {
    await cliente.cerrarSesion();
  } catch {
    // Sin red, la sesión vence sola en el servidor; lo importante es no dejar al jugador atrapado.
  } finally {
    await almacen.borrar();
  }
}

/** Pide la baja. El servidor ya borró todas las sesiones; si el pedido falla, la sesión local sigue. */
export async function eliminarCuenta({ cliente, almacen }: Contexto): Promise<{ vence: string }> {
  const baja = await cliente.eliminarCuenta();
  await almacen.borrar();
  return baja;
}
