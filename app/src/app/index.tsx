import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Jugador } from "../api/cliente.ts";
import { Confirmacion } from "../componentes/Confirmacion.tsx";
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from "../componentes/ui.tsx";
import { useSesion } from "../ingreso/contexto.tsx";
import { colores, fuentes } from "../tema.ts";

export default function Inicio() {
  const { estado, ingresar, reintentar } = useSesion();
  const [ingresando, setIngresando] = useState(false);
  if (estado.tipo === "cargando") return <Cargando />;
  if (estado.tipo === "dentro") return <Perfil jugador={estado.jugador} aviso={estado.aviso} />;
  if (estado.tipo === "sinConexion") {
    return (
      <Pantalla titulo="Sin conexión">
        <Parrafo>No pudimos conectar con El Truco. Revisá tu conexión y probá de nuevo.</Parrafo>
        <Boton onPress={reintentar}>Reintentar</Boton>
      </Pantalla>
    );
  }
  return (
    <Pantalla titulo="Entrá a jugar">
      {estado.aviso ? <Aviso>{estado.aviso}</Aviso> : null}
      <Parrafo>Ingresá con tu cuenta de El Truco para jugar en línea con personas y computadoras.</Parrafo>
      <Boton
        ocupado={ingresando}
        onPress={() => { setIngresando(true); ingresar().finally(() => setIngresando(false)); }}
      >
        Ingresar
      </Boton>
    </Pantalla>
  );
}

const textoEliminar = "Cerramos tu sesión en todos tus dispositivos y te sacamos de tus mesas. "
  + "Tenés 30 días para arrepentirte: si volvés a ingresar antes, cancelamos la eliminación. "
  + "Después borramos tu cuenta y lo que te identifica; las partidas que jugaste con otras personas quedan sin tu nombre.";

function Perfil({ jugador, aviso }: { jugador: Jugador; aviso?: string }) {
  const { cerrarSesion, eliminarCuenta } = useSesion();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmarEliminacion() {
    setOcupado(true);
    setError(null);
    try {
      await eliminarCuenta();
    } catch {
      setError("No pudimos pedir la eliminación. Probá de nuevo.");
      setConfirmando(false);
      setOcupado(false);
    }
  }

  return (
    <Pantalla titulo="Tu perfil">
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {error ? <Aviso>{error}</Aviso> : null}
      <View style={estilos.ficha}>
        <Text style={estilos.etiqueta}>Nombre</Text>
        <Text style={estilos.nombre}>{jugador.nombre}</Text>
        <Text style={estilos.etiqueta}>ID de jugador</Text>
        <Text selectable style={estilos.id}>{jugador.id}</Text>
      </View>
      <Link href="/mesa" style={estilos.enlace}>Mesa de prueba</Link>
      <Boton variante="secundario" ocupado={ocupado} onPress={() => { setOcupado(true); cerrarSesion(); }}>
        Cerrar sesión
      </Boton>
      <Boton variante="peligro" ocupado={ocupado} onPress={() => setConfirmando(true)}>Eliminar mi cuenta</Boton>
      <Confirmacion
        visible={confirmando}
        titulo="¿Eliminar tu cuenta?"
        texto={textoEliminar}
        confirmar="Eliminar mi cuenta"
        ocupado={ocupado}
        alConfirmar={confirmarEliminacion}
        alCancelar={() => setConfirmando(false)}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  ficha: { borderColor: colores.borde, borderRadius: 16, borderWidth: 1, gap: 4, padding: 16, backgroundColor: "#fffdf6" },
  etiqueta: { color: colores.tintaSuave, fontFamily: fuentes.texto, fontSize: 13, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  nombre: { color: colores.tinta, fontFamily: fuentes.titulo, fontSize: 24 },
  id: { color: colores.tinta, fontFamily: fuentes.texto, fontSize: 15 },
  enlace: { color: colores.panoClaro, fontFamily: fuentes.textoFuerte, fontSize: 16, textDecorationLine: "underline" },
});
