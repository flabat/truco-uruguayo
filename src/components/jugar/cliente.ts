import { crearCliente } from "@eltruco/cliente/cliente.ts";
import { useMesa as useMesaCompartida, type AvisosDeRed } from "@eltruco/cliente/use-mesa.ts";

export * from "@eltruco/cliente/cliente.ts";

/** La web usa la cookie de sesión en su mismo origen. */
export const clienteWeb = crearCliente();
export const pedir = clienteWeb.pedir;

const avisosDeVentana: AvisosDeRed = ({ leer, sinRed }) => {
  window.addEventListener("online", leer);
  window.addEventListener("offline", sinRed);
  window.addEventListener("pageshow", leer);
  return () => {
    window.removeEventListener("online", leer);
    window.removeEventListener("offline", sinRed);
    window.removeEventListener("pageshow", leer);
  };
};

export function useMesa(id: string, recienCreada = false) {
  return useMesaCompartida(clienteWeb, id, recienCreada, avisosDeVentana);
}
