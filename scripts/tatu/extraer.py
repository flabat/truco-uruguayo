"""Extraer la edición de Cartas Tatú 50 del 21 de marzo de 2026 (00:47 UTC)."""

import argparse
import hashlib
import json
from math import dist
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

HERE = Path(__file__).resolve().parent
SOURCE_SHA1 = "abc422357d20a5f442148eeda964a89d65fc4457"
SAMPLES = ("copas-04", "copas-12", "copas-05", "espadas-01", "reverso")
CANVAS = (384, 596)


def extract(sheet, corners):
    # Las esquinas siguen el orden SI, II, ID, SD del modo QUAD de Pillow.
    tl, bl, br, tr = corners
    width = round((dist(tl, tr) + dist(bl, br)) / 2)
    height = round((dist(tl, bl) + dist(tr, br)) / 2)
    card = sheet.transform(
        (width, height), Image.Transform.QUAD,
        [value for corner in corners for value in corner], Image.Resampling.BICUBIC,
    )
    # Solo el negro conectado al exterior es fondo. La tinta interior se conserva.
    silhouette = ImageOps.expand(card.convert("L").point(lambda p: 255 if p > 90 else 0), 1)
    ImageDraw.floodfill(silhouette, (0, 0), 128)
    alpha = silhouette.point(lambda p: 0 if p == 128 else 255)
    alpha = alpha.crop((1, 1, width + 1, height + 1)).filter(ImageFilter.MinFilter(3))
    card.putalpha(alpha)
    return card


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="PNG original de Wikimedia Commons")
    parser.add_argument("--samples", action="store_true", help="exportar solo las cinco muestras")
    parser.add_argument("--masters", type=Path, help="guardar además los PNG a resolución de origen")
    parser.add_argument("--output", type=Path, help="guardar copias WebP del escaneo para comparar")
    args = parser.parse_args()
    if not (args.masters or args.output):
        parser.error("Indicá --masters o --output para guardar los recortes de referencia.")
    if args.output and args.output.resolve() == HERE.parents[1] / "public/img/cartas/tatu":
        parser.error("Elegí otro directorio. Las imágenes del sitio se exportan desde los SVG.")
    with args.source.open("rb") as source:
        if hashlib.file_digest(source, "sha1").hexdigest() != SOURCE_SHA1:
            parser.error("La huella del PNG no coincide con la edición de los recortes.")
    crops = json.loads((HERE / "recortes.json").read_text())
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
    if args.masters:
        args.masters.mkdir(parents=True, exist_ok=True)
    with Image.open(args.source) as sheet:
        for name in SAMPLES if args.samples else crops:
            card = extract(sheet, crops[name])
            if args.masters:
                card.save(args.masters / f"{name}.png")
            if args.output:
                web = ImageOps.pad(card, CANVAS, method=Image.Resampling.LANCZOS, color=(0, 0, 0, 0))
                web.save(args.output / f"{name}.webp", quality=90, method=6)


if __name__ == "__main__":
    main()
