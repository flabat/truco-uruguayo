import { useState } from "react";
import { rutaGestion, useConsulta, type Consulta, type Jugador, type Mesa, type Pagina } from "./consultas";

const modalidades = { "1v1": "Duelo", "2v2": "Parejas", "3v3": "Tercetos" };
const fechaUTC = new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });

export function EstadoConsulta({ error, datos, recargar }: { error?: boolean; datos?: unknown; recargar: () => void }) {
  if (error) return <div role="alert" className="alert alert-warning gestion-aviso d-flex flex-wrap align-items-center gap-2">
    <span>{datos ? "Falló la actualización. Se muestran los últimos datos recibidos." : "No se pudieron cargar los datos."}</span>
    <button type="button" className="btn btn-sm" onClick={recargar}>Reintentar</button>
  </div>;
  return datos ? null : <p className="gestion-texto my-4" role="status">Cargando…</p>;
}

export function Paginacion({ datos, ir }: { datos: Pagina<unknown>; ir: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(datos.total / datos.porPagina));
  if (paginas === 1 && datos.pagina === 1) return null;
  return <nav className="gestion-paginacion" aria-label="Paginación">
    <button className="btn btn-sm" disabled={datos.pagina <= 1} onClick={() => ir(datos.pagina - 1)}>Anterior</button>
    <span className="gestion-texto">Página {datos.pagina} de {paginas}</span>
    <button className="btn btn-sm" disabled={datos.pagina >= paginas} onClick={() => ir(datos.pagina + 1)}>Siguiente</button>
  </nav>;
}

function Partida({ mesa, vivo, jugador }: { mesa: Mesa; vivo: boolean; jugador?: Jugador }) {
  const espera = mesa.estado === "esperando";
  const terminada = mesa.estado === "terminada";
  const equipoPropio = jugador && mesa.asientos.find(a => a.jugador === jugador.id)?.equipo;
  const formato = modalidades[mesa.modo];
  const capacidad = { "1v1": 2, "2v2": 4, "3v3": 6 }[mesa.modo];
  const estadoEspera = mesa.asientos.length === capacidad ? "Pronta para repartir" : "Esperando jugadores";
  let estado = terminada ? "Terminada" : vivo ? "En curso" : "Sin terminar";
  if (terminada && equipoPropio !== undefined && mesa.ganador !== null) estado = mesa.ganador === equipoPropio ? "Victoria" : "Derrota";
  if (espera) estado = estadoEspera;
  const fecha = mesa.fin ?? mesa.inicio;
  const etiquetaFecha = mesa.fin ? "Fin" : "Inicio";
  const conectados = vivo ? mesa.asientos.filter(a => a.conectado && a.tipo === "humano").map(a => a.nombre) : [];
  const rivales = equipoPropio === undefined ? [] : mesa.asientos.filter(a => a.equipo !== equipoPropio).map(a => a.nombre);
  return <details className="gestion-partida">
    <summary>
      <span><b>Mesa {mesa.id.slice(0, 8).toUpperCase()}</b><small className="gestion-texto">
        {formato} · {estado}{vivo && mesa.mano ? " · Mano " + mesa.mano : ""}
      </small>{vivo && <small className="gestion-texto">{conectados.length ? "En la mesa: " + conectados.join(", ") : "Sin personas conectadas"}</small>}
      {rivales.length > 0 && <small className="gestion-texto">Contra {rivales.join(", ")}</small>}
      {!vivo && <small className="gestion-fecha gestion-texto">
        {fecha ? <>{etiquetaFecha} <time dateTime={fecha}>{fechaUTC.format(new Date(fecha))} UTC</time></> : "Fecha sin registrar"}
      </small>}</span>
      <span className="gestion-puntos">
        {mesa.puntos ? <><strong>{mesa.puntos.join(" – ")}</strong><small>{terminada ? "Final" : "Parcial"}</small></>
          : espera ? <>{mesa.asientos.length} de {capacidad}<small>asientos</small></> : "Sin tanteador"}
      </span>
    </summary>
    <div className="gestion-equipos">
      {[0, 1].map(equipo => {
        const asientos = mesa.asientos.filter(a => a.equipo === equipo);
        const libres = capacidad / 2 - asientos.length;
        let equipoLabel = "Equipo " + (equipo + 1);
        if (equipoPropio !== undefined) equipoLabel += equipoPropio === equipo ? " · " + jugador!.nombre : " · Rivales";
        return <div key={equipo}><h3>{equipoLabel}{mesa.ganador === equipo ? " · Ganador" : ""}</h3>
          <ul className="gestion-celdas">
            {asientos.map(a => <li className="gestion-asiento" key={a.asiento}>
              <span>{a.nombre || (a.tipo === "computadora" ? "Computadora" : "Jugador")}</span>
              <small className="gestion-texto">{a.tipo === "humano" ? "Persona" : "Computadora"}</small>
              {vivo && a.conectado && <small className="gestion-presente">En la mesa</small>}
            </li>)}
            {espera && libres > 0 && <li className="gestion-texto">{libres === 1 ? "1 asiento libre" : libres + " asientos libres"}</li>}
          </ul>
        </div>;
      })}
    </div>
  </details>;
}

export function ListaMesas({ mesas, vivo = false, jugador }: { mesas: Mesa[]; vivo?: boolean; jugador?: Jugador }) {
  if (!mesas.length) return <p className="card card-body" role="status">{vivo ? "Sin mesas para mostrar." : "No hay partidas para esta consulta."}</p>;
  return <div className="card">{mesas.map(mesa => <Partida key={mesa.id} mesa={mesa} vivo={vivo} jugador={jugador} />)}</div>;
}

export function Historial({ acceso, jugador, volver }: Consulta & { jugador?: Jugador; volver?: () => void }) {
  const [pagina, ir] = useState(1);
  const [filtros, filtrar] = useState<Record<string,string>>({});
  const [desde, cambiarDesde] = useState("");
  const [hasta, cambiarHasta] = useState("");
  const ruta = rutaGestion("historial", pagina, { ...filtros, jugador: jugador?.id ?? "" });
  const respuesta = useConsulta<Pagina<Mesa>>(ruta, acceso);
  return <>
    {volver && <button type="button" className="btn btn-sm gestion-volver" onClick={volver}>← Volver a jugadores</button>}
    <div className="gestion-encabezado"><h1>{jugador ? "Partidas de " + jugador.nombre : "Historial de partidas"}</h1>
      {jugador && <span>Terminadas: {jugador.terminadas} · Ganadas: {jugador.ganadas}</span>}
    </div>
    <form className="gestion-filtros gestion-filtros-historial" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      filtrar(Object.fromEntries(Array.from(form, ([k, v]) => [k, String(v).trim()])));
      ir(1);
    }}>
      {!jugador && <label><span className="form-label">Jugador o mesa</span><input className="form-control" type="search" name="q" maxLength={100} /></label>}
      <label><span className="form-label">Estado</span><select className="form-select" name="estado">
        <option value="">Todos</option><option value="terminada">Terminadas</option><option value="sin-terminar">Sin terminar</option>
      </select></label>
      <label><span className="form-label">Modalidad</span><select className="form-select" name="modo">
        <option value="">Todas</option>{Object.entries(modalidades).map(([modo, nombre]) => <option key={modo} value={modo}>{nombre}</option>)}
      </select></label>
      <label><span className="form-label">Desde (UTC)</span><input type="date" className="form-control" name="desde" max={hasta || undefined} value={desde} onChange={e => cambiarDesde(e.target.value)} /></label>
      <label><span className="form-label">Hasta (UTC)</span><input type="date" className="form-control" name="hasta" min={desde || undefined} value={hasta} onChange={e => cambiarHasta(e.target.value)} /></label>
      <button className="btn btn-primary" type="submit">Filtrar</button>
    </form>
    <EstadoConsulta {...respuesta}/>
    {respuesta.datos && <><ListaMesas mesas={respuesta.datos.elementos} jugador={jugador} /><Paginacion datos={respuesta.datos} ir={ir} /></>}
  </>;
}
