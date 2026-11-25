/** Abre la hoja de compartir del sistema; si no hay o falla, copia el enlace. Cancelar no es un error. */
export async function compartirInvitacion({ enlace, compartir, copiar }: {
  enlace: string;
  compartir?: (enlace: string) => Promise<"compartida" | "cancelada">;
  copiar?: (enlace: string) => Promise<void>;
}): Promise<string> {
  if (compartir) {
    try {
      await compartir(enlace);
      return "";
    } catch {
      /* Se copia el enlace. */
    }
  }
  if (copiar) {
    try {
      await copiar(enlace);
      return "Invitación copiada.";
    } catch {
      /* Queda el enlace a la vista para copiarlo a mano. */
    }
  }
  return "Copiá el enlace para compartirlo.";
}
