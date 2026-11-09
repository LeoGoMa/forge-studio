"""Convierte las fotos PNG del portafolio en WebP ligeros y escribe img/manifest.json.

Uso: python tools/optimize_images.py <originales/assets> <img> [--logo <monograma.png>]
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

PROJECTS = ("vantif", "mallas", "moda", "forge")
WIDTHS = (480, 960, 1600)
MAX_BYTES = 256000
QUALITY_START, QUALITY_STEP, QUALITY_MIN = 78, 6, 60
CAP_STEP = 80
OG_CENTERING = (0.5, 0.08)  # deja la cabeza completa del modelo dentro del cuadro


def named_photos(folder, project):
    """Devuelve (png, slug) en orden alfabético; los hf_… pasan a <project>-01, -02…"""
    photos, hf_count = [], 0
    for png in sorted(folder.glob("*.png"), key=lambda p: p.name):
        if png.name.startswith("hf_"):
            hf_count += 1
            photos.append((png, f"{project}-{hf_count:02d}"))
        else:
            photos.append((png, png.stem))
    return photos


def resized(image, width):
    """Escala al ancho pedido sin agrandar nunca."""
    if image.width <= width:
        return image
    return image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)


def save_webp(image, path):
    """Guarda en WebP al 78 y baja de 6 en 6 hasta 60; devuelve si cupo en MAX_BYTES."""
    for quality in range(QUALITY_START, QUALITY_MIN - 1, -QUALITY_STEP):
        image.save(path, "WEBP", quality=quality, method=6)
        if path.stat().st_size <= MAX_BYTES:
            return True
    return False


def save_photo(original, paths):
    """Guarda un WebP por ancho; si uno no cabe a q60, baja el tope de 80 en 80 y repite los tres.

    Devuelve el ancho real de cada archivo y el tamaño del más grande.
    """
    cap = original.width
    while True:
        widths = {}
        for key, path in paths.items():
            image = resized(original, min(int(key), cap))
            if not save_webp(image, path):
                cap = image.width - CAP_STEP
                break
            widths[key] = image.width
        else:
            return widths, image.size
        if cap < WIDTHS[0]:
            sys.exit(f"error: {path} no cabe en {MAX_BYTES} bytes ni a {WIDTHS[0]} px")


def optimize_photos(assets_dir, img_dir, site_root):
    manifest = []
    for project in PROJECTS:
        folder = assets_dir / project
        if not folder.is_dir():
            sys.exit(f"error: no existe la carpeta {folder}")
        (img_dir / project).mkdir(parents=True, exist_ok=True)
        for png, slug in named_photos(folder, project):
            paths = {str(w): img_dir / project / f"{slug}-{w}.webp" for w in WIDTHS}
            with Image.open(png) as original:
                widths, (width, height) = save_photo(original, paths)
                capped = width < min(WIDTHS[-1], original.width)
            # width y height son los del archivo más grande; widths, el ancho real de cada archivo.
            manifest.append({
                "project": project, "slug": slug, "width": width, "height": height,
                "files": {key: path.relative_to(site_root).as_posix() for key, path in paths.items()},
                "widths": widths,
            })
            print(f"{project}/{slug}: {width}x{height}, tope {width if capped else '-'}, "
                  f"{paths[str(WIDTHS[-1])].stat().st_size} bytes")
    return manifest


def make_logo(logo_path, img_dir, site_root):
    with Image.open(logo_path) as logo:
        if logo.width != logo.height:
            sys.exit(f"error: el logo {logo_path} debe ser cuadrado")
        (img_dir / "brand").mkdir(parents=True, exist_ok=True)
        for size in (96, 192):
            path = img_dir / "brand" / f"forge-monogram-{size}.webp"
            if not save_webp(logo.resize((size, size), Image.LANCZOS), path):
                sys.exit(f"error: {path} pasa de {MAX_BYTES} bytes")
        logo.resize((32, 32), Image.LANCZOS).save(site_root / "favicon-32.png", optimize=True)
        logo.resize((180, 180), Image.LANCZOS).save(site_root / "apple-touch-icon.png", optimize=True)


def make_og(assets_dir, img_dir):
    with Image.open(assets_dir / "vantif" / "editorial-chipinque.png") as source:
        og = ImageOps.fit(source.convert("RGB"), (1200, 630), Image.LANCZOS, centering=OG_CENTERING)
    og.save(img_dir / "og.jpg", "JPEG", quality=80, optimize=True, progressive=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("assets", type=Path, help="carpeta con vantif/, mallas/, moda/ y forge/")
    parser.add_argument("img", type=Path, help="carpeta de salida (img/ del sitio)")
    parser.add_argument("--logo", type=Path, help="PNG cuadrado del monograma")
    args = parser.parse_args()

    img_dir = args.img.resolve()
    site_root = img_dir.parent
    img_dir.mkdir(parents=True, exist_ok=True)

    manifest = optimize_photos(args.assets, img_dir, site_root)
    if args.logo:
        make_logo(args.logo, img_dir, site_root)
    make_og(args.assets, img_dir)
    (img_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(manifest)} fotos en {img_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
