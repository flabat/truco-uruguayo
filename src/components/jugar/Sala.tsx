import { useEffect, useRef, useState } from "react";
import {
  ErrorMesa,
  idComando,
  mensajeDe,
  pedir,
  useMesa,
  type Eleccion,
  type Jugador,
  type Mesa,
  type Modo,
} from "./cliente";
import { EnJuego } from "./Tablero";

function Ingreso({ volver, invitada }: { volver: string; invitada?: boolean }) {
  return (
    <div className="j-panel">
      <h2>{invitada ? "Te invitaron a una mesa" : "Entrá con tu jugador"}</h2>
      <p>
        {invitada
          ? "Ingresá para ocupar tu asiento con los demás jugadores."
          : "Ingresá para crear una mesa y guardar tu asiento."}
      </p>
      <form action="/api/auth/login" method="get">
        <input type="hidden" name="volver" value={volver} />
        <button className="button">Ingresar al juego</button>
      </form>
    </div>
  );
}

function AbrirMesa({
  base,
  anterior,
  abrir,
}: {
  base: string;
  anterior: string | null;
  abrir: (id: string, aviso: string) => void;
}) {
  const [modo, elegir] = useState<Modo>("2v2");
  const [ocupado, ocupar] = useState(false);
  const [error, avisar] = useState("");
  async function crear(conBots: boolean) {
    if (ocupado) return;
    ocupar(true);
    avisar("");
    try {
      const mesa = await pedir<Mesa>("/api/mesas", { modo });
      const destino = base + "jugar/?mesa=" + encodeURIComponent(mesa.id);
      // Guardar el enlace antes de llenar la mesa permite retomarla tras un corte.
      history.replaceState(null, "", destino);
      let aviso = "";
      try {
        if (conBots) {
          for (const lugar of mesa.asientos.filter((a) => a.tipo === "vacio")) {
            await pedir("/api/mesas/" + mesa.id + "/computadoras", { asiento: lugar.asiento });
          }
        }
      } catch (e) {
        aviso = "La mesa está creada. " + mensajeDe(e);
      }
      abrir(mesa.id, aviso);
    } catch (e) {
      avisar(mensajeDe(e));
      ocupar(false);
    }
  }
  return (
    <div className="j-crear">
      <div className="j-panel">
        {anterior && (
          <a className="j-volver" href={base + "jugar/?mesa=" + encodeURIComponent(anterior)}>
            Volver a mi mesa →
          </a>
        )}
        <h2>Crear una mesa</h2>
        <fieldset disabled={ocupado}>
          <legend>Modalidad</legend>
          <div className="j-modos">
            {(["1v1", "2v2"] as const).map((m, i) => (
              <label key={m} className={modo === m ? "elegido" : ""}>
                <input type="radio" name="modo" checked={m === modo} onChange={() => elegir(m)} />
                <span>
                  <strong>{i ? "2 contra 2" : "1 contra 1"}</strong>
                  <small>{i ? "En parejas" : "Mano a mano"}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="j-acciones">
          <button className="button" disabled={ocupado} onClick={() => crear(false)}>
            Crear mesa
          </button>
          <button className="j-sec" disabled={ocupado} onClick={() => crear(true)}>
            Jugar con computadoras
          </button>
        </div>
        <p className="j-ayuda">
          Compartí la invitación con tus amigos o completá los lugares con computadoras.
        </p>
        <p role="status">{ocupado ? "Preparando la mesa…" : error}</p>
      </div>
      <div className="j-ilustracion" aria-hidden="true">
        {["espadas-01", "copas-12", "oros-07"].map((c) => (
          <img key={c} alt="" src={base + "img/cartas/tatu/" + c + ".webp"} />
        ))}
      </div>
    </div>
  );
}

function Invitacion({ enlace }: { enlace: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [mensaje, avisar] = useState("");
  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      avisar("Invitación copiada.");
    } catch {
      input.current?.focus();
      input.current?.select();
      let copiada = false;
      try {
        copiada = document.execCommand?.("copy") ?? false;
      } catch {
        /* El usuario puede copiar el texto seleccionado manualmente. */
      }
      avisar(copiada ? "Invitación copiada." : "Enlace seleccionado. Copialo para compartirlo.");
    }
  }
  return (
    <div className="j-invita">
      <label htmlFor="invitacion">Enlace de invitación</label>
      <div>
        <input id="invitacion" ref={input} value={enlace} readOnly onFocus={(e) => e.target.select()} />
        <button className="j-sec" onClick={copiar}>
          Copiar invitación
        </button>
      </div>
      <span role="status">{mensaje}</span>
    </div>
  );
}

function MesaAbierta({
  id,
  jugador,
  base,
  avisoInicial,
}: {
  id: string;
  jugador: Jugador;
  base: string;
  avisoInicial: string;
}) {
  const { ruta, mesa, partida, conectada, error, refrescar } = useMesa(id);
  const [ocupado, ocupar] = useState(false);
  const [aviso, avisar] = useState(avisoInicial);
  useEffect(() => {
    const clave = "truco.ultima-mesa." + jugador.id;
    try {
      if (mesa) localStorage.setItem(clave, mesa.id);
      if (error && [403, 404].includes(error.status) && localStorage.getItem(clave) === id)
        localStorage.removeItem(clave);
    } catch {
      /* La mesa sigue disponible en su enlace si el navegador no guarda datos. */
    }
  }, [mesa?.id, error, id, jugador.id]);
  async function enviar(path: string, datos: object) {
    ocupar(true);
    avisar("");
    try {
      // Ante una confirmación perdida, el segundo envío usa la misma clave de comando.
      try {
        await pedir(ruta + path, datos);
      } catch (e) {
        if (e instanceof ErrorMesa || !("id" in datos)) throw e;
        await pedir(ruta + path, datos);
      }
    } catch (e) {
      avisar(mensajeDe(e));
    } finally {
      await refrescar.current();
      ocupar(false);
    }
  }
  function jugada(accion?: Eleccion) {
    if (ocupado || !conectada || !partida) return;
    void enviar(accion ? "/acciones" : "/siguiente", {
      id: idComando(),
      version: partida.version,
      ...(accion && { accion }),
    });
  }

  if (error?.status === 401) return <Ingreso volver={"/jugar/?mesa=" + encodeURIComponent(id)} />;
  if (error)
    return (
      <div className="j-panel">
        <p role="alert">{error.message}</p>
        <a className="j-link" href={base + "jugar/"}>
          Volver al salón
        </a>
      </div>
    );
  if (!mesa) return <p role="status">Conectando con tu mesa…</p>;
  const faltan = mesa.asientos.filter((a) => a.tipo === "vacio").length;
  const bloqueada = ocupado || !conectada;
  return (
    <>
      <div className="j-barra">
        <span>
          {mesa.modo === "1v1" ? "Mano a mano" : "En parejas"} · {jugador.nombre}
        </span>
        <a className="j-link" href={base + "jugar/"}>
          Volver al salón
        </a>
      </div>
      {!conectada && (
        <p role="status" className="j-aviso">
          Reconectando con tu mesa…
        </p>
      )}
      {aviso && (
        <p role="alert" className="j-aviso">
          {aviso}
        </p>
      )}
      {mesa.lista && partida?.vista ? (
        <EnJuego base={base} mesa={mesa} partida={partida} bloqueada={bloqueada} jugar={jugada} />
      ) : (
        <div className="j-espera">
          <div className="j-panel">
            <h2>{faltan ? "Esperando jugadores" : "Repartiendo las cartas…"}</h2>
            <p>
              {faltan === 1
                ? "Falta un jugador para repartir."
                : faltan
                  ? "Faltan " + faltan + " jugadores para repartir."
                  : "La mesa está completa."}
            </p>
            {faltan > 0 && <Invitacion enlace={mesa.invitacion} />}
          </div>
          <section className="j-asientos">
            <h2>Asientos</h2>
            {mesa.asientos.map((a) => (
              <div className="j-lugar" key={a.asiento}>
                <span className="j-numero" aria-label={"Asiento " + (a.asiento + 1)}>
                  {a.asiento + 1}
                </span>
                <div>
                  <strong>
                    {a.nombre ?? "Lugar libre"}
                    {a.asiento === mesa.miAsiento && " · Vos"}
                  </strong>
                  <small>
                    {mesa.modo === "2v2"
                      ? "Equipo " + (a.equipo + 1)
                      : a.asiento === mesa.miAsiento
                        ? "Tu asiento"
                        : "Rival"}
                  </small>
                </div>
                {a.tipo === "vacio" && jugador.id === mesa.creadorId && (
                  <button
                    className="j-sec"
                    disabled={bloqueada}
                    aria-label={"Agregar computadora al asiento " + (a.asiento + 1)}
                    onClick={() => enviar("/computadoras", { asiento: a.asiento })}
                  >
                    Agregar computadora
                  </button>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}

export default function Sala({ base }: { base: string }) {
  const [jugador, identificar] = useState<Jugador | null>();
  const [mesa, abrir] = useState("");
  const [invitacion, invitar] = useState("");
  const [volver, regresar] = useState("/jugar/");
  const [error, avisar] = useState("");
  const [anterior, recordar] = useState<string | null>(null);
  const [avisoMesa, informar] = useState("");
  useEffect(() => {
    let vigente = true;
    const params = new URLSearchParams(location.search);
    const token = params.get("invitacion");
    const id = params.get("mesa");
    const ruta =
      "/jugar/" +
      (token ? "?invitacion=" + encodeURIComponent(token) : id ? "?mesa=" + encodeURIComponent(id) : "");
    regresar(ruta);
    invitar(token ?? "");
    async function entrar() {
      try {
        const yo = await pedir<Jugador>("/api/jugador");
        if (!vigente) return;
        try {
          recordar(localStorage.getItem("truco.ultima-mesa." + yo.id));
        } catch {
          /* El enlace de invitación también permite volver a la mesa. */
        }
        if (token) {
          const mesa = await pedir<Mesa>("/api/invitaciones/" + encodeURIComponent(token) + "/unirse", {});
          if (!vigente) return;
          history.replaceState(null, "", base + "jugar/?mesa=" + encodeURIComponent(mesa.id));
          abrir(mesa.id);
        } else if (id) abrir(id);
        identificar(yo);
      } catch (e) {
        if (!vigente) return;
        if (e instanceof ErrorMesa && e.status === 401) identificar(null);
        else avisar(mensajeDe(e));
      }
    }
    void entrar();
    return () => {
      vigente = false;
    };
  }, [base]);

  return (
    <>
      <header className="j-titulo">
        <a className="j-link" href={base}>
          ← Volver al inicio
        </a>
        <h1>
          {mesa ? "Mesa de " : "Jugar al "}
          <em>truco</em>
        </h1>
      </header>
      {error ? (
        <div className="j-panel">
          <p role="alert">{error}</p>
          <a className="j-link" href={base + "jugar/"}>
            Volver al salón
          </a>{" "}
          ·{" "}
          <a className="j-link" href={base + "aprender/mano/"}>
            Jugar una mano guiada
          </a>
        </div>
      ) : jugador === undefined ? (
        <p role="status">{invitacion ? "Abriendo la invitación…" : "Consultando tu sesión…"}</p>
      ) : jugador === null ? (
        <Ingreso volver={volver} invitada={Boolean(invitacion)} />
      ) : mesa ? (
        <MesaAbierta id={mesa} jugador={jugador} base={base} avisoInicial={avisoMesa} />
      ) : (
        <AbrirMesa
          base={base}
          anterior={anterior}
          abrir={(id, aviso) => {
            informar(aviso);
            abrir(id);
          }}
        />
      )}
    </>
  );
}
