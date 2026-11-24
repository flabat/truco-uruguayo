import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { familiasPorHabilidad } from "../../src/aprendizaje/generadores/familias.ts";
import { generarMano, leerEpisodio, resolverManos, type EpisodioTantos } from "../src/lib/episodio.ts";

const base: EpisodioTantos = {
  plantilla: "contar-tantos", serie: "contar-envido", id: "03", modalidad: "envido", muestra: "espadas-03",
  gancho: "¿Cuánto tenés de envido?",
  manos: [["oros-05", "oros-07", "copas-02"], { cambio: { de: "oros-05", a: "espadas-05" } },
    { familia: "tres-palos-distintos", semilla: 41 }],
};

function yaml(texto: string) {
  const ruta = path.join(mkdtempSync(path.join(tmpdir(), "episodio-")), "ep.yaml");
  writeFileSync(ruta, texto);
  return ruta;
}

test("lee un episodio YAML", () => {
  const ep = leerEpisodio(yaml(`plantilla: contar-tantos
serie: contar-envido
id: "03"
modalidad: envido
muestra: espadas-03
gancho: "¿Cuánto tenés de envido?"
manos:
  - [oros-05, oros-07, copas-02]
  - cambio: { de: oros-05, a: espadas-05 }
  - { familia: tres-palos-distintos, semilla: 41 }
lineas:
  valores: null
`));
  assert.deepEqual(ep, { ...base, lineas: { valores: null } });
});

test("un YAML inválido nombra el campo", () => {
  assert.throws(() => leerEpisodio(yaml(`plantilla: contar-tantos
serie: s
id: "1"
modalidad: envido
muestra: espadas-03
gancho: g
manos:
  - [oros-05, oros-07, copas-02]
  - cambio: { de: oros-05, a: espadas-99 }
  - [copas-01, oros-06, bastos-11]
`)), /manos\.1\.cambio\.a/);
});

test("resuelve una mano escrita, un cambio y una generada", () => {
  const [a, b, c] = resolverManos(base);
  assert.equal(a.tantos.total, 32);
  assert.deepEqual(b.cartas, ["espadas-05", "oros-07", "copas-02"]);
  assert.deepEqual(b.cambio, { de: "oros-05", a: "espadas-05" });
  assert.equal(b.tantos.total, 35);
  assert.equal(c.tantos.forma, "tres-palos-distintos");
});

test("la misma semilla da la misma mano", () => {
  assert.deepEqual(resolverManos(base)[2].cartas, resolverManos(base)[2].cartas);
});

test("rechaza una flor en un episodio de envido", () => {
  const ep = { ...base, muestra: "bastos-06" as const, manos: [["copas-01", "copas-02", "copas-03"], { cambio: { de: "copas-01", a: "oros-01" } }, ["oros-04", "copas-07", "espadas-01"]] } as EpisodioTantos;
  assert.throws(() => resolverManos(ep), /La mano 1 es flor, pero el episodio es de envido/);
});

test("una familia ajena a la modalidad lista las válidas", () => {
  const ep = { ...base, modalidad: "flor", manos: [["oros-07", "oros-04", "oros-12"], { cambio: { de: "oros-12", a: "espadas-11" } }, { familia: "una-pieza", semilla: 1 }] } as EpisodioTantos;
  assert.throws(() => resolverManos(ep), (e: Error) => /una-pieza/.test(e.message) && /dos-piezas/.test(e.message));
});

test("toda familia de contar tantos se resuelve", () => {
  for (const modalidad of ["envido", "flor"] as const) {
    for (const familia of familiasPorHabilidad[modalidad === "envido" ? "contar-envido" : "contar-flor"]) {
      for (let semilla = 1; semilla <= 5; semilla++) {
        const mano = generarMano(familia, "espadas-03", semilla, modalidad);
        assert.equal(mano.tantos.modalidad, modalidad, `${familia}/${semilla}`);
        assert.equal(mano.cartas.length, 3);
      }
    }
  }
});

test("un cambio con una carta ausente falla", () => {
  const ep = { ...base, manos: [base.manos[0], { cambio: { de: "bastos-07", a: "espadas-05" } }, base.manos[2]] } as EpisodioTantos;
  assert.throws(() => resolverManos(ep), /bastos-07/);
});

test("la segunda mano debe ser un cambio de la primera", () => {
  const ep = { ...base, manos: [base.manos[0], ["oros-04", "copas-07", "espadas-01"], base.manos[2]] } as EpisodioTantos;
  assert.throws(() => resolverManos(ep), /cambio/);
});
