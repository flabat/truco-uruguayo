// Mesas cuya espera se vio en la sala: al abrirse la mesa, su primer reparto se anima.
const presenciadas = new Set<string>();

export function anotarPresenciada(id: string) {
  presenciadas.add(id);
}

/** Consume la marca: solo la primera mesa que se abre con ese id anima el reparto. */
export function presencioElReparto(id: string): boolean {
  return presenciadas.delete(id);
}
