import { useState } from "react";
import { Text, View } from "react-native";
import type { DatosDeHojas } from "../modelo.ts";
import { Apartado, BotonDeHoja, estilosDeHoja, Fila } from "./PartesDeHoja.tsx";

/**
 * Lo que pasó en la mano, las vueltas terminadas y «Reportar esta jugada». Las señas recibidas de
 * las mesas legadas las agrega `MesaPantalla` debajo. «Manos anteriores» no va: la partida que
 * llega a la mesa no trae las manos ya cerradas.
 */
export function HojaMano({ datos, reportar }: {
  datos: Pick<DatosDeHojas, "encabezado" | "historial" | "vueltas">;
  /** Solo para las cuentas habilitadas a reportar. */
  reportar?: () => Promise<void>;
}) {
  const [enviando, ocupar] = useState(false);
  const [aviso, avisar] = useState("");
  const alReportar = async () => {
    if (!reportar || enviando) return;
    ocupar(true);
    avisar("");
    try {
      await reportar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo abrir el reporte.");
    } finally {
      ocupar(false);
    }
  };

  return (
    <View testID="hoja-mano">
      <Text style={estilosDeHoja.nota}>{datos.encabezado}</Text>
      <Apartado titulo="Lo que pasó">
        {datos.historial.length
          ? datos.historial.map((entrada, i) => <Fila key={i}>{entrada}</Fila>)
          : <Text style={estilosDeHoja.nota}>Todavía no hay jugadas.</Text>}
      </Apartado>
      {datos.vueltas.length ? (
        <Apartado titulo="Vueltas terminadas">
          {datos.vueltas.map(v => (
            <View key={v.numero}>
              <Fila dato={v.ganador}>{v.numero}</Fila>
              <Text style={[estilosDeHoja.nota, { marginTop: 2 }]}>{v.jugadas}</Text>
            </View>
          ))}
        </Apartado>
      ) : null}
      {reportar ? (
        <View style={estilosDeHoja.botones}>
          <BotonDeHoja alPresionar={() => void alReportar()} deshabilitado={enviando}
            descripcion="Abre un borrador en GitHub en otra pestaña">
            Reportar esta jugada ↗
          </BotonDeHoja>
        </View>
      ) : null}
      {aviso ? <Text role="status" style={[estilosDeHoja.nota, { marginTop: 6 }]}>{aviso}</Text> : null}
    </View>
  );
}
