# Campeonato local de noviembre de 2026

Chicos digitales a 40 entre computadoras. Se usaron reglas `online-1`, competencia `chico-40-v1` y, en el formato correspondiente, `senas-publicas-v1`. Cada campo incluyó al incumbente V1, cinco estilos, un oponente entrenado de forma independiente y un contrajugador entrenado contra el candidato exacto. El duelo incluyó además el retador de la falta inicial. En parejas se jugó tanto con equipo propio como con un compañero de otra semilla que el candidato no había visto.

## Decisiones

| Formato | Chicos | Pares por cruce | Contra V1, IC simultáneo 95 % | Peor cambio por familia, IC simultáneo | Decisión |
| --- | ---: | ---: | --- | --- | --- |
| Duelo | 9216 | 256 | 15,82 % (11,52 % a 20,12 %) | caller/fixed, -41,6 pp (-48,8 a -34,6 pp) | fallido |
| Parejas sin señas | 16384 | 256 | 32,03 % (26,37 % a 37,50 %) | strong-cards/fixed, -38,3 pp (-45,3 a -31,2 pp) | fallido |
| Parejas con señas públicas | 16384 | 256 | 31,25 % (25,59 % a 36,91 %) | strong-cards/fixed, -36,1 pp (-43,2 a -29,1 pp) | fallido |

La comparación directa usa el equipo propio contra V1. Cada cambio por familia compara candidato y V1 frente al mismo rival sobre los mismos repartos, desde ambos equipos. Los intervalos remuestrean secuencias completas 10.000 veces, con corrección de Bonferroni para la comparación directa y cada cambio por familia. Para aprobar se exigió un límite inferior directo superior al 50 % y un límite inferior de cambio superior a −2 puntos porcentuales en todas las familias. La regla de decisión también exige integridad del campo y una tasa de fallback admisible.

Los tres límites superiores directos quedaron por debajo del 50 %. La decisión es conservar V1 en duelo y en ambas variantes de parejas. La activación de los candidatos se ensayó en un stack local descartable y se revirtió. La fuerza frente a jugadores humanos sigue sin evaluarse.

## Servicio y archivos verificados

| Formato | Decisiones del candidato | p50 / p95 / p99 (ms) | Fallback | Diferencia mínima detectable estimada | Plan SHA-256 |
| --- | ---: | --- | --- | --- | --- |
| [Duelo](duel.json) | 153309 | 0,026 / 0,058 / 0,099 | 0,00 % | 12,2 pp | `0bc5055db4fda618809d74cf7f5745c3b7d20f9f4bb05200d19b6bc5ebd79cdb` |
| [Parejas sin señas](pairs.json) | 219648 | 0,030 / 0,067 / 0,108 | 0,00 % | 13,2 pp | `fbd100cd8d9548d2fb9601070e0ff4d1582185b13aa66fddea6213ffe33d3416` |
| [Parejas con señas públicas](pairs-senas.json) | 230048 | 0,046 / 0,100 / 0,158 | 0,00 % | 12,6 pp | `22115dfe4d0add0185dd0a793174ffe5573884daeb430bebcfab824c5ac3b424` |

Cada archivo de formato conserva la huella del manifiesto privado, los actores y sus pines, las latencias, los puntos por canto y las bandas de tanteador. El ejemplo público reproduce la primera manga contra el contrajugador. Se usaron el mismo motor y trabajador de inferencia que en el servidor, un plazo de 200 ms y un máximo de 0,5 % de fallback. La búsqueda quedó desactivada en los tres formatos.

La verificación integral del build pasó 194 pruebas unitarias y 104 casos de navegador en cada una de las dos rutas del sitio. Otro checkout regeneró los informes a partir de las jugadas. En el stack local se registraron los tres pines del campeonato y se verificó un chico completo con cada uno. Tras la reversión, el registro devolvió `incumbent-online-v1` para los tres formatos. La prueba de caída anterior al commit, confirmación única y reinicio también pasó. El log de este ensayo está en `runs/championship-118/candidate-stack.log`, SHA-256 `b224b8d8216c0dc178391cb225b033175b1b5eac29cdb762ffd2b505333d1d8c`.

## Compañeros, señas y promoción suplementaria

La promoción suplementaria jugó 2.688 chicos por formato, con equipos fijos y siete rivales de igual peso. El séptimo rival fue un checkpoint anterior de otro linaje. El cuadro muestra la tasa directa contra V1 y su intervalo simultáneo.

| Formato | Victoria frente a V1 |
| --- | ---: |
| Duelo | 17,19 % (10,42 % a 25,00 %) |
| Parejas sin señas | 33,33 % (25,00 % a 41,67 %) |
| Parejas con señas públicas | 30,73 % (22,40 % a 39,06 %) |

En los repartos públicos de desarrollo, con compañero propio frente a V1, el equipo de señas ganó 22/96 con gestos y 28/96 al ocultarlos y permitir solo silencio. El archivo de cruces incluye las nueve combinaciones de compañero y rival. [Cruces y enmascaramiento](crossplay.json) · [Promoción suplementaria](promotion.json)

## Aprendizaje y recursos

El perfil destinó cinco minutos a cada una de tres semillas por formato. El piloto reservó dos horas a cada formato y alternó las tres semillas por tiempo consumido. Frente al perfil, el cambio medio fue +0,98 puntos porcentuales en duelo (IC 95 % −1,79 a +3,76), +0,52 en parejas (−2,26 a +3,70) y −2,14 con señas (−6,31 a +1,56). Ningún formato alcanzó el criterio de extensión. Se ensayó una variación de representación en duelo y otra de rivales en parejas. La liga trabajó en la CPU del M5 tras medir el paso completo con CPU y Metal. El registro público conserva crecimiento, consumo, resultados por semilla, matrices y SHA-256 de los checkpoints. [Registro de la liga local](../../../league/results/local-2026-11-18.json)

## Reproducción local

Usá Node 24 y la revisión que figura en el registro público del formato. Guardá los archivos grandes en `runs/`. La liga conserva cada checkpoint bajo `runs/league-130-01/snapshots/<etapa>/<formato>/<semilla>/checkpoint`, y los pesos finales bajo `runs/league-130-01/championship-input/<formato>/`. El árbitro conserva la clave local y los artefactos junto al plan. Los paquetes por secuencia viven en `runs/championship-118/evaluation/<formato>/`. Se puede verificar el resultado desde otro checkout con el mismo build.

Se reanudó una copia de cada uno de los tres checkpoints finales en un checkout independiente. El argumento indica el total al que se desea llegar.

| Formato | Semilla | SHA-256 del checkpoint del piloto | Argumento probado |
| --- | ---: | --- | --- |
| duel | 73061 | `fa10fa6491223fc70ae885a32d82d380f9e49d08bd573b0d1b42c4b2bafee1b4` | `--iterations 486401` |
| pairs | 72043 | `6778687b05e0e261e89ac158276fcac58a49a46024dd0f5d2b1405fbb31c15e7` | `--matches 25092` |
| pairs-senas | 73061 | `491102759f6678a90937710b32e0b96841e10c04e6bfd0a5148301e6edd60337` | `--matches 17560` |

```sh
uv sync --frozen --project training/partners/python
export TRUCO_PYTHON="$PWD/training/partners/python/.venv/bin/python"
COPY_DIR=$(mktemp -d)
cp runs/league-130-01/snapshots/pilot/pairs/72043/checkpoint "$COPY_DIR/checkpoint"
npm run train -- --resume "$COPY_DIR/checkpoint" --matches 25092
```

```sh
FORMAT=duel
PLAN_SHA256=0bc5055db4fda618809d74cf7f5745c3b7d20f9f4bb05200d19b6bc5ebd79cdb
PLAN=runs/championship-118/plans/$FORMAT/plan.json
OUTPUT=runs/championship-118/evaluation/$FORMAT
# Para otra modalidad, cambiá FORMAT y usá el compromiso de su fila.
node training/championship/event.ts verify --plan "$PLAN" --expected "$PLAN_SHA256" --output "$OUTPUT" --record "$OUTPUT/publico.json"
shasum -a 256 "$OUTPUT/manifest.json"
# Registrar, activar los tres pines y revertir a V1 en un stack descartable.
TEST_CHAMPIONSHIP_ROOT="$PWD/runs/championship-118/plans" npm run check:stack
```

Las pruebas del motor reprodujeron la falta 40–0, los 5.000 chicos históricos y 3.000 chicos de arena. El registro de ingeniería contiene las mediciones independientes de CPU/Metal, latencia y calibración de búsqueda. [Evidencia de ingeniería](engineering.json) · [Entrenamiento y reanudación](../../../README.md) · [Operación de políticas](../../../../api/README-politicas.md) · [Coordinación y revisiones](https://github.com/flabat/truco-uruguayo/issues/118)
