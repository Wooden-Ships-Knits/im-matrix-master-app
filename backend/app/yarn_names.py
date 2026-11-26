"""Yarn names: what a written yarn is, and which yarn a written name means.

Every loader that reads a yarn out of someone's file comes through here, so
the rules live in one place and a row that cannot be placed says WHY.

The rules, in the order they are tried:

1. A confirmed alias (`yarn_aliases`), this source's first, then one marked
   for every source. A spelling a person has already answered is never a
   question again.
2. The written text itself. Our yarn identity is still the whole label
   ("YCA BREAKER WHITE - 658"), so an exact match is a match.
3. Prefix + code, and then the colour name must agree too. A code that
   exists under another colour name is NOT a match: it is the reason one
   yarn becomes two, so it stops and asks.

What does not parse is told apart from what is merely unknown:

  unparsed            the text is not a yarn reference at all
  trim                it is a trim (XZIP, STAMP …), not a colour
  unknown_code        prefix + code parse, no yarn of ours carries them
  code_name_conflict  the code is ours, under a different colour name

The parse follows the ERP project's `item.parse_material`
(database-manangement-erp, erp/db/schema/04_recon.sql), with two deliberate
differences, both ours to keep:

  * the colour name is split at the LAST " - " whose tail looks like a
    supplier code, not the first. "YCA NAVY - BLUE - 880" is the colour
    "NAVY - BLUE", code 880; splitting at the first dash makes the code
    "BLUE - 880", which is not a code.
  * a code must look like a code: digits, with one optional letter
    ("1708", "1708 B"). The four qty figures of a row whose code is
    "ELASTIC" were never going to be yarn kilos.

This parse runs ONE WAY. `yarn_colors.name` is the written label and the
identity; `prefix` and `color_code` are copies of parts of it, kept so a
query can ask about them. Nothing rebuilds the label from the parts — a
label-from-parts helper lived here unused until the style editor's BOM did
exactly that and printed "YST YST RED PAPRIKA - 893 - 893". It is gone, and
frontend/test/sheet.test.mjs now fails if one comes back. To show a yarn,
select its name.
"""
from __future__ import annotations

import re

# The seven yarn bases, the YARN ANALYSIS sheets and `yarn_materials` (0030).
# repo._YARN_MATERIALS filters the BOARD by the same seven: one vocabulary,
# two uses, pinned together in frontend/test/sheet.test.mjs.
YARN_PREFIXES = ("YY", "YST", "YCA", "YAC", "YTX", "YP", "BJ")

# Trims are not colours. They are named so the queue can say "that is a trim"
# instead of "unreadable": a different answer for the operator.
TRIM_PREFIXES = ("XZIP", "XB", "XSNAP", "XGROMET", "STAMP", "XLB", "XTAG")

# A supplier colour code: digits, optionally one letter ("1708", "1708 B").
CODE = r"[0-9]+(?: ?[A-Z])?"

_YARN_RE = re.compile(r"^(%s) (.+)\s*-\s*(%s)$" % ("|".join(YARN_PREFIXES), CODE))
# YTX colours are numbered, so they have a code and no name: "YTX - 031".
_CODE_ONLY_RE = re.compile(r"^(YTX)\s*-\s*(%s)$" % CODE)
# BJ is benang jahit, sewing thread. Most of its 37 rows carry a code like
# any yarn ("BJ ALMOND BUTTER - 735"), but six are written by colour alone
# ("BJ BREAKER WHITE", "BJ BREAKER WHITE - NATURAL"), and BJ has no YARN
# ANALYSIS sheet, so no code is coming for them. Name-only is the LAST
# yarn pattern tried: a BJ row with a code still parses as one.
_NAME_ONLY_RE = re.compile(r"^(BJ) (.+)$")
_TRIM_RE = re.compile(r"^(%s)\b" % "|".join(TRIM_PREFIXES))


def squash(text) -> str:
    """Upper case, single spaces, trimmed — how every name is compared."""
    return " ".join(str(text or "").split()).upper()


def parse_yarn_name(text) -> dict | None:
    """{kind, prefix, name, code} for a written yarn, or None.

    `name` is None for a numbered yarn (YTX - 031); `code` is None for a
    trim, whose identity is its whole text.
    """
    s = squash(text)
    if not s:
        return None
    m = _CODE_ONLY_RE.match(s)
    if m:
        return {"kind": "yarn", "prefix": m.group(1), "name": None,
                "code": m.group(2)}
    m = _YARN_RE.match(s)
    if m:
        return {"kind": "yarn", "prefix": m.group(1),
                "name": m.group(2).strip(" -") or None, "code": m.group(3)}
    m = _NAME_ONLY_RE.match(s)
    if m:
        return {"kind": "yarn", "prefix": m.group(1),
                "name": m.group(2).strip(" -") or None, "code": None}
    if _TRIM_RE.match(s):
        return {"kind": "trim", "prefix": _TRIM_RE.match(s).group(1),
                "name": None, "code": None}
    return None


def resolve_yarn(cur, text, source_code: str = "*") -> tuple[int | None, str, dict]:
    """(yarn_color_id, reason, detail) for one written yarn. Never guesses.

    `cur` is an open cursor; nothing here writes. The reasons are the ones
    in this module's docstring, plus 'alias', 'name' and 'code_and_name'
    for the three ways a row is placed.
    """
    s = squash(text)
    if not s:
        return None, "unparsed", {}

    cur.execute("""
        SELECT yarn_color_id FROM yarn_aliases
         WHERE alias_text = %s AND source_code IN (%s, '*')
         ORDER BY (source_code = %s) DESC
         LIMIT 1
    """, (s, source_code, source_code))
    row = cur.fetchone()
    if row:
        return row[0], "alias", {}

    # Squashed on both sides: the workbook spells one yarn with one space and
    # another with two, and those are the same yarn.
    cur.execute("SELECT id FROM yarn_colors"
                " WHERE upper(btrim(regexp_replace(name, '\\s+', ' ', 'g'))) = %s"
                " ORDER BY id LIMIT 1", (s,))
    row = cur.fetchone()
    if row:
        return row[0], "name", {}

    parsed = parse_yarn_name(s)
    if parsed is None:
        return None, "unparsed", {"written": s}
    if parsed["kind"] == "trim":
        return None, "trim", {"written": s, "prefix": parsed["prefix"]}

    # IS NOT DISTINCT FROM, because a codeless yarn (BJ) has to find the rows
    # whose code is NULL rather than find nothing.
    cur.execute("""
        SELECT y.id, y.name, c.name
          FROM yarn_colors y
          LEFT JOIN colors c ON c.id = y.color_id
         WHERE y.prefix = %s
           AND upper(btrim(regexp_replace(y.color_code, '\\s+', ' ', 'g')))
               IS NOT DISTINCT FROM %s
         ORDER BY y.id
    """, (parsed["prefix"], parsed["code"]))
    hits = cur.fetchall()
    for cid, label, colour in hits:
        if squash(colour) == squash(parsed["name"]):
            return cid, "code_and_name", {}

    detail = {"written": s, "prefix": parsed["prefix"], "code": parsed["code"],
              "colour": parsed["name"],
              # The same colour name under another code is usually the answer
              # the operator is looking for, so it travels with the question.
              "same_name": _same_name(cur, parsed)}
    if not hits or parsed["code"] is None:
        # Nothing carries this code — or there is no code to carry (BJ), and
        # no thread of ours has that colour name. "Belongs to another colour"
        # would be the wrong thing to say.
        return None, "unknown_code", detail
    return None, "code_name_conflict", {
        **detail,
        "code_belongs_to": [{"id": cid, "name": label} for cid, label, _ in hits],
    }


def _same_name(cur, parsed) -> list[dict]:
    """Yarns of this prefix whose colour name matches, whatever their code."""
    if not parsed["name"]:
        return []
    cur.execute("""
        SELECT y.id, y.name
          FROM yarn_colors y
          JOIN colors c ON c.id = y.color_id
         WHERE y.prefix = %s AND upper(c.name) = %s
         ORDER BY y.id
         LIMIT 5
    """, (parsed["prefix"], squash(parsed["name"])))
    return [{"id": r[0], "name": r[1]} for r in cur.fetchall()]
