/** Forma comparable del texto hablado: minúsculas, sin tildes ni signos, espacios simples. */
export function plano(texto: string): string {
  return texto.normalize("NFD").toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
