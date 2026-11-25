import { expect, test } from '@playwright/test';

test('comparte la página pública sin parámetros y expone una vista previa', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async data => { window.compartido = data; };
  });
  await page.goto('/aprender/?invitacion=privada');
  await page.getByRole('button', { name: /Compartir esta página/ }).click();
  const datos = await page.evaluate(() => window.compartido);
  expect(datos.title).toBe('Aprender con las cartas · El Truco');
  expect(datos.url).toMatch(/\/aprender\/$/);
  expect(datos.url).not.toContain('privada');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /mesa-social\.jpg$/);
  await expect(page.locator('meta[property="og:url"]')).not.toHaveAttribute('content', /privada/);
});

test('permite copiar manualmente cuando no hay portapapeles', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Compartir esta página/ }).click();
  await expect(page.getByLabel('Enlace para compartir')).toBeFocused();
  await expect(page.getByText('Enlace seleccionado. Copialo para compartirlo.')).toBeVisible();
});

test('cuenta el uso de compartir sin enviar el enlace ni datos personales', async ({ page }) => {
  await page.addInitScript(() => { navigator.share = async () => {}; });
  await page.goto('/aprender/?invitacion=secreto');
  const evento = page.waitForRequest(request => new URL(request.url()).pathname === '/eventos/compartir-pagina.txt');
  await page.getByRole('button', { name: /Compartir esta página/ }).click();
  const solicitud = await evento;
  expect(solicitud.method()).toBe('GET');
  expect(new URL(solicitud.url()).search).toBe('');
  expect(solicitud.postData()).toBeNull();
  expect(solicitud.headers().referer || "").toBe("");
});
