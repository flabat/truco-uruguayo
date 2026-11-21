import { expect, test } from '@playwright/test';

test('comparte la página pública sin parámetros y expone una vista previa', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = async data => { window.compartido = data; };
  });
  await page.goto('/aprender/?invitacion=privada');
  await page.getByRole('button', { name: /Compartir esta página/ }).click();
  const datos = await page.evaluate(() => window.compartido);
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

test('comparte la invitación de mesa y conserva el enlace privado solo en la acción elegida', async ({ page }) => {
  const id = '44b9a82c-c1f9-404f-b0fd-f7956d9b50b0';
  const enlace = 'https://eltru.co/jugar/?invitacion=token-de-prueba';
  await page.addInitScript(() => {
    navigator.share = async data => { window.compartido = data; };
  });
  await page.routeWebSocket('**/vivo', () => {});
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/jugador') return route.fulfill({ json: { id: 'ana', nombre: 'Ana', salonHabilitado: true } });
    if (path === '/api/mesas/' + id) return route.fulfill({ json: {
      id, creadorId: 'ana', miAsiento: 0, modo: '2v2', meta: 40, lista: false, invitacion: enlace,
      asientos: [{ asiento: 0, tipo: 'humano', nombre: 'Ana', equipo: 0 }, ...[1, 2, 3].map(asiento => ({ asiento, tipo: 'vacio', nombre: null, equipo: asiento % 2 }))],
    } });
    if (path.endsWith('/partida')) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: {} });
  });
  await page.goto('/jugar/?mesa=' + id);
  await page.getByRole('button', { name: 'Compartir invitación' }).click();
  expect(await page.evaluate(() => window.compartido)).toMatchObject({ url: enlace, text: expect.stringContaining('Sumate a mi mesa') });
  await expect(page.locator('meta[property="og:url"]')).not.toHaveAttribute('content', /mesa=/);
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
