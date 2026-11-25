import { StyleSheet, Switch, Text, View } from "react-native";
import { colores, fuentes } from "../../tema.ts";
import { baseDeLaApi } from "../../configuracion.ts";
import { esWeb } from "../../ingreso/plataforma.ts";
import { useSonidoActivado } from "../../sonido/index.ts";
import type { Preferencias } from "../preferencias.ts";
import { abrirAparte } from "../web.ts";
import { Apartado, BotonDeHoja, estilosDeHoja, Fila } from "./PartesDeHoja.tsx";
import { mesaColores } from "./estilo.ts";

function Interruptor({ etiqueta, detalle, valor, cambiar, bloqueado }: {
  etiqueta: string; detalle?: string; valor: boolean; cambiar: (v: boolean) => void; bloqueado?: boolean;
}) {
  return (
    <View style={estilos.interruptor}>
      <View style={estilos.textos}>
        <Text style={estilos.etiqueta}>{etiqueta}</Text>
        {detalle ? <Text style={estilosDeHoja.nota}>{detalle}</Text> : null}
      </View>
      <Switch accessibilityLabel={etiqueta} value={valor} onValueChange={cambiar} disabled={bloqueado}
        trackColor={{ false: mesaColores.bordeBoton, true: colores.tinta }} thumbColor={colores.papel}
        {...(esWeb && { activeThumbColor: colores.papel })} />
    </View>
  );
}

/** Reglas, versiones de la mesa (lo de `PieMesa` en la web), sonido, hápticos, modo liviano y salida. */
export function HojaMas({ versionReglas, politica, nombreModelo, preferencias, cambiar, reducirMovimiento, salir }: {
  versionReglas?: number;
  politica?: string;
  nombreModelo?: string;
  preferencias: Preferencias;
  cambiar: (clave: keyof Preferencias, valor: boolean) => void;
  reducirMovimiento: boolean;
  salir: () => void;
}) {
  const [sonidoActivado, cambiarSonido] = useSonidoActivado();
  return (
    <View testID="hoja-mas">
      <Apartado titulo="Preferencias">
        <Interruptor etiqueta="Sonido" valor={sonidoActivado} cambiar={cambiarSonido} />
        {esWeb ? null : <Interruptor etiqueta="Hápticos" valor={preferencias.hapticos} cambiar={v => cambiar("hapticos", v)} />}
        <Interruptor etiqueta="Modo liviano"
          detalle={reducirMovimiento ? "Lo activa la opción de reducir movimiento del sistema." : "Sin brillos ni partículas."}
          valor={preferencias.liviano || reducirMovimiento} cambiar={v => cambiar("liviano", v)} bloqueado={reducirMovimiento} />
      </Apartado>
      <Apartado titulo="Mesa">
        <Fila dato={versionReglas == null ? "Sin informar" : "v" + versionReglas}>Versión de reglas</Fila>
        <View style={estilos.modelo}>
          <Text style={estilos.etiqueta}>Modelo de la computadora</Text>
          <Text style={estilos.valor}>{nombreModelo ?? politica ?? "Sin informar"}</Text>
          {politica && nombreModelo ? <Text style={[estilosDeHoja.nota, estilos.id]} numberOfLines={1}>{politica}</Text> : null}
        </View>
      </Apartado>
      <View style={estilosDeHoja.botones}>
        <BotonDeHoja alPresionar={() => abrirAparte(baseDeLaApi.replace(/\/+$/, "") + "/reglas/")}>Reglas ↗</BotonDeHoja>
        <BotonDeHoja alPresionar={salir}>Salir al salón</BotonDeHoja>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  interruptor: {
    alignItems: "center", borderBottomColor: mesaColores.separador, borderBottomWidth: 1, flexDirection: "row", gap: 12,
    justifyContent: "space-between", paddingVertical: 8,
  },
  textos: { flexShrink: 1 },
  etiqueta: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 14, lineHeight: 19 },
  modelo: { borderBottomColor: mesaColores.separador, borderBottomWidth: 1, paddingVertical: 6 },
  valor: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 14, lineHeight: 19, marginTop: 1 },
  id: { fontSize: 11 },
});
