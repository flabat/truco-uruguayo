import { Redirect, type Href } from "expo-router";
import type { ReactNode } from "react";
import type { Jugador } from "../api/cliente.ts";
import { Cargando } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import type { Destino } from "./enlaces.ts";

const consulta = (destino: Destino) =>
  destino.tipo === "invitacion" ? "?invitacion=" + destino.token : `?${destino.tipo}=${destino.id}`;

/** Sin sesión vuelve al inicio con el enlace, para ingresar y retomarlo. */
export function RequiereJugador({ destino, children }: { destino: Destino | null; children: (jugador: Jugador) => ReactNode }) {
  const { estado } = useSesion();
  if (estado.tipo === "cargando") return <Cargando />;
  if (estado.tipo !== "dentro") return <Redirect href={("/" + (destino ? consulta(destino) : "")) as Href} />;
  return children(estado.jugador);
}
