import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Geometria } from "@eltruco/mesa-geometria";
import { colores, fuentes } from "../../tema.ts";
import { enRect, mesaColores } from "./estilo.ts";
import type { Pestana } from "./Tira.tsx";

function Panel({ testID, rect, children }: { testID: string; rect: NonNullable<Geometria["paneles"]>["izquierdo"]; children: ReactNode }) {
  return (
    <View testID={testID} style={[enRect(rect), estilos.panel]}>
      <ScrollView contentContainerStyle={estilos.contenido}>{children}</ScrollView>
    </View>
  );
}

function Titulo({ children, chico }: { children: string; chico?: boolean }) {
  return <Text role="heading" aria-level={2} style={[estilos.titulo, chico && estilos.tituloChico]}>{children}</Text>;
}

/**
 * En el escritorio, las hojas de la tira quedan fijas a los costados de la mesa: a la izquierda
 * Mano (o Reparto); a la derecha Tantos, Voz y lo de Más.
 */
export function Paneles({ paneles, titulos, extra, recibidas }: {
  paneles: NonNullable<Geometria["paneles"]>;
  titulos: Record<Pestana, string>;
  extra?: Partial<Record<Pestana, ReactNode>>;
  /** Las señas recibidas de las mesas legadas, debajo de la mano como en su hoja. */
  recibidas?: ReactNode;
}) {
  return (
    <>
      <Panel testID="panel-mano" rect={paneles.izquierdo}>
        <Titulo>{titulos.mano}</Titulo>
        {extra?.mano ?? null}
        {recibidas}
      </Panel>
      <Panel testID="panel-tantos" rect={paneles.derecho}>
        <Titulo>{titulos.tantos}</Titulo>
        {extra?.tantos ?? null}
        <View style={estilos.seccion}>
          <Titulo chico>{titulos.voz}</Titulo>
          {extra?.voz ?? null}
        </View>
        <View style={estilos.seccion}>
          <Titulo chico>{titulos.mas}</Titulo>
          {extra?.mas ?? null}
        </View>
      </Panel>
    </>
  );
}

const estilos = StyleSheet.create({
  panel: { backgroundColor: mesaColores.hoja },
  contenido: { gap: 8, padding: 16 },
  titulo: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 20 },
  tituloChico: { fontSize: 17 },
  seccion: { borderTopColor: mesaColores.separador, borderTopWidth: 1, gap: 8, marginTop: 10, paddingTop: 12 },
});
