#!/usr/bin/env python3
"""
Fetch and synchronise curated restaurant photos.

Workflow:
  1. Update PHOTO_SOURCES below with Instagram post URLs you want to ingest.
  2. Run `python tools/update_restaurant_photos.py --download` to fetch the images into
     `IGPics/<slug>/` and convert them into WebP assets under
     `mobile/src/assets/restaurants/<slug>/`.
  3. The script regenerates `mobile/src/assets/restaurantPhotoManifest.ts`
     based on the WebP assets that exist on disk, so the mobile app always
     references the latest curated set.
  4. Add `--slugs slug_a slug_b` if you only need to refresh a subset (e.g. retrying
     failed Instagram fetches).
  5. When Instagram requires authentication for certain posts, set an `IG_PASSWORD`
     environment variable (or bring your own) and run with
     `--login your_username [--password-env NAME]`.

If Instagram blocks unauthenticated fetches for one of the URLs, copy the image
into `IGPics/<slug>/` manually and rerun the script without the `--download`
flag to convert and update the manifest.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Iterable, List, Sequence

try:
    import instaloader  # type: ignore
    from PIL import Image
except ImportError as exc:  # pragma: no cover - guard for missing deps
    print(
        "Missing dependencies. Install them with:\n"
        "  source .venv/bin/activate\n"
        "  .venv/bin/python -m pip install instaloader Pillow",
        file=sys.stderr,
    )
    raise


REPO_ROOT = Path(__file__).resolve().parents[1]
IGPICS_ROOT = REPO_ROOT / "IGPics"
ASSETS_ROOT = REPO_ROOT / "mobile" / "src" / "assets" / "restaurants"
RESTAURANT_DATA_PATH = REPO_ROOT / "backend" / "app" / "data" / "restaurants.json"
MANIFEST_PATH = REPO_ROOT / "mobile" / "src" / "assets" / "restaurantPhotoManifest.ts"
PUBLIC_PHOTO_PREFIX = "/assets/restaurants"
MAX_PHOTOS_PER_SLUG = 5

SHORTCODE_PATTERN = re.compile(r"/p/([^/?#]+)/")

_INSTALOADER = instaloader.Instaloader(
    download_comments=False,
    download_videos=False,
    download_video_thumbnails=False,
    post_metadata_txt_pattern="",
    save_metadata=False,
    compress_json=False,
)


# Curated Instagram sources per restaurant slug.
PHOTO_SOURCES: Dict[str, Sequence[str]] = {
    "360bar": [
        "https://www.instagram.com/p/DQoWJAjjK-b/",
        "https://www.instagram.com/p/DJCC5Hat5C7/",
        "https://www.instagram.com/p/DL7JZc6tTg3/",
        "https://www.instagram.com/p/DGnd833N9oi/",
        "https://www.instagram.com/p/DAvigoaNMXX/",
    ],
    "artclub": [
        "https://www.instagram.com/p/DJmQB_zIU12/",
        "https://www.instagram.com/p/C9pbXLKoc6Q/",
        "https://www.instagram.com/p/C7_OXz4tKcb/",
        "https://www.instagram.com/p/DAnwwhhNzjQ/",
        "https://www.instagram.com/p/CzBeqrdNa_d/",
    ],
    "caybagi145": [
        "https://www.instagram.com/p/DP3tgQvjX9E/",
        "https://www.instagram.com/p/DGBOAICqhxj/",
        "https://www.instagram.com/p/DN0OUS5WrWx/",
        "https://www.instagram.com/p/DFP9dfrKijN/",
        "https://www.instagram.com/p/DFNL-wyKXxS/",
    ],
    "chinar": [
        "https://www.instagram.com/p/DNvsLkAat0l/",
        "https://www.instagram.com/p/DNfyML61rs9/",
        "https://www.instagram.com/p/DP_dM6UiA5j/",
        "https://www.instagram.com/p/DPoO7dkiPh1/",
        "https://www.instagram.com/p/DFr6xr3uWbn/",
    ],
    "dolma": [
        "https://www.instagram.com/p/DQGwpIHCLoa/",
        "https://www.instagram.com/p/DP3oh00iPNv/",
        "https://www.instagram.com/p/DO-1c4BCByu/",
        "https://www.instagram.com/p/DPBGFhXCJ6D/",
        "https://www.instagram.com/p/DOD-xCAiMIa/",
    ],
    "firuze": [
        "https://www.instagram.com/p/DOTwKA0irKy/",
        "https://www.instagram.com/p/DPddhmoiifM/",
        "https://www.instagram.com/p/C5TjPaVNo4K/",
        "https://www.instagram.com/p/CsJbFHaNGb9/",
        "https://www.instagram.com/p/Co98nY2Ni7e/",
    ],
    "mangal": [
        "https://www.instagram.com/p/DE9FTo7Ox-A/",
        "https://www.instagram.com/p/C-t-Fh_sAJl/",
        "https://www.instagram.com/p/C-ehVU3hoTk/",
        "https://www.instagram.com/p/DB20JakBH2J/",
        "https://www.instagram.com/p/C-ehVU3hoTk/",
    ],
    "nakhchivan-restaurant": [],
    "marivanna": [
        "https://www.instagram.com/p/DP8CV2NiG3h/",
        "https://www.instagram.com/p/DNNNZrcIdJz/",
        "https://www.instagram.com/p/DQlPHMViC0Y/",
        "https://www.instagram.com/p/DOfVs97CFzv/",
        "https://www.instagram.com/p/DOXnUWMiG8e/",
    ],
    "mugam": [
        "https://www.instagram.com/p/DQMzB1niDOL/",
        "https://www.instagram.com/p/C-nd6vJNmql/",
        "https://www.instagram.com/p/C_KwAX7itrt/",
        "https://www.instagram.com/p/C5ts5ACNVI1/",
        "https://www.instagram.com/p/CtfUu92trOk/",
    ],
    "nergiz": [
        "https://www.instagram.com/p/DPdfjmOigf7/",
        "https://www.instagram.com/p/DMidLvqNgZL/",
        "https://www.instagram.com/p/DGONdUItdOR/",
        "https://www.instagram.com/p/DMDjqb_NOzj/",
        "https://www.instagram.com/p/DM4V5P9Ni2h/",
    ],
    "novikov": [
        "https://www.instagram.com/p/DQpD8_fDPw1/",
        "https://www.instagram.com/p/Cwm0iDzNV3U/",
        "https://www.instagram.com/p/CvW7RkqN6aO/",
        "https://www.instagram.com/p/CtMJupUtlGT/",
        "https://www.instagram.com/p/CsipYUBtV6k/",
    ],
    "oronero": [
        "https://www.instagram.com/p/DOJDcUYCGJr/",
        "https://www.instagram.com/p/CsYybMXtAxM/",
        "https://www.instagram.com/p/Czlmxdzt8KT/",
        "https://www.instagram.com/p/CqVFzhtL2Kk/",
        "https://www.instagram.com/p/DOgBL4oCDJ5/",
    ],
    "paulaner": [
        "https://www.instagram.com/p/CwMu9g5AFui/",
        "https://www.instagram.com/p/DM4nMt8NG1s/",
        "https://www.instagram.com/p/DLu1qp_NS6t/",
        "https://www.instagram.com/p/DK-PWJPtMjE/",
        "https://www.instagram.com/p/CDo4_N5DF2g/",
    ],
    "passage145": [
        "https://www.instagram.com/p/DO0r27hCI8w/",
        "https://www.instagram.com/p/DNIgT9_I5LR/",
        "https://www.instagram.com/p/DLfRNNFoTw3/",
        "https://www.instagram.com/p/DNDdVT5oszf/",
        "https://www.instagram.com/p/DNkueWQNyOG/",
    ],
    "qaladivari": [
        "https://www.instagram.com/p/DPyfFCyDjaN/",
        "https://www.instagram.com/p/DNNbDZFxY5-/",
        "https://www.instagram.com/p/DNkgm2tNEti/",
        "https://www.instagram.com/p/DGX1EFftJeo/",
        "https://www.instagram.com/p/DI0oHF4Rsyz/",
    ],
    "qaynana": [
        "https://www.instagram.com/p/DNXqOXqI9V8/",
        "https://www.instagram.com/p/DQEN0gtiPAl/",
        "https://www.instagram.com/p/DN-4kOciKfb/",
        "https://www.instagram.com/p/DPLKcolCEwA/",
        "https://www.instagram.com/p/DNGB8ToIbZ_/",
    ],
    "riviera": [
        "https://www.instagram.com/p/DQWgg5wCkoj/",
        "https://www.instagram.com/p/DQjTXoIigON/",
        "https://www.instagram.com/p/DQHGkjdCo9V/",
        "https://www.instagram.com/p/DO3K90PilgG/",
        "https://www.instagram.com/p/DPLbNcTima6/",
    ],
    "sahil": [
        "https://www.instagram.com/p/DQEXTmYiOEi/",
        "https://www.instagram.com/p/DPlqOmUiO5J/",
        "https://www.instagram.com/p/DOorNGvDqx2/",
        "https://www.instagram.com/p/DOnSfMpiJF7/",
        "https://www.instagram.com/p/DPgcURACN1N/",
    ],
    "shah": [
        "https://www.instagram.com/p/DIbZUOaIMfu/",
        "https://www.instagram.com/p/DJ9eMjuIyjU/",
        "https://www.instagram.com/p/DKwVZIcI0W_/",
        "https://www.instagram.com/p/DKb7DAkoZ4h/",
        "https://www.instagram.com/p/DKm6fWtIuaO/",
    ],
    "shirvanshah": [
        "https://www.instagram.com/p/DHZB0x0gIvN/",
        "https://www.instagram.com/p/DDPiNe2N7fv/",
        "https://www.instagram.com/p/DCZdR-aNUmS/",
        "https://www.instagram.com/p/DJPU5-vtcbJ/",
        "https://www.instagram.com/p/DMqKKw6tm-j/",
    ],
    "skygrill": [
        "https://www.instagram.com/p/DQGmRcZjAdW/",
        "https://www.instagram.com/p/DHc5CnAtaSo/",
        "https://www.instagram.com/p/DLzk2T3NeCi/",
        "https://www.instagram.com/p/DHxqc1pt3Zb/",
        "https://www.instagram.com/p/DGU_fWjALOy/",
    ],
    "sumakh": [
        "https://www.instagram.com/p/DIv8M48ND97/",
        "https://www.instagram.com/p/DJjuteaobyg/",
        "https://www.instagram.com/p/DKMt72JIja4/",
        "https://www.instagram.com/p/DLCUyohtFFx/",
        "https://www.instagram.com/p/DNvZfq9UNqI/",
    ],
    "syrovarnya": [
        "https://www.instagram.com/p/DOK-5rfjPkP/",
        "https://www.instagram.com/p/DOazXGFjGRv/",
        "https://www.instagram.com/p/DMPdhfDNAb6/",
        "https://www.instagram.com/p/Cb1_ESkAlzh/",
        "https://www.instagram.com/p/CWvPnR4AgiY/",
    ],
    "vapiano": [
        "https://www.instagram.com/p/C-h0GYsIH3F/",
        "https://www.instagram.com/p/DQWME6OCD5L/",
        "https://www.instagram.com/p/DQTjsQTCATC/",
        "https://www.instagram.com/p/DQgnvW0CCP0/",
        "https://www.instagram.com/p/CQNmBJtpZzF/",
    ],
    "zafferano": [
        "https://www.instagram.com/p/Cm1NjUeDpDW/",
        "https://www.instagram.com/p/CutI5nYNAoH/",
        "https://www.instagram.com/p/ClTSbCVMRTV/",
        "https://www.instagram.com/p/Cj8A1fFIx_b/",
        "https://www.instagram.com/p/CjS0K14qQjN/",
    ],
    # 2025-11-10 enrichment batch (photos sourced via baku_enricher)
    "baku-cafe": [],
    "baku-convention-center": [],
    "balcon-cafe": [],
    "besh-gastropub": [],
    "black-city-lounge-terrace": [],
    "cafe-city-fountain": [],
    "fireworks-urban-kitchen": [],
    "green-house-asian-kitchen": [],
    "harbour-tap-and-grill": [],
    "hard-rock-cafe": [],
    "kefli-local-wine-snacks": [],
    "la-kuku": [],
    "la-maison-patisserie-cafe": [],
    "latitude-longitude-bar-lounge": [],
    "merci-baku": [],
    "movida-lounge-and-dining": [],
    "nur-lounge": [],
    "paris-bistro": [],
    "pasifico-lounge-and-dining": [],
    "people-livebar": [],
    "porterhouse-grill-wine": [],
    "prive-steak-gallery-baku": [],
    "scalini": [],
    "shur": [],
    "sushi-room-baku": [],
    "wooga-korean-steakhouse": [],
    "zest-lifestyle-cafe": [],
}


def fetch_instagram_image(url: str) -> bytes:
    match = SHORTCODE_PATTERN.search(url)
    if not match:
        raise RuntimeError(f"Unsupported Instagram URL (missing shortcode): {url}")
    shortcode = match.group(1)
    post = instaloader.Post.from_shortcode(_INSTALOADER.context, shortcode)
    with TemporaryDirectory() as tmpdir:
        target = Path(tmpdir) / "post"
        _INSTALOADER.dirname_pattern = str(target)
        _INSTALOADER.download_post(post, target=str(target))
        images = sorted(
            (p for p in Path(tmpdir).rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}),
            key=lambda p: p.stat().st_mtime,
        )
        if not images:
            raise RuntimeError(f"No image assets recovered for Instagram post {url}")
        payload = images[0].read_bytes()
    return payload


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def map_sort_key(path: Path) -> tuple[int, str]:
    stem = path.stem
    try:
        return (0, f"{int(stem):08d}")
    except ValueError:
        return (1, stem)


def convert_to_webp(jpeg_bytes: bytes, dest_path: Path) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(BytesIO(jpeg_bytes)) as img:
        rgb = img.convert("RGB")
        rgb.save(dest_path, "WEBP", quality=85, method=6)


def download_for_slug(slug: str, urls: Sequence[str]) -> None:
    if not urls:
        return
    ensure_dir(IGPICS_ROOT / slug)
    ensure_dir(ASSETS_ROOT / slug)
    for idx, url in enumerate(urls[:MAX_PHOTOS_PER_SLUG], start=1):
        try:
            payload = fetch_instagram_image(url)
        except Exception as exc:  # pragma: no cover - user needs to investigate
            print(f"[warn] Failed to download {url}: {exc}", file=sys.stderr)
            continue
        raw_path = IGPICS_ROOT / slug / f"{idx}.jpg"
        raw_path.write_bytes(payload)
        webp_path = ASSETS_ROOT / slug / f"{idx}.webp"
        convert_to_webp(payload, webp_path)
        print(f"[ok] {slug} photo {idx} saved to {webp_path.relative_to(REPO_ROOT)}")


def convert_existing(slug: str) -> None:
    source_dir = IGPICS_ROOT / slug
    if not source_dir.exists():
        return
    candidates = sorted(
        (
            p
            for p in source_dir.iterdir()
            if p.is_file()
            and not p.name.startswith(".")
            and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        ),
        key=map_sort_key,
    )
    for idx, path in enumerate(candidates[:MAX_PHOTOS_PER_SLUG], start=1):
        try:
            with path.open("rb") as fh:
                payload = fh.read()
        except Exception as exc:
            print(f"[warn] Unable to read {path}: {exc}", file=sys.stderr)
            continue
        dest = ASSETS_ROOT / slug / f"{idx}.webp"
        convert_to_webp(payload, dest)
        print(f"[ok] {slug} photo {idx} refreshed from existing source")


def load_restaurant_slugs() -> List[str]:
    data = json.loads(RESTAURANT_DATA_PATH.read_text())
    slugs = []
    for entry in data:
        slug = entry.get("slug")
        if slug:
            slugs.append(str(slug).strip().lower())
    return sorted(set(slugs))


def generate_manifest(slugs: Iterable[str]) -> None:
    asset_entries: List[str] = []
    pending_slugs: List[str] = []

    for slug in sorted(set(slugs)):
        slug_dir = ASSETS_ROOT / slug
        if not slug_dir.exists():
            pending_slugs.append(slug)
            continue
        images = sorted((p for p in slug_dir.glob("*.webp") if p.is_file()), key=map_sort_key)[
            :MAX_PHOTOS_PER_SLUG
        ]
        if not images:
            pending_slugs.append(slug)
            continue
        requires = ",\n    ".join(
            f"require('./restaurants/{slug}/{img.name}')" for img in images
        )
        entry_lines = [
            f"  '{slug}': bundle(require('./restaurants/{slug}/{images[0].name}'), [",
            f"    {requires},",
            "  ]),",
        ]
        asset_entries.append("\n".join(entry_lines))

    entries_block = "\n".join(asset_entries)
    if entries_block:
        entries_block += "\n"

    if pending_slugs:
        pending_lines = ",\n  ".join(repr(slug) for slug in pending_slugs)
        pending_block = (
            "export const PENDING_PHOTO_SLUGS = new Set<string>([\n"
            f"  {pending_lines},\n"
            "]);\n\n"
        )
    else:
        pending_block = "export const PENDING_PHOTO_SLUGS = new Set<string>([]);\n\n"

    manifest_content = (
        "import type { ImageSourcePropType } from 'react-native';\n"
        "export type RestaurantAssetBundle = {\n"
        "  cover?: ImageSourcePropType;\n"
        "  gallery?: ImageSourcePropType[];\n"
        "  pending?: boolean;\n"
        "};\n\n"
        "const bundle = (\n"
        "  cover: ImageSourcePropType,\n"
        "  gallery: ImageSourcePropType[],\n"
        "): RestaurantAssetBundle => ({\n"
        "  cover,\n"
        "  gallery,\n"
        "});\n\n"
        "const pendingBundle = (): RestaurantAssetBundle => ({\n"
        "  pending: true,\n"
        "});\n\n"
        f"{pending_block}"
        "export const restaurantPhotoManifest: Record<string, RestaurantAssetBundle> = {\n"
        f"{entries_block}"
        "};\n"
    )
    MANIFEST_PATH.write_text(manifest_content)
    print(f"[ok] Manifest regenerated at {MANIFEST_PATH.relative_to(REPO_ROOT)}")
    if pending_slugs:
        print(f"[info] Slugs without local assets: {', '.join(sorted(pending_slugs))}")


def update_restaurant_data_image_refs() -> None:
    if not RESTAURANT_DATA_PATH.exists():
        return
    try:
        data = json.loads(RESTAURANT_DATA_PATH.read_text())
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise RuntimeError(f"Failed to parse {RESTAURANT_DATA_PATH}: {exc}") from exc

    changed = False
    for entry in data:
        slug = str(entry.get("slug") or "").strip().lower()
        if not slug:
            continue
        slug_dir = IGPICS_ROOT / slug
        if not slug_dir.exists():
            continue
        images = sorted(
            (
                p
                for p in slug_dir.iterdir()
                if p.is_file()
                and not p.name.startswith(".")
                and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
            ),
            key=map_sort_key,
        )[:MAX_PHOTOS_PER_SLUG]
        if not images:
            continue
        rel_paths = [f"{PUBLIC_PHOTO_PREFIX}/{slug}/{img.name}" for img in images]
        if entry.get("photos") != rel_paths:
            entry["photos"] = rel_paths
            changed = True
        if entry.get("cover_photo") != rel_paths[0]:
            entry["cover_photo"] = rel_paths[0]
            changed = True

    if changed:
        RESTAURANT_DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"[ok] Updated photo references in {RESTAURANT_DATA_PATH.relative_to(REPO_ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Synchronise curated restaurant photos.")
    parser.add_argument(
        "--download",
        action="store_true",
        help="Fetch Instagram posts defined in PHOTO_SOURCES before regenerating assets.",
    )
    parser.add_argument(
        "--slugs",
        nargs="+",
        help="Only process the specified restaurant slugs (defaults to all).",
    )
    parser.add_argument(
        "--login",
        help="Instagram username for authenticated downloads (optional).",
    )
    parser.add_argument(
        "--password-env",
        default="IG_PASSWORD",
        help="Environment variable that holds the Instagram password when using --login.",
    )
    args = parser.parse_args()

    if args.login:
        password = os.environ.get(args.password_env)
        if not password:
            parser.error(
                f"Environment variable {args.password_env} is not set but --login was provided."
            )
        try:
            _INSTALOADER.login(args.login, password)
        except Exception as exc:  # pragma: no cover - best effort login helper
            parser.error(f"Failed to login to Instagram as {args.login}: {exc}")

    if args.slugs:
        requested = []
        for raw in args.slugs:
            slug = raw.strip().lower()
            if slug not in PHOTO_SOURCES:
                parser.error(f"Unknown slug '{raw}'. Available: {', '.join(sorted(PHOTO_SOURCES))}")
            requested.append(slug)
    else:
        requested = list(PHOTO_SOURCES.keys())

    if args.download:
        for slug in requested:
            urls = PHOTO_SOURCES.get(slug, [])
            download_for_slug(slug, urls)
    else:
        for slug in requested:
            convert_existing(slug)

    slugs = load_restaurant_slugs()
    generate_manifest(slugs)
    update_restaurant_data_image_refs()


if __name__ == "__main__":
    main()
