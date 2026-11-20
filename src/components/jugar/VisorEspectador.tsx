import { useEffect, useRef } from "react";
import type { tableroEspectador } from "../../../api/tablero-espectador";
import { descripcionDeJugada, HistorialDeMano, tantos } from "./HistorialDeMano";
import { Naipe, Tanteador } from "./Tablero";
import { participantesMesa, type ResumenMesa } from "./resumen-salon";
import { useConsultaSalon } from "./useConsultaSalon";
import "./visor.css";

interface MesaEspectadora extends ResumenMesa {
  asientos: { asiento: number; equipo: number; tipo: "humano" | "computadora"; nombre: string }[];
  estado: "en-juego" | "terminada" | "interrumpida";
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
  const ultima = mesa.tablero.acciones.at(-1);
  return ultima ? descripcionDeJugada(ultima, n => mesa.asientos[n].nombre) : "Se repartieron las cartas.";
}

const titulos = {
  "en-juego": "La mano en juego",
  terminada: "Partida terminada",
  interrumpida: "Partida interrumpida",
};

function Tapete({ mesa }: { mesa: MesaEspectadora }) {
  const { tablero, asientos } = mesa;
  const nombre = (n: number) => asientos[n].nombre;
  const ultimaVuelta = tablero.vueltas.at(-1);
  // Conservar la vuelta cerrada hasta que aparezca la primera carta de la siguiente.
  const actual = tablero.vueltaActual;
  const cerrada = !actual?.jugadas.length ? ultimaVuelta : undefined;
  const jugadas = cerrada?.jugadas ?? actual?.jugadas ?? [];
  const numeroVuelta = tablero.vueltas.length + (cerrada ? 0 : 1);
  const turno = tablero.turnoDeCartas;
  const resultado = tablero.resultado;
  return <>
    <Tanteador meta={mesa.meta} puntos={mesa.puntos} propio={0} equipo={equipo} />
    <div className="j-partida visor-partida">
      <section className="j-tapete visor-tapete" aria-label="Tapete">
        <header>
          <strong>Mano {mesa.manoNumero}</strong>
          <span>{numeroVuelta}.ª vuelta</span>
        </header>
        <div className={'visor-puestos visor-' + mesa.modo}>
          <figure className="visor-muestra">
            <Naipe id={tablero.muestra} base={base} />
            <figcaption>Muestra</figcaption>
          </figure>
          {asientos.map(a => {
            const carta = jugadas.find(j => j.asiento === a.asiento)?.carta;
            const gano = cerrada?.resultado.tipo === "ganada" && cerrada.resultado.asiento === a.asiento;
            return <div key={a.asiento} className={'visor-puesto visor-asiento-' + a.asiento} role="group" aria-label={a.nombre}>
              <div className="j-persona">
                <b>{a.nombre}</b>
                <span>{equipo(a.equipo)}{tablero.dador === a.asiento && " · Dador"}{tablero.mano === a.asiento && " · Mano"}</span>
              </div>
              {carta && <div className={gano ? "j-jugada j-ganadora" : "j-jugada"}>
                <Naipe id={carta} base={base} />
                {gano && <small>Ganó la vuelta</small>}
              </div>}
            </div>;
          })}
        </div>
        {cerrada?.resultado.tipo === "parda" && <p className="visor-parda">Vuelta parda</p>}
      </section>
      <section className="j-jugada-panel" aria-label="Desarrollo de la mano">
        <h3>{titulos[mesa.estado]}</h3>
        <div role="status">{resumenDeLaMano(mesa)}</div>
        {mesa.estado === "en-juego" && !resultado && <p>
          La mano vale {tantos(tablero.valorTruco)}.
          {turno != null && " La próxima carta le corresponde a " + nombre(turno) + "."}
        </p>}
        <HistorialDeMano key={mesa.manoNumero} acciones={tablero.acciones} cobros={tablero.cobros} nombre={nombre} />
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
    {datos && <Tapete mesa={datos} />}
  </section>;
}
