"""Season label to the SKU prefix Shopify and Salesforce use.

Ported from web-apps/services/transform/season.py. The arithmetic is kept
rather than a lookup table, for the reason given there: the hand-written table
it replaced had no F27 row, so F28 borrowed F27's code and everything after
shifted. Worse, an unknown code was passed straight through and became a SKU
prefix matching nothing — the run ended with an empty report and no
explanation, so a typo and a quiet week looked identical.

This is the same number as seasons.season_number in our own schema (S27 is 58
either way); it is computed rather than read so a fetch does not depend on the
season already existing here.
"""
EPOCH_YEAR = 23
EPOCH_CODE = 50
MIN_YEAR = 19
MAX_YEAR = 40


def season_to_code(season: str) -> str:
    """"S26" -> "K56", "F27" -> "K59". Raises on anything else.

    Raising is the point. Returning the input unchanged is what made a typo
    indistinguishable from a week with no sales.
    """
    text = "" if season is None else str(season).strip().upper()
    if len(text) != 3 or text[0] not in ("S", "F") or not text[1:].isdigit():
        raise ValueError(f"invalid season code: {season!r} — expected S## or F##")

    year = int(text[1:])
    if not MIN_YEAR <= year <= MAX_YEAR:
        raise ValueError(
            f"season year out of range: {text} (expected S/F{MIN_YEAR}..{MAX_YEAR})")

    offset = (year - EPOCH_YEAR) * 2 + (1 if text[0] == "F" else 0)
    return f"K{EPOCH_CODE + offset}"
