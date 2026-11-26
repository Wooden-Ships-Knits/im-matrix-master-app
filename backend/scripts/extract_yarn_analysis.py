"""Read YARN ANALYSIS into JSON lines. Reads only; writes no database.

    # the newest file in a folder (the project folder by default, or the
    # Drive folder if YARN_ANALYSIS_DIR points at one):
    docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend \
        python scripts/extract_yarn_analysis.py /app/source /app/import
    # or one named file:
    ... python scripts/extract_yarn_analysis.py "/app/source/YARN ANALYSIS NOV 10.xlsx" /app/import

Output, one folder per run (<out>/<stamp>/):

    yarn_analysis.jsonl       {"sheet", "row_no", "data": {...}} per yarn row
    yarn_analysis.meta.json   {source_code, rows, files:[{path, modified,
                              sha256, rows}], notes:[...], stock_on}

Three rules this stage owns, all learned from the workbook itself:

  * WHICH FILE. PPIC starts next month's file by copying this one and adding
    an empty ON HAND column, so the newest file by name is not always the
    newest file with figures in it. A file whose newest ON HAND column holds
    less than half the kilos of the column before it is passed over for the
    next older one, and the reason is written into the notes. Names carrying
    COPY / TEST / BACKUP / FREEZE are never read at all.
  * WHERE THE LIST ENDS. The yarn list stops at the pivot's own "Grand
    Total"; the rows below it are scratch (YCA keeps a loose "YCA RAW WHITE
    Total" down there). Only in-list rows are written.
  * WHICH COLUMN IS WHICH. Nothing here knows a column letter. Every column
    is found by its header text, with alternates, because the four tabs
    spell the same thing differently: YAC says "OLS COLOR NAME", YCA's
    header sits on row 3 while the others are on row 5, and the Nove/Novi
    note changes name per tab.

The figures are the cached results of the team's formulas, so we read what
PPIC reads. Nothing is computed here, and no yarn is ever invented: a row
that matches no yarn of ours is still written out, and the loader decides
whether it is a question worth asking (scripts/load_yarn_stock.py).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

SOURCE_CODE = "yarn_analysis"
TABS = ("YY+YST", "YCA", "YAC", "YP&YTX")
READY_SHARE = 0.5          # the newest ON HAND column must hold this much of the one before it
NOT_OFFICIAL = re.compile(r"COPY|TEST|TEMPLATE|BACK ?UP|BEFORE|FREEZE|^~\$", re.I)
NAME_RE = re.compile(r"^YARN ANALYSIS ([A-Z]+)\.? ?(\d{1,2})(?:, (\d{4}))?\.xlsx$", re.I)
MONTHS = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "MEI": 5, "JUN": 6,
          "JUL": 7, "AUG": 8, "AGU": 8, "SEP": 9, "OCT": 10, "OKT": 10,
          "NOV": 11, "DEC": 12, "DES": 12}

# Single-value columns: field -> header patterns, first match wins.
FIELDS = {
    "av_3m": [r"^AV 3 MONTHS \(NO PROJECTION\)$"],
    "av_3m_proj": [r"^AV 3 MONTHS WITH PROJECTION$"],
    "av_full": [r"^AV FULL SEASON \(NO PROJECTION\)$"],
    "av_full_proj": [r"^AV FULL SEASON WITH PROJECTION$"],
    "on_po_kg": [r"^TTL ON PO$"],
    "o4_now": [r"^O4 - CURRENT STATUS$"],
    "o4_prev": [r"^O4 - PREVIOS?E? STATUS$"],
    "color_family": [r"^COLOR FAMILY$"],
    "old_name": [r"^OL[DS] COLOR NAME$"],
}
TEXT = {"o4_now", "o4_prev", "color_family", "old_name"}
# Free text PPIC writes per yarn: kept whole, in `detail.notes`, never parsed.
NOTE_COLS = [r"^NOV[IE] NOTE$", r"^PB NOTES$", r"^S27 YARN NOTE$", r"YARN PLAN",
             r"^POTENTIAL SUBS$", r"^COLOR LOOK SIMILAR$", r"^YARN STATUS AND SUB :$"]


def sp(v) -> str:
    return " ".join(str(v if v is not None else "").split()).upper()


def num(v):
    if v in (None, "") or isinstance(v, bool):
        return None
    try:
        return round(float(str(v).replace(",", "").strip()), 3)
    except (TypeError, ValueError):
        return None


def month_no(word: str):
    return MONTHS.get(sp(word)[:3])


def on_hand_date(label: str, year: int):
    """'On Hand NOV 10' / 'On Hand 7 JULY' -> ISO date in the file's year."""
    s = sp(label)[len("ON HAND"):].strip()
    m = re.search(r"(\d{1,2})\s+([A-Z]+)|([A-Z]+)\s+(\d{1,2})", s)
    if not m:
        return None
    day, mon = (m.group(1), m.group(2)) if m.group(1) else (m.group(4), m.group(3))
    mo = month_no(mon)
    try:
        return dt.date(year, mo, int(day)).isoformat() if mo else None
    except ValueError:
        return None


def col_letter(ref: str) -> str:
    return re.match(r"([A-Z]+)", ref).group(1)


class Book:
    """One workbook, open read-only: sheet names to their parsed rows."""

    def __init__(self, path: str):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        wb = ET.fromstring(self.zip.read("xl/workbook.xml"))
        rels = ET.fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels}
        self.parts = {}
        for s in wb.iter(NS + "sheet"):
            t = target[s.get(RNS + "id")].lstrip("/")
            self.parts[s.get("name").strip()] = t if t.startswith("xl/") else "xl/" + t
        self.strings = []
        if "xl/sharedStrings.xml" in self.zip.namelist():
            for _, el in ET.iterparse(self.zip.open("xl/sharedStrings.xml"), events=("end",)):
                if el.tag == NS + "si":
                    self.strings.append("".join(t.text or "" for t in el.iter(NS + "t")))
                    el.clear()

    def rows(self, tab: str) -> dict:
        part = self.parts.get(tab)
        if part is None:
            raise SystemExit(f"no sheet named {tab!r} — found {sorted(self.parts)}")
        out = {}
        for _, el in ET.iterparse(self.zip.open(part), events=("end",)):
            if el.tag != NS + "row":
                continue
            cells = {}
            for c in el.findall(NS + "c"):
                t, v = c.get("t"), c.find(NS + "v")
                if v is None or v.text is None:
                    continue
                raw = self.strings[int(v.text)] if t == "s" else v.text
                raw = " ".join(str(raw).split())
                if raw:
                    cells[col_letter(c.get("r"))] = raw
            if cells:
                out[int(el.get("r"))] = cells
            el.clear()
        return out


class Sheet:
    """One yarn tab: its header row, its columns by name, its yarn rows."""

    def __init__(self, rows: dict, tab: str, year: int):
        self.tab, self.rows, self.year = tab, rows, year
        self.header_row = next(
            (ri for ri in sorted(rows)
             if any(sp(v) == "COLOR" for v in rows[ri].values())), None)
        if self.header_row is None:
            raise SystemExit(f"{tab}: no header row with a COLOR column")
        self.hdr = rows[self.header_row]
        self.by_name: dict[str, str] = {}
        for letter, text in self.hdr.items():
            self.by_name.setdefault(sp(text), letter)
        self.name_col = self.by_name["COLOR"]
        self.cols = {f: self._find(pats) for f, pats in FIELDS.items()}
        # On Hand snapshots, oldest first; the last one is the file's stock date.
        oh = [(letter, on_hand_date(text, year)) for letter, text in self.hdr.items()
              if sp(text).startswith("ON HAND")]
        self.on_hand = sorted(((l, d) for l, d in oh if d), key=lambda x: x[1])
        self.status_cols = [(l, t) for l, t in self.hdr.items()
                            if "YARN STATUS" in sp(t) and "SUB" not in sp(t)]
        self.note_cols = [(l, t) for l, t in self.hdr.items()
                          if any(re.search(p, sp(t)) for p in NOTE_COLS)]

    def _find(self, pats):
        for p in pats:
            for text, letter in self.by_name.items():
                if re.search(p, text):
                    return letter
        return None

    @property
    def stock_on(self):
        return self.on_hand[-1][1] if self.on_hand else None

    def yarn_rows(self):
        """(row_no, yarn_text, data) per yarn above the pivot's Grand Total."""
        for ri in sorted(self.rows):
            if ri <= self.header_row:
                continue
            cells = self.rows[ri]
            raw = cells.get(self.name_col)
            if not raw:
                continue
            label = sp(raw)
            if label.startswith("GRAND"):
                return                      # the list ends here; below is scratch
            # The pivot writes every yarn as "<yarn> Total".
            name = label[: -len(" TOTAL")].strip() if label.endswith(" TOTAL") else label
            if not name:
                continue
            ya = {"tab": self.tab}
            for field, letter in self.cols.items():
                v = cells.get(letter) if letter else None
                ya[field] = (sp(v) or None) if field in TEXT else num(v)
            ya["on_hand"] = [{"d": d, "kg": num(cells.get(l))}
                             for l, d in self.on_hand if num(cells.get(l)) is not None]
            if self.on_hand:
                ya["stock_on"] = self.stock_on
                # The formulas read the last On Hand column; blank counts as 0.
                ya["on_hand_kg"] = num(cells.get(self.on_hand[-1][0])) or 0.0
            yield ri, name, {
                "yarn_text": name,
                "ya": ya,
                "status": {sp(t): sp(cells.get(l)) or None for l, t in self.status_cols},
                "notes": {sp(t): cells.get(l) for l, t in self.note_cols if cells.get(l)},
            }

    def stock_tally(self):
        """(newest ON HAND header, its kg, the previous column's kg) — the
        check for whether this file's stock has been filled in yet."""
        if not self.on_hand:
            return None, 0.0, 0.0
        newest = self.on_hand[-1][0]
        prev = self.on_hand[-2][0] if len(self.on_hand) > 1 else newest
        kg = prev_kg = 0.0
        for ri in sorted(self.rows):
            if ri <= self.header_row:
                continue
            raw = self.rows[ri].get(self.name_col)
            if not raw:
                continue
            if sp(raw).startswith("GRAND"):
                break
            kg += num(self.rows[ri].get(newest)) or 0.0
            prev_kg += num(self.rows[ri].get(prev)) or 0.0
        return sp(self.hdr[newest]), kg, prev_kg


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_books(folder: str) -> list[tuple[dt.date, str]]:
    """YARN ANALYSIS workbooks in a folder, newest by the date in the name."""
    found = []
    for name in os.listdir(folder):
        m = NAME_RE.match(name)
        if not m or NOT_OFFICIAL.search(name):
            continue
        mo = month_no(m.group(1))
        if not mo:
            continue
        path = os.path.join(folder, name)
        year = int(m.group(3) or dt.datetime.fromtimestamp(os.path.getmtime(path)).year)
        try:
            found.append((dt.date(year, mo, int(m.group(2))), path))
        except ValueError:
            continue
    return sorted(found, reverse=True)


def read_book(path: str, out_dir: Path, notes: list[str]) -> dict:
    """Write the pair of files for one workbook; return the run's summary."""
    year = dt.datetime.fromtimestamp(os.path.getmtime(path)).year
    book = Book(path)
    out_dir.mkdir(parents=True, exist_ok=True)
    jsonl = out_dir / f"{SOURCE_CODE}.jsonl"
    per_tab, gap, stock_on = [], None, None
    with open(jsonl, "w", encoding="utf-8") as f:
        for tab in TABS:
            sheet = Sheet(book.rows(tab), tab, year)
            n = 0
            for row_no, _name, data in sheet.yarn_rows():
                f.write(json.dumps({"sheet": tab, "row_no": row_no, "data": data},
                                   ensure_ascii=False) + "\n")
                n += 1
            per_tab.append({"tab": tab, "rows": n})
            stock_on = max(filter(None, (stock_on, sheet.stock_on)), default=None)
            col, kg, prev_kg = sheet.stock_tally()
            if prev_kg > 1 and kg < READY_SHARE * prev_kg:
                gap = (f"tab {tab}: {col} holds {kg:,.0f} kg against "
                       f"{prev_kg:,.0f} kg in the column before it")
    rows = sum(t["rows"] for t in per_tab)
    meta = {
        "source_code": SOURCE_CODE, "rows": rows, "stock_on": stock_on,
        "tabs": per_tab, "notes": list(notes),
        "files": [{"path": path, "rows": rows,
                   "modified": dt.datetime.fromtimestamp(os.path.getmtime(path))
                                 .isoformat(timespec="seconds"),
                   "sha256": sha256(path)}],
    }
    (out_dir / f"{SOURCE_CODE}.meta.json").write_text(
        json.dumps(meta, indent=1), encoding="utf-8")
    return {"meta": meta, "gap": gap}


def extract(source: str, out: str, tries: int = 3) -> tuple[Path, dict]:
    """Read the file (or the newest usable file of a folder); return (run dir, meta)."""
    out_dir = Path(out) / dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    if not os.path.isdir(source):
        res = read_book(source, out_dir, [])
        if res["gap"]:
            print("  stock check:", res["gap"])
        return out_dir, res["meta"]

    books = find_books(source)
    if not books:
        raise SystemExit(f"no YARN ANALYSIS workbook in {source}")
    notes: list[str] = []
    shortlist = books[:tries]
    for k, (_day, path) in enumerate(shortlist):
        res = read_book(path, out_dir, notes)
        if res["gap"] and k + 1 < len(shortlist):
            notes.append(f"{os.path.basename(path)} passed over: its stock is "
                         f"not filled in yet ({res['gap']})")
            print("  " + notes[-1])
            continue
        if res["gap"]:
            # Last one we are willing to look at: read it, and say so.
            notes.append(f"stock check: {res['gap']}")
            res = read_book(path, out_dir, notes)
        return out_dir, res["meta"]
    return out_dir, res["meta"]


def report(out_dir: Path, meta: dict) -> None:
    print(f"{meta['files'][0]['path']}")
    for t in meta["tabs"]:
        print(f"  {t['tab']}: {t['rows']} yarns")
    print(f"  {meta['rows']} rows, stock {meta['stock_on']}, into {out_dir}")
    for n in meta["notes"]:
        print("  note:", n)
    sys.stdout.flush()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="a YARN ANALYSIS .xlsx, or a folder of them")
    ap.add_argument("out", help="where the run folder is written")
    ap.add_argument("--tries", type=int, default=3,
                    help="how many files back to look for one with its stock filled in")
    args = ap.parse_args()
    report(*extract(args.source, args.out, args.tries))


if __name__ == "__main__":
    main()
