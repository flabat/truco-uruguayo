import { useLocalSearchParams } from "expo-router";
import { Boton, Pantalla, Parrafo } from "../../componentes/ui.tsx";
import { VisorDeEspectador, volverAlSalon } from "../../mesa/entrada.tsx";
import { usePrecargaDeMesa } from "../../precarga/usePrecargaDeMesa.ts";
import { destinoDeEnlace } from "../../salon/enlaces.ts";
import { RequiereJugador } from "../../salon/RequiereJugador.tsx";

export default function PantallaMirar() {
  usePrecargaDeMesa();
  const { id } = useLocalSearchParams<{ id: string }>();
  const destino = destinoDeEnlace({ mirar: id });
  return (
    <RequiereJugador destino={destino}>
      {jugador => destino?.tipo === "mirar" && jugador.salonHabilitado
        ? <VisorDeEspectador key={destino.id} id={destino.id} />
        : (
          <Pantalla titulo="Mirar una mesa">
            <Parrafo>Esta mesa no está disponible para mirar.</Parrafo>
            <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
          </Pantalla>
        )}
    </RequiereJugador>
  );
}
