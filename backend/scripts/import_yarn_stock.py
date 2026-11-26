"""Yarn stock, from YARN ANALYSIS: two availability numbers per colour.

    # the container only sees ./backend, so the workbook is copied in first
    # (and removed after — an 8MB xlsx in backend/ is one git add away from
    # the repository):
    cp "YARN ANALYSIS NOV 10.xlsx" backend/yarn-analysis.xlsx
    # dry run (report only), inside the backend container:
    docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend \
        python scripts/import_yarn_stock.py "/app/yarn-analysis.xlsx"
    # write:
    ... scripts/import_yarn_stock.py "/app/yarn-analysis.xlsx" --write
    rm backend/yarn-analysis.xlsx

What is taken: the workbook's own "Yarn AV template" sheet defines the
numbers the team quotes — net available with and without SY projection —
and the physical board writes each as a pair, "AV 3 MONTHS / AV FULL
SEASON". So four columns per colour: the AV 3 MONTHS and AV FULL SEASON
variants of both, onto qty_*_proj_3m and qty_*_proj. Those are the Color
Table's two chips, each showing its pair.

Like import_season.py: nothing here knows a column letter, every column is
found by header name. Unlike it, this writes the database directly — it
runs inside the backend container, where there is no password to hold.

Rows that do not match a yarn in the database are REPORTED, never created:
a colour the BOM has never used has no business appearing on the board, and
the mismatches are exactly the merge material for docs/yarn-split.md.
"""
import argparse
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import pool, transaction  # noqa: E402

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

SHEETS = ["YY+YST", "YCA", "YAC", "YP&YTX"]
COL_NAME = "COLOR"
COL_WITHOUT = "AV FULL SEASON (NO PROJECTION)"
COL_WITH = "AV FULL SEASON WITH PROJECTION"
COL_WITHOUT_3M = "AV 3 MONTHS (NO PROJECTION)"
COL_WITH_3M = "AV 3 MONTHS WITH PROJECTION"
# Since 0030 the colour family has a home (colors.family); same sheets.
COL_FAMILY = "COLOR FAMILY"


def norm(s):
    return " ".join(str(s or "").split()).upper()


def yarn_name(cell):
    """The workbook's COLOR cell is a pivot label: 'YST ALASKA NIGHT - 880
    Total'. The yarn is the label without the pivot's suffix."""
    n = norm(cell)
    return n[: -len(" TOTAL")] if n.endswith(" TOTAL") else n


def col_letter(ref):
    return re.match(r"([A-Z]+)", ref).group(1)


class YarnSheet:
    """One material sheet, columns by name.

    The header row is anchored on COLOR FAMILY, not OLD COLOR NAME: YAC's
    header spells it OLS COLOR NAME and YP&YTX has no old-name column at
    all, but every sheet carries COLOR and COLOR FAMILY side by side.
    """

    def __init__(self, z, part, strings, sheet_name=""):
        self.sheet_name = sheet_name
        self.rows = {}
        for ev, el in ET.iterparse(z.open(part), events=("end",)):
            if el.tag != NS + "row":
                continue
            cells = {}
            for c in el.findall(NS + "c"):
                t, v = c.get("t"), c.find(NS + "v")
                if v is None or v.text is None:
                    continue
                raw = strings[int(v.text)] if t == "s" else v.text
                raw = " ".join(str(raw).split())
                if raw:
                    cells[col_letter(c.get("r"))] = raw
            if cells:
                self.rows[int(el.get("r"))] = cells
            el.clear()

        self.header_row = next(
            (ri for ri in sorted(self.rows)
             if any(norm(v) == "COLOR FAMILY" for v in self.rows[ri].values())),
            None)
        if self.header_row is None:
            raise SystemExit(f"{sheet_name}: no COLOR FAMILY header row")
        self.by_name = {norm(v): letter
                        for letter, v in self.rows[self.header_row].items()}

    def _col(self, name):
        letter = self.by_name.get(norm(name))
        if letter is None:
            raise SystemExit(f"{self.sheet_name}: no column named {name!r}"
                             f" — header has {sorted(self.by_name)[:12]}…")
        return letter

    def records(self):
        name_c = self._col(COL_NAME)
        wo_c = self._col(COL_WITHOUT)
        wi_c = self._col(COL_WITH)
        wo3_c = self._col(COL_WITHOUT_3M)
        wi3_c = self._col(COL_WITH_3M)
        fam_c = self._col(COL_FAMILY)
        for ri in sorted(self.rows):
            if ri <= self.header_row:
                continue
            cells = self.rows[ri]
            raw = cells.get(name_c, "")
            name = yarn_name(raw)
            # The pivot's own footer: "Grand Total" loses its " Total" suffix
            # like any other label and arrives here as GRAND.
            if not name or name in ("GRAND", "GRAND TOTAL"):
                continue
            yield (name, _num(cells.get(wo_c)), _num(cells.get(wi_c)),
                   _num(cells.get(wo3_c)), _num(cells.get(wi3_c)),
                   norm(cells.get(fam_c)) or None)


def _num(v):
    if v in (None, ""):
        return None
    try:
        return round(float(v), 2)
    except ValueError:
        return None


def open_book(path):
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    parts = {}
    for s in wb.iter(NS + "sheet"):
        t = target[s.get(RNS + "id")].lstrip("/")
        parts[s.get("name").strip()] = t if t.startswith("xl/") else "xl/" + t
    strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        for ev, el in ET.iterparse(z.open("xl/sharedStrings.xml"), events=("end",)):
            if el.tag == NS + "si":
                strings.append("".join(t.text or "" for t in el.iter(NS + "t")))
                el.clear()
    return z, parts, strings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--write", action="store_true",
                    help="apply; without it, report what would change")
    args = ap.parse_args()

    # The API opens the pool in its lifespan; a script has to do it itself.
    pool.open()

    z, parts, strings = open_book(args.xlsx)

    # The workbook speaks last: a colour on two sheets (there are none today,
    # but pivots get copied) keeps the later sheet's numbers.
    stock = {}
    per_sheet = []
    for want in SHEETS:
        part = parts.get(want)
        if part is None:
            raise SystemExit(f"no sheet named {want!r} — found {sorted(parts)}")
        sheet = YarnSheet(z, part, strings, want)
        n = 0
        for name, wo, wi, wo3, wi3, fam in sheet.records():
            stock[name] = (wo, wi, wo3, wi3, fam)
            n += 1
        per_sheet.append((want, n))

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM yarn_colors")
            db = {}
            for cid, cname in cur.fetchall():
                db.setdefault(norm(cname), cid)

    matched, updates, unmatched = 0, [], []
    for name, (wo, wi, wo3, wi3, fam) in stock.items():
        cid = db.get(name)
        if cid is None:
            unmatched.append(name)
            continue
        matched += 1
        updates.append((wo, wi, wo3, wi3, fam, cid))

    families = 0
    if args.write:
        with transaction() as conn:
            with conn.cursor() as cur:
                for wo, wi, wo3, wi3, fam, cid in updates:
                    cur.execute(
                        "UPDATE yarn_colors"
                        "   SET qty_without_proj = %s, qty_with_proj = %s,"
                        "       qty_without_proj_3m = %s, qty_with_proj_3m = %s"
                        " WHERE id = %s", (wo, wi, wo3, wi3, cid))
                    if fam:
                        # The family belongs to the COLOUR, once — not to
                        # each yarn that comes in it.
                        cur.execute(
                            "UPDATE colors c SET family = %s"
                            "  FROM yarn_colors y"
                            " WHERE y.id = %s AND c.id = y.color_id"
                            "   AND c.family IS DISTINCT FROM %s",
                            (fam, cid, fam))
                        families += cur.rowcount

    for name, n in per_sheet:
        print(f"{name}: {n} colours")
    print(f"workbook colours: {len(stock)}  matched: {matched}"
          f"  unmatched: {len(unmatched)}")
    print(f"db colours without a stock row: {len(db) - matched}"
          " (trims, and names the workbook spells differently)")
    print(f"applied ({families} colour families set)" if args.write
          else "dry run — nothing written")
    if unmatched:
        print("\nin the workbook, not in yarn_colors"
              " (merge material for yarn-split.md):")
        for name in sorted(unmatched):
            print(f"  {name}")


if __name__ == "__main__":
    main()
