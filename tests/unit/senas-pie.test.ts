import assert from "node:assert/strict";
import test from "node:test";
import { cartaParaJugar, elegirAccionConPie, elegirIndicacionesPie } from "@eltruco/motor/bot-pie.ts";
import type { CardId } from "@eltruco/motor/cartas.ts";
import { aplicarOnline, iniciarOnline, vistaOnline, type AccionOnline, type EstadoOnline, type RepartoOnline } from "@eltruco/motor/mesa-online.ts";
import type { Asiento, TresCartas } from "@eltruco/motor/reparto.ts";
import { cartasPedidas, catalogoGestosPie, crearIndicacionPie, gestosDeCartas, significadoDeGesto, textoDeIndicacion, pieQueResponde, vistaDelPie, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";

const manos: TresCartas[] = [
  ["copas-02", "bastos-01", "oros-04"], ["bastos-06", "copas-03", "oros-06"],
  ["copas-04", "espadas-06", "oros-07"], ["oros-12", "bastos-07", "espadas-07"],
  ["oros-02", "espadas-12", "bastos-03"], ["oros-10", "espadas-04", "copas-07"],
];
function reparto(cantidad: 2 | 4 | 6, mano: Asiento = 0): RepartoOnline {
  return { versionReparto: cantidad === 6 ? "online-2" : "online-1", reglaFlor: "inmediata-v2",
    dador: ((mano + cantidad - 1) % cantidad) as Asiento, mano, manos: manos.slice(0, cantidad), muestra: "copas-06" };
}
function aplicar(e: EstadoOnline, a: AccionOnline): EstadoOnline {
  const paso = aplicarOnline(e, a);
  assert.ok(paso.ok, JSON.stringify({ a, paso }));
  return paso.estado;
}
function tirar(e: EstadoOnline, cartas: CardId[]): EstadoOnline {
  return cartas.reduce((estado, carta) => aplicar(estado, { tipo: "carta", asiento: estado.mano.turno!, carta }), e);
}

test("las once expresiones son convencionales, ordenadas y distintas", () => {
  const muestra = "copas-06";
  const convenciones: [CardId, keyof typeof catalogoGestosPie][] = [
    ["copas-02","cejas"], ["copas-04","beso"], ["copas-05","nariz"], ["copas-11","ojo-derecho"],
    ["copas-10","ojo-izquierdo"], ["bastos-01","labios-derecha"], ["espadas-01","labios-derecha"],
    ["oros-07","labios-izquierda"], ["espadas-07","labios-izquierda"], ["copas-03","labio-inferior"],
    ["oros-02","boca"], ["oros-01","lengua"], ["copas-01","lengua"], ["bastos-12","ojos-cerrados"],
  ];
  for (const [carta, gesto] of convenciones) assert.deepEqual(gestosDeCartas([carta], muestra), [gesto]);
  assert.deepEqual(new Set(convenciones.map(c => c[1])), new Set(Object.keys(catalogoGestosPie)));
  assert.deepEqual(gestosDeCartas(["espadas-01","copas-02","bastos-01"], muestra), ["cejas","labios-derecha"]);
  assert.deepEqual(gestosDeCartas(["espadas-05","bastos-12","oros-04"], muestra), ["ojos-cerrados"]);
  assert.deepEqual(gestosDeCartas([], muestra), []);
  assert.deepEqual(gestosDeCartas(["copas-12","oros-04"], "copas-04"), ["beso"]);
  assert.deepEqual(gestosDeCartas(["copas-12","copas-07","copas-01"], muestra), ["lengua"]);
});

test("el pie se fija con el orden del reparto para todos los dadores de cuatro y seis", () => {
  for (const cantidad of [4, 6] as const) {
    for (let mano = 0; mano < cantidad; mano++) {
      const e = iniciarOnline(reparto(cantidad, mano as Asiento));
      const orden = Array.from({ length: cantidad }, (_, i) => (mano + i) % cantidad);
      for (const s of orden) {
        const equipo = orden.filter(n => n % 2 === s % 2);
        const pie = equipo.at(-1)!;
        const v = vistaDelPie(e, s as Asiento, [])!;
        assert.equal(v.pie, pie);
        assert.deepEqual(v.grupos.map(g => g.emisor), s === pie ? equipo.slice(0, -1) : [s]);
        assert.deepEqual(v.opciones.map(o => o.destinatario), s === pie ? equipo.slice(0, -1) : []);
      }
    }
  }
});

test("la misma vuelta conserva su instantánea tras una carta, un envite o una reconexión", () => {
  const inicial = iniciarOnline(reparto(4));
  const delPie = (e: EstadoOnline) => vistaDelPie(e, 2, [])!;
  const grupo = [{ emisor: 0, gestos: ["cejas", "labios-derecha"] }];
  assert.deepEqual(delPie(inicial).grupos, grupo);
  const envido = aplicar(inicial, {tipo:"envido",asiento:0});
  assert.deepEqual(delPie(envido), delPie(inicial));
  const estado = tirar(inicial, ["bastos-01"]);
  assert.deepEqual(delPie(estado).grupos, grupo);
  assert.deepEqual(delPie(estado).opciones, []);
  assert.deepEqual(delPie(structuredClone(estado)), delPie(estado));
  const segunda = tirar(estado, ["bastos-06","copas-04","oros-12"]);
  assert.equal(segunda.mano.turno, 2);
  assert.deepEqual(delPie(segunda), {pie:2,vuelta:2,grupos:[{emisor:0,gestos:["cejas"]}],
    opciones:[{destinatario:0,frases:["voy-a-vos"]}]});
});

test("parda y máximas iguales del mismo equipo afectan la salida sin transferir la capitanía", () => {
  const r = reparto(4);
  const distintas: TresCartas[] = [...r.manos];
  distintas[0] = ["copas-02","bastos-01","oros-03"];
  distintas[2] = ["copas-04","espadas-06","bastos-03"];
  for (const [carta, resultado] of [["copas-03","parda"],["bastos-06","ganada"]] as const) {
    const e = tirar(iniciarOnline({...r, manos:distintas}), ["oros-03", carta, "bastos-03","oros-12"]);
    assert.equal(e.mano.vueltas[0].resultado.tipo, resultado);
    assert.equal(e.mano.turno, 0);
    assert.equal(vistaDelPie(e, 0, [])?.pie, 2);
    assert.equal(vistaDelPie(e, 1, [])?.pie, 3);
  }
});

test("la seña de un emisor de redondilla modifica exclusivamente las vistas propias y de su pie", () => {
  const r = reparto(6);
  const otras = [...r.manos];
  otras[0] = ["copas-11","espadas-01","bastos-02"];
  const a = iniciarOnline(r), b = iniciarOnline({...r, manos:otras});
  for (const s of [0,1,2,3,4,5] as const) {
    const va = vistaDelPie(a, s, []), vb = vistaDelPie(b, s, []);
    if (s === 0 || s === 4) assert.notDeepEqual(va, vb);
    else assert.deepEqual(va, vb);
  }
  assert.deepEqual(vistaDelPie(b,4,[])?.grupos, [
    {emisor:0,gestos:["ojo-derecho","labios-derecha","boca"]},
    {emisor:2,gestos:["beso","labios-izquierda"]},
  ]);
});

test("se puede hablar sin tener la palabra, una vez por destinatario y vuelta", () => {
  const e = iniciarOnline(reparto(6));
  const primera = crearIndicacionPie(e,4,0,"veni",1,[])!;
  assert.deepEqual(primera, {emisor:4,destinatario:0,frase:"veni",vuelta:1,indiceAccion:0});
  assert.equal(crearIndicacionPie(e,4,0,"juga",1,[primera]), undefined);
  assert.ok(crearIndicacionPie(e,4,2,"juga",1,[primera]));
  for (const [quien,a,frase,vuelta] of [[2,0,"veni",1],[4,4,"veni",1],[4,1,"veni",1],[4,0,"voy-a-vos",1],
    [4,0,"sarasa",1],[4,0,"__proto__",1],[4,0,"veni",2],[4,"0","veni",1]] as const) {
    assert.equal(crearIndicacionPie(e,quien,a,frase,vuelta,[]), undefined);
  }
  const envido = aplicar(e,{tipo:"envido",asiento:0});
  assert.equal(crearIndicacionPie(envido,4,0,"veni",1,[])?.indiceAccion,1);
  const despues = tirar(e,["oros-04"]);
  assert.equal(crearIndicacionPie(despues,4,0,"veni",1,[]),undefined);
  assert.equal(crearIndicacionPie(despues,4,2,"juga",1,[])?.indiceAccion,1);
  assert.deepEqual(e.acciones, []);
  assert.deepEqual(e.cobros, []);
});

test("el pie puede decir voy a vos antes o después de su carta de salida", () => {
  const e = tirar(iniciarOnline(reparto(4)), ["oros-04","bastos-06","copas-04","oros-12"]);
  const viejas: IndicacionPie[] = [{emisor:2,destinatario:0,frase:"veni",vuelta:1,indiceAccion:0}];
  assert.equal(crearIndicacionPie(e,2,0,"juga",2,viejas), undefined);
  assert.equal(crearIndicacionPie(e,2,0,"voy-a-vos",2,viejas)?.indiceAccion,4);
  assert.equal(crearIndicacionPie(tirar(e,["espadas-06"]),2,0,"voy-a-vos",2,viejas)?.indiceAccion,5);
});

test("duelo, pico a pico y cierre anticipado carecen de señas y de opciones", () => {
  const cuatro = iniciarOnline(reparto(4));
  const truco = aplicar(cuatro,{tipo:"truco",asiento:0});
  const cerrada = aplicar(truco,{tipo:"no-quiero",asiento:1});
  for (const estado of [iniciarOnline(reparto(2)),iniciarOnline(reparto(6), [0,0],50,2),cerrada]) {
    for (const asiento of [0,1,2,3,4,5] as const) {
      assert.equal(vistaDelPie(estado, asiento, []), undefined);
      assert.equal(crearIndicacionPie(estado,asiento,0,"veni",1,[]), undefined);
    }
  }
});

test("el retiro y el rechazo de truco cierran las indicaciones mientras se cobran las flores", () => {
  const cartas: TresCartas[] = [...manos];
  cartas[1] = ["bastos-02", "bastos-04", "bastos-05"];
  const redondilla = iniciarOnline({ ...reparto(6), manos: cartas });
  const retiro = aplicar(redondilla, { tipo: "mazo", asiento: 0 });
  const parejas = iniciarOnline({ ...reparto(4), manos: cartas.slice(0, 4) });
  const truco = aplicar(parejas, { tipo: "truco", asiento: 0 });
  assert.ok(crearIndicacionPie(truco, 2, 0, "veni", 1, []));
  const rechazo = aplicar(truco, { tipo: "no-quiero", asiento: 3 });
  assert.equal(retiro.retiro, 0);
  assert.equal(rechazo.rechazoTruco, true);
  for (const [estado, pie] of [[retiro, 4], [rechazo, 2]] as const) {
    assert.equal(estado.resultado, null);
    assert.deepEqual(estado.consultaFlor, [1]);
    assert.deepEqual(vistaDelPie(estado, pie, [])?.opciones, []);
    assert.equal(crearIndicacionPie(estado, pie, 0, "veni", 1, []), undefined);
  }
});

test("el pie bot pide fuerza o baja según sus cartas y los gestos que recibió", () => {
  const r = reparto(4);
  const pedir = (reparto: RepartoOnline) => {
    const e = iniciarOnline(reparto);
    return elegirIndicacionesPie(vistaOnline(e,2),vistaDelPie(e,2,[])!);
  };
  assert.deepEqual(pedir(r), [{destinatario:0,frase:"juga",carta:"cejas"}]); // Ana señaló la pieza mayor que la de Clara.
  const otras = [...r.manos];
  otras[0] = ["copas-05","bastos-01","oros-04"];
  assert.deepEqual(pedir({...r,manos:otras}), [{destinatario:0,frase:"veni"}]);
  otras[0] = ["oros-11","espadas-05","oros-04"];
  otras[2] = ["oros-10","espadas-06","copas-07"];
  assert.deepEqual(pedir({...r,manos:otras}), []); // Ninguna mano tiene una fuerte.
  const e = tirar(iniciarOnline(r),["oros-04","bastos-06","copas-04","oros-12"]);
  assert.deepEqual(elegirIndicacionesPie(vistaOnline(e,2),vistaDelPie(e,2,[])!),[{destinatario:0,frase:"voy-a-vos"}]);
});

test("el consejo cambia una salida del bot, conserva su elección de canto y vence con la vuelta", () => {
  const e = iniciarOnline(reparto(4));
  const ana = vistaOnline(e,0);
  const cartas = {...ana, legales:["carta" as const]};
  const pie = vistaDelPie(e,0,[])!;
  const veni = crearIndicacionPie(e,2,0,"veni",1,[])!;
  const juga = crearIndicacionPie(e,2,0,"juga",1,[])!;
  assert.deepEqual(elegirAccionConPie(cartas,pie,[veni]), {tipo:"carta",asiento:0,carta:"oros-04"});
  assert.deepEqual(elegirAccionConPie(cartas,pie,[juga]), {tipo:"carta",asiento:0,carta:"copas-02"});
  assert.deepEqual(elegirAccionConPie(cartas,pie,[{...veni,vuelta:2}]), elegirAccionConPie(cartas,pie,[]));
  assert.deepEqual(elegirAccionConPie(ana,pie,[veni]), elegirAccionConPie(ana,pie,[]));
  const segunda = tirar(e,["oros-04","bastos-06","copas-04","oros-12"]);
  const propia = crearIndicacionPie(segunda,2,0,"voy-a-vos",2,[])!;
  const v = {...vistaOnline(segunda,2),legales:["carta" as const]};
  assert.deepEqual(elegirAccionConPie(v,vistaDelPie(segunda,2,[propia]),[propia]), {tipo:"carta",asiento:2,carta:"espadas-06"});
});

// El reparto 6 de la mesa ea5ed1d4 (#425): el mano tiene el 2 y el 4 de la muestra y el pie les pidió fuerza a los dos.
const reparto6: RepartoOnline = { versionReparto: "online-2", reglaFlor: "inmediata-v2", dador: 5, mano: 0, muestra: "espadas-11",
  manos: [["copas-11","espadas-04","espadas-02"], ["bastos-04","copas-12","oros-06"], ["espadas-10","copas-04","bastos-11"],
    ["copas-10","bastos-03","copas-03"], ["bastos-01","copas-07","oros-01"], ["bastos-02","bastos-05","copas-01"]] };

test("en tercetos el pie arma un solo plan: juega el más fuerte con la carta nombrada y los demás van chico", () => {
  const e = iniciarOnline(reparto6);
  const plan = elegirIndicacionesPie(vistaOnline(e,4), vistaDelPie(e,4,[])!);
  // El 4 de la muestra gana seguro: la única pieza mayor, el 2, también es del mano.
  assert.deepEqual(plan, [{destinatario:0,frase:"juga",carta:"beso"},{destinatario:2,frase:"veni"}]);
  const dichas: IndicacionPie[] = [];
  for (const p of plan) dichas.push(crearIndicacionPie(e,4,p.destinatario,p.frase,1,dichas,p.carta)!);
  assert.deepEqual(dichas.map(d => textoDeIndicacion(d)), ["Jugá el 4 de la muestra","Vení"]);
  assert.equal(textoDeIndicacion(dichas[0], reparto6.muestra), "Jugá el 4 de espadas");
});

test("si el pie tiene la mejor carta, les dice «Vení» a todos y no nombra cartas", () => {
  const manosPie = [...reparto6.manos];
  manosPie[4] = ["espadas-02","copas-07","oros-01"];
  manosPie[0] = ["copas-11","espadas-04","bastos-06"];
  const e = iniciarOnline({...reparto6, manos: manosPie});
  assert.deepEqual(elegirIndicacionesPie(vistaOnline(e,4), vistaDelPie(e,4,[])!),
    [{destinatario:0,frase:"veni"},{destinatario:2,frase:"veni"}]);
});

test("la carta nombrada es la pieza más baja que gana seguro, o la mejor que mostró el compañero", () => {
  assert.equal(cartaParaJugar(["cejas","beso"], new Set(["cejas","beso"])), "beso");
  assert.equal(cartaParaJugar(["beso","nariz"], new Set(["beso","nariz"])), "beso"); // El 2 puede estar en manos rivales.
  assert.equal(cartaParaJugar(["beso","nariz"], new Set(["cejas","beso","nariz"])), "nariz");
  assert.equal(cartaParaJugar(["labios-derecha","labio-inferior"], new Set()), "labios-derecha");
  assert.equal(cartaParaJugar(["ojos-cerrados"], new Set()), undefined);
  assert.equal(cartaParaJugar([], new Set()), undefined);
});

test("la carta sólo acompaña a «Jugá» y tiene que estar entre los gestos del destinatario", () => {
  const e = iniciarOnline(reparto6);
  assert.deepEqual(crearIndicacionPie(e,4,0,"juga",1,[],"cejas"),
    {emisor:4,destinatario:0,frase:"juga",carta:"cejas",vuelta:1,indiceAccion:0});
  for (const [destinatario, frase, carta] of [[0,"veni","cejas"],[0,"juga","nariz"],[0,"juga","ojos-cerrados"],
    [0,"juga","sarasa"],[0,"juga","__proto__"],[2,"juga","cejas"],[0,"juga",null]] as const) {
    assert.equal(crearIndicacionPie(e,4,destinatario,frase,1,[],carta), undefined);
  }
  assert.ok(crearIndicacionPie(e,4,2,"juga",1,[],"ojo-izquierdo"));
  assert.deepEqual(cartasPedidas(reparto6.manos[0], "beso", reparto6.muestra), ["espadas-04"]);
  assert.deepEqual(cartasPedidas(reparto6.manos[3], "labio-inferior", reparto6.muestra), ["bastos-03","copas-03"]);
});

test("la computadora que recibe «Jugá» con carta tira esa carta si alcanza para ganar la mesa", () => {
  const e = iniciarOnline(reparto6);
  const mano = {...vistaOnline(e,0), legales:["carta" as const]};
  const pie = vistaDelPie(e,0,[])!;
  const conCarta = crearIndicacionPie(e,4,0,"juga",1,[],"beso")!;
  const sinCarta = crearIndicacionPie(e,4,0,"juga",1,[])!;
  assert.deepEqual(elegirAccionConPie(mano,pie,[conCarta]), {tipo:"carta",asiento:0,carta:"espadas-04"});
  assert.deepEqual(elegirAccionConPie(mano,pie,[sinCarta]), {tipo:"carta",asiento:0,carta:"espadas-02"});
});

test("si la muestra es una pieza, el pie nombra el 12 del palo, que es la carta que tiene el compañero", () => {
  assert.deepEqual(gestosDeCartas(["copas-12"], "copas-10"), ["ojo-izquierdo"]);
  assert.equal(significadoDeGesto("ojo-izquierdo", "copas-10"), "12 de copas");
  assert.equal(textoDeIndicacion({ frase: "juga", carta: "ojo-izquierdo" }, "copas-10"), "Jugá el 12 de copas");
  assert.equal(textoDeIndicacion({ frase: "juga", carta: "ojo-derecho" }, "copas-10"), "Jugá el 11 de copas");
  assert.equal(significadoDeGesto("labio-inferior", "copas-03"), "Tres");
  assert.equal(textoDeIndicacion({ frase: "juga", carta: "ojo-izquierdo" }), "Jugá el 10 de la muestra");
});

test("con señas al pie, el pie de la computadora responde el envido del rival por sus compañeros humanos", () => {
  for (const cantidad of [4, 6] as const) {
    const inicio = iniciarOnline(reparto(cantidad));
    const pie = (cantidad - 1) as Asiento;
    const canto = aplicar(inicio, { tipo: "real-envido", asiento: 0 });
    assert.equal(pieQueResponde(canto, [1]), pie);
    if (cantidad === 6) assert.equal(pieQueResponde(canto, [1, 3]), pie);
    // Con el pie humano, cualquiera del equipo responde como antes.
    assert.equal(pieQueResponde(canto, [pie]), undefined);
    assert.equal(pieQueResponde(canto, [1, pie]), undefined);
    // Sin humanos que responden no hay nada que cambiar.
    assert.equal(pieQueResponde(canto, []), undefined);
    assert.equal(pieQueResponde(canto, [0]), undefined);
    assert.equal(pieQueResponde(inicio, [1]), undefined);
    // El truco sigue su curso: lo responde cualquiera del equipo.
    assert.equal(pieQueResponde(aplicar(inicio, { tipo: "truco", asiento: 0 }), [1]), undefined);
    // Una vez respondido, la mano sigue sin esperar al pie.
    assert.equal(pieQueResponde(aplicar(canto, { tipo: "quiero", asiento: pie }), [1]), undefined);
  }
});

test("el compañero humano que debe cantar su flor conserva su oportunidad ante el envido", () => {
  const conFlor = reparto(4);
  conFlor.manos = [conFlor.manos[0], ["bastos-04", "bastos-05", "bastos-06"], ...conFlor.manos.slice(2)];
  const canto = aplicar(iniciarOnline(conFlor), { tipo: "envido", asiento: 0 });
  assert.ok(vistaOnline(canto, 1).legales.includes("flor"));
  assert.equal(pieQueResponde(canto, [1]), undefined);
});
