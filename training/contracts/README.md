# Campeonato local de computadoras

El árbitro usa la versión 1 de la mesa en línea. El objetivo es ganar un chico de 40 tantos. Cada formato tiene su propia política, oponentes, artefactos y resultado. La guía de probabilidades conserva su motor y sus ejemplos.

## Reglas de la mesa y convenciones del campeonato

|Decisión|Origen|Aplicación|
|---|---|---|
|Reparto, piezas, parda y prioridad de flor|Mesa en línea V1|Tres rondas desde mano y luego la muestra. El reductor decide las jugadas y los cobros. La arena usa cartas indexadas por par y mano. El servidor usa su reparto criptográfico.|
|Tanteador y siguiente mano|Servicio de partidas V1|Sumar cada cobro una vez, limitar el tanteador a 40 y avanzar el dador un asiento. Calcular la falta con el tanteador inicial del puntero. Un envite puede terminar el chico antes de jugar una carta.|
|Respuesta conjunta|Convención de campeonato basada en el servidor para computadoras|Actúa el primer asiento de aDecidir en su orden original. Cada declaración de flor sigue su propio turno. Las mesas mixtas conservan la espera por un humano elegible.|
|Señas digitales|Variante de campeonato para parejas|Cualquiera de las 13 señas de la tabla de juego o silencio. Se permiten amagues. Se confirma gesto y jugada juntos, se publica el gesto antes de la jugada y luego los cobros. Silencio se codifica como la jugada ordinaria.|
|Azar y selección|Convención de campeonato|El árbitro separa reparto, decisiones de cada asiento, entrenamiento y evaluación. La política devuelve una distribución ordenada por acciones legales. El muestreo ocurre fuera del actor.|

## Frontera de información

Cada asiento recibe sus cartas originales y restantes, el orden relativo de los asientos, muestra, mano, dador, los dos tanteadores y la meta. El historial conserva los turnos públicos en orden, con todos los cobros de cada acción, incluso los diferidos por consultas de flor. Las comparaciones se copian de los cobros públicos de la versión del motor usada. La observación distingue el truco pendiente debajo del envite y los tantos base de aceptación o rechazo. Para flor, el total incluye los tantos de las declaraciones públicas según el equipo ganador y el tipo de envite.

Cada carta tiene su ID de baraja y cada canto su ID del reductor. En parejas con señas, una jugada con gesto usa el ID del gesto, una barra y el ID de la jugada. Un actor terminal tiene una lista legal y una distribución vacías. Una política de asiento no recibe la mano del compañero, las semillas, el árbitro ni etiquetas del crítico. Los repartos y las semillas pertenecen al replay privado. Para una transcripción pública se proyectan exclusivamente los turnos, los tanteadores y la información visible.

## Versionado y activación

Los identificadores de reglas, campeonato, observación, acciones, replay, formato de checkpoint y formato de exportación se declaran en index.ts. Cada actor exportado requiere además una identidad de política y un hash del contenido. Cambiar la semántica de un campo, el orden de acciones o la convención de señas exige un identificador nuevo y fixtures para cada versión admitida. Verificar los hashes antes de cargar un artefacto.

V1 sigue activo en los tres formatos hasta que se pueda fijar un candidato compatible y su campo de evaluación. La activación será local y explícita por formato tras el campeonato. El servicio debe registrar la jugada confirmada y el uso de V1 ante plazo vencido o artefacto incompatible. La reversión seleccionará el actor compatible anterior para partidas nuevas. Las partidas iniciadas conservan la política fijada o la alternativa registrada. La publicación requiere otra autorización.

## Fixtures

fixtures.json contiene repartos sintéticos de árbitro y transcripciones, con las proyecciones esperadas en apertura, oferta y cierre. En duelo el quiero dispara 40 tantos; en parejas se liquidan al terminar la última consulta de flor. El fixture con señas incluye un gesto público antes de la falta. La prueba compara el reductor y la lectura pública de cobros.

Desde la raíz con Node 24, ejecutar `node --test tests/unit/training-contracts.test.ts`. SHA-256 del pack `5a6f1926b367d14bb68336a5a4381c7e5fa93e66605f8ed92f947d2e894cca28`. El registro de dependencias, responsables y verificaciones se mantiene en el [issue de coordinación](https://github.com/flabat/truco-uruguayo/issues/118).
