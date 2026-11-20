import { edicionModelo, fechaModelo } from "../lib/modelos";

export default function FichaModelo({ id, formato }: { id: string; formato?: string }) {
  const { nombre, publicado } = edicionModelo(id, formato);
  return (
    <details className="ficha-modelo">
      <summary>
        {nombre} <span className="modelo-publicacion">· {publicado
          ? <>Publicado el <time dateTime={publicado}>{fechaModelo(publicado)}</time></>
          : "Fecha sin registrar"}</span>
      </summary>
      <div className="modelo-identificador"><span>Identificador</span> <code>{id}</code></div>
    </details>
  );
}
