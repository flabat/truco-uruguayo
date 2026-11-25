"""Check internal links, anchors and assets in the built frontend."""

from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from posixpath import normpath
import sys
from urllib.parse import quote, unquote, urljoin, urlsplit

# Rutas que sirve la exportación web de la app (infra/web.conf y el Caddyfile), no el sitio Astro.
APP_ROUTES = (PurePosixPath("jugar"),)


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.anchors = set()
        self.links = []
        self.feed(path.read_text(encoding="utf-8"))
        self.close()

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value is None:
                continue
            if key == "id" or (tag == "a" and key == "name"):
                self.anchors.add(value)
            if key in ("href", "src", "poster"):
                self.links.append(value)


def check_site(root, site_url):
    site = urlsplit(site_url)
    base = PurePosixPath(unquote(site.path) or "/")
    pages = {file: Page(file) for file in root.rglob("*.html")}
    if root / "index.html" not in pages:
        yield "The build is missing index.html"
        return

    for file, page in pages.items():
        path = file.relative_to(root).as_posix()
        route = quote(path.removesuffix("index.html") if file.name == "index.html" else path)
        url = urljoin(site_url.rstrip("/") + "/", route)
        for link in page.links:
            target = urlsplit(urljoin(url, link))
            if target.netloc != site.netloc or target.scheme not in ("http", "https"):
                continue
            pathname = PurePosixPath(normpath(unquote(target.path)))
            if not pathname.is_relative_to(base):
                yield f"{path} → {link} escapes the project path {base}"
                continue
            relative = pathname.relative_to(base)
            if any(relative == route or relative.is_relative_to(route) for route in APP_ROUTES):
                if target.fragment:
                    yield f"{path} → {link} points to an anchor inside the app"
                continue
            dest = root / relative
            if dest.is_dir():
                dest = dest / "index.html"
            if not dest.is_file():
                yield f"{path} → {link} points to a missing file"
                continue
            anchor = unquote(target.fragment).split(":~:text=", 1)[0]
            if dest in pages and anchor and anchor.lower() != "top" and anchor not in pages[dest].anchors:
                yield f"{path} → {link} points to a missing anchor"


if __name__ == "__main__":
    errors = list(check_site(Path(sys.argv[1]), sys.argv[2]))
    if errors:
        sys.exit("\n".join(errors))
    print("Verified internal links, assets and anchors.")
