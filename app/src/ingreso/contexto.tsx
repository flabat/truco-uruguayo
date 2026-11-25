import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Jugador, JugadorDePrueba } from "../api/cliente.ts";
import { abrirIngreso, abrirIngresoDePrueba, almacen, cliente } from "./plataforma.ts";
import { cargarJugador, cerrarSesion as cerrar, eliminarCuenta as eliminar } from "./sesion.ts";

export type Estado =
  | { tipo: "cargando" }
  | { tipo: "sinConexion" }
  | { tipo: "fuera"; aviso?: string }
  | { tipo: "dentro"; jugador: Jugador; aviso?: string };

interface Sesion {
  estado: Estado;
  ingresar(): Promise<void>;
  /** Los jugadores del ingreso de prueba; vacío salvo que la API anuncie el modo (AUTH_DEV). */
  jugadoresDePrueba: JugadorDePrueba[];
  ingresarComo(usuario: string): Promise<void>;
  cerrarSesion(): Promise<void>;
  eliminarCuenta(): Promise<void>;
  reintentar(): void;
}

const ContextoSesion = createContext<Sesion | null>(null);

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "long", year: "numeric" });

export function ProveedorDeSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [jugadoresDePrueba, setJugadoresDePrueba] = useState<JugadorDePrueba[]>([]);

  // Lo decide la API: sin AUTH_DEV responde 404 y no se muestra nada.
  const fuera = estado.tipo === "fuera";
  useEffect(() => {
    if (!fuera) return;
    let vigente = true;
    cliente.jugadoresDePrueba().then(usuarios => { if (vigente) setJugadoresDePrueba(usuarios); });
    return () => { vigente = false; };
  }, [fuera]);

  const cargar = useCallback(() => {
    setEstado({ tipo: "cargando" });
    cargarJugador({ cliente, almacen }).then(
      jugador => setEstado(jugador ? { tipo: "dentro", jugador } : { tipo: "fuera" }),
      () => setEstado({ tipo: "sinConexion" }),
    );
  }, []);
  useEffect(cargar, [cargar]);

  const entrar = useCallback(async (abrir: () => Promise<{ jugador: Jugador; bajaCancelada: boolean } | null>) => {
    try {
      const ingreso = await abrir();
      if (!ingreso) return;
      // El canje no dice si el salón está habilitado: /api/jugador sí.
      const jugador = await cliente.jugador().catch(() => null) ?? ingreso.jugador;
      setEstado({
        tipo: "dentro", jugador,
        aviso: ingreso.bajaCancelada ? "Cancelamos la eliminación de tu cuenta." : undefined,
      });
    } catch {
      setEstado({ tipo: "fuera", aviso: "No pudimos completar el ingreso. Probá de nuevo." });
    }
  }, []);
  const ingresar = useCallback(() => entrar(abrirIngreso), [entrar]);
  const ingresarComo = useCallback((usuario: string) => entrar(() => abrirIngresoDePrueba(usuario)), [entrar]);

  const cerrarSesion = useCallback(async () => {
    await cerrar({ cliente, almacen });
    setEstado({ tipo: "fuera" });
  }, []);

  const eliminarCuenta = useCallback(async () => {
    const { vence } = await eliminar({ cliente, almacen });
    setEstado({
      tipo: "fuera",
      aviso: `Pediste eliminar tu cuenta. Se borra el ${fecha(vence)}. Si volvés a ingresar antes, cancelamos la eliminación.`,
    });
  }, []);

  return (
    <ContextoSesion.Provider value={{ estado, ingresar, jugadoresDePrueba, ingresarComo, cerrarSesion, eliminarCuenta, reintentar: cargar }}>
      {children}
    </ContextoSesion.Provider>
  );
}

export function useSesion(): Sesion {
  const sesion = useContext(ContextoSesion);
  if (!sesion) throw new Error("useSesion requiere ProveedorDeSesion.");
  return sesion;
}
