/** Lo que ofrece expo-secure-store, para poder probarlo sin el teléfono. */
export interface Guardado {
  leer(clave: string): Promise<string | null>;
  guardar(clave: string, valor: string): Promise<void>;
  borrar(clave: string): Promise<void>;
}

export interface AlmacenSesion {
  /** Lee la sesión guardada y la deja disponible en `actual`. */
  leer(): Promise<string | null>;
  guardar(sesion: string): Promise<void>;
  borrar(): Promise<void>;
  /** La última sesión leída o guardada, sin esperar: el cliente compartido la pide en cada pedido. */
  actual(): string | null;
}

const clave = "truco.sesion";

export function crearAlmacenSesion(guardado: Guardado): AlmacenSesion {
  let actual: string | null = null;
  return {
    async leer() {
      actual = await guardado.leer(clave);
      return actual;
    },
    async guardar(sesion) {
      await guardado.guardar(clave, sesion);
      actual = sesion;
    },
    async borrar() {
      actual = null;
      await guardado.borrar(clave);
    },
    actual: () => actual,
  };
}
