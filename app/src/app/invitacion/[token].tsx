import { ErrorMesa, mensajeDe, type Mesa } from "@eltruco/cliente/cliente.ts";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Hoja } from "../../componentes/salon.tsx";
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from "../../componentes/ui.tsx";
import { useSesion } from "../../ingreso/contexto.tsx";
import { cliente } from "../../ingreso/plataforma.ts";
import { volverAlSalon } from "../../mesa/entrada.tsx";
import { usePrecargaDeMesa } from "../../precarga/usePrecargaDeMesa.ts";
import { destinoDeEnlace, rutaDe } from "../../salon/enlaces.ts";
import { textoVisibilidad } from "../../salon/mesa-nueva.ts";
import { RequiereJugador } from "../../salon/RequiereJugador.tsx";

export default function PantallaInvitacion() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const destino = destinoDeEnlace({ invitacion: token });
  if (!destino || destino.tipo !== "invitacion") {
    return (
      <Pantalla titulo="Invitación no válida">
        <Parrafo>El enlace de invitación no es válido.</Parrafo>
        <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }
  return <RequiereJugador destino={destino}>{() => <Invitacion key={destino.token} token={destino.token} />}</RequiereJugador>;
}

const irALaSala = (id: string) => router.replace(rutaDe({ tipo: "mesa", id }) as Href);

function Invitacion({ token }: { token: string }) {
  usePrecargaDeMesa();
  const { reintentar: recargarSesion } = useSesion();
  const ruta = "/api/invitaciones/" + encodeURIComponent(token);
  const [previa, setPrevia] = useState<{ publica: boolean } | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const fallar = (e: unknown) => {
    if (e instanceof ErrorMesa && e.status === 401) recargarSesion();
    else setError(mensajeDe(e));
  };

  useEffect(() => {
    const cancel = new AbortController();
    cliente.pedir<{ publica: boolean; sentada: boolean; id?: string }>(ruta, undefined, cancel.signal)
      .then(datos => {
        if (datos.sentada && datos.id) irALaSala(datos.id);
        else setPrevia({ publica: datos.publica });
      })
      .catch(e => { if (!cancel.signal.aborted) fallar(e); });
    return () => cancel.abort();
  }, [ruta]);

  async function ocupar() {
    setOcupado(true);
    try {
      const mesa = await cliente.pedir<Mesa>(ruta + "/unirse", {});
      irALaSala(mesa.id);
    } catch (e) {
      fallar(e);
      setOcupado(false);
    }
  }

  if (error) {
    return (
      <Pantalla titulo="Te invitaron a una mesa">
        <Aviso>{error}</Aviso>
        <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }
  if (!previa) return <Cargando />;
  return (
    <Pantalla titulo="Te invitaron a una mesa">
      <Hoja>
        <Parrafo>{textoVisibilidad(previa.publica)}</Parrafo>
        <Boton ocupado={ocupado} onPress={() => void ocupar()}>Ocupar mi asiento</Boton>
        <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
      </Hoja>
    </Pantalla>
  );
}
