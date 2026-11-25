/** Lo que ofrece expo-secure-store, para poder probarlo sin el teléfono. */
export interface Guardado {
  leer(clave: string): Promise<string | null>;
  guardar(clave: string, valor: string): Promise<void>;
  borrar(clave: string): Promise<void>;
}

export interface AlmacenSesion {
  leer(): Promise<string | null>;
  guardar(sesion: string): Promise<void>;
  borrar(): Promise<void>;
}

const clave = "truco.sesion";

export function crearAlmacenSesion(guardado: Guardado): AlmacenSesion {
  return {
    leer: () => guardado.leer(clave),
    guardar: sesion => guardado.guardar(clave, sesion),
    borrar: () => guardado.borrar(clave),
  };
}
