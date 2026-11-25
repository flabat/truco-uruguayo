import { expect } from "@playwright/test";
import { cartasPorId } from "@eltruco/cliente/cartas.ts";

export async function comprobarMuestra(page, cartaEsperada) {
  const muestra = page.getByRole("img", { name: /^Muestra / });
  await expect(muestra).toHaveCount(1);
  await muestra.scrollIntoViewIfNeeded();
  const frente = muestra.locator('img:not([src$="/reverso.webp"])');
  const src = await frente.getAttribute("src");
  const id = src.split("/").at(-1).replace(".webp", "");
  if (cartaEsperada) expect(id).toBe(cartaEsperada);
  const nombre = cartasPorId.get(id).nombre;
  await expect(muestra.getByText(nombre, { exact: true })).toBeVisible();
  expect(await muestra.ariaSnapshot()).toBe(`- img "Muestra ${nombre}"`);
  await expect(muestra.locator("a, button, input, [tabindex]")).toHaveCount(0);

  const vista = await frente.evaluate(async (imagen) => {
    await imagen.decode();
    const carta = imagen.getBoundingClientRect();
    const dorso = imagen.parentElement.querySelector('img[src$="/reverso.webp"]');
    await dorso.decode();
    const mazo = dorso.getBoundingClientRect();
    const visible = (x, y) => document.elementFromPoint(carta.left + x * carta.width, carta.top + y * carta.height);
    const vecinos = document.querySelectorAll(".asiento, .mesa-panel, .ap-mano, .ap-abanico, .jugadas, .j-persona, .j-jugada, .j-dorsos img, .mesa-naipes button");
    const invade = [...vecinos].some((vecino) => {
      const otro = vecino.getBoundingClientRect();
      return otro.width && otro.height && otro.left < mazo.right && otro.right > mazo.left
        && otro.top < mazo.bottom && otro.bottom > mazo.top;
    });
    return {
      indiceVisible: visible(0.12, 0.12) === imagen,
      paloVisible: visible(0.5, 0.4) === imagen,
      mitadCubierta: visible(0.5, 0.6) === dorso && visible(0.5, 0.9) === dorso,
      dorsoAtravesado: mazo.width > mazo.height && mazo.left < carta.left && mazo.right > carta.right,
      invade,
    };
  });
  expect(vista).toEqual({ indiceVisible: true, paloVisible: true, mitadCubierta: true, dorsoAtravesado: true, invade: false });
}

export async function posicionEnTapete(page) {
  return page.getByRole("img", { name: /^Muestra / }).locator('img:not([src$="/reverso.webp"])').evaluate(async (frente) => {
    await document.fonts.ready;
    const cara = frente.getBoundingClientRect();
    const tapete = frente.closest(".j-tapete").getBoundingClientRect();
    return [Math.round(cara.left - tapete.left), Math.round(cara.top - tapete.top)];
  });
}

export async function comprobarMuestraDelDador(page, carta) {
  await comprobarMuestra(page, carta);
  const tapete = page.getByRole("region", { name: "Tapete" });
  const dador = tapete.locator(".j-puesto").filter({ has: page.locator(".j-persona span").filter({ hasText: /Dador/ }) });
  await expect(dador.getByRole("img", { name: /^Muestra / })).toHaveCount(1);
  const aLaDerecha = await dador.evaluate(puesto => {
    const centro = elemento => {
      const { x, y, width, height } = elemento.getBoundingClientRect();
      return [x + width / 2, y + height / 2];
    };
    const [mx, my] = centro(puesto.querySelector(".j-muestra"));
    const [dx, dy] = centro(puesto.querySelector(".j-ocupante"));
    const [cx, cy] = centro(puesto.closest(".j-puestos"));
    return (mx - dx) * (dy - cy) + (my - dy) * (cx - dx) > 0;
  });
  expect(aLaDerecha).toBe(true);
}

export async function capturarTapete(page, nombre) {
  if (!process.env.CAPTURAS_TAPETE) return;
  const ancho = page.viewportSize().width;
  await page.getByRole("region", { name: "Tapete" }).screenshot({
    path: `${process.env.CAPTURAS_TAPETE}/${nombre}-${ancho}.jpg`, type: "jpeg", quality: 86, scale: "css",
  });
}
