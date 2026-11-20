import { test, expect } from "@playwright/test";
test.use({ locale: "es-UY" });

const mateo = "00000000-0000-4000-8000-000000000001";
const ines = "00000000-0000-4000-8000-000000000002";
const mesaId = "4e7a3210-0000-4000-8000-000000000001";
const asientos = [
  { asiento: 0, equipo: 0, tipo: "humano", jugador: mateo, nombre: "Mateo", conectado: true },
  { asiento: 1, equipo: 1, tipo: "humano", jugador: ines, nombre: "Inés", conectado: true },
  { asiento: 2, equipo: 0, tipo: "humano", jugador: "00000000-0000-4000-8000-000000000003", nombre: "Lucía", conectado: true },
  { asiento: 3, equipo: 1, tipo: "computadora", jugador: null, nombre: "Bot de mesa", conectado: false },
];
const partida = { id: mesaId, modo: "2v2", meta: 30, mano: 4, estado: "sin-terminar", puntos: [12,8], ganador: null, inicio: null, fin: null, asientos };
const espera = { ...partida, id: "8f2d5539-0000-4000-8000-000000000003", mano: null, estado: "esperando", puntos: null, asientos: asientos.slice(0,1) };
const victoria = { ...partida, id: "5fe47020-0000-4000-8000-000000000002", estado: "terminada", puntos: [30,20], ganador: 0, fin: "2026-11-20T12:04:00Z" };
const persona = { id: mateo, nombre: "Mateo", sesionVigente: true, terminadas: 1, ganadas: 1, mesasConectadas: [mesaId] };
const pagina = (elementos, extra = {}) => ({ elementos, total: elementos.length, pagina: 1, porPagina: 25, ...extra });
const vivo = pagina([partida, espera], { sesionesVigentes: 6, personasConectadas: 3, partidasEnCurso: 1 });

for (const estado of [401,403]) test("gestión limita el acceso según la sesión " + estado, async ({page}) => {
  await page.route("**/api/gestion/**", route => route.fulfill({ status: estado, json: {} }));
  await page.goto("/gestion/");
  await expect(page.getByRole("heading", {name: estado===401 ? "Ingreso a administración" : "Acceso restringido"})).toBeVisible();
  await expect(page.getByRole("link", {name:/Ingresar/})).toHaveAttribute("href","/api/auth/login?volver=%2Fgestion%2F");
  await expect(page.getByRole("navigation",{name:"Secciones del panel"})).toHaveCount(0);
});

test("el panel consulta mesas, sesiones e historial sin ejecutar acciones de juego", async ({page}, info) => {
  const solicitudes = [];
  await page.route("**/api/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    solicitudes.push([request.method(), url.pathname, Object.fromEntries(url.searchParams)]);
    let datos;
    if (url.pathname === "/api/gestion/vivo") datos = vivo;
    if (url.pathname === "/api/gestion/jugadores") {
      datos = url.searchParams.get("q") === "Ausente" ? pagina([]) : pagina([persona]);
    }
    if (url.pathname === "/api/gestion/historial") {
      const sinTerminar = url.searchParams.get("estado") === "sin-terminar";
      datos = pagina(sinTerminar ? [partida] : [victoria, partida]);
    }
    return route.fulfill({status: datos ? 200 : 404, json: datos ?? {}});
  });
  await page.goto("/gestion/");
  await page.getByText("Mesa 4E7A3210",{exact:true}).click();
  await expect(page.getByRole("heading",{name:"Equipo 1",exact:true})).toBeVisible();
  await expect(page.getByText("Esperando jugadores",{exact:false})).toBeVisible();
  await expect(page.getByText("Bot de mesa",{exact:true})).toBeVisible();
  await expect(page.getByText("Computadora",{exact:true})).toBeVisible();
  if (process.env.CAPTURAS_GESTION && info.project.name === "desktop") await page.screenshot({ path: process.env.CAPTURAS_GESTION+"/gestion-desktop.png", fullPage: true, scale: "css" });
  await page.getByRole("button",{name:"Ver jugadores",exact:true}).click();
  await expect(page.getByRole("checkbox",{name:"Solo con sesión vigente"})).toBeChecked();
  const registro = page.getByRole("row").filter({has:page.getByRole("button",{name:"Ver partidas de Mateo"})});
  await expect(registro.getByRole("cell",{name:"1",exact:true})).toHaveCount(2);
  await page.getByRole("button",{name:"Ver partidas de Mateo"}).click();
  await expect(page.getByText("Terminadas: 1 · Ganadas: 1")).toBeVisible();
  if (process.env.CAPTURAS_GESTION && info.project.name === "mobile") {
    await page.getByText("Mesa 5FE47020",{exact:true}).click();
    await page.screenshot({ path: process.env.CAPTURAS_GESTION+"/gestion-mobile.png", fullPage: true, scale: "css" });
  }
  await page.getByRole("combobox",{name:"Estado",exact:true}).selectOption("sin-terminar");
  await page.getByRole("button",{name:"Filtrar",exact:true}).click();
  await expect(page.getByText("Mesa 5FE47020",{exact:true})).toHaveCount(0);
  await page.locator("summary").filter({hasText:"Mesa 4E7A3210"}).press("Enter");
  await expect(page.getByRole("heading",{name:"Equipo 2 · Rivales"})).toBeVisible();
  await expect(page.getByText("12 – 8",{exact:true})).toBeVisible();
  await expect(page.getByText("Fecha sin registrar")).toBeVisible();
  await page.getByRole("button",{name:"Volver a jugadores",exact:false}).click();
  await page.getByLabel("Nombre del jugador").fill("Ausente");
  await page.getByRole("button",{name:"Buscar",exact:true}).click();
  await expect(page.getByText("No hay jugadores para esta consulta.")).toBeVisible();
  await page.getByRole("button",{name:"Historial",exact:true}).click();
  await page.getByText("Mesa 5FE47020",{exact:true}).click();
  await expect(page.getByText(/Fin .*UTC/)).toBeVisible();
  expect(solicitudes).toContainEqual(["GET","/api/gestion/jugadores",{pagina:"1",vigentes:"1"}]);
  expect(solicitudes).toContainEqual(["GET","/api/gestion/historial",{pagina:"1",estado:"sin-terminar",jugador:mateo}]);
  expect(solicitudes.every(([method,path])=>method==="GET" && path.startsWith("/api/gestion/"))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === "mobile") {
    await page.setViewportSize({width:320,height:700});
    for (const nombre of ["Historial","Jugadores","En vivo"]) {
      await page.getByRole("button",{name:nombre,exact:true}).click();
      if (nombre==="Historial") await expect(page.getByText("Mesa 5FE47020",{exact:true})).toBeVisible();
      if (nombre==="Jugadores") await expect(page.getByRole("button",{name:"Ver partidas de Mateo"})).toBeVisible();
      if (nombre==="En vivo") await expect(page.getByText("Mesa 4E7A3210",{exact:true})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("en vivo conserva la última lectura si cae el servicio y oculta los datos si vence la sesión", async ({page}) => {
  let estado = 200;
  await page.route("**/api/gestion/vivo?**", route => route.fulfill({ status: estado, json: estado===200 ? vivo : {} }));
  await page.clock.install();
  await page.goto("/gestion/");
  const mesa = page.getByText("Mesa 4E7A3210",{exact:true});
  await expect(mesa).toBeVisible();
  estado=503;
  await page.clock.fastForward(15_001);
  await expect(page.getByRole("alert")).toContainText("últimos datos recibidos");
  await expect(mesa).toBeVisible();
  estado=401;
  await page.getByRole("button",{name:"Reintentar"}).click();
  await expect(page.getByRole("heading",{name:"Ingreso a administración"})).toBeVisible();
  await expect(mesa).toHaveCount(0);
});

test("jugadores navega grupos de resultados", async ({page}) => {
  await page.route("**/api/gestion/vivo?**", route=>route.fulfill({json:vivo}));
  await page.route("**/api/gestion/jugadores?**", route=>{
    const actual=Number(new URL(route.request().url()).searchParams.get("pagina"));
    return route.fulfill({ json: pagina([{...persona,nombre:actual===1?"Mateo":"Catalina"}],{total:26,pagina:actual}) });
  });
  await page.goto("/gestion/");
  await page.getByRole("button",{name:"Jugadores",exact:true}).click();
  await page.getByRole("button",{name:"Siguiente",exact:true}).click();
  await expect(page.getByRole("button",{name:"Ver partidas de Catalina"})).toBeVisible();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
});

test("Funciones edita la audiencia de Tercetos y recupera una edición obsoleta", async ({page}, info) => {
  let datos = { audiencia: "desactivado", jugadores: [], version: 0, historial: [] };
  let conflicto = false;
  await page.route("**/api/gestion/vivo?**", r => r.fulfill({json:vivo}));
  await page.route("**/api/gestion/jugadores?**", r => r.fulfill({json:pagina([persona])}));
  await page.route("**/api/gestion/funciones/tercetos", async r => {
    if (r.request().method() === "PUT") {
      if (conflicto) return r.fulfill({status:409,json:{}});
      expect(r.request().postDataJSON()).toEqual({audiencia:"seleccionados", jugadores:[mateo],version:0});
      datos = { audiencia: "seleccionados", jugadores:[persona], version:1, historial:[
        {version:1,anterior:"desactivado",audiencia:"seleccionados",agregados:[mateo],retirados:[],operador:"Ana",fecha:"2026-11-20T12:00:00Z"},
      ] };
    }
    return r.fulfill({json:datos});
  });
  await page.goto("/gestion/");
  await page.getByRole("button", {name:"Funciones",exact:true}).click();
  await page.getByRole("button", {name:"Editar audiencia"}).press("Enter");
  await page.getByLabel("Quién puede jugar").selectOption("seleccionados");
  await page.getByLabel("Nombre del jugador").fill("Mateo");
  await page.getByRole("button", {name:"Buscar",exact:true}).click();
  await page.getByRole("button", {name:"Agregar a Mateo"}).click();
  await expect(page.getByRole("heading", {name:"Jugadores seleccionados (1)"})).toBeVisible();
  await page.getByRole("button", {name:"Quitar a Mateo"}).click();
  await page.getByRole("button", {name:"Agregar a Mateo"}).click();
  await page.getByRole("button", {name:"Guardar cambios"}).click();
  await expect(page.getByText("Configuración guardada.")).toBeVisible();
  await expect(page.getByText("Desactivado → Jugadores seleccionados")).toBeVisible();
  await page.getByRole("button", {name:"Editar audiencia"}).click();
  await page.getByLabel("Quién puede jugar").selectOption("todos");
  await expect(page.getByText(/Al guardar, cualquier jugador/)).toBeVisible();
  if (process.env.CAPTURAS_FUNCIONES) await page.screenshot({path:process.env.CAPTURAS_FUNCIONES+"/funciones-"+info.project.name+".png",fullPage:true,scale:"css"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  conflicto = true;
  await page.getByRole("button", {name:"Guardar cambios"}).click();
  await expect(page.getByRole("alert")).toContainText("Otra edición");
  await expect(page.getByRole("button", {name:"Editar audiencia"})).toBeVisible();
});
