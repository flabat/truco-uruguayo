import "./polyfill.ts";
import type { Partida } from "@eltruco/cliente/cliente.ts";
import { pasosDeVueltas } from "@eltruco/cliente/presentacion-vueltas.ts";
import { useMesa } from "@eltruco/cliente/use-mesa.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import { cliente } from "../ingreso/plataforma.ts";
import { avisosDeApp, memoriaDeMesa } from "../salon/plataforma.ts";
import { signalVersionFor } from "../../../training/contracts/index.ts";
import { hojaDeCantos, type Canto } from "./hoja-cantos.ts";
import { MesaPantalla, type AccionesMesa } from "./MesaPantalla.tsx";
import { mesaDeJugador } from "./modelo.ts";
import { senasEnMesa } from "./senas.ts";
import { useColaDePresentacion } from "./useCola.ts";
import { useJugadas } from "./useJugadas.ts";

// No se importa de entrada.tsx: esa entrada importa este archivo.
const salirAlSalon = () => router.replace("/");
const sinEventos = () => {};

/** La mesa en juego, conectada a la mesa en vivo. */
export function MesaEnJuego({ id }: { id: string }) {
  const { estado: sesion, reintentar: recargarSesion } = useSesion();
  const jugadorId = sesion.tipo === "dentro" ? sesion.jugador.id : null;
  // La sala no avisa si se acaba de crear la mesa: el primer reparto aparece sin animarse.
  const { ruta, mesa, partida: lectura, conectada, reconexion, error, refrescar } = useMesa(cliente, id, false, avisosDeApp);
  const recibida = lectura?.vista ? lectura : undefined;
  const simple: Partida | undefined = recibida && recibida.formato !== "triples" ? recibida as Partida : undefined;

  const nombre = useCallback((asiento: number) => mesa?.asientos[asiento]?.nombre ?? "", [mesa]);
  const { partida, presentando, voz } = useColaDePresentacion(simple, false, reconexion, pasosDeVueltas, {
    liviano: false, alEvento: sinEventos, miAsiento: mesa?.miAsiento ?? null, nombre,
  });
  const { enviando, aviso, jugar, indicar } = useJugadas(cliente, ruta, refrescar, partida?.version);
  const [rechazos, setRechazos] = useState(0);
  const rechazar = useCallback(() => setRechazos(n => n + 1), []);

  useEffect(() => {
    if (mesa && jugadorId) void memoriaDeMesa.recordar(jugadorId, mesa.id);
  }, [mesa?.id, jugadorId]);
  useEffect(() => {
    if (error && jugadorId && [403, 404].includes(error.status)) void memoriaDeMesa.olvidar(jugadorId, id);
    if (error?.status === 401) recargarSesion();
  }, [error, id, jugadorId, recargarSesion]);
  const enEspera = mesa?.lista === false && !mesa.cancelada;
  useEffect(() => {
    if (enEspera) router.replace(("/sala/" + encodeURIComponent(id)) as Href);
  }, [enEspera, id]);

  if (error?.status === 401) return <Cargando />;
  if (error) {
    return (
      <Pantalla titulo="Mesa no disponible">
        <Aviso>{error.message}</Aviso>
        <Boton variante="secundario" onPress={salirAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }
  if (mesa?.cancelada) {
    return (
      <Pantalla titulo="Mesa cancelada">
        <Parrafo>Se canceló la mesa: quien la creó dejó el juego.</Parrafo>
        <Boton variante="secundario" onPress={salirAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }
  if (!mesa || !mesa.lista || !recibida) return <Cargando />;
  if (!partida) {
    // Provisorio hasta la tarea 12, que lleva los tercetos a la mesa nueva.
    return (
      <Pantalla titulo="Tercetos">
        <Parrafo>Los tercetos todavía no se juegan en la mesa nueva de la app.</Parrafo>
        <Boton variante="secundario" onPress={salirAlSalon}>Volver al salón</Boton>
      </Pantalla>
    );
  }

  const versionLegada = mesa.formato && mesa.formato !== "triples" ? signalVersionFor(mesa.formato) : null;
  const versionSenas = mesa.versionSenas ?? versionLegada;
  const versionDesconocida = Boolean(versionSenas && (
    partida.versionSenas !== versionSenas || (versionSenas !== versionSenasPie && versionSenas !== versionLegada)
  ));
  const bloqueada = enviando || !conectada || versionDesconocida || presentando;

  const visible = mesaDeJugador(mesa, partida, { voz, presentando });
  const indicacion = versionDesconocida ? "Actualizá la aplicación para jugar con esta versión de señas." : aviso;
  const mesaVisible = {
    ...visible,
    puedeJugarCarta: visible.puedeJugarCarta && !bloqueada,
    estado: indicacion ? { titulo: visible.estado.titulo, indicacion } : visible.estado,
  };
  const v = partida.vista;
  const hojaCantos = presentando || versionDesconocida ? null : hojaDeCantos({
    legales: v.legales,
    pendiente: v.pendiente,
    trucoPendiente: v.trucoPendiente,
    porDeclararFlor: v.porDeclararFlor,
    miAsiento: mesa.miAsiento,
    nombre,
    tantosPropios: v.tantosPropios,
  });
  const senas = senasEnMesa({ mesa, partida, espectador: false });

  // En mesas legadas cada jugada va sin seña: se juega en silencio.
  const acciones: AccionesMesa = {
    jugarCarta: (carta: CardId) => {
      if (bloqueada) return rechazar();
      void jugar({ tipo: "carta", carta }).then(aceptada => aceptada || rechazar());
    },
    cantar: (tipo: Canto) => {
      if (!bloqueada) void jugar({ tipo });
    },
    indicar: (destinatario, frase, vuelta) => {
      if (!bloqueada && senas.tipo === "pie") void indicar(destinatario, frase, vuelta);
    },
    repartir: () => {
      if (!bloqueada) void jugar();
    },
    salir: salirAlSalon,
  };

  return (
    <MesaPantalla mesa={mesaVisible} senas={senas} hojaCantos={hojaCantos} acciones={acciones} extra={{}}
      rechazos={rechazos} conectada={conectada} />
  );
}
