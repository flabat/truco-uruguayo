import "./polyfill.ts";
import type { Partida, PartidaTercetos } from "@eltruco/cliente/cliente.ts";
import { pasosDeTercetos } from "@eltruco/cliente/presentacion-tercetos.ts";
import { pasosDeVueltas } from "@eltruco/cliente/presentacion-vueltas.ts";
import type { Paso, PasosNuevos } from "@eltruco/cliente/secuencia-de-mesa.ts";
import { useMesa } from "@eltruco/cliente/use-mesa.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { versionSenasPie } from "@eltruco/motor/senas-pie.ts";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import { cliente } from "../ingreso/plataforma.ts";
import { avisosDeApp, memoriaDeMesa } from "../salon/plataforma.ts";
import { signalVersionFor } from "../../../training/contracts/index.ts";
import { hojaDeLaMesa, type Canto } from "./hoja-cantos.ts";
import { MesaPantalla, type AccionesMesa } from "./MesaPantalla.tsx";
import {
  cartasDeLaEspera, datosDeHojas, datosDeTercetos, entradaDeHoja, mesaDeJugador, mesaDeTercetos, recordarCartas,
  type CartasRecordadas,
} from "./modelo.ts";
import { crearEventos } from "./eventos.ts";
import { presencioElReparto } from "./presenciadas.ts";
import { reportarJugada } from "./reporte.ts";
import { camposDelReporte } from "./reporte-campos.ts";
import { senasEnMesa } from "./senas.ts";
import { useColaDePresentacion } from "./useCola.ts";
import { useJugadas } from "./useJugadas.ts";
import { useEfectos } from "./useEfectos.ts";
import { usePreferencias } from "./usePreferencias.ts";
import { HojaMano } from "./vistas/HojaMano.tsx";
import { HojaMas } from "./vistas/HojaMas.tsx";
import { HojaTantos } from "./vistas/HojaTantos.tsx";
import { HojaVoz } from "./vistas/HojaVoz.tsx";

// No se importa de entrada.tsx: esa entrada importa este archivo.
const salirAlSalon = () => router.replace("/");
const crearMesa = () => router.replace("/crear");
// La cola de tercetos queda vacía mientras la mesa no es de tercetos.
const pasosDeLosTercetos: PasosNuevos<PartidaTercetos | undefined> = (anterior, actual, presencio, pendientes) =>
  actual ? pasosDeTercetos(anterior, actual, presencio, pendientes as Paso<PartidaTercetos>[] | undefined) : [];

/** La mesa en juego, conectada a la mesa en vivo. */
export function MesaEnJuego({ id }: { id: string }) {
  const { estado: sesion, reintentar: recargarSesion } = useSesion();
  const jugadorId = sesion.tipo === "dentro" ? sesion.jugador.id : null;
  const puedeReportar = sesion.tipo === "dentro" && sesion.jugador.puedeReportar === true;
  const { preferencias, cargadas, cambiar, reducirMovimiento, liviano } = usePreferencias();
  // La cola anuncia aquí lo que se presenta; el lienzo y el tanteador lo escuchan para animarlo.
  const [eventos] = useState(crearEventos);
  useEfectos(eventos, preferencias, cargadas);
  // Se lee una sola vez: la marca de la sala se consume al abrir la mesa.
  const [presencio] = useState(() => presencioElReparto(id));
  const { ruta, mesa, partida: lectura, conectada, reconexion, error, refrescar } = useMesa(cliente, id, presencio, avisosDeApp);
  const recibida = lectura?.vista ? lectura : undefined;
  const simple: Partida | undefined = recibida && recibida.formato !== "triples" ? recibida as Partida : undefined;
  const tercetos: PartidaTercetos | undefined = recibida?.formato === "triples" ? recibida as PartidaTercetos : undefined;

  const nombre = useCallback((asiento: number) => mesa?.asientos[asiento]?.nombre ?? "", [mesa]);
  const opcionesDeCola = { liviano, alEvento: eventos.emitir, miAsiento: mesa?.miAsiento ?? null, nombre };
  const colaSimple = useColaDePresentacion(simple, presencio, reconexion, pasosDeVueltas, opcionesDeCola);
  const colaTercetos = useColaDePresentacion(tercetos, presencio, reconexion, pasosDeLosTercetos, opcionesDeCola);
  const { partida, presentando, voz } = tercetos ? colaTercetos : colaSimple;
  // Tercetos: quien espera su duelo no tiene cartas, porque el servidor se las manda al abrirse su
  // duelo. Después de jugarlo, la app recuerda las que le sobraron; al recargar, la mano queda vacía.
  const recordadas = useRef<CartasRecordadas | null>(null);
  if (partida?.formato === "triples") recordadas.current = recordarCartas(recordadas.current, partida);
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
  if (!mesa || !mesa.lista || !recibida || !partida) return <Cargando />;

  const versionLegada = mesa.formato && mesa.formato !== "triples" ? signalVersionFor(mesa.formato) : null;
  const versionSenas = mesa.versionSenas ?? versionLegada;
  const versionDesconocida = Boolean(versionSenas && (
    partida.versionSenas !== versionSenas || (versionSenas !== versionSenasPie && versionSenas !== versionLegada)
  ));
  const bloqueada = enviando || !conectada || versionDesconocida || presentando;

  const visible = partida.formato === "triples"
    ? mesaDeTercetos(mesa, partida, { voz, presentando, cartasEnEspera: cartasDeLaEspera(recordadas.current, partida, mesa.miAsiento) })
    : mesaDeJugador(mesa, partida, { voz, presentando });
  const indicacion = versionDesconocida ? "Actualizá la aplicación para jugar con esta versión de señas." : aviso;
  const mesaVisible = {
    ...visible,
    puedeJugarCarta: visible.puedeJugarCarta && !bloqueada,
    estado: indicacion ? { titulo: visible.estado.titulo, indicacion } : visible.estado,
  };
  const hojaCantos = hojaDeLaMesa({ presentando, versionDesconocida, ...entradaDeHoja(mesa, partida) });
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
    crearMesa,
    salir: salirAlSalon,
  };

  const datos = partida.formato === "triples"
    ? datosDeTercetos(mesa, partida, visible, { voz, presentando })
    : datosDeHojas(mesa, partida, visible, { voz, presentando });
  const reportar = puedeReportar
    ? () => reportarJugada(mesa.id, camposDelReporte(partida, visible.vuelta, presentando, voz?.indice))
    : undefined;
  const extra = {
    mano: <HojaMano datos={datos} reportar={reportar} />,
    tantos: <HojaTantos datos={datos} />,
    voz: <HojaVoz ruta={ruta} disponible={mesa.vozDisponible === true} />,
    mas: (
      <HojaMas versionReglas={mesa.versionReglas} politica={mesa.politica} nombreModelo={mesa.edicionModelo?.nombre}
        preferencias={preferencias} cambiar={cambiar} reducirMovimiento={reducirMovimiento} salir={salirAlSalon} />
    ),
  };

  return (
    <MesaPantalla mesa={mesaVisible} senas={senas} hojaCantos={hojaCantos} acciones={acciones} extra={extra}
      rechazos={rechazos} conectada={conectada} eventos={eventos} liviano={liviano} hapticos={cargadas && preferencias.hapticos} />
  );
}
