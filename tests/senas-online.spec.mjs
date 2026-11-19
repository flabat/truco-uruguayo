import { test, expect } from "@playwright/test";
import { iniciarOnline, vistaOnline } from "../src/motor/mesa-online.ts";
import { commitTurn } from "../training/signals/index.ts";
import { teamSignalsVersion } from "../training/contracts/index.ts";

test("un gesto se confirma junto a la jugada y se recupera una sola vez", async ({page,isMobile}) => {
  if (isMobile) await page.setViewportSize({width:320,height:780});
  const id = "8349aa42-c1f9-404f-b0fd-f7956d9b50b1";
  const mesa = {id,modo:"2v2",formato:"pairs-private-senas",creadorId:"s0",miAsiento:0,lista:true,
    asientos:["A","B","C","D"].map((nombre,asiento)=>({asiento,nombre,equipo:asiento%2,tipo:"computadora"}))};
  let state = iniciarOnline({versionReparto:"online-1",mano:0,dador:3,muestra:"bastos-01",
    manos:[["espadas-03","oros-06","bastos-02"],["oros-07","oros-11","bastos-03"],
      ["oros-01","copas-03","espadas-07"],["copas-05","espadas-02","oros-03"]]});
  const turns = [];
  const sent = [];
  await page.routeWebSocket("**/vivo", () => {});
  await page.route("**/api/**", async route => {
    const req=route.request(), path=new URL(req.url()).pathname;
    let data={id:"s0",nombre:"A"};
    if (path === "/api/mesas") {
      expect(req.postDataJSON()).toEqual({modo:"2v2",formato:"pairs-private-senas"});
      data=mesa;
    } else if(path.endsWith(id)) data=mesa;
    else if(path.endsWith("/acciones")) {
      const {accion}=req.postDataJSON();
      sent.push(accion);
      const {state:next,turn}=commitTurn(state,0,"pairs-private-senas",accion.sena+"/"+accion.tipo);
      state=next; turns.push(turn);
    } else if(path.endsWith("/partida")) data={version:turns.length+1,manoNumero:1,puntos:[0,0],meta:40,
      ganadorPartida:null,formato:"pairs-private-senas",versionSenas:teamSignalsVersion,turnos:turns,vista:vistaOnline(state,0)};
    await route.fulfill({json:data});
  });
  await page.goto("jugar/");
  const check=page.getByRole("checkbox",{name:"Permitir señas entre compañeros"});
  await check.focus(); await check.press("Space");
  await page.getByRole("button",{name:"Crear mesa",exact:true}).click();
  const selector=page.getByRole("combobox",{name:"Seña para esta jugada"});
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveAccessibleDescription("La seña la ven vos y tu compañero al confirmar la jugada.");
  await expect(selector).toHaveValue("");
  await expect(selector.locator("option")).toHaveCount(14);
  await selector.focus(); await selector.press("a");
  await expect(selector).toHaveValue("cejas");
  expect(sent).toEqual([]);
  if(process.env.CAPTURAS_SENAS) {
    await page.screenshot({path:process.env.CAPTURAS_SENAS+"/senas-"+test.info().project.name+".jpg",quality:80,fullPage:true});
  }
  await page.getByRole("button",{name:"Falta envido",exact:true}).press("Enter");
  const entries=page.getByRole("region",{name:"Señas de esta mano"}).getByRole("listitem");
  const publicas=page.getByRole("region",{name:"Historial de la mano",exact:true}).getByRole("listitem");
  await expect(entries).toHaveText(["A · Alzar ambas cejas · falta envido"]);
  await expect(publicas).toHaveText(["A dijo «Falta envido»."]);
  await page.reload();
  await expect(entries).toHaveText(["A · Alzar ambas cejas · falta envido"]);
  await expect(publicas).toHaveText(["A dijo «Falta envido»."]);
  expect(sent).toEqual([{tipo:"falta-envido",sena:"cejas"}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
