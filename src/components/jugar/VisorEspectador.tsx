import { useEffect, useRef } from "react";
import { PalabraDelPie } from "./Voz";
import { useVozDelPie } from "@eltruco/cliente/voces.ts";
import { VozDiscord } from "./VozDiscord";
import type { tableroEspectador } from "../../../api/tablero-espectador";
import { HistorialDeMano } from "./HistorialDeMano";
import { descripcionDeIndicacion, descripcionDeJugada, tantos } from "@eltruco/cliente/textos.ts";
import { Tanteador } from "./Tablero";
import { Tapete } from "./Tapete";
import type { VersionesMesa } from "./cliente";
import PieMesa from "./PieMesa";
import { participantesMesa, type ResumenMesa } from "./resumen-salon";
import { useConsultaSalon } from "./useConsultaSalon";
import "./visor.css";

interface MesaEspectadora extends ResumenMesa, VersionesMesa {
  asientos: { asiento: number; equipo: number; tipo: "humano" | "computadora"; nombre: string }[];
  estado: "en-juego" | "terminada" | "interrumpida";
  vozDisponible?: boolean;
  tablero: ReturnType<typeof tableroEspectador>;
}

interface Props {
  id: string;
  volver: () => void;
  crear: () => void;
  volverAMiMesa?: () => void;
  alPerderSesion: () => void;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "") + "/";
const equipo = (n: number) => "Equipo " + (n + 1);

function resumenDeLaMano(mesa: MesaEspectadora) {
  if (mesa.estado === "interrumpida") return "La exhibición terminó sin ganador.";
  if (mesa.estado === "terminada") {
    const ganador = mesa.puntos[0] > mesa.puntos[1] ? 1 : 2;
    return "Ganó el equipo " + ganador + ".";
  }
  if (mesa.tablero.resultado) return "El equipo " + (mesa.tablero.resultado.equipo + 1) + " ganó la mano.";
  const ultimaPalabra = mesa.tablero.indicaciones?.at(-1);
  if (ultimaPalabra?.indiceAccion === mesa.tablero.acciones.length) {
    return descripcionDeIndicacion(ultimaPalabra, n => mesa.asientos[n].nombre);
  }
  const ultima = mesa.tablero.acciones.at(-1);
  return ultima ? descripcionDeJugada(ultima, n => mesa.asientos[n].nombre) : "Se repartieron las cartas.";
}

const titulos = {
  "en-juego": "La mano en juego",
  terminada: "Partida terminada",
  interrumpida: "Partida interrumpida",
};

function MesaObservada({ mesa }: { mesa: MesaEspectadora }) {
  const { tablero, asientos } = mesa;
  const nombre = (n: number) => asientos[n].nombre;
  const palabra = useVozDelPie(mesa.manoNumero, tablero.indicaciones, tablero.acciones.length);
  const ultimaVuelta = tablero.vueltas.at(-1);
  // Conservar la vuelta cerrada hasta que aparezca la primera carta de la siguiente.
  const actual = tablero.vueltaActual;
  const cerrada = !actual?.jugadas.length ? ultimaVuelta : undefined;
  const numeroVuelta = tablero.vueltas.length + (cerrada ? 0 : 1);
  const turno = tablero.turnoDeCartas;
  const resultado = tablero.resultado;
  return <>
    <PieMesa mesa={mesa} />
    <Tanteador meta={mesa.meta} puntos={mesa.puntos} propio={0} equipo={equipo} />
    <div className="j-partida visor-partida">
      <Tapete
        base={base}
        asientos={asientos.map(a => ({ ...a, papel: equipo(a.equipo) }))}
        asientoInferior={0}
        dador={tablero.dador}
        mano={tablero.mano}
        muestra={tablero.muestra}
        titulo={"Mano " + mesa.manoNumero}
        numeroVuelta={numeroVuelta}
        vuelta={cerrada ?? actual}
        manosOcultas={{ jugadas: tablero.acciones.filter(a => a.tipo === "carta") }}
        detalle={asiento => ({ contenido: <PalabraDelPie indicacion={palabra} asiento={asiento} nombre={nombre} /> })}
        terminada={Boolean(resultado && !cerrada)}
      />
      <section className="j-jugada-panel" aria-label="Desarrollo de la mano">
        <h3>{titulos[mesa.estado]}</h3>
        <div role="status" aria-live={palabra ? "off" : "polite"}>{resumenDeLaMano(mesa)}</div>
        {mesa.estado === "en-juego" && !resultado && <p>
          La mano vale {tantos(tablero.valorTruco)}.
          {turno != null && " La próxima carta le corresponde a " + nombre(turno) + "."}
        </p>}
        <HistorialDeMano key={mesa.manoNumero} acciones={tablero.acciones} indicaciones={tablero.indicaciones} cobros={tablero.cobros} nombre={nombre} />
        {tablero.cobros.length > 0 && <section className="j-lances">
          <h3>Tantos cobrados</h3>
          <ul>{tablero.cobros.map((c, i) => <li key={i}>
            <b>{equipo(c.equipo)} · {tantos(c.tantos)}</b> por {c.motivo}
            {c.asiento != null && c.tantoGanador != null && " (" + nombre(c.asiento) + " con " + c.tantoGanador + ")"}
          </li>)}</ul>
          {tablero.comparacionFlor && <p>Flor querida. {new Intl.ListFormat("es-UY").format(
            tablero.comparacionFlor.map(p => nombre(p.asiento) + " cantó " + p.total))}.</p>}
        </section>}
      </section>
    </div>
  </>;
}

export default function VisorEspectador({ id, volver, crear, volverAMiMesa, alPerderSesion }: Props) {
  const { datos, estado, reintentar } = useConsultaSalon<MesaEspectadora>("/api/salon/mesas/" + encodeURIComponent(id), 2000);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, [id]);
  useEffect(() => {
    if (estado === "sin-sesion") alPerderSesion();
  }, [estado, alPerderSesion]);

  return <section className="visor" aria-labelledby="visor-titulo">
    <div className="visor-cabecera">
      <div>
        <h2 id="visor-titulo" tabIndex={-1} ref={titulo}>Estás mirando</h2>
        {datos && <p>{datos.modo === "1v1" ? "Duelo" : "Parejas"} · {participantesMesa(datos)}</p>}
      </div>
      <nav className="j-acciones" aria-label="Navegación del espectador">
        <button className="j-sec" onClick={volver}>Volver al salón</button>
        {volverAMiMesa && <button className="j-sec" onClick={volverAMiMesa}>Volver a mi mesa</button>}
        <button className="button" onClick={crear}>Crear mi mesa</button>
      </nav>
    </div>
    {estado === "cargando" && !datos && <p role="status">Cargando la mesa…</p>}
    {estado === "no-disponible" && <p role="status">Esta mesa ya no está disponible en el salón.</p>}
    {estado === "error" && <div className="j-aviso visor-reconexion">
      <p role="alert">{datos ? "Reconectando… Estás viendo la última jugada recibida." : "No se pudo cargar la mesa."}</p>
      <button className="j-sec" onClick={reintentar}>Reintentar</button>
    </div>}
    {datos && <>
      {datos.vozDisponible
        ? <VozDiscord key={datos.id} espectador exhibicion={datos.origen === "exhibicion"}
            ruta={"/api/salon/mesas/" + encodeURIComponent(datos.id)} />
        : <p className="j-ayuda">La voz de esta mesa en Discord está desactivada.</p>}
      <MesaObservada mesa={datos} />
    </>}
  </section>;
}
