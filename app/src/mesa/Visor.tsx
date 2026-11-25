import "./polyfill.ts";
import { useCallback, useMemo, useState } from "react";
import { Boton, Cargando, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { useConsulta } from "../salon/useConsulta.ts";
import { MesaPantalla, type AccionesMesa } from "./MesaPantalla.tsx";
import {
  datosDelEspectador, mesaDeEspectador, pasosDelEspectador, seguimientoInicial, seguirConsulta, versionarObservada,
  type MesaObservada,
} from "./modelo.ts";
import { crearEventos } from "./eventos.ts";
import { volverAlSalon } from "./salir.ts";
import { useColaDePresentacion } from "./useCola.ts";
import { useEfectos } from "./useEfectos.ts";
import { usePreferencias } from "./usePreferencias.ts";
import { HojaMano } from "./vistas/HojaMano.tsx";
import { HojaMas } from "./vistas/HojaMas.tsx";
import { HojaTantos } from "./vistas/HojaTantos.tsx";
import { HojaVoz } from "./vistas/HojaVoz.tsx";

const nada = () => {};
const sinSenas = { tipo: "ninguna" } as const;
// El espectador no juega: la mesa no ofrece ninguna jugada, solo la salida.
const acciones: AccionesMesa = {
  jugarCarta: nada, cantar: nada, indicar: nada, repartir: nada, crearMesa: nada, salir: volverAlSalon,
};

/** Mirar una mesa del salón con la misma mesa del jugador, sin mano, sin Cantos y sin señas. */
export function Visor({ id }: { id: string }) {
  const ruta = "/api/salon/mesas/" + encodeURIComponent(id);
  const { datos, estado, reintentar } = useConsulta<MesaObservada>(ruta, 2000);
  const { preferencias, cambiar, reducirMovimiento, liviano } = usePreferencias();
  const [eventos] = useState(crearEventos);
  useEfectos(eventos, preferencias);
  // La cola compara por identidad: la versión se arma una vez por lectura.
  const recibida = useMemo(() => datos ? versionarObservada(datos) : undefined, [datos]);
  const nombre = useCallback((asiento: number) => datos?.asientos[asiento]?.nombre ?? "", [datos]);
  // Tras un corte, lo que llegó junto aparece al día.
  const [guardado, guardar] = useState(seguimientoInicial);
  const seguimiento = seguirConsulta(guardado, estado, datos?.manoNumero);
  if (seguimiento !== guardado) guardar(seguimiento);
  const { partida, voz } = useColaDePresentacion(recibida, false, seguimiento.reconexion, pasosDelEspectador,
    { liviano, alEvento: eventos.emitir, miAsiento: null, nombre });

  if (estado === "cargando" && !datos) return <Cargando />;
  if (estado === "no-disponible" || estado === "sin-sesion" || !datos || !partida) {
    return (
      <Pantalla titulo="Mirar una mesa">
        <Parrafo>{estado === "error" ? "No se pudo cargar la mesa." : "Esta mesa no está disponible para mirar."}</Parrafo>
        {estado === "error" ? <Boton onPress={reintentar}>Reintentar</Boton> : null}
        <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }

  const mesa = partida.mesa;
  const visible = mesaDeEspectador(mesa, { voz });
  const hojas = datosDelEspectador(mesa, visible);
  const extra = {
    mano: <HojaMano datos={hojas} />,
    tantos: <HojaTantos datos={hojas} />,
    voz: <HojaVoz ruta={ruta} disponible={datos.vozDisponible === true} espectador exhibicion={datos.origen === "exhibicion"} />,
    mas: (
      <HojaMas versionReglas={datos.versionReglas} politica={datos.politica} nombreModelo={datos.edicionModelo?.nombre}
        preferencias={preferencias} cambiar={cambiar} reducirMovimiento={reducirMovimiento} salir={volverAlSalon} />
    ),
  };
  return (
    <MesaPantalla mesa={visible} senas={sinSenas} hojaCantos={null} acciones={acciones} extra={extra}
      rechazos={0} conectada={estado !== "error"} eventos={eventos} liviano={liviano} hapticos={preferencias.hapticos} />
  );
}
