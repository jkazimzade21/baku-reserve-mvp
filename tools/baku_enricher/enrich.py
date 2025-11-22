import os, re, io, json, time, hashlib, math, pathlib, mimetypes, sys
from typing import List, Dict, Any, Optional, Tuple
import requests
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
try:
    import googlemaps  # type: ignore
except Exception:
    googlemaps = None
from slugify import slugify
import typer
from tenacity import retry, stop_after_attempt, wait_exponential
from PIL import Image
import imagehash
import tldextract
from rapidfuzz import fuzz
from dotenv import load_dotenv

# Optional deps (guarded)
try:
    from apify_client import ApifyClient
except Exception:
    ApifyClient = None

try:
    import instaloader
except Exception:
    instaloader = None

# CLIP
import torch
import open_clip


app = typer.Typer(help="Baku Restaurant Enricher (Codex CLI tool)")

# --------------------------
# Utility
# --------------------------

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

def headers() -> Dict[str, str]:
    return {
        "User-Agent": "Mozilla/5.0 (compatible; BakuEnricher/1.0; +https://example.invalid)"
    }

def is_pdf_url(url: str) -> bool:
    p = urlparse(url)
    return p.path.lower().endswith(".pdf")

def is_image_url(url: str) -> bool:
    ext = pathlib.Path(urlparse(url).path).suffix.lower()
    return ext in {".jpg", ".jpeg", ".png", ".webp"}

def safe_get(url: str, timeout=15) -> Optional[requests.Response]:
    try:
        r = requests.get(url, headers=headers(), timeout=timeout, allow_redirects=True)
        if r.status_code == 200:
            return r
    except Exception:
        return None
    return None

def head_ok(url: str, timeout=10) -> bool:
    try:
        r = requests.head(url, headers=headers(), timeout=timeout, allow_redirects=True)
        return r.status_code == 200
    except Exception:
        return False

def domain(url: str) -> str:
    p = tldextract.extract(url)
    return ".".join([x for x in [p.domain, p.suffix] if x])

def to_maps_place_url(place_id: str) -> str:
    return f"https://www.google.com/maps/place/?q=place_id:{place_id}"

# --------------------------
# Google Places
# --------------------------

def find_place_in_baku(gmaps: Any, query: str) -> Optional[Dict[str, Any]]:
    if googlemaps is None:
        raise RuntimeError("Google Maps provider disabled; place lookup unavailable.")
    fp = gmaps.find_place(
        input=f"{query} Baku",
        input_type="textquery",
        fields=["place_id"]
    )
    candidates = fp.get("candidates", [])
    if not candidates:
        return None
    place_id = candidates[0]["place_id"]
    details = gmaps.place(
        place_id=place_id,
        fields=[
            "name","formatted_address","geometry/location",
            "url","website","international_phone_number","type"
        ]
    )["result"]
    details["place_id"] = place_id
    return details

# --------------------------
# Instagram handle resolution
# --------------------------

IG_RX = re.compile(r"https?://(www\.)?instagram\.com/([A-Za-z0-9_.]+)/?", re.I)

def extract_ig_from_html(url: str, html: str) -> Optional[str]:
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        m = IG_RX.match(a["href"])
        if m:
            return m.group(2).strip("/")
    return None

def resolve_instagram_handle(name: str, website: Optional[str]) -> Tuple[Optional[str], float, str]:
    """
    Strategy:
      1) If website exists, parse footer/header for instagram link — high confidence.
      2) Fallback: search API (SerpAPI/Bing) site:instagram.com "name" Baku — medium confidence.
      3) Else none.
    Returns: (handle, confidence, method)
    """
    # 1) website crawl
    if website:
        r = safe_get(website)
        if r is not None:
            ig = extract_ig_from_html(website, r.text)
            if ig:
                return ig, 0.95, "website_link"

        # try /contact /about
        for path in ["/contact", "/about", "/en", "/az", "/ru", "/tr"]:
            u = urljoin(website, path)
            r = safe_get(u)
            if r is not None:
                ig = extract_ig_from_html(u, r.text)
                if ig:
                    return ig, 0.90, f"website_link:{path}"

    # 2) SERP fallback
    serp = os.getenv("SERPAPI_API_KEY")
    bing = os.getenv("BING_SEARCH_V7_KEY")
    q = f'site:instagram.com "{name}" Baku'
    if serp:
        try:
            resp = requests.get(
                "https://serpapi.com/search.json",
                params={"engine":"google","q":q,"api_key":serp},
                timeout=20
            )
            data = resp.json()
            for item in data.get("organic_results", []):
                link = item.get("link","")
                m = IG_RX.match(link)
                if m:
                    return m.group(2).strip("/"), 0.8, "serpapi"
        except Exception:
            pass
    elif bing:
        try:
            resp = requests.get(
                "https://api.bing.microsoft.com/v7.0/search",
                params={"q":q,"count":10},
                headers={"Ocp-Apim-Subscription-Key": bing},
                timeout=20
            )
            data = resp.json()
            for w in data.get("webPages", {}).get("value", []):
                link = w.get("url","")
                m = IG_RX.match(link)
                if m:
                    return m.group(2).strip("/"), 0.75, "bing"
        except Exception:
            pass

    return None, 0.0, "none"

# --------------------------
# Instagram media fetch
# --------------------------

def _is_video_entry(item: Dict[str, Any]) -> bool:
    media_type = (item.get("type") or item.get("productType") or "").lower()
    if any(token in media_type for token in ("video", "clip", "reel")):
        return True
    flags = (
        item.get("isVideo"),
        item.get("is_video"),
        item.get("video"),
        item.get("videoUrl"),
        item.get("video_url"),
    )
    return any(flags)


def _extract_image_urls(node: Dict[str, Any]) -> List[str]:
    urls: List[str] = []

    def push(value: Optional[str]):
        if isinstance(value, str) and value.startswith("http") and value not in urls:
            urls.append(value)

    candidate_keys = (
        "displayUrl",
        "displayURL",
        "display_url",
        "imageUrl",
        "imageURL",
        "image_url",
        "thumbnail_url",
        "thumbnailUrl",
    )
    for key in candidate_keys:
        push(node.get(key))

    for res in node.get("displayResources") or node.get("display_resources") or []:
        if isinstance(res, dict):
            push(res.get("src") or res.get("url"))
        else:
            push(res)

    for img in node.get("images") or []:
        if isinstance(img, dict):
            push(img.get("url") or img.get("src"))
        else:
            push(img)

    for cand in (node.get("imageVersions2") or {}).get("candidates", []):
        push(cand.get("url"))

    return urls

def fetch_instagram_images_apify(handle: str, limit=40) -> List[Dict[str,Any]]:
    if not ApifyClient:
        return []
    token = os.getenv("APIFY_TOKEN")
    if not token:
        return []
    client = ApifyClient(token)
    proxy_conf = {"useApifyProxy": True}
    proxy_group = os.getenv("APIFY_PROXY_GROUP")
    if proxy_group:
        proxy_conf["apifyProxyGroups"] = [proxy_group]
    # Public actor that gets posts and media URLs (skip reels later)
    run_input = {
        "directUrls": [f"https://www.instagram.com/{handle}/"],
        "resultsType": "posts",
        "resultsLimit": min(limit, 50),
        "scrapePostsUntilDate": None,
        "searchType": "user",
        "addParentData": False,
        "maxRequestRetries": 3,
        "maxConcurrency": 5,
        "proxyConfiguration": proxy_conf,
    }
    try:
        run = client.actor("apify/instagram-scraper").call(run_input=run_input)
    except Exception as exc:
        print(f"[baku-enricher] Apify scrape failed for {handle}: {exc}", file=sys.stderr)
        return []
    if run.get("status") != "SUCCEEDED":
        print(
            f"[baku-enricher] Apify run for {handle} ended with status {run.get('status')}",
            file=sys.stderr,
        )
    out = []
    dataset_id = run.get("defaultDatasetId")
    if not dataset_id:
        print(f"[baku-enricher] Apify run missing dataset for {handle}", file=sys.stderr)
        return []
    for item in client.dataset(dataset_id).iterate_items():
        if _is_video_entry(item):
            continue
        caption = item.get("caption") or item.get("alt") or ""
        urls = _extract_image_urls(item)
        # include child posts if the actor stored them separately
        for child in item.get("childPosts", []) or []:
            if _is_video_entry(child):
                continue
            urls.extend(_extract_image_urls(child))
        if not urls:
            continue
        out.extend({"url": u, "caption": caption} for u in urls)
    if not out:
        print(f"[baku-enricher] Apify returned 0 images for {handle}", file=sys.stderr)
    return out

def fetch_instagram_images_instaloader(handle: str, limit=40) -> List[Dict[str,Any]]:
    if not instaloader:
        return []
    L = instaloader.Instaloader(download_pictures=False, download_video_thumbnails=False, save_metadata=False, max_connection_attempts=1)
    ig_user = os.getenv("INSTAGRAM_USERNAME")
    ig_pass = os.getenv("INSTAGRAM_PASSWORD")
    if ig_user and ig_pass:
        try:
            L.login(ig_user, ig_pass)
        except Exception as exc:
            print(f"[baku-enricher] Instaloader login failed: {exc}", file=sys.stderr)
    try:
        profile = instaloader.Profile.from_username(L.context, handle)
        out = []
        for idx, post in enumerate(profile.get_posts()):
            if idx >= limit:
                break
            if post.is_video:
                continue
            # sidecar: iterate images
            if post.typename == "GraphSidecar":
                for node in post.get_sidecar_nodes():
                    if node.is_video:
                        continue
                    out.append({"url": node.display_url, "caption": post.caption or ""})
            else:
                out.append({"url": post.url, "caption": post.caption or ""})
        return out
    except Exception as exc:
        print(f"[baku-enricher] Instaloader fetch failed for {handle}: {exc}", file=sys.stderr)
        return []

def fetch_instagram_media(handle: str, limit=40) -> List[Dict[str,Any]]:
    # Prefer Apify if configured
    items = fetch_instagram_images_apify(handle, limit=limit)
    if items:
        return items
    return fetch_instagram_images_instaloader(handle, limit=limit)

# --------------------------
# CLIP classification (food vs interior)
# --------------------------

class ClipClassifier:
    def __init__(self):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32", pretrained="openai"
        )
        self.model = self.model.to(device).eval()
        self.tokenizer = open_clip.get_tokenizer("ViT-B-32")
        self.food_prompts = [
            "a photo of a plated dish",
            "a photo of food",
            "a photo of cuisine",
            "a photo of dessert",
            "a photo of sushi",
            "a photo of pizza",
            "a photo of steak",
        ]
        self.interior_prompts = [
            "a photo of a restaurant interior",
            "a photo of a dining room",
            "a photo of a bar interior",
            "a photo of a cafe interior",
            "a photo of tables and chairs inside a restaurant",
        ]
        self.food_text = self._encode_text(self.food_prompts)
        self.interior_text = self._encode_text(self.interior_prompts)

    @torch.no_grad()
    def _encode_text(self, prompts: List[str]):
        tokens = self.tokenizer(prompts)
        return self.model.encode_text(tokens.to(self.device)).float()

    @torch.no_grad()
    def score(self, img: Image.Image) -> Tuple[float, float]:
        # returns (food_score, interior_score)
        image = self.preprocess(img).unsqueeze(0).to(self.device)
        img_feat = self.model.encode_image(image).float()
        img_feat /= img_feat.norm(dim=-1, keepdim=True)
        food = self.food_text / self.food_text.norm(dim=-1, keepdim=True)
        interior = self.interior_text / self.interior_text.norm(dim=-1, keepdim=True)
        food_sim = (img_feat @ food.T).max().item()
        interior_sim = (img_feat @ interior.T).max().item()
        return food_sim, interior_sim

def download_image(url: str) -> Optional[Image.Image]:
    try:
        r = requests.get(url, headers=headers(), timeout=20)
        if r.status_code == 200:
            return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception:
        return None
    return None

def select_3_food_2_interior(media: List[Dict[str,Any]], classifier: ClipClassifier) -> Tuple[List[Dict[str,Any]], List[Dict[str,Any]]]:
    # de-duplicate by perceptual hash
    seen = set()
    scored = []
    for item in media:
        img = download_image(item["url"])
        if img is None:
            continue
        ph = imagehash.average_hash(img, hash_size=16)
        if ph in seen:
            continue
        seen.add(ph)
        fs, iscore = classifier.score(img)
        scored.append({"url": item["url"], "caption": item.get("caption",""), "food": fs, "interior": iscore})
    # rank
    food_sorted = sorted(scored, key=lambda x: x["food"], reverse=True)
    interior_sorted = sorted(scored, key=lambda x: x["interior"], reverse=True)
    return food_sorted[:3], interior_sorted[:2]

# --------------------------
# Menu finder
# --------------------------

MENU_WORDS = [
    "menu", "menyu", "menü", "меню", "speisekarte", "карта", "карта меню", "karte"
]
# Also treat "food", "yemək", "kahvaltı", "şirniyyat", etc. as weaker hints if anchor text contains them with "menu"
WEAK_HINTS = ["food", "cuisine", "qida", "yemək", "kahvalti", "kahvaltı", "şirniyyat", "dessert", "drinks", "bar"]

def discover_menu_url(website: Optional[str], ig_bio_url: Optional[str]) -> Tuple[Optional[str], float, str]:
    """
    Strategy:
      1) Crawl homepage and common pages; find <a> with text matching MENU_WORDS (highest).
      2) If none, parse link-in-bio (Linktree, Flowpage, etc.) for a menu link.
      3) Last resort: check anchors that contain 'menu' in href, verify 200.
    Returns: (url, confidence, source)
    """
    tried = set()
    def crawl(url: str) -> Optional[str]:
        if not url or url in tried:
            return None
        tried.add(url)
        r = safe_get(url)
        if r is None:
            return None
        soup = BeautifulSoup(r.text, "html.parser")
        # strong match by anchor text
        candidates = []
        for a in soup.find_all("a", href=True):
            text = norm(a.get_text(" ") or "").lower()
            href = a["href"]
            full = urljoin(url, href)
            if is_pdf_url(full) and any(w in text for w in MENU_WORDS):
                return full
            # keep candidates
            score = 0
            if any(w in text for w in MENU_WORDS):
                score += 3
            if "menu" in href.lower():
                score += 2
            if any(w in text for w in WEAK_HINTS):
                score += 1
            if score > 0:
                candidates.append((score, full))
        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            for _, u in candidates:
                if head_ok(u) or safe_get(u) is not None:
                    return u
        return None

    # 1) website crawl
    if website:
        for path in ["", "/menu", "/menyu", "/menü", "/ru", "/az", "/en", "/tr", "/about", "/contact", "/food", "/dishes"]:
            u = urljoin(website, path) if path else website
            m = crawl(u)
            if m:
                conf = 0.95 if is_pdf_url(m) else 0.85
                return m, conf, "website"

    # 2) link-in-bio
    if ig_bio_url:
        m = crawl(ig_bio_url)
        if m:
            return m, 0.8, "ig_bio"

    # 3) none
    return None, 0.0, "none"

# --------------------------
# Tag generation
# --------------------------

KEYWORDS = {
    # cuisine
    "azerbaijani": ["azerbaijani","azərbaycan","qutab","döner","dönər","plov","dolma","kebap","kabab","qəlyanaltı","gurza"],
    "georgian": ["georgian","khinkali","hacapuri","khachapuri","xinkali","хинкали","хачапури"],
    "sushi": ["sushi","roll","nigiri","sashimi","японская","японский","japanese"],
    "steakhouse": ["steak","ribeye","t-bone","porterhouse","sirloin","steakhouse"],
    "burger": ["burger","бургер"],
    "pizza": ["pizza","пицца"],
    "seafood": ["fish","balıq","seafood","морепродукты","əjdaha","shrimp","prawn","salmon","tuna","oyster"],
    "vegan": ["vegan","vegan-friendly","веган"],
    "vegetarian": ["vegetarian","вегетариан"],
    "dessert": ["dessert","şirniyyat","sweet","cake","tort","чизкейк","пирожное"],
    "breakfast": ["breakfast","kahvaltı","zavtrak","завтрак","səhər yeməyi"],
    "coffee": ["coffee","espresso","latte","americano","капучино","кофе","qəhvə"],
    "bar": ["bar","cocktail","mixology","drinks","мохито","маргарита","negroni"],
    "shisha": ["shisha","hookah","nargile","kalyan","кальян","nargilə"],
    # vibes
    "late night": ["late night","ночью","open late","gecə açıq"],
    "rooftop": ["rooftop","terrace","teras","терасса","terras"],
    "fine dining": ["fine dining","мишелин","sommelier","tasting menu"],
    "family-friendly": ["family","kids","ușaq","дети","детское меню","child"],
    "live music": ["live music","dj","музыка","концерт"],
}

def make_tags(text_blobs: List[str], place_types: List[str]) -> List[str]:
    base = set()
    big_text = " | ".join([t.lower() for t in text_blobs if t])
    for tag, words in KEYWORDS.items():
        for w in words:
            if w in big_text:
                base.add(tag)
                break
    # infer from Google place types
    type_map = {
        "bar": "bar", "night_club": "late night", "cafe": "coffee",
        "meal_takeaway": "takeout", "meal_delivery": "delivery",
        "bakery": "dessert", "restaurant": None
    }
    for t in place_types or []:
        if t in type_map and type_map[t]:
            base.add(type_map[t])

    # ensure at least five tags with fallbacks
    fallbacks = ["restaurant","casual","trendy","cozy","group friendly","romantic"]
    for f in fallbacks:
        if len(base) >= 5: break
        base.add(f)
    return list(base)[:8]

# --------------------------
# Main enrich flow
# --------------------------

def resolved_bio_link_from_instagram_profile(handle: Optional[str]) -> Optional[str]:
    # Lightweight: if Apify result includes profile info, it can return externalUrl.
    # To keep the script compact, we won't hit profile again here.
    # Leave None; menu finder will rely on website crawl primarily.
    return None

@app.command()
def enrich(
    name: str = typer.Argument(..., help="Restaurant name (Baku)"),
    out_dir: pathlib.Path = typer.Option(pathlib.Path("out/restaurants"), "--out-dir", help="Output directory"),
    download_images: bool = typer.Option(bool(os.getenv("DOWNLOAD_IMAGES","false").lower()=="true"), "--download-images", help="Download images instead of keeping remote URLs"),
    min_confidence: float = typer.Option(0.7, help="Minimum confidence for IG handle & menu before 'needs_review'"),
    limit_posts: int = typer.Option(60, help="Max IG posts to scan")
):
    load_dotenv(override=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Google Places
    gkey = os.getenv("GOOGLE_MAPS_API_KEY")
    if not gkey:
        typer.echo("GOOGLE_MAPS_API_KEY is required.", err=True)
        raise typer.Exit(2)
    gmaps = googlemaps.Client(key=gkey)
    place = find_place_in_baku(gmaps, name)
    if not place:
        typer.echo(json.dumps({"error":"place_not_found","input":name}, ensure_ascii=False, indent=2))
        raise typer.Exit(1)

    website = place.get("website")
    maps_link = to_maps_place_url(place["place_id"])

    # Instagram handle
    ig_handle, ig_conf, ig_source = resolve_instagram_handle(place["name"], website)
    ig_url = f"https://www.instagram.com/{ig_handle}/" if ig_handle else None

    # Instagram media
    media = fetch_instagram_media(ig_handle, limit=limit_posts) if ig_handle else []
    # Classify & select 3 food + 2 interior
    clf = ClipClassifier()
    food, interior = select_3_food_2_interior(media, clf)

    # Menu URL
    ig_bio_link = resolved_bio_link_from_instagram_profile(ig_handle)
    menu_url, menu_conf, menu_src = discover_menu_url(website, ig_bio_link)

    # Tags from captions + website + place types
    captions = [m.get("caption","") for m in media[:40]]
    site_text = ""
    if website:
        r = safe_get(website)
        if r is not None:
            soup = BeautifulSoup(r.text, "html.parser")
            site_text = soup.get_text(" ", strip=True)[:5000]
    raw_types = place.get("types") or place.get("type") or []
    if isinstance(raw_types, str):
        place_types = [raw_types]
    else:
        place_types = raw_types
    tags = make_tags([*captions, site_text], place_types)

    # Download or keep URLs
    def persist_images(items: List[Dict[str,Any]], prefix: str) -> List[str]:
        urls = []
        for i, it in enumerate(items, 1):
            u = it["url"]
            if download_images:
                # keep extension if known
                ext = pathlib.Path(urlparse(u).path).suffix or ".jpg"
                img_name = f"{slug}-" + f"{prefix}{i}{ext}"
                img_path = out_dir / "images" / img_name
                img_path.parent.mkdir(parents=True, exist_ok=True)
                img = download_image(u)
                if img:
                    img.save(img_path)
                    urls.append(f"images/{img_name}")
            else:
                urls.append(u)
        return urls

    slug = slugify(place["name"])
    food_urls = persist_images(food, "food-")
    interior_urls = persist_images(interior, "interior-")

    needs_review = (ig_conf < min_confidence) or (menu_conf < min_confidence) or (len(food_urls) < 3) or (len(interior_urls) < 2)

    record = {
        "slug": slug,
        "name": place["name"],
        "address": place.get("formatted_address"),
        "location": {
            "lat": place["geometry"]["location"]["lat"],
            "lng": place["geometry"]["location"]["lng"],
        },
        "google_maps_url": maps_link,
        "phone": place.get("international_phone_number"),
        "website": website,
        "instagram": {
            "handle": ig_handle,
            "url": ig_url,
            "confidence": round(ig_conf, 2),
            "source": ig_source
        },
        "menu_url": {
            "url": menu_url,
            "confidence": round(menu_conf, 2),
            "source": menu_src
        },
        "images": {
            "food": food_urls,       # exactly 3 if available
            "interior": interior_urls # exactly 2 if available
        },
        "tags": tags[:8],
        "needs_review": needs_review,
        "generated_at": int(time.time())
    }

    # Save JSON
    out_path = out_dir / f"{slug}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)

    typer.echo(json.dumps(record, ensure_ascii=False, indent=2))
    typer.echo(f"\nSaved -> {out_path}", err=True)

if __name__ == "__main__":
    app()
