import { expect, test } from "@playwright/test";

const mesa = "00000000-0000-4000-8000-000000000235";
const regreso = "/volver/?mesa=" + mesa;

test("el regreso de Discord prioriza el asiento y conserva el acceso neutral del espectador", async ({page}) => {
  let sentado = true;
  let lecturas = 0;
  await page.route("**/api/mesas/" + mesa, r => r.fulfill({ status: sentado ? 200 : 404, json: {} }));
  await page.route("**/api/salon/mesas/" + mesa, r => {
    lecturas++;
    return r.fulfill({ json: {} });
  });
  await page.route("**/jugar/?*", r => r.fulfill({ contentType: "text/html", body: "<p>Mesa</p>" }));
  await page.goto(regreso);
  await expect(page).toHaveURL(new RegExp("/jugar/\\?mesa=" + mesa + "$"));
  expect(lecturas).toBe(0);
  sentado = false;
  await page.goto(regreso);
  await expect(page).toHaveURL(new RegExp("/jugar/\\?mirar=" + mesa + "$"));
  expect(lecturas).toBe(1);
});

test("el regreso conserva el destino tras login y respeta una mesa privada", async ({page}) => {
  let estado = 401;
  await page.route("**/api/mesas/" + mesa, r => r.fulfill({ status: estado, json: {} }));
  await page.route("**/api/auth/login?*", r => r.fulfill({ body: "Ingreso" }));
  await page.route("**/api/salon/mesas/" + mesa, r => r.fulfill({ status: 404, json: {} }));
  await page.goto(regreso);
  await expect(page).toHaveURL(url => url.pathname === "/api/auth/login" && url.searchParams.get("volver") === regreso);
  estado = 404;
  await page.goto(regreso);
  await expect(page.getByRole("status")).toHaveText("Esta mesa no está disponible para mirar.");
  await expect(page).toHaveURL(new RegExp("/volver/"));
});
