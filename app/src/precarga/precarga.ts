// Precarga de lo que necesita la mesa (cartas y, en la web, CanvasKit) mientras el jugador está en el
// salón o la sala. Sin React Native, para probarla con node --test.
export type Tarea = () => Promise<unknown>;

/** Corre las tareas una sola vez; si alguna falla, el próximo llamado vuelve a intentarlo. */
export function crearPrecarga(tareas: () => Tarea[]): () => Promise<void> {
  let enCurso: Promise<void> | undefined;
  return () => {
    enCurso ??= Promise.all(tareas().map(tarea => tarea())).then(
      () => {},
      error => {
        enCurso = undefined;
        throw error;
      },
    );
    return enCurso;
  };
}

export function crearRegistroDePrecarga() {
  const registradas: Tarea[] = [];
  return {
    registrar(tarea: Tarea) {
      registradas.push(tarea);
    },
    tareas: () => [...registradas],
  };
}
