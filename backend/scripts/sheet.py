"""Read an IM MASTER workbook with nothing but the standard library.

Shared by the importer and the golden test. Deliberately no openpyxl: the
header row moves between seasons (54, 57, 57, 61) and the column letters drift
even inside one season, so everything here is located by header *name*
(season-drift.md §7).
"""
import re
import zipfile
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
ERRORS = {"#VALUE!", "#DIV/0!", "#REF!", "#N/A", "#NAME?", "#NULL!", "#NUM!"}
SIZES = {"X/S", "S/M", "M/L", "X/L"}


class Ambiguous(Exception):
    """A header name that sits on more than one populated column."""


def _col(ref):
    return re.match(r"([A-Z]+)", ref).group(1)


class Sheet:
    def __init__(self, path, sheet_name):
        self.z = zipfile.ZipFile(path)
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels}
        part = None
        for s in wb.iter(NS + "sheet"):
            if s.get("name") == sheet_name:
                t = target[s.get(RNS + "id")].lstrip("/")
                part = t if t.startswith("xl/") else "xl/" + t
        if part is None:
            raise SystemExit(f"no sheet named {sheet_name!r}")
        self.part = part

        self.strings = []
        if "xl/sharedStrings.xml" in self.z.namelist():
            for ev, el in ET.iterparse(self.z.open("xl/sharedStrings.xml"), events=("end",)):
                if el.tag == NS + "si":
                    self.strings.append("".join(t.text or "" for t in el.iter(NS + "t")))
                    el.clear()

        self.rows = {}
        for ev, el in ET.iterparse(self.z.open(part), events=("end",)):
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
                    cells[_col(c.get("r"))] = raw
            if cells:
                self.rows[int(el.get("r"))] = cells
            el.clear()

        # The header is the widest row carrying a DESCRIPTION cell.
        self.header_row, best = None, 0
        for ri in sorted(self.rows)[:120]:
            vals = self.rows[ri].values()
            if any(v.upper() == "DESCRIPTION" for v in vals) and len(self.rows[ri]) > best:
                best, self.header_row = len(self.rows[ri]), ri
        self.header = self.rows[self.header_row]

        # A header name can appear on more than one column. S27 carries two
        # both called SOSOK — the first is an empty label, the second holds the
        # cost — so keeping only the first loses the data silently. Keep every
        # letter and choose between them by which one is actually populated.
        self._by_name = {}
        for letter, name in self.header.items():
            self._by_name.setdefault(" ".join(name.upper().split()), []).append(letter)

        # How many real values sit under each column. Banner Xs and error cells
        # do not count, so a label column scores 0 against its populated twin.
        self._density = {}
        for ri, cells in self.rows.items():
            if ri <= self.header_row:
                continue
            for letter, v in cells.items():
                if v in ERRORS or v.upper() == "X":
                    continue
                self._density[letter] = self._density.get(letter, 0) + 1

    def duplicates(self):
        """Header names sharing more than one column, for an import to report."""
        return {
            name: [(l, self._density.get(l, 0)) for l in letters]
            for name, letters in self._by_name.items()
            if len(letters) > 1
        }

    def col(self, name, *fallbacks, prefer=None):
        """Column letter for a header name — never a hardcoded letter.

        When a name sits on several columns and only one of them holds data,
        that one is meant (S27's two SOSOK columns). When several hold data the
        sheet is genuinely ambiguous — S27 has two populated FINAL RETAIL PRICE
        columns that disagree on 3,872 rows — and guessing there is how wrong
        numbers get imported silently. Raise instead, and let the caller name
        the column it means with `prefer`.
        """
        # Every exact name is tried before any prefix guess. F25 has no plain
        # "WHLS LINE PRICE" but four columns starting with it, so a prefix hit
        # on the first candidate must not beat an exact hit on the second.
        keys = [" ".join(c.upper().split()) for c in (name, *fallbacks)]
        attempts = [(k, self._by_name.get(k)) for k in keys]
        for k in keys:
            if self._by_name.get(k) is None:
                # Prefix fallback keeps its leftmost-column meaning: the first
                # header that starts with the name, in sheet order.
                hit = next((n for n in self._by_name if n.startswith(k)), None)
                attempts.append((k, self._by_name[hit] if hit else None))

        for candidate, letters in attempts:
            if not letters:
                continue
            if prefer and prefer in letters:
                return prefer
            if len(letters) == 1:
                return letters[0]
            best = max(self._density.get(l, 0) for l in letters)
            if best == 0:
                return letters[0]          # all empty, nothing to get wrong
            # A column with a couple of stray values is a leftover, not a rival:
            # F25 carries SOSOK on two columns, 2 values against 1,466. Only
            # columns within a tenth of the fullest one count as candidates.
            populated = [l for l in letters
                         if self._density.get(l, 0) * 10 >= best]
            if len(populated) == 1:
                return populated[0]
            raise Ambiguous(
                "%r sits on %s in this sheet, all populated: %s. "
                "Pass prefer='XX' to say which one is meant."
                % (candidate, ", ".join(populated),
                   ", ".join("%s=%d rows" % (l, self._density[l]) for l in populated)))
        return None

    def data_rows(self):
        """Every real style row: banner rows and blanks excluded."""
        d = self.col("DESCRIPTION")
        for ri in sorted(self.rows):
            if ri <= self.header_row:
                continue
            cells = self.rows[ri]
            if d not in cells:
                continue
            # A banner row carries a literal X in nearly every column
            if sum(1 for k, v in cells.items() if v.upper() == "X" and k != d) >= 40:
                continue
            yield ri, cells

    def value(self, cells, name, *fallbacks, prefer=None):
        letter = self.col(name, *fallbacks, prefer=prefer)
        if not letter:
            return None
        v = cells.get(letter)
        if v is None or v in ERRORS or v.upper() == "X":
            return None
        return v

    def number(self, cells, name, *fallbacks, prefer=None):
        v = self.value(cells, name, *fallbacks, prefer=prefer)
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def load_formulas(self, letters):
        """Second pass over the sheet, collecting formulas for these columns.

        The operation columns store money, but the minutes that produced it sit
        in the formula: =(24/60)*($FQ$55*$FQ$54). Reading them beats dividing
        the cost by a rate, and the same formula names the cells holding the
        season's labour rate, so nothing has to be hardcoded per season.
        """
        want = set(letters)
        out = {}
        for ev, el in ET.iterparse(self.z.open(self.part), events=("end",)):
            if el.tag != NS + "row":
                continue
            ri = int(el.get("r"))
            if ri > self.header_row:
                for c in el.findall(NS + "c"):
                    f = c.find(NS + "f")
                    if f is None or not f.text:
                        continue
                    letter = _col(c.get("r"))
                    if letter in want:
                        out.setdefault(ri, {})[letter] = f.text
            el.clear()
        self.formulas = out
        return out


# The DESCRIPTION suffix carries more than the size. Spellings drifted between
# seasons — S25 wrote "FINISHING AT FACTORY" where F25 onward writes "FAF", and
# "BOTH" became "BOTH WHS" — and segments get combined ("000 ONLY- FAF") or
# annotated ("BOTH (NAME FOR SY: PETRA ZIP)"). So these are searched for inside
# the whole suffix rather than matched against a segment.
#
# Order matters: "000 ONLY (NAME FOR SY: KERRY)" mentions SY but is not SY only.
_CHANNEL = [
    (re.compile(r"\bBOTH\b"), "BOTH"),
    (re.compile(r"\b000\s*ONLY\b"), "000 ONLY"),
    (re.compile(r"\b(?:SHOPIFY|SY)\s*ONLY\b"), "SY ONLY"),
]
_FINISHING = [
    (re.compile(r"\bFAF\b|\bFINISHING\s+AT\s+FACTORY\b"), "FAF"),
    (re.compile(r"\bFAH\b|\bFINISHING\s+TAKE\s+HOME\b"), "FAH"),
]


def _suffix(text):
    return " - ".join(text.split(" - ")[1:]).upper()


def channel_of(text):
    """'... - X/S - 000 ONLY' -> '000 ONLY'. None when the row does not say."""
    s = _suffix(text or "")
    for pattern, value in _CHANNEL:
        if pattern.search(s):
            return value
    return None


def finishing_of(text):
    """'... - FAH' -> 'FAH'. None when the row does not say."""
    s = _suffix(text or "")
    for pattern, value in _FINISHING:
        if pattern.search(s):
            return value
    return None


# Collections are rows, not a column. A banner row carries the name in
# DESCRIPTION and a literal X in every other column, and it CLOSES the block
# above it rather than opening the one below — im-to-sales-force does the same
# thing with a bfill, and that is where this reading is confirmed.
#
# Banners come in runs: "COTTON" then "ESSENTIALS", or "SKI SNOW", "LUXE",
# "WS COLLECTION". The last real label is the collection; the ones before it
# name the yarn. "WS COLLECTION" is a wrapper that sits after the real name,
# so it only counts when it is the only thing in the run.
_WRAPPER = re.compile(r"^WS COLLECTION\b")


def _collection_name(labels):
    real = [l for l in labels if not _WRAPPER.match(l.upper())]
    chosen = (real or labels)[-1]
    # "ESSENTIALS - OK upload SF" is ESSENTIALS; the note is someone's status.
    return chosen.split(" - ")[0].strip()


def banner_runs(sh):
    """[(first_row, name)] for each run of consecutive banner rows."""
    d = sh.col("DESCRIPTION")
    banners = []
    for ri in sorted(sh.rows):
        if ri <= sh.header_row:
            continue
        cells = sh.rows[ri]
        if d not in cells:
            continue
        if sum(1 for k, v in cells.items() if v.upper() == "X" and k != d) >= 40:
            banners.append((ri, cells[d]))

    runs, cur = [], []
    for ri, label in banners:
        if cur and ri == cur[-1][0] + 1:
            cur.append((ri, label))
        else:
            if cur:
                runs.append(cur)
            cur = [(ri, label)]
    if cur:
        runs.append(cur)
    return [(r[0][0], _collection_name([l for _i, l in r])) for r in runs]


def collection_at(sh):
    """row index -> the collection that closes the block it sits in."""
    runs = banner_runs(sh)
    out, i = {}, 0
    for ri, _cells in sh.data_rows():
        while i < len(runs) and runs[i][0] < ri:
            i += 1
        if i < len(runs):
            out[ri] = runs[i][1]
    return out


def split_description(text):
    """'ALEX STRIPED CREW COTTON - X/S - 000 ONLY' -> (name, size).

    The suffix chain runs up to three segments and only some are sizes
    (schema.md §7.1), so the size is recognised, never assumed to be last.
    """
    parts = [p.strip() for p in text.split(" - ")]
    name = parts[0]
    size = next((p.upper() for p in parts[1:] if p.upper() in SIZES), None)
    return name, size


_RATE_REFS = re.compile(r"\$([A-Z]+)\$([0-9]+)")
_SAFE = re.compile(r"[0-9+\-*.()\s]+")


def minutes_from(formula):
    """Minutes out of =(24/60)*(rate*mult).

    The numerator is sometimes arithmetic rather than a single number — two
    operations billed together, written the way the sheet's author thought of
    them, as ((2*4)+(2*2))/60. Take everything left of the /60, drop the
    unmatched opening brackets the split leaves behind, and evaluate it as
    arithmetic — never as code.
    """
    if not formula:
        return None
    f = formula.strip().lstrip("=")
    i = f.find("/60")
    if i < 0:
        return None
    tail = f[i + 3:]
    if "*" not in tail or "$" not in tail:
        return None                       # not a rate multiplication
    expr = f[:i].strip()
    while expr.count("(") > expr.count(")") and expr.startswith("("):
        expr = expr[1:].strip()
    if not expr or not _SAFE.fullmatch(expr):
        return None
    try:
        return float(eval(expr, {"__builtins__": {}}, {}))
    except Exception:
        return None


def rate_cells(formula):
    """The ($COL$row, $COL$row) pair a cost formula multiplies by."""
    return _RATE_REFS.findall(formula or "")
