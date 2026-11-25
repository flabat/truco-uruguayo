/**
 * El emulador de Android ve la máquina en 10.0.2.2, no en localhost. `npm run app:nativo -- --api local` le da a Metro
 * una URL con localhost para que el mismo Metro sirva iOS, Android y la web; acá se traduce en Android.
 */
export function direccionDeLaApi(url: string, so: string): string {
  if (so !== "android") return url;
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, "$110.0.2.2");
}
