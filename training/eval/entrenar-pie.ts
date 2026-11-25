import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aDecidir, aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { elegirAccionConPie, elegirIndicacionesPie } from "@eltruco/motor/bot-pie.ts";
import { elegirAccionModeloPie, type ModeloPie } from "@eltruco/motor/modelo-pie.ts";
import { crearIndicacionPie, vistaDelPie, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { esMetaDeChico } from "@eltruco/motor/chico.ts";
import { equipoDelAsiento, type Asiento } from "@eltruco/motor/reparto.ts";
import { scheduledDeal } from "../arena/index.ts";

const formato = "pairs-private-senas";
const asientos: Asiento[] = [0, 1, 2, 3];

function cruce(modelo: ModeloPie, semilla: number, pares: number, verificar = false, meta = 40) {
  let victorias = 0, manos = 0, decisiones = 0, privadas = 0, sumCuadrados = 0;
  for (let par = 0; par < pares; par++) {
    let victoriasPar = 0;
    for (const equipo of [0, 1] as const) {
      let puntos: [number, number] = [0, 0];
      for (let mano = 0; Math.max(...puntos) < meta; mano++) {
        const reparto = scheduledDeal(formato, semilla, par, mano);
        let estado = iniciarOnline({ ...reparto, reglaFlor: "inmediata-v2", respondenSinFlor: asientos }, puntos, meta);
        const palabras: IndicacionPie[] = [];
        let anterior = 0;
        while (!estado.resultado) {
          const vuelta = estado.mano.vueltas.length + 1;
          if (anterior !== vuelta) {
            anterior = vuelta;
            for (const asiento of asientos) {
              const pie = vistaDelPie(estado, asiento, palabras);
              if (pie?.pie !== asiento) continue;
              if (verificar) {
                for (const grupo of pie.grupos) {
                  assert.equal(equipoDelAsiento(grupo.emisor), equipoDelAsiento(asiento));
                  const emisor = vistaDelPie(estado, grupo.emisor, palabras);
                  assert.deepEqual(emisor?.grupos, [grupo]);
                  for (const rival of asientos.filter(lugar => equipoDelAsiento(lugar) !== equipoDelAsiento(asiento))) {
                    assert.ok(!vistaDelPie(estado, rival, palabras)?.grupos.some(g => g.emisor === grupo.emisor));
                    const vista = vistaOnline(estado, rival);
                    assert.ok(!("grupos" in vista));
                    privadas++;
                  }
                }
              }
              for (const propuesta of elegirIndicacionesPie(vistaOnline(estado, asiento), pie)) {
                const palabra = crearIndicacionPie(estado, asiento, propuesta.destinatario, propuesta.frase, vuelta, palabras);
                assert.ok(palabra);
                palabras.push(palabra);
              }
            }
          }
          const asiento = aDecidir(estado)[0];
          const vista = vistaOnline(estado, asiento);
          const pie = vistaDelPie(estado, asiento, palabras);
          const accion = equipoDelAsiento(asiento) === equipo
            ? elegirAccionModeloPie(modelo, vista, pie, palabras) : elegirAccionConPie(vista, pie, palabras);
          assert.ok(accion);
          const paso = aplicarOnline(estado, accion);
          assert.ok(paso.ok);
          decisiones++;
          estado = paso.estado;
        }
        manos++;
        puntos = marcadorOnline(estado);
      }
      if (puntos[equipo] === meta) victoriasPar++;
    }
    victorias += victoriasPar;
    sumCuadrados += (victoriasPar / 2) ** 2;
  }
  const tasa = victorias / (2 * pares);
  const error = pares > 1 ? Math.sqrt((sumCuadrados / pares - tasa ** 2) / (pares - 1)) : 0;
  return { chicos: 2 * pares, victorias, tasa, limiteInferior95: tasa - 1.96 * error, manos, decisiones, privadas };
}

const opciones = {
  envido: [24, 26, 28, 30, 32, 45],
  real: [27, 29, 31, 33, 45],
  falta: [32, 33, 34, 35, 36, 38, 45],
  aceptar: [22, 25, 27, 29, 31],
  aceptarFalta: [28, 30, 32, 33, 35, 45],
  cubrir: [-1, 0, 2, 4, 6, 8],
} satisfies Record<keyof ModeloPie, number[]>;

function entrenar(semilla: number, pares: number) {
  let modelo = { envido: 28, real: 31, falta: 35, aceptar: 25, aceptarFalta: 25, cubrir: -1 };
  let resultado = cruce(modelo, semilla, pares);
  for (let epoca = 0; epoca < 2; epoca++) {
    for (const rasgo of Object.keys(opciones) as (keyof ModeloPie)[]) {
      for (const valor of opciones[rasgo]) {
        if (modelo[rasgo] === valor) continue;
        const candidato = { ...modelo, [rasgo]: valor };
        const prueba = cruce(candidato, semilla, pares);
        if (prueba.victorias > resultado.victorias) {
          modelo = candidato;
          resultado = prueba;
        }
      }
    }
    console.error(JSON.stringify({ epoca, modelo, resultado }));
  }
  return { formato, modelo, semilla, resultado };
}

const [modo, semillaCruda, paresCrudos, archivo, metaCruda = "40"] = process.argv.slice(2);
const semilla = Number(semillaCruda), pares = Number(paresCrudos);
assert.ok(Number.isSafeInteger(semilla) && semilla >= 0 && Number.isSafeInteger(pares) && pares > 1);
if (modo === "entrenar") {
  console.log(JSON.stringify(entrenar(semilla, pares), null, 2));
} else if (modo === "evaluar" && archivo) {
  const meta = Number(metaCruda);
  assert.ok(esMetaDeChico(meta));
  const entrenamiento = JSON.parse(readFileSync(archivo, "utf8"));
  assert.notEqual(semilla, entrenamiento.semilla);
  assert.equal(entrenamiento.formato, formato);
  console.log(JSON.stringify({ formato, semilla, meta, modelo: entrenamiento.modelo,
    resultado: cruce(entrenamiento.modelo, semilla, pares, true, meta) }, null, 2));
} else {
  throw new Error("Uso: entrenar <semilla> <pares> | evaluar <semilla> <pares> <modelo.json>");
}
