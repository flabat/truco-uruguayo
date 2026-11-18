# Truco Oriental

Guía en español del truco uruguayo. Las reglas incluyen ejemplos, enlaces a sus fuentes y variantes de mesa. Astro genera el sitio como archivos estáticos para GitHub Pages.

## Desarrollo local

Con Node.js 24 y npm, instalá las dependencias e iniciá el servidor desde la raíz del proyecto.

```sh
npm ci
npm run dev
```

Abrí la dirección que imprime Astro. Podés compilar y revisar la versión de producción con estos comandos.

```sh
npm run build
npm run preview
```

La salida se guarda en `dist/`. Para probar la navegación bajo la ruta de un repositorio, usá la misma URL en ambos comandos.

```sh
PAGES_URL=https://example.org/truco-uruguayo/ npm run build
PAGES_URL=https://example.org/truco-uruguayo/ npm run preview
```

## Publicación en GitHub Pages

1. Usá la rama `main` con los cambios que querés publicar.
2. En **Settings → Pages → Build and deployment → Source**, seleccioná **GitHub Actions**.
3. En **Actions → Publicar en GitHub Pages**, elegí **Run workflow** sobre `main`. Repetí este paso cuando quieras publicar otra versión.
4. Abrí la URL que aparece en el entorno `github-pages` al terminar el despliegue.

El flujo recibe la URL de GitHub Pages y configura la ruta base de Astro. Sirve tanto para un sitio bajo `/<repositorio>/` como para una dirección en la raíz de un dominio. La publicación se inicia manualmente. GitHub Free admite Pages en repositorios públicos. [Disponibilidad por plan](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#who-can-use-this-feature) [Documentación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Dominio propio

1. En **Settings → Pages → Custom domain**, guardá el nombre que registraste.
2. En el proveedor DNS, apuntá el dominio raíz a GitHub Pages con los registros `A`, `ALIAS` o `ANAME` indicados por GitHub. Para un subdominio como `www`, creá un `CNAME` hacia `<cuenta>.github.io`. [Registros y valores DNS de GitHub](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
3. Volvé a ejecutar el flujo para compilar con la nueva URL. Activá **Enforce HTTPS** cuando GitHub haya emitido el certificado.

## Contenido y componentes

Las páginas se editan en `src/pages/` y las reglas con sus fuentes en `src/data/`. Mantené los enlaces internos y los recursos públicos relativos a `import.meta.env.BASE_URL` para que funcionen en las dos modalidades de publicación.

Una futura página de práctica puede incorporar un componente Astro con un `<script>` o una isla interactiva de React, Vue o Svelte. Las demás páginas siguen sirviéndose como HTML estático. [Interactividad en Astro](https://docs.astro.build/en/concepts/islands/)

## Trabajo en el repositorio

Seguí la [guía de contribución](CONTRIBUTING.md) para reservar un issue, trabajar en una rama aislada y abrir un pull request contra `main`. Con Python 3 instalado, ejecutá `npm run check` para repetir localmente la verificación de GitHub Actions.

Las ilustraciones se generaron para esta guía. Las fuentes tipográficas DM Sans y DM Serif Text se sirven con el sitio desde sus paquetes de Fontsource.
