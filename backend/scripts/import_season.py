"""Import IM MASTER styles into the app, one season or all five, through the API.

    /usr/bin/python3 backend/scripts/import_season.py --season S27 --limit 20
    /usr/bin/python3 backend/scripts/import_season.py --all --dry-run
    /usr/bin/python3 backend/scripts/import_season.py --all

Writes go through POST/PUT /api/styles like the screens do, so whatever this
proves is true of the real write path.

Nothing here knows a column letter. Every column is found by header name, and
where a name is ambiguous the choice is made structurally — see resolve_retail.
"""
import argparse
import collections
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sheet import (Sheet, Ambiguous, channel_of, collection_at,  # noqa: E402
                   finishing_of, minutes_from, rate_cells, split_description)

ROOT = Path(__file__).resolve().parents[2]
SEASONS = ["S25", "F25", "S26", "F26", "S27"]
API = "http://localhost:8085"

# Operation code -> header name. S25/F25/F26 call the column EMBRO/STAMP;
# S26 and S27 renamed it to STAMP, so both names are offered.
OPS = {
    "CEK_POLA": ("CEK POLA",), "LINK": ("LINK",), "QC_LINK": ("QC LINK",),
    "FINISHING": ("FINISHING",), "QC_FINISHING": ("QC FINISHING",),
    "LABEL_SEWING": ("LABEL SEWING: LOGO & CONTENT",), "STEAM": ("STEAM",),
    "QC_PRE": ("QC PRE",), "QC_FINAL": ("QC FINAL",), "SOSOK": ("SOSOK",),
    "CLEANING_YARN": ("CLEANING YARN",), "SERVICE_INTARSIA": ("SERVICE INTARSIA",),
    "EMBRO_STAMP": ("EMBRO/STAMP", "STAMP"), "CUCI_SCREEN": ("CUCI SCREEN",),
    "JEMUR": ("JEMUR",),
}

TEXT_FIELDS = (
    ("content_code", "CONTENT"), ("gauge_code", "GAUCE"),
    ("style_number", "#"), ("construction", "CONSTRUCTION"),
    ("composition_care", "COMPOSITION & CARE LABEL"),
    ("gauge", "GAUGE"), ("tension", "TENSION"),
    ("total_ends", "TTL ENDS"), ("color_sequence", "COLOR SEQUENCE"),
    ("bagging_method", "BAGGING METHOD"), ("packing_method", "PACKING METHOD"),
    ("packing_in_box", "PACKING METHOD IN BOX"),
    ("polybag_sticker", "POLY BAG STICKER."),
    ("box_labeling", "BOX LABELING"), ("ship_via", "SHIP VIA"),
    ("hang_tag", "HANG TAG INSTRUCTIONS"),
    ("special_instructions", "SPECIAL CUSTOMER ORDER INSTRUCTIONS"),
    ("hs_code", "TARIFF CATEGORY"), ("duty_category", "DUTY CATEG"),
)
NUM_FIELDS = (
    ("admin_pct", ("ADMIN %",)),
    ("knit_minutes_dev", ("MINUTES PER PC PER MACHINE IN DEV",)),
    # LT_P in the Salesforce map. The sheet keeps two minute columns
    # side by side: what the sample took in development, and what the
    # production line takes.
    ("knit_minutes_prod", ("MINUTES PER PC PER MACHINE IN PROD LINE",)),
    ("box_length_cm", ("BOX LENGTH",)), ("box_depth_cm", ("BOX DEPTH",)),
    ("box_height_cm", ("BOX HEIGHT",)),
    # F25 has no plain WHLS LINE PRICE, only USA and CANADA variants.
    ("wholesale_price", ("WHLS LINE PRICE", "WHLS LINE PRICE - USA")),
    ("sample_price", ("FINAL SAMPLE PRICE",)),
)


def _index(letter):
    n = 0
    for ch in letter:
        n = n * 26 + (ord(ch) - 64)
    return n


def resolve_retail(sh):
    """Which FINAL RETAIL PRICE column is meant.

    S26 and S27 carry two, disagreeing on most rows. The one that belongs to
    the record is the one sitting at the end of the markup run — it is the only
    one present in all five seasons, so it is the column that makes a season
    series comparable. The second, at the sheet's right edge, arrived in S26
    and is left alone (decided 2026-09-22).
    """
    letters = sh._by_name.get("FINAL RETAIL PRICE", [])
    if len(letters) <= 1:
        return letters[0] if letters else None
    order = sorted(sh.header, key=_index)
    for letter in letters:
        i = order.index(letter)
        for prev in reversed(order[:i]):
            if sh.header[prev].strip():
                if sh.header[prev].upper().startswith("VOL AIR MARGIN RETAIL PRICE"):
                    return letter
                break
    return min(letters, key=_index)


def labour_factor(sh):
    """The season's labour rate x multiplier, read out of the sheet.

    Every operation cost is (minutes/60) * (rate * multiplier), and the formula
    names the two cells holding those. Only their product is needed, so which
    is which never has to be decided. Reading it here is what lets one importer
    serve five seasons at three different rates.
    """
    counts = collections.Counter()
    for row in sh.formulas.values():
        for f in row.values():
            refs = rate_cells(f)
            if len(refs) == 2:
                counts[tuple(refs)] += 1
    if not counts:
        return None
    (c1, r1), (c2, r2) = counts.most_common(1)[0][0]
    try:
        return (float(sh.rows.get(int(r1), {}).get(c1))
                * float(sh.rows.get(int(r2), {}).get(c2)))
    except (TypeError, ValueError):
        return None


def call(method, path, payload=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read()[:300].decode()}")


def collect(sh, season):
    """Group the sheet's rows into one payload per style."""
    retail = resolve_retail(sh)
    op_cols = {}
    for code, names in OPS.items():
        try:
            c = sh.col(*names)
        except Ambiguous:
            c = None
        if c:
            op_cols[c] = code
    sh.load_formulas(op_cols)
    factor = labour_factor(sh)
    collections_by_row = collection_at(sh)

    styles = collections.OrderedDict()
    for ri, cells in sh.data_rows():
        name, size = split_description(sh.value(cells, "DESCRIPTION") or "")
        if not name:
            continue
        s = styles.setdefault(name, {
            "name": name, "season": season, "status": "active",
            "sizes": [], "colorways": [], "operations": [],
            "_sizes_seen": set(), "_colors_seen": set(), "_ops": {},
            "_channel": collections.Counter(), "_finishing": collections.Counter(),
        })

        # Channel and finishing come out of the DESCRIPTION suffix, counted
        # across the style's rows rather than taken from the first one.
        desc = sh.value(cells, "DESCRIPTION") or ""
        ch = channel_of(desc)
        if ch:
            s["_channel"][ch] += 1
        fin = finishing_of(desc)
        if fin:
            s["_finishing"][fin] += 1

        # The collection is a banner row further down the sheet, closing the
        # block this style sits in.
        if not s.get("collection"):
            name = collections_by_row.get(ri)
            if name:
                s["collection"] = name

        for key, header in TEXT_FIELDS:          # first non-empty wins
            if not s.get(key):
                v = sh.value(cells, header)
                if v:
                    s[key] = v
        for key, headers in NUM_FIELDS:
            if s.get(key) in (None, ""):
                v = sh.number(cells, *headers)
                if v is not None:
                    s[key] = v
        if retail and s.get("retail_price") in (None, ""):
            v = cells.get(retail)
            try:
                s["retail_price"] = float(v)
            except (TypeError, ValueError):
                pass

        if size and size not in s["_sizes_seen"]:
            s["_sizes_seen"].add(size)
            s["sizes"].append({
                "size": size,
                "weight_kg": sh.number(cells, "FINISHED KGS / ITEM"),
                "pcs_per_box": sh.number(cells, "PCS / BOX"),
            })

        tag = sh.value(cells, "WS TAG COLOR")
        if tag and tag not in s["_colors_seen"]:
            s["_colors_seen"].add(tag)
            bom = []
            for slot in range(1, 22):
                colour = sh.value(cells, f"COLOR{slot}", f"COLOR {slot}")
                if not colour:
                    continue
                pct = sh.number(cells, f"C{slot}Y%")
                bom.append({
                    "yarn": colour,
                    # the sheet holds a fraction; the app stores a percentage
                    "percent": round(pct * 100, 6) if pct is not None and pct <= 1.5 else pct,
                    "ends": sh.number(cells, f"C{slot} ENDS"),
                })
            s["colorways"].append({"name": tag, "bom": bom})

        # Minutes prefer the formula the cost was calculated with, which states
        # them outright. Plenty of cells are typed constants with no formula
        # though, so those are divided back out by the rate the sheet itself
        # gave us. Both routes agree wherever both exist.
        ops = s["_ops"]
        row = sh.formulas.get(ri, {})
        for letter, code in op_cols.items():
            if ops.get(code, (None, None))[1] == "formula":
                continue
            m = minutes_from(row.get(letter))
            if m is not None:
                ops[code] = (round(m, 2), "formula")
            elif code not in ops and factor:
                try:
                    cost = float(cells.get(letter))
                except (TypeError, ValueError):
                    continue
                ops[code] = (round(cost / factor * 60, 2), "cost")

    for s in styles.values():
        s["operations"] = [{"code": c, "minutes": m}
                           for c, (m, _src) in s.pop("_ops").items()]

        # A style whose rows disagree sells on both — the split is by
        # colourway, and the style-level field cannot say more than that.
        ch = s.pop("_channel")
        if ch:
            s["whs_channel"] = "BOTH" if len(ch) > 1 else next(iter(ch))
            s["sell_sy"] = s["whs_channel"] != "000 ONLY"
            s["sell_000"] = s["whs_channel"] != "SY ONLY"
        # Same reasoning as whs_channel: when the sheet says both, say both.
        fin = s.pop("_finishing")
        if fin:
            s["finishing_location"] = "BOTH" if len(fin) > 1 else next(iter(fin))

        s.pop("_sizes_seen", None)
        s.pop("_colors_seen", None)
    return styles


def import_season(season, limit=None, only=None, dry_run=False):
    path = ROOT / f"{season} IM MASTER.xlsx"
    if not path.exists():
        raise SystemExit(f"missing workbook: {path}")
    sh = Sheet(str(path), season)
    styles = collect(sh, season)
    chosen = [s for s in styles.values()
              if not only or only.upper() in s["name"].upper()]
    if limit:
        chosen = chosen[:limit]
    print(f"{season}: header row {sh.header_row}, {len(styles)} styles, "
          f"{len(chosen)} selected")
    if dry_run:
        if chosen:
            print(json.dumps(chosen[0], indent=2)[:1600])
        return 0, 0

    existing = {(s.get("season"), s["name"].upper()): s["id"]
                for s in call("GET", "/api/styles")}
    created = updated = 0
    for s in chosen:
        sid = existing.get((season, s["name"].upper()))
        if sid:
            call("PUT", f"/api/styles/{sid}", s); updated += 1
        else:
            call("POST", "/api/styles", s); created += 1
    print(f"{season}: {created} created, {updated} updated")
    return created, updated


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", choices=SEASONS)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--style", help="only styles whose name contains this")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not args.season and not args.all:
        ap.error("pass --season or --all")

    total_c = total_u = 0
    for season in (SEASONS if args.all else [args.season]):
        c, u = import_season(season, args.limit, args.style, args.dry_run)
        total_c += c; total_u += u
    if args.all and not args.dry_run:
        print(f"\ntotal: {total_c} created, {total_u} updated")


if __name__ == "__main__":
    main()
