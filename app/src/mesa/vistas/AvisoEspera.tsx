import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { mensajeDe } from "@eltruco/cliente/cliente.ts";
import { colores, fuentes } from "../../tema.ts";
import {
  accionDeEspera, esperasVisibles, ocultarEspera, partesDeEspera, segundosRestantes, type Espera, type EsperasOcultas,
} from "../abandono.ts";
import { BotonDeHoja, estilosDeHoja } from "./PartesDeHoja.tsx";
import { mesaColores } from "./estilo.ts";

/**
 * Un aviso por cada humano desconectado que traba la mesa, con la cuenta hasta que se lo puede
 * reemplazar. Al vencer ofrece cobrar la partida (duelo) o reemplazarlo, y «Seguir esperando».
 */
export function AvisoEspera({ esperas, modo, reemplazar }: {
  esperas: readonly Espera[] | undefined;
  modo: "1v1" | "2v2" | "3v3";
  reemplazar: (asiento: number) => Promise<void>;
}) {
  const [ahora, cambiarAhora] = useState(Date.now);
  const [ocultas, cambiarOcultas] = useState<EsperasOcultas>({});
  const [enviando, cambiarEnviando] = useState<number | null>(null);
  const [errores, cambiarErrores] = useState<Readonly<Record<number, string>>>({});
  const hayEsperas = (esperas?.length ?? 0) > 0;
  useEffect(() => {
    if (!hayEsperas) return;
    cambiarAhora(Date.now());
    const reloj = setInterval(() => cambiarAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [hayEsperas]);

  const visibles = esperasVisibles(esperas, ocultas, ahora);
  if (visibles.length === 0) return null;

  async function aceptar(asiento: number) {
    cambiarEnviando(asiento);
    cambiarErrores(e => ({ ...e, [asiento]: "" }));
    try {
      await reemplazar(asiento);
    } catch (error) {
      cambiarErrores(e => ({ ...e, [asiento]: mensajeDe(error) }));
    } finally {
      cambiarEnviando(null);
    }
  }

  return (
    <View style={estilos.columna} pointerEvents="box-none">
      {visibles.map(espera => {
        const restantes = segundosRestantes(espera.disponible, ahora);
        const error = errores[espera.asiento];
        const { anuncio, cuenta } = partesDeEspera(espera.nombre, restantes);
        return (
          <View key={espera.asiento} testID={"aviso-espera-" + espera.asiento} style={estilos.aviso} accessibilityLiveRegion="polite">
            {/* La región viva cambia solo al aparecer el aviso, la acción o un error: la cuenta queda fuera. */}
            <View style={estilos.fila}>
              <Text style={estilos.texto}>{anuncio}</Text>
              {cuenta ? (
                <Text style={estilos.texto} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {cuenta}
                </Text>
              ) : null}
            </View>
            {error ? <Text style={estilosDeHoja.nota}>{error}</Text> : null}
            {restantes === 0 ? (
              <View style={estilos.botones}>
                <BotonDeHoja principal deshabilitado={enviando !== null} alPresionar={() => void aceptar(espera.asiento)}
                  descripcion={modo === "1v1"
                    ? `Ganás la partida porque ${espera.nombre} no volvió.`
                    : `Una computadora juega el lugar de ${espera.nombre}.`}>
                  {accionDeEspera(modo)}
                </BotonDeHoja>
                <BotonDeHoja deshabilitado={enviando !== null} descripcion={`Vuelve a preguntarte en un minuto si ${espera.nombre} no volvió.`}
                  alPresionar={() => cambiarOcultas(o => ocultarEspera(o, espera, Date.now()))}>
                  Seguir esperando
                </BotonDeHoja>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  columna: { gap: 8, maxWidth: 420, width: "100%" },
  aviso: {
    backgroundColor: mesaColores.hoja, borderRadius: 14, boxShadow: "0 6px 18px rgba(0, 0, 0, 0.45)", gap: 6, padding: 12,
  },
  fila: { flexDirection: "row", flexWrap: "wrap" },
  texto: { color: colores.tinta, fontFamily: fuentes.textoFuerte, fontSize: 15, lineHeight: 20 },
  botones: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
