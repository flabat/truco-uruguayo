import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as esperar } from "node:timers/promises";
import { expect } from "@playwright/test";

const basicas = ["flor", "paso-flor", "quiero", "carta"];
const apuestas = ["flor", "paso-flor", "contraflor-al-resto", "falta-envido", "quiero", "carta"];
const espera = { timeout: 20_000 };

function eleccion(vista, preferencias) {
  const tipo = preferencias.find(t => vista.legales.includes(t));
  assert.ok(tipo, "Falta una respuesta a " + JSON.stringify(vista.legales));
  return tipo === "carta" ? { tipo, carta: vista.cartas[0] } : { tipo };
}

function comprobarEspera(p) {
  assert.equal(p.vista.estado, "esperando");
  assert.deepEqual(p.vista.legales, []);
  for (const clave of ["cartas", "tantosPropios", "manos", "restantes"]) {
    assert.ok(!(clave in p.vista), "Campo privado en espera: " + clave);
  }
}

export async function probarTercetos(paginas, { crear, invitar, partida, jugar, boton, tapete, ruta }) {
  const [ana] = paginas;
  async function comando(p, version, accion) {
    const res = await p.request.post(ruta(p) + (accion ? "/acciones" : "/siguiente"), {
      data: { id: randomUUID(), version, ...(accion && { accion }) },
      headers: { origin: new URL(p.url()).origin },
    });
    assert.equal(res.status(), 200, await res.text());
    return res.json();
  }

  await crear(ana, "3v3");
  for (const [i, p] of paginas.slice(1).entries()) {
    await invitar(p, ana, [undefined, undefined, undefined, "eva", "luis"][i]);
  }
  await Promise.all(paginas.map(p => expect(tapete(p)).toBeVisible(espera)));
  const inicial = await Promise.all(paginas.map(partida));
  const reparto = inicial.flatMap(p => p.vista.cartas);
  assert.equal(new Set([...reparto, inicial[0].vista.muestra]).size, 19);
  for (const [i, p] of inicial.entries()) {
    assert.equal(p.meta, 50);
    assert.equal(p.formato, "triples");
    assert.equal(p.vista.asiento, i);
    assert.equal(p.lance.tipo, "redondilla");
    assert.deepEqual(p.vista.equipoPorAsiento, [0,1,0,1,0,1]);
    for (const carta of reparto.filter(c => !p.vista.cartas.includes(c))) {
      assert.ok(!JSON.stringify(p).includes(carta), "Carta ajena visible en el primer reparto.");
    }
  }
  const primerActor = inicial.findIndex(p => p.vista.legales.length);
  await jugar(paginas[primerActor], eleccion(inicial[primerActor].vista, basicas).tipo);

  let ausente = null, regreso = false, primeraMuestraPico;
  let anterior;
  for (let paso = 0; ; paso++) {
    assert.ok(paso < 1400, "El chico con seis humanos debe progresar.");
    const presentes = paginas.filter((_, i) => i !== ausente);
    const vistas = await Promise.all(presentes.map(partida));
    const actual = vistas[0];
    if (anterior && anterior.manoNumero !== actual.manoNumero) {
      assert.equal(actual.vista.dador, (anterior.vista.dador + 1) % 6);
      const correspondePico = anterior.lance.tipo === "redondilla" && Math.max(...anterior.puntos) < 25;
      assert.equal(actual.lance.tipo, correspondePico ? "pico-a-pico" : "redondilla");
      assert.deepEqual(actual.puntos, anterior.puntos);
    }
    anterior = actual;
    if (actual.ganadorPartida !== null) {
      assert.equal(actual.puntos[actual.ganadorPartida], 50);
      assert.ok(regreso, "Falta probar la reconexión en el segundo duelo.");
      await Promise.all(paginas.map(p => expect(boton(p, "Repartir otra mano")).toHaveCount(0)));
      console.log("Seis jugadores por invitación: chico a 50, rotación del dador y reconexión durante el pico.", actual.puntos);
      break;
    }
    if (actual.manoNumero === 2 && !actual.vista.resultado) {
      assert.equal(actual.lance.tipo, "pico-a-pico");
      primeraMuestraPico ??= actual.vista.muestra;
      assert.equal(actual.vista.muestra, primeraMuestraPico);
      for (const p of vistas.filter(p => !actual.lance.activos.includes(p.vista.asiento))) comprobarEspera(p);
      if (actual.lance.duelo === 1 && ausente === null && !regreso) {
        ausente = (actual.lance.activos[0] + 1) % 6;
        comprobarEspera(vistas[ausente]);
        await paginas[ausente].goto("about:blank");
        continue;
      }
      if (actual.lance.duelo === 2 && ausente !== null) {
        assert.ok(actual.lance.activos.includes(ausente));
        assert.ok(vistas.every(p => p.vista.legales.length === 0), "La mesa espera al mano ausente.");
        await paginas[ausente].goto(presentes[0].url());
        await expect(paginas[ausente].getByRole("status").filter({hasText: "Duelo 2 de 3"})).toBeVisible(espera);
        const recuperada = await partida(paginas[ausente]);
        assert.equal(recuperada.version, actual.version);
        assert.equal(recuperada.vista.asiento, ausente);
        assert.equal(recuperada.vista.cartas.length, 3);
        ausente = null;
        regreso = true;
        continue;
      }
    }
    if (actual.vista.resultado) {
      await comando(presentes[0], actual.version);
    } else {
      const i = vistas.findIndex(p => p.vista.legales.length);
      assert.notEqual(i, -1);
      const accion = eleccion(vistas[i].vista, actual.manoNumero < 3 ? basicas : apuestas);
      await comando(presentes[i], actual.version, accion);
    }
  }

  await crear(ana, "3v3", true, 26);
  await expect(tapete(ana)).toBeVisible(espera);
  const mesa = await (await ana.request.get(ruta(ana))).json();
  assert.deepEqual(mesa.asientos.map(a => a.tipo), ["humano", ...Array(5).fill("computadora")]);
  assert.equal(mesa.politica, "tercetos-basica-v1");
  let progreso = 0, plazo = Date.now() + 20_000, recargada = false;
  for (;;) {
    assert.ok(Date.now() < plazo, "Un turno de la mesa con cinco computadoras quedó detenido.");
    const actual = await partida(ana);
    assert.equal(actual.meta, 26);
    if (actual.version > progreso) {
      progreso = actual.version;
      plazo = Date.now() + 20_000;
    }
    assert.ok(progreso < 1800, "El chico mixto debe alcanzar su meta.");
    if (actual.ganadorPartida !== null) {
      assert.equal(actual.puntos[actual.ganadorPartida], 26);
      assert.ok(recargada);
      console.log("Una persona y cinco computadoras terminaron el chico a 26.", actual.puntos);
      break;
    }
    if (!recargada) {
      await ana.reload();
      await expect(tapete(ana)).toBeVisible(espera);
      recargada = true;
    } else if (actual.vista.resultado) {
      await comando(ana, actual.version);
    } else if (actual.vista.legales.length) {
      await comando(ana, actual.version, eleccion(actual.vista, apuestas));
    } else {
      await esperar(35);
    }
  }
}
