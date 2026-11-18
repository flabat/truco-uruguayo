"""Verify the deck and the playable example in the generated site."""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import sys


class Cards(HTMLParser):
    def __init__(self, path, section=None):
        super().__init__()
        self.section = section
        self.sections = []
        self.images = []
        self.feed(path.read_text(encoding="utf-8"))
        self.close()

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "section":
            self.sections.append(attributes.get("id"))
        src = attributes.get("src", "")
        in_scope = self.section is None or self.section in self.sections
        if in_scope and tag == "img" and "/img/cartas/tatu/" in src:
            self.images.append(Path(src).name)

    def handle_endtag(self, tag):
        if tag == "section":
            self.sections.pop()


root = Path(sys.argv[1])
expected = {
    f"{suit}-{rank:02}.webp"
    for suit in ("oros", "copas", "espadas", "bastos")
    for rank in range(1, 13)
} | {"comodin-01.webp", "comodin-02.webp", "reverso.webp"}

files = {p.name for p in (root / "img/cartas/tatu").glob("*.webp")}
gallery = Cards(root / "baraja/index.html").images
if files != expected or Counter(gallery) != Counter(expected):
    sys.exit("La galería debe mostrar una vez las 48 cartas de palo, los dos comodines y el reverso.")

sample = Cards(root / "reglas/jerarquia/index.html", section="rey-pieza").images
if sample != ["reverso.webp", "copas-04.webp", "copas-12.webp", "copas-05.webp", "espadas-01.webp"]:
    sys.exit("El ejemplo debe mostrar el mazo, la muestra y las tres cartas en orden de fuerza.")
print("Verified the 51 Tatú images and the five-card example.")
