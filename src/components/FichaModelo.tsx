import { edicionModelo, fechaModelo, type EdicionModelo } from "../lib/modelos";

interface Props {
  id: string;
  formato?: string;
  edicion?: EdicionModelo;
}

export default function FichaModelo({ id, formato, edicion }: Props) {
  const { nombre, publicado } = edicion ?? edicionModelo(id, formato);
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
