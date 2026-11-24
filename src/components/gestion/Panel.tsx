import { useState } from "react";
import { Historial, ListaMesas, Paginacion, EstadoConsulta } from "./Partidas";
import { rutaGestion, useConsulta, type Acceso, type Consulta, type Jugador, type Pagina, type Vivo } from "./consultas";

const login = "/api/auth/login?volver=%2Fgestion%2F";
const secciones = { vivo: "En vivo", jugadores: "Jugadores", historial: "Historial" } as const;
type Seccion = keyof typeof secciones;

function EnVivo({ acceso, verSesiones }: Consulta & { verSesiones: () => void }) {
  const [pagina, ir] = useState(1);
  const respuesta = useConsulta<Vivo>(rutaGestion("vivo", pagina), acceso, true);
  const { datos, actualizado } = respuesta;
  return <>
    <div className="gestion-encabezado">
      <h1>Actividad en vivo</h1>
      {actualizado && <small className="gestion-texto">
        Última actualización <time dateTime={actualizado.toISOString()}>{actualizado.toLocaleTimeString("es-UY")}</time>
      </small>}
    </div>
    <EstadoConsulta {...respuesta} />
    {datos && <>
      <div className="gestion-contadores">
        <div className="card"><div className="card-body"><strong className="gestion-cifra">{datos.sesionesVigentes}</strong>
          <span>Personas con sesión vigente</span><br />
          <button className="btn btn-link p-0" type="button" onClick={verSesiones}>Ver jugadores</button>
        </div></div>
        <div className="card"><div className="card-body"><strong className="gestion-cifra">{datos.personasConectadas}</strong>
          <span>Personas conectadas a mesas</span></div></div>
        <div className="card"><div className="card-body"><strong className="gestion-cifra">{datos.partidasEnCurso}</strong>
          <span>Partidas en curso con conexión</span></div></div>
      </div>
      <h2>Mesas</h2>
      <ListaMesas mesas={datos.elementos} vivo />
      <Paginacion datos={datos} ir={ir} />
    </>}
  </>;
}

interface Directorio extends Consulta {
  soloVigentes: boolean;
  jugador: Jugador | null;
  seleccionar: (jugador: Jugador | null) => void;
}

function Jugadores({ acceso, soloVigentes, jugador, seleccionar }: Directorio) {
  const [pagina, ir] = useState(1);
  const [q, buscar] = useState("");
  const [vigentes, cambiarVigentes] = useState(soloVigentes);
  const ruta = rutaGestion("jugadores", pagina, { q, vigentes: vigentes ? "1" : "" });
  const respuesta = useConsulta<Pagina<Jugador>>(ruta, acceso);
  const { datos } = respuesta;
  if (jugador) return <Historial acceso={acceso} jugador={jugador} volver={() => seleccionar(null)} />;
  return <>
    <div className="gestion-encabezado"><h1>Jugadores</h1></div>
    <form className="gestion-filtros" onSubmit={event => {
      event.preventDefault();
      buscar(String(new FormData(event.currentTarget).get("q") ?? "").trim()); ir(1);
    }}>
      <label><span className="form-label">Nombre del jugador</span>
        <input className="form-control" type="search" name="q" defaultValue={q} maxLength={100} />
      </label>
      <button className="btn btn-primary" type="submit">Buscar</button>
      <label className="form-check"><input type="checkbox" className="form-check-input" checked={vigentes} onChange={event => {
        cambiarVigentes(event.target.checked); ir(1);
      }} /><span className="form-check-label">Solo con sesión vigente</span></label>
    </form>
    <EstadoConsulta {...respuesta} />
    {datos && <>
      {datos.elementos.length ? <div className="card"><table className="table gestion-tabla mb-0">
        <caption className="visually-hidden">Chicos terminados y ganados por jugador</caption>
        <thead><tr><th scope="col">Jugador</th><th className="gestion-col-sesion" scope="col">Sesión</th><th scope="col" className="text-end">Terminadas</th><th scope="col" className="text-end">Ganadas</th></tr></thead>
        <tbody>{datos.elementos.map(j => {
          const estado = j.sesionVigente ? "Vigente" : "Sin sesión";
          return <tr key={j.id}>
            <td>
              <button type="button" className="btn btn-link" onClick={() => seleccionar(j)} aria-label={"Ver partidas de " + j.nombre}>{j.nombre}</button>
              <small className="gestion-sesion-movil gestion-texto"> · {j.sesionVigente ? "Sesión vigente" : estado}</small>
              {j.mesasConectadas.length > 0 && <div className="gestion-texto">{j.mesasConectadas.map(id => "Mesa " + id.slice(0, 8).toUpperCase()).join(", ")}</div>}
            </td>
            <td className="gestion-col-sesion">{estado}</td><td className="text-end">{j.terminadas}</td><td className="text-end">{j.ganadas}</td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="card card-body" role="status">No hay jugadores para esta consulta.</p>}
      <Paginacion datos={datos} ir={ir} />
    </>}
  </>;
}

export default function Panel() {
  const [acceso, cambiarAcceso] = useState<Acceso>("comprobando");
  const [seccion, abrir] = useState<Seccion>("vivo");
  const [jugador, seleccionar] = useState<Jugador | null>(null);
  const [soloVigentes, cambiarSoloVigentes] = useState(false);
  if (acceso === 401 || acceso === 403) return <section className="card gestion-acceso">
    <div className="card-body">
      <h1>{acceso === 401 ? "Ingreso a administración" : "Acceso restringido"}</h1>
      <p>{acceso === 401 ? "Ingresá con la cuenta habilitada para consultar el panel." : "Tu cuenta no tiene acceso al panel de administración."}</p>
      <a className="btn btn-primary" href={login}>{acceso === 401 ? "Ingresar con usuario y contraseña" : "Ingresar con otra cuenta"}</a>
    </div>
  </section>;
  return <>
    {acceso === "autorizado" && <div className="gestion-nav">
      <nav aria-label="Secciones del panel">{(Object.keys(secciones) as Seccion[]).map(k =>
        <button type="button" key={k} aria-current={seccion === k ? "page" : undefined} onClick={() => {
          seleccionar(null); cambiarSoloVigentes(false); abrir(k);
        }}>{secciones[k]}</button>)}
      </nav>
      <form method="post" action="/api/auth/logout"><button className="btn btn-sm" type="submit">Salir</button></form>
    </div>}
    {seccion === "vivo" && <EnVivo acceso={cambiarAcceso} verSesiones={() => { cambiarSoloVigentes(true); abrir("jugadores"); }} />}
    {seccion === "jugadores" && <Jugadores key={String(soloVigentes)} acceso={cambiarAcceso} soloVigentes={soloVigentes} jugador={jugador} seleccionar={seleccionar} />}
    {seccion === "historial" && <Historial acceso={cambiarAcceso} />}
  </>;
}
