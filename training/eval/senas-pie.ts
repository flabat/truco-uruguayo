import assert from "node:assert/strict";
import { aDecidir, aplicarOnline, iniciarOnline, marcadorOnline, vistaOnline } from "@eltruco/motor/mesa-online.ts";
import { accionesPie, elegirAccionConPie, elegirIndicacionesPie, observacionPie, politicaPie } from "@eltruco/motor/bot-pie.ts";
import { crearIndicacionPie, versionSenasPie, vistaDelPie, type IndicacionPie } from "@eltruco/motor/senas-pie.ts";
import { equipoDelAsiento, type Asiento, type Equipo } from "@eltruco/motor/reparto.ts";
import { scheduledDeal, streamVersion } from "../arena/index.ts";

const formato = "pairs-private-senas";
const asientos: Asiento[] = [0, 1, 2, 3];
const condiciones = [
  { nombre: "silencio", gestos: false, palabras: false },
  { nombre: "solo-gestos", gestos: true, palabras: false },
  { nombre: "solo-palabras", gestos: false, palabras: true },
  { nombre: "completo", gestos: true, palabras: true },
] as const;

function evaluar(condicion: typeof condiciones[number], semilla: number, pares: number) {
  const datos = { ...condicion, chicos: pares * 2, victorias: 0, manos: 0, oportunidades: 0,
    frases: { veni: 0, juga: 0, "voy-a-vos": 0 }, cartasConPedido: 0, cartasDistintasPorPedido: 0 };
  for (let par = 0; par < pares; par++) {
    for (const equipo of [0, 1] as const) {
      let puntos: [number, number] = [0, 0];
      for (let mano = 0; Math.max(...puntos) < 40; mano++) {
        const reparto = scheduledDeal(formato, semilla, par, mano);
        let estado = iniciarOnline({ ...reparto, reglaFlor: "inmediata-v2", respondenSinFlor: asientos }, puntos, 40);
        const indicaciones: IndicacionPie[] = [];
        let ultimaVuelta = 0;
        const privado = (asiento: Asiento) => {
          const pie = vistaDelPie(estado, asiento, indicaciones)!;
          for (const grupo of pie.grupos) {
            assert.equal(equipoDelAsiento(grupo.emisor), equipoDelAsiento(asiento));
            assert.ok(grupo.emisor === asiento || pie.pie === asiento);
          }
          return equipoDelAsiento(asiento) === equipo && condicion.gestos ? pie : { ...pie, grupos: [] };
        };
        while (!estado.resultado) {
          const vuelta = estado.mano.vueltas.length + 1;
          if (vuelta !== ultimaVuelta) {
            ultimaVuelta = vuelta;
            for (const asiento of asientos) {
              if (equipoDelAsiento(asiento) !== equipo) continue;
              const pie = privado(asiento);
              if (asiento !== pie.pie) continue;
              datos.oportunidades += pie.opciones.length;
              if (!condicion.palabras) continue;
              const propuestas = elegirIndicacionesPie(vistaOnline(estado, asiento), pie);
              for (const propuesta of propuestas) {
                const frase = crearIndicacionPie(estado, asiento, propuesta.destinatario, propuesta.frase, vuelta, indicaciones);
                assert.ok(frase);
                indicaciones.push(frase);
                datos.frases[frase.frase]++;
              }
            }
          }
          const asiento = aDecidir(estado)[0];
          const vista = vistaOnline(estado, asiento);
          const pie = privado(asiento);
          const accion = elegirAccionConPie(vista, pie, indicaciones);
          assert.ok(accion);
          const pedido = indicaciones.find(i => i.destinatario === asiento && i.vuelta === vuelta);
          if (pedido && accion.tipo === "carta") {
            datos.cartasConPedido++;
            // Misma decisión, mismas cartas, mismos hechos. Sólo se omite la palabra dirigida al bot.
            const sinPedido = elegirAccionConPie(vista, pie, indicaciones.filter(i => i !== pedido));
            assert.ok(sinPedido?.tipo === "carta");
            if (accion.carta !== sinPedido.carta) datos.cartasDistintasPorPedido++;
          }
          const paso = aplicarOnline(estado, accion);
          assert.ok(paso.ok);
          estado = paso.estado;
        }
        datos.manos++;
        puntos = marcadorOnline(estado);
      }
      const ganador: Equipo = puntos[0] === 40 ? 0 : 1;
      if (ganador === equipo) datos.victorias++;
    }
  }
  return datos;
}

const [semilla = 314, pares = 64] = process.argv.slice(2).map(Number);
if (![semilla, pares].every(Number.isSafeInteger) || semilla < 0 || pares < 1) throw new Error("Uso: node training/eval/senas-pie.ts [semilla] [pares]");
console.log(JSON.stringify({ formato, versionSenas: versionSenasPie, politica: politicaPie, observacion: observacionPie,
  acciones: accionesPie, repartos: streamVersion, semilla, pares, resultados: condiciones.map(c => evaluar(c, semilla, pares)) }, null, 2));
