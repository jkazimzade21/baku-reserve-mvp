from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping

LANG_CODES = {"en", "az", "ru"}


def _normalize_token(value: str) -> str:
    lowered = unicodedata.normalize("NFKD", value.strip().lower())
    cleaned_chars = [ch if ch.isalnum() or ch == " " else " " for ch in lowered]
    cleaned = "".join(cleaned_chars)
    cleaned = re.sub(r"[\s\-]+", " ", cleaned)
    parts = [part for part in cleaned.split() if part]
    return "_".join(parts)


def _build_lookup(mapping: Mapping[str, Mapping[str, list[str]]]) -> dict[str, str]:
    reverse: dict[str, str] = {}
    for canonical, localized in mapping.items():
        token = _normalize_token(canonical)
        reverse[token] = canonical
        for synonyms in localized.values():
            for synonym in synonyms:
                key = _normalize_token(synonym)
                if key:
                    reverse[key] = canonical
    return reverse


CANONICAL_VIBE_TAGS: dict[str, dict[str, list[str]]] = {
    "romantic": {
        "en": ["romantic", "date night", "anniversary"],
        "az": ["romantik", "sevgililer", "sevgilim"],
        "ru": ["романтика", "для свидания", "романтический"],
    },
    "family_friendly": {
        "en": ["family", "kids friendly"],
        "az": ["ailəvi", "uşaqlar üçün"],
        "ru": ["семейный", "с детьми"],
    },
    "rooftop": {
        "en": ["rooftop", "terrace", "sky lounge"],
        "az": ["dam terası", "terasa"],
        "ru": ["на крыше", "терраса"],
    },
    "garden": {
        "en": ["garden", "courtyard"],
        "az": ["bağ", "həyətyanı"],
        "ru": ["сад", "двор"],
    },
    "live_music": {
        "en": ["live music", "band", "jazz"],
        "az": ["canlı musiqi", "caz"],
        "ru": ["живая музыка", "джаз"],
    },
    "skyline": {
        "en": ["skyline", "city view", "panoramic"],
        "az": ["şəhər mənzərəsi", "panorama"],
        "ru": ["вид на город", "панорама"],
    },
    "waterfront": {
        "en": ["waterfront", "boulevard", "seaside"],
        "az": ["dənizkənarı", "bulvar"],
        "ru": ["у моря", "набережная"],
    },
    "mixology": {
        "en": ["mixology", "cocktail bar"],
        "az": ["kokteyl bar"],
        "ru": ["коктейльный бар"],
    },
    "brunch": {
        "en": ["brunch"],
        "az": ["branç"],
        "ru": ["бранч"],
    },
    "breakfast": {
        "en": ["breakfast", "morning"],
        "az": ["səhər yeməyi"],
        "ru": ["завтрак"],
    },
    "late_night": {
        "en": ["late night", "after hours"],
        "az": ["gecə", "gec açıq"],
        "ru": ["ночью", "допоздна"],
    },
    "shisha": {
        "en": ["shisha", "hookah"],
        "az": ["nargilə"],
        "ru": ["кальян"],
    },
    "wine_cellar": {
        "en": ["wine cellar", "sommelier"],
        "az": ["şərab zirzəmisi"],
        "ru": ["винный погреб", "сомелье"],
    },
    "seafood": {
        "en": ["seafood", "fish"],
        "az": ["dəniz məhsulları", "balıq"],
        "ru": ["морепродукты", "рыба"],
    },
    "steakhouse": {
        "en": ["steak", "grill"],
        "az": ["stek", "ət evi"],
        "ru": ["стейк", "гриль"],
    },
    "sushi": {
        "en": ["sushi", "japanese"],
        "az": ["suşi", "yapon"],
        "ru": ["суши", "японская"],
    },
    "cozy": {
        "en": ["cozy", "intimate"],
        "az": ["komfortlu"],
        "ru": ["уютный", "ламповый"],
    },
    "fine_dining": {
        "en": ["fine dining", "tasting menu"],
        "az": ["premium", "degustasiya"],
        "ru": ["высокая кухня", "дегустационное меню"],
    },
    "trendy": {
        "en": ["trendy", "stylish"],
        "az": ["dəbdəbəli"],
        "ru": ["модный", "стильный"],
    },
    "group_friendly": {
        "en": ["group", "large party"],
        "az": ["qrup", "böyük masa"],
        "ru": ["группой", "большая компания"],
    },
    "heritage": {
        "en": ["heritage", "traditional"],
        "az": ["milli", "ənənəvi"],
        "ru": ["традиционный", "национальный"],
    },
    "tea_house": {
        "en": ["tea house", "tea garden", "tea room"],
        "az": ["çay evi", "çay bağı"],
        "ru": ["чайхана", "чайный дом"],
    },
    "armudu_tea_service": {
        "en": ["armudu tea", "pear glass tea", "armudu service"],
        "az": ["armudu çay", "armudu stəkan", "armudu servis"],
        "ru": ["армуду", "грушевидный стакан"],
    },
    "samovar_service": {
        "en": ["samovar tea", "samovar service"],
        "az": ["samovar çay", "samovar xidməti"],
        "ru": ["самовар", "чай из самовара"],
    },
    "dominoes_available": {
        "en": ["dominoes", "domino tables"],
        "az": ["dominolar", "domino masası"],
        "ru": ["домино", "костяшки"],
    },
    "backgammon_tables": {
        "en": ["backgammon", "nard tables"],
        "az": ["nərd", "nərd masası"],
        "ru": ["нарды", "настольные нарды"],
    },
    "board_games": {
        "en": ["board games", "table games"],
        "az": ["stolüstü oyunlar"],
        "ru": ["настольные игры"],
    },
    "live_mugham_music": {
        "en": ["live mugham", "mugham band"],
        "az": ["canlı muğam", "muğam"],
        "ru": ["мугам", "живая мугам музыка"],
    },
    "dj_nights": {
        "en": ["dj nights", "club dj"],
        "az": ["dj gecələri", "klub dj"],
        "ru": ["диджей", "dj вечер"],
    },
    "vegan_options": {
        "en": ["vegan options", "plant based"],
        "az": ["vegan seçimlər"],
        "ru": ["веган меню"],
    },
    "gluten_free_options": {
        "en": ["gluten free", "gf options"],
        "az": ["qlütensiz"],
        "ru": ["безглютеновое"],
    },
    "kids_corner": {
        "en": ["kids corner", "play area", "kid zone"],
        "az": ["uşaq guşəsi", "uşaq meydançası"],
        "ru": ["детский уголок", "для детей"],
    },
    "wheelchair_accessible": {
        "en": ["wheelchair accessible", "step free"],
        "az": ["maneəsiz giriş", "araba girişli"],
        "ru": ["доступно для инвалидов", "без ступенек"],
    },
    "specialty_coffee": {
        "en": ["specialty coffee", "third wave coffee"],
        "az": ["spesialti qəhvə"],
        "ru": ["спешелти кофе"],
    },
    "wine_bar": {
        "en": ["wine bar", "wine lounge"],
        "az": ["şərab barı"],
        "ru": ["винный бар"],
    },
    "rooftop_lounge": {
        "en": ["rooftop lounge", "sky lounge"],
        "az": ["dam lounge", "dam barı"],
        "ru": ["лаунж на крыше", "скай-бар"],
    },
    "sunset_dining": {
        "en": ["sunset dining", "sunset view"],
        "az": ["günbatımı yeməyi"],
        "ru": ["ужин на закате"],
    },
}


CANONICAL_LOCATION_TAGS: dict[str, dict[str, list[str]]] = {
    "old_city": {
        "en": ["old city", "icheri sheher"],
        "az": ["içərişəhər"],
        "ru": ["ичеришехер", "старый город"],
    },
    "fountain_square": {
        "en": ["fountain square", "nizami street"],
        "az": ["fıskiyələr", "nizami"],
        "ru": ["фонтан", "низамии", "торговая"],
    },
    "port_baku": {
        "en": ["port baku", "white city"],
        "az": ["port baku"],
        "ru": ["порт баку", "белый город"],
    },
    "seaside": {
        "en": ["seaside", "boulevard"],
        "az": ["dənizkənarı", "bulvar"],
        "ru": ["набережная", "у моря"],
    },
    "flame_towers": {
        "en": ["flame towers", "highland park"],
        "az": ["alov qüllələri"],
        "ru": ["пламенные башни", "аловые башни"],
    },
    "bayil": {
        "en": ["bayil"],
        "az": ["bayıl"],
        "ru": ["байыл"],
    },
    "yasamal": {
        "en": ["yasamal", "parliament avenue"],
        "az": ["yasamal"],
        "ru": ["ясамал"],
    },
    "city_center": {
        "en": ["city center", "downtown"],
        "az": ["şəhər mərkəzi"],
        "ru": ["центр", "даунтаун"],
    },
    "ganjlik": {
        "en": ["ganjlik", "ganclik"],
        "az": ["gənclik"],
        "ru": ["гянджлик"],
    },
}


CUISINE_SYNONYMS: dict[str, dict[str, list[str]]] = {
    "azerbaijani": {
        "en": ["azerbaijani", "azerbaijan"],
        "az": ["azərbaycan mətbəxi", "azerbaycan mətbəxi", "azeri"],
        "ru": ["азербайджанская"],
    },
    "mediterranean": {
        "en": ["mediterranean"],
        "az": ["aralıq dənizi"],
        "ru": ["средиземноморская"],
    },
    "seafood": {
        "en": ["seafood", "fish"],
        "az": ["dəniz məhsulu"],
        "ru": ["морепродукты"],
    },
    "steakhouse": {
        "en": ["steak", "grill"],
        "az": ["stek"],
        "ru": ["стейк"],
    },
    "sushi": {
        "en": ["sushi", "japanese"],
        "az": ["suşi", "yapon"],
        "ru": ["суши", "японская"],
    },
    "italian": {
        "en": ["italian"],
        "az": ["italyan"],
        "ru": ["итальянская"],
    },
    "turkish": {
        "en": ["turkish"],
        "az": ["türk"],
        "ru": ["турецкая"],
    },
    "russian": {
        "en": ["russian"],
        "az": ["rus"],
        "ru": ["русская"],
    },
    "international": {
        "en": ["international", "fusion"],
        "az": ["fyuzyon"],
        "ru": ["интернациональная"],
    },
    "pan_asian": {
        "en": ["pan asian", "asian"],
        "az": ["asiyalı"],
        "ru": ["паназиатская", "азиатская"],
    },
}


NEGATIVE_SYNONYMS: dict[str, dict[str, list[str]]] = {
    "no_loud_music": {
        "en": ["no loud music", "quiet", "calm"],
        "az": ["sakit", "səs-küy olmasın"],
        "ru": ["без громкой музыки", "тихое место"],
    },
    "no_smoking": {
        "en": ["no smoking", "smoke free"],
        "az": ["siqaret olmasın", "tüstüsüz"],
        "ru": ["не курят", "без дыма"],
    },
    "not_spicy": {
        "en": ["not spicy", "mild"],
        "az": ["acı olmasın", "yüngül"],
        "ru": ["не острое", "мягкое"],
    },
    "no_shisha": {
        "en": ["no shisha", "no hookah"],
        "az": ["nargilə olmasın"],
        "ru": ["без кальяна"],
    },
}


_VIBE_LOOKUP = _build_lookup(CANONICAL_VIBE_TAGS)
_LOCATION_LOOKUP = _build_lookup(CANONICAL_LOCATION_TAGS)
_CUISINE_LOOKUP = _build_lookup(CUISINE_SYNONYMS)
_NEGATIVE_LOOKUP = _build_lookup(NEGATIVE_SYNONYMS)


def _canonicalize(
    values: Iterable[str] | None, lookup: Mapping[str, str], allow_passthrough: bool
) -> list[str]:
    if not values:
        return []
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        token = _normalize_token(str(value))
        if not token:
            continue
        resolved = lookup.get(token)
        if not resolved and allow_passthrough:
            resolved = token
        if not resolved or resolved in seen:
            continue
        seen.add(resolved)
        result.append(resolved)
    return result


def canonicalize_vibes(values: Iterable[str] | None, lang: str | None = None) -> list[str]:
    return _canonicalize(values, _VIBE_LOOKUP, allow_passthrough=True)


def canonicalize_amenities(values: Iterable[str] | None, lang: str | None = None) -> list[str]:
    return _canonicalize(values, _VIBE_LOOKUP, allow_passthrough=True)


def canonicalize_locations(values: Iterable[str] | None, lang: str | None = None) -> list[str]:
    return _canonicalize(values, _LOCATION_LOOKUP, allow_passthrough=True)


def canonicalize_cuisines(values: Iterable[str] | None, lang: str | None = None) -> list[str]:
    return _canonicalize(values, _CUISINE_LOOKUP, allow_passthrough=True)


def canonicalize_negatives(values: Iterable[str] | None, lang: str | None = None) -> list[str]:
    return _canonicalize(values, _NEGATIVE_LOOKUP, allow_passthrough=False)


NEIGHBORHOOD_TO_LOCATION = {
    "icherisheher": "old_city",
    "old_city": "old_city",
    "fountain_square": "fountain_square",
    "nizami_street": "fountain_square",
    "malakan_garden": "fountain_square",
    "port_baku": "port_baku",
    "white_city": "port_baku",
    "seaside_boulevard": "seaside",
    "neftchilar_avenue": "seaside",
    "bayil": "bayil",
    "flame_towers": "flame_towers",
    "highland_park": "flame_towers",
    "city_center": "city_center",
    "downtown": "city_center",
    "nasimi": "city_center",
    "yasamal": "yasamal",
    "parliament_avenue_yasamal": "yasamal",
    "ganjlik": "ganjlik",
    "ganclik": "ganjlik",
    "gənclik": "ganjlik",
    "ganjlik_mall": "ganjlik",
    "6th_parallel": "city_center",
    "sixth_parallel": "city_center",
    "boyuk_qala": "old_city",
}


PRICE_BUCKET_ORDER = ["budget", "mid", "upper", "luxury"]


def restaurant_price_bucket(price_level: str | None) -> str:
    if not price_level:
        return "mid"
    digits = re.findall(r"([1-4])", price_level)
    if digits:
        idx = int(digits[0])
    elif price_level.strip().count("$"):
        idx = price_level.count("$")
    else:
        idx = 2
    idx = max(1, min(4, idx))
    return PRICE_BUCKET_ORDER[idx - 1]


def price_bucket_to_int(bucket: str | None) -> int:
    if not bucket:
        return 2
    bucket = bucket.lower()
    try:
        return PRICE_BUCKET_ORDER.index(bucket) + 1
    except ValueError:
        return 2


def derive_restaurant_tags(record: Mapping[str, object]) -> set[str]:
    tags = []
    for key in ("tags", "highlights", "experiences"):
        raw = record.get(key)
        if isinstance(raw, list):
            tags.extend(str(item) for item in raw if isinstance(item, str))
    return set(canonicalize_vibes(tags))


def derive_restaurant_cuisines(record: Mapping[str, object]) -> set[str]:
    cuisines = record.get("cuisine")
    if not isinstance(cuisines, list):
        return set()
    return set(canonicalize_cuisines(str(item) for item in cuisines))


def derive_restaurant_locations(record: Mapping[str, object]) -> set[str]:
    values: list[str] = []
    neighborhood = record.get("neighborhood")
    if neighborhood:
        values.append(str(neighborhood))
    address = record.get("address")
    if address:
        values.append(str(address))
    tags = record.get("tags") or []
    if isinstance(tags, list):
        values.extend(str(tag) for tag in tags if isinstance(tag, str))
    canonical = set(canonicalize_locations(values))
    for value in values:
        token = _normalize_token(str(value))
        mapped = NEIGHBORHOOD_TO_LOCATION.get(token)
        if mapped:
            canonical.add(mapped)
    return canonical


def normalize_negative_preferences(values: Iterable[str] | None) -> list[str]:
    return canonicalize_negatives(values)


PROMPT_STOPWORDS = {
    "with",
    "from",
    "that",
    "this",
    "have",
    "your",
    "please",
    "need",
    "looking",
    "around",
    "near",
    "city",
    "place",
    "like",
    "just",
    "very",
    "want",
    "after",
    "before",
    "take",
    "make",
    "keep",
    "more",
    "less",
    "over",
    "under",
    "into",
    "some",
    "good",
    "best",
    "also",
    "only",
}


def prompt_keywords(prompt: str) -> set[str]:
    tokens = re.findall(r"[\w]+", prompt.lower())
    return {token for token in tokens if len(token) > 3 and token not in PROMPT_STOPWORDS}
