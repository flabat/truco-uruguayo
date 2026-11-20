import { useState } from "react";
import { EstadoConsulta, Paginacion } from "./Partidas";
import { rutaGestion, useConsulta, type Consulta, type Jugador, type Pagina } from "./consultas";

const ruta = "/api/gestion/funciones/tercetos";
const audiencias = {
  desactivado: "Desactivado",
  seleccionados: "Jugadores seleccionados",
  todos: "Todos los jugadores",
} as const;
type Audiencia = keyof typeof audiencias;
type Persona = Pick<Jugador, "id" | "nombre">;
interface Configuracion {
  version: number;
  audiencia: Audiencia;
  jugadores: Persona[];
  historial: {
    version: number; fecha: string; operador: string; anterior: Audiencia; audiencia: Audiencia;
    agregados: string[]; retirados: string[];
  }[];
}

function BuscarJugadores({ acceso, seleccion, agregar }: Consulta & { seleccion: Persona[]; agregar: (j: Persona) => void }) {
  const [texto, escribir] = useState("");
  const [busqueda, buscar] = useState<string | null>(null);
  const [pagina, ir] = useState(1);
  return <>
    <form className="gestion-filtros" onSubmit={e => { e.preventDefault(); buscar(texto.trim()); ir(1); }}>
      <label><span className="form-label">Nombre del jugador</span>
        <input type="search" className="form-control" value={texto} maxLength={100} onChange={e => escribir(e.target.value)} />
      </label>
      <button className="btn" type="submit">Buscar</button>
    </form>
    {busqueda !== null && <Resultados acceso={acceso} rutaBusqueda={rutaGestion("jugadores", pagina, { q: busqueda })}
      seleccion={seleccion} agregar={agregar} ir={ir} />}
  </>;
}

function Resultados({ acceso, rutaBusqueda, seleccion, agregar, ir }: Consulta & {
  rutaBusqueda: string; seleccion: Persona[]; agregar: (j: Persona) => void; ir: (p: number) => void;
}) {
  const respuesta = useConsulta<Pagina<Jugador>>(rutaBusqueda, acceso);
  return <>
    <EstadoConsulta {...respuesta} />
    {respuesta.datos && <>
      {respuesta.datos.elementos.length === 0 && <p role="status">Sin resultados.</p>}
      {respuesta.datos.elementos.map(j => <div className="gestion-persona" key={j.id}>
        <span>{j.nombre} <small>{j.id}</small></span>
        <button className="btn btn-sm" type="button" disabled={seleccion.some(s => s.id === j.id)}
          aria-label={"Agregar a " + j.nombre} onClick={() => agregar({ id: j.id, nombre: j.nombre })}>Agregar</button>
      </div>)}
      <Paginacion datos={respuesta.datos} ir={ir} />
    </>}
  </>;
}

export function Funciones({ acceso }: Consulta) {
  const respuesta = useConsulta<Configuracion>(ruta, acceso);
  const [borrador, editar] = useState<Configuracion | null>(null);
  const [guardando, ocupar] = useState(false);
  const [mensaje, avisar] = useState("");
  const [error, fallar] = useState("");
  const [guardada, recordar] = useState<Configuracion | null>(null);
  const actual = guardada && respuesta.datos && guardada.version > respuesta.datos.version ? guardada : respuesta.datos;
  async function guardar() {
    if (!borrador || guardando) return;
    ocupar(true); fallar("");
    try {
      const r = await fetch(ruta, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: borrador.version, audiencia: borrador.audiencia, jugadores: borrador.jugadores.map(j => j.id) }) });
      if (r.status === 401 || r.status === 403) { acceso(r.status); return; }
      if (r.status === 409) {
        editar(null); respuesta.recargar();
        throw new Error("Otra edición guardó cambios. Revisá la configuración vigente antes de editar otra vez.");
      }
      if (!r.ok) throw new Error((await r.json()).error);
      recordar(await r.json()); editar(null); avisar("Configuración guardada."); respuesta.recargar();
    } catch (e) {
      fallar(e instanceof Error ? e.message : "No se pudo guardar la configuración.");
    } finally { ocupar(false); }
  }
  return <>
    <div className="gestion-encabezado"><h1>Funciones</h1><small className="gestion-texto">{location.host}</small></div>
    <EstadoConsulta {...respuesta} />
    {actual && <section className="card card-body">
      <h2 className="mt-0">Tercetos · 3 contra 3</h2>
      {borrador ? <fieldset disabled={guardando}>
        <label className="form-label" htmlFor="audiencia">Quién puede jugar</label>
        <select className="form-select" id="audiencia" value={borrador.audiencia}
          onChange={e => editar({ ...borrador, audiencia: e.target.value as Audiencia })}>
          {Object.entries(audiencias).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
        </select>
        {borrador.audiencia === "seleccionados" && <>
          <h3 className="mt-3">Jugadores seleccionados ({borrador.jugadores.length})</h3>
          {borrador.jugadores.map(j => <div className="gestion-persona" key={j.id}>
            <span>{j.nombre} <small>{j.id}</small></span>
            <button className="btn btn-sm" type="button" aria-label={"Quitar a " + j.nombre}
              onClick={() => editar({ ...borrador, jugadores: borrador.jugadores.filter(s => s.id !== j.id) })}>Quitar</button>
          </div>)}
          <BuscarJugadores acceso={acceso} seleccion={borrador.jugadores}
            agregar={j => editar({ ...borrador, jugadores: [...borrador.jugadores, j] })} />
        </>}
        <p className="my-3" role="status">{borrador.audiencia === "todos"
          ? "Al guardar, cualquier jugador con sesión podrá crear una mesa de Tercetos o aceptar una invitación."
          : borrador.audiencia === "desactivado"
            ? "Al guardar, se cerrará el ingreso a Tercetos. Quienes ya tienen asiento podrán seguir jugando."
            : "Al guardar, solo las cuentas de la lista podrán crear mesas de Tercetos o aceptar invitaciones."}</p>
        <div className="d-flex gap-2"><button className="btn btn-primary" type="button" onClick={guardar}>Guardar cambios</button>
          <button className="btn" type="button" onClick={() => { editar(null); fallar(""); }}>Cancelar</button></div>
      </fieldset> : <div>
        <p>Quién puede jugar · <strong>{audiencias[actual.audiencia]}</strong>
          {actual.audiencia === "seleccionados" && " (" + actual.jugadores.length + ")"}</p>
        <button type="button" className="btn" onClick={() => { editar(actual); avisar(""); fallar(""); }}>Editar audiencia</button>
      </div>}
      {mensaje && <p role="status" className="mt-2">{mensaje}</p>}
      {error && <p role="alert" className="mt-2">{error}</p>}
    </section>}
    {actual && <section><h2>Últimos cambios</h2>
      {actual.historial.length === 0 && <p>Todavía no se registraron cambios.</p>}
      <ol className="list-group">{actual.historial.map(c => <li key={c.version} className="list-group-item">
        <strong>{c.operador}</strong> · <time dateTime={c.fecha}>{new Date(c.fecha).toLocaleString("es-UY")}</time>
        <div>{audiencias[c.anterior]} → {audiencias[c.audiencia]}</div>
        {(c.agregados.length > 0 || c.retirados.length > 0) && <details><summary>Cambios en jugadores</summary>
          {c.agregados.map(id => <div key={id} className="text-break">Agregado · {id}</div>)}
          {c.retirados.map(id => <div key={id} className="text-break">Retirado · {id}</div>)}
        </details>}
      </li>)}</ol>
    </section>}
  </>;
}
