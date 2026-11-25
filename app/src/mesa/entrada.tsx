// Única entrada a la mesa y al visor de espectador. El resto de la app solo usa `entrarALaMesa`,
// `mirarMesa`, `MesaEnJuego` y `VisorDeEspectador`.
import { participantesMesa, type ResumenMesa } from "@eltruco/cliente/salon.ts";
import { router, type Href } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Hoja, Pano, Pildora } from "../componentes/salon.tsx";
import { Boton, Cargando, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { registrarPrecargaWeb } from "../precarga/usePrecargaDeMesa.ts";
import { useConsulta } from "../salon/useConsulta.ts";
import { colores, fuentes } from "../tema.ts";
import { cargarCanvasKit } from "./canvaskit.ts";
import { anotarPresenciada } from "./presenciadas.ts";
import { abrirEnLaWeb } from "./web.ts";

export { MesaEnJuego } from "./MesaEnJuego.tsx";

registrarPrecargaWeb(cargarCanvasKit);

/** Cuando la mesa empieza, la sala de espera deja su lugar a la mesa, que anima el primer reparto. */
export function entrarALaMesa(id: string) {
  anotarPresenciada(id);
  router.replace(`/mesa?id=${encodeURIComponent(id)}` as Href);
}

export function mirarMesa(id: string) {
  router.push(`/mirar/${encodeURIComponent(id)}` as Href);
}

export const volverAlSalon = () => router.replace("/");

interface MesaObservada extends ResumenMesa {
  asientos: { asiento: number; equipo: number; tipo: "humano" | "computadora"; nombre: string }[];
  estado: "en-juego" | "terminada" | "interrumpida";
}

const titulos = { "en-juego": "La mano en juego", terminada: "Partida terminada", interrumpida: "Partida interrumpida" };

/** Provisorio hasta 4d: el visor muestra el tanteador y los asientos, consultando cada 2 segundos. */
export function VisorDeEspectador({ id }: { id: string }) {
  const { datos: mesa, estado, reintentar } = useConsulta<MesaObservada>("/api/salon/mesas/" + encodeURIComponent(id), 2000);
  if (estado === "cargando" && !mesa) return <Cargando />;
  if (estado === "no-disponible" || estado === "sin-sesion" || !mesa) {
    return (
      <Pantalla titulo="Mirar una mesa">
        <Parrafo>{estado === "error" ? "No se pudo cargar la mesa." : "Esta mesa no está disponible para mirar."}</Parrafo>
        {estado === "error" ? <Boton onPress={reintentar}>Reintentar</Boton> : null}
        <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }
  const equipo = (n: number) => mesa.asientos.filter(a => a.equipo === n).map(a => a.nombre).join(" y ");
  return (
    <Pantalla titulo={titulos[mesa.estado]}>
      <Pano etiqueta="Mesa observada">
        <Pildora>👁 Mirando</Pildora>
        <Text style={estilos.enPano}>{mesa.modo === "1v1" ? "Duelo" : "Parejas"} · Mano {mesa.manoNumero}</Text>
        <Text aria-label="Tanteador" style={estilos.tanteador}>
          {equipo(0)} {mesa.puntos[0]} · {mesa.puntos[1]} {equipo(1)}
        </Text>
        <Text style={estilos.suave}>{participantesMesa(mesa)} · a {mesa.meta}</Text>
      </Pano>
      {estado === "error" ? <Parrafo suave>Reconectando con la mesa…</Parrafo> : null}
      <Hoja>
        <Parrafo suave>La mesa nueva para mirar llega en una próxima versión de la app.</Parrafo>
        <Boton variante="secundario" onPress={() => abrirEnLaWeb("/jugar/?mirar=" + encodeURIComponent(id))}>Mirar en la web</Boton>
      </Hoja>
      <Boton variante="secundario" onPress={volverAlSalon}>Volver al salón</Boton>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  enPano: { color: colores.papel, fontFamily: fuentes.titulo, fontSize: 22 },
  tanteador: { color: colores.papel, fontFamily: fuentes.textoFuerte, fontSize: 18 },
  suave: { color: "#d8e3dc", fontFamily: fuentes.texto, fontSize: 14 },
});
