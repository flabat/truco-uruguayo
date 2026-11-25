import { Text, View } from "react-native";
import type { DatosDeHojas } from "../modelo.ts";
import { Apartado, estilosDeHoja, Fila } from "./PartesDeHoja.tsx";

/** Tus tantos, el valor de la mano y los tantos cobrados, como el panel de la mesa web. */
export function HojaTantos({ datos }: { datos: Pick<DatosDeHojas, "cuenta" | "cobrados"> }) {
  const { cuenta, cobrados } = datos;
  return (
    <View testID="hoja-tantos">
      {cuenta ? (
        <Apartado titulo="Esta mano">
          <Fila dato={cuenta.tusTantos}>Tus tantos</Fila>
          <Fila dato={cuenta.valor}>Valor de la mano</Fila>
        </Apartado>
      ) : null}
      <Apartado titulo={cobrados.titulo}>
        {cobrados.filas.length
          ? cobrados.filas.map((c, i) => <Fila key={i}><Text style={estilosDeHoja.fuerte}>{c.equipo}</Text> {c.texto}</Fila>)
          : <Text style={estilosDeHoja.nota}>Todavía no se cobraron tantos en esta mano.</Text>}
      </Apartado>
    </View>
  );
}
