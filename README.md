# El Truco

Truco uruguayo con muestra para jugar en el navegador. La misma aplicación reúne las mesas de duelo, parejas y tercetos, la guía de reglas con sus fuentes y la práctica individual.

## Desarrollo local

Para jugar una partida, levantá la aplicación completa con Docker Compose desde la raíz del repositorio.

```sh
eval "$(node scripts/version.mjs --exportar)" && docker compose up --build --wait
```

Abrí [El Truco](http://localhost:8081/). Podés leer las reglas o practicar como invitado. Para crear una mesa o aceptar una invitación, ingresá con una de las cuentas de prueba de la [guía del entorno local](docs/entorno-local.md). Compose levanta la web, la API que aplica el motor de juego, PostgreSQL y el proveedor de identidad.

Para trabajar solo en la interfaz, usá Node.js 24 y npm.

```sh
npm ci
npm run dev
```

Abrí la dirección que imprime Astro. Para revisar la interfaz compilada en `dist/`, ejecutá los siguientes comandos. Tanto el servidor de desarrollo como la vista previa sirven la guía y la práctica individual. Las mesas multijugador requieren los servicios de Compose.

```sh
npm run build
npm run preview
```

## Producción

La [guía del VPS](docs/produccion.md) incluye el despliegue con Docker Compose, HTTPS, cuentas, copias externas y el ensayo local de recuperación. Para cambiar la cantidad de mesas en vivo, pausar las exhibiciones o recuperar el servicio, seguí el [procedimiento de operación del salón](docs/multijugador/salon-en-vivo/operacion.md).

## Contenido y componentes

Las páginas se editan en `src/pages/` y las reglas con sus fuentes en `src/data/`. Astro compila la interfaz para la raíz del sitio.

El [diseño de la ruta de aprendizaje](docs/aprendizaje/README.md) describe el motor de reglas, el simulador reproducible de parejas y la autoría de lecciones. El [plan por fases](docs/aprendizaje/plan.md) enlaza los issues y sus dependencias para implementar en paralelo.

La [guía de entrenamiento local](training/README.md) permite entrenar rivales de computadora para duelos y parejas, reproducir chicos y verificar la evaluación por formato.

El [formato de replay de un chico](docs/multijugador/replay-chico.md) incluye cuatro partidas de referencia y un ejemplo para reconstruir una jugada desde el asiento que la vio.

El [diseño del juego de a seis](docs/multijugador/tercetos/README.md) describe la mesa de tres contra tres, la meta configurable de 50 tantos y los tres duelos de un pico a pico. El [plan de implementación](docs/multijugador/tercetos/implementacion.md) reúne las dependencias y las pruebas de cada entrega.

## Trabajo en el repositorio

Seguí la [guía de contribución](CONTRIBUTING.md) para reservar un issue, trabajar en una rama aislada y abrir un pull request contra `main`. Después de instalar Chromium como indica la guía y con Python 3 disponible, ejecutá `npm run check` para repetir localmente la verificación de GitHub Actions.

Las ilustraciones de ambiente se generaron para esta guía. La [baraja Tatú](scripts/tatu/README.md) se dibujó a partir de la digitalización de GlyphEnjoyer. Sus 50 caras y el reverso tienen fuentes SVG editables en `arte/tatu/`. Después de editar, ejecutá `npm run cartas:generar` para actualizar los WebP del sitio. Las fuentes tipográficas DM Sans y DM Serif Text se sirven con el sitio desde sus paquetes de Fontsource.

## Licencia

El código, la documentación y la baraja Tatú se publican con la [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). Si modificás el juego y lo ofrecés a otras personas por la red, tenés que darles el código de tu versión con la misma licencia.

La licencia no cubre la marca ni algunos recursos propios, que conservan todos los derechos:

- el nombre «El Truco», el dominio y el logo (`public/favicon.svg` y su copia en `video/public/marca/favicon.svg`);
- los íconos y la pantalla de inicio de la app (`app/assets/icono/`);
- las ilustraciones de ambiente (`public/img/baraja.webp`, `mano.webp`, `mate.webp`, `mesa-social.jpg`, `src/assets/mesa-criolla.webp` y su copia en `video/public/marca/mesa-criolla.webp`);
- las voces de la mesa (`app/assets/sonido/voces/`).

Una versión derivada tiene que usar otro nombre y reemplazar esos archivos.

De terceros:

- La baraja Tatú parte de [Cartas Tatú 50, de GlyphEnjoyer](https://commons.wikimedia.org/wiki/File:Cartas_Tat%C3%BA_50.png), digitalización publicada como CC0 1.0.
- DM Sans y DM Serif Text se distribuyen con la SIL Open Font License 1.1 ([public/licenses/](public/licenses/)).
- Las voces se generaron con ElevenLabs. Los efectos de sonido se sintetizan en `scripts/voces/efectos.ts`, sin muestras de terceros.
- El logo de Sign in with Apple es de Apple y se usa con su licencia para desarrolladores. No está en el repositorio: la imagen de Keycloak lo baja de Apple Design Resources al construirse (`infra/keycloak/Dockerfile`). La AGPL no lo cubre, tampoco en las capturas que lo muestran.
