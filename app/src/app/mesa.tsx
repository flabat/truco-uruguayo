import { Redirect, useLocalSearchParams } from "expo-router";
import { MesaEnJuego } from "../mesa/entrada.tsx";
import { destinoDeEnlace } from "../salon/enlaces.ts";
import { RequiereJugador } from "../salon/RequiereJugador.tsx";

/** Ruta de la mesa en juego (`/mesa?id=<mesa>`). Lo que muestra vive en mesa/entrada.tsx, que reemplaza 4d. */
export default function PantallaMesa() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const destino = id ? destinoDeEnlace({ mesa: id }) : null;
  if (!destino || destino.tipo !== "mesa") return <Redirect href="/" />;
  return <RequiereJugador destino={destino}>{() => <MesaEnJuego key={destino.id} id={destino.id} />}</RequiereJugador>;
}
