"""Splitting and tidying the strings both sources send.

Ported from web-apps/services/reports/sales_report/pipeline.py. The two
behaviours here are load-bearing and were both bugs once.
"""
import re

# Spelled out rather than \s because a non-breaking space — the kind that
# rides along with spreadsheet and CMS copy-paste — is not ASCII whitespace.
# Covers NBSP, the en/em space range, zero-width space, narrow NBSP,
# ideographic space, and a stray BOM.
WHITESPACE = "[\\s  -​  　﻿]"
_RUNS = re.compile(WHITESPACE + "+")
_AROUND_SLASH = re.compile(WHITESPACE + "*/" + WHITESPACE + "*")


def tidy(value) -> str:
    """Collapse stray whitespace so near-duplicates key as one value.

    "BLACK /PURE SNOW" and "BLACK/PURE SNOW" are the same colour, but as raw
    strings they are two group-by keys. Runs of whitespace become one space,
    space around a "/" separator goes entirely, then the ends are trimmed.
    Whitespace inside a word stays: "PURE SNOW" never becomes "PURESNOW".
    """
    if value is None:
        return ""
    text = _RUNS.sub(" ", str(value))
    text = _AROUND_SLASH.sub("/", text)
    return text.strip()


def parse_style_color(product_name):
    """"STYLE-COLOR-SIZE" -> (style, colour, size).

    Anchored from the RIGHT. The separator is "-", but a style may contain one
    ("ZIP-V COTTON") while colour and size never do — a multi-colour name uses
    "/" ("PRETTY PINK/ALMOND BUTTER") and a size is "S/M". So size is the last
    segment, colour the one before it, and everything remaining re-joined is
    the style. Taking the first segment as the style truncates every hyphenated
    name.
    """
    if not isinstance(product_name, str):
        return "", "", ""

    parts = [p.strip() for p in product_name.split("-")]
    if len(parts) >= 3:
        return "-".join(parts[:-2]).strip(), parts[-2], parts[-1]
    if len(parts) == 2:
        return parts[0], parts[1], ""
    return parts[0], "", ""
