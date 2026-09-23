"""Reading and writing a style, whole.

One GET returns the style with its sizes, colourways, yarn lines and
measurements nested; one PUT takes the same shape back (backend.md §5). The
children are replaced rather than diffed, inside one transaction, so "the API
state equals the payload" is true by construction (flow.md §3).

Field names here match what the React client already sends. The mapping to the
v2 tables lives in this one module so the rest of the code speaks v2.
"""
from decimal import Decimal, InvalidOperation

from psycopg.rows import dict_row

from .db import pool, transaction

# Columns on `styles` that the client sends and reads back unchanged.
FLAT = [
    "style_name", "status", "style_number", "sku_code", "sub_group", "sell_sy", "sell_000",
    "construction", "composition_care", "color_sequence", "gauge_detail", "gauge",
    "tension",
    "total_ends", "logo_label", "details", "bagging_method", "polybag_sticker",
    "packing_method", "packing_in_box", "box_labeling", "box_length_cm",
    "box_depth_cm", "box_height_cm", "pcs_per_box", "ship_via", "hs_code",
    "duty_category", "hang_tag", "special_instructions", "notes", "photo_url",
    # cost inputs: admin % and the knit minutes the labour cost is built from
    "admin_pct", "knit_minutes_dev",
    # Which X/S grading factor this style uses, 0.9 or 0.92 (migration 0005).
    "xs_weight_factor",
    # Channel and finishing, read from the DESCRIPTION suffix (migration 0006).
    "whs_channel", "finishing_location",
    "whls_line_price_usd", "whls_retail_price_usd", "sy_retail_price_usd",
    "final_sale_price_usd", "price_000", "final_sample_price_usd",
]

# client name -> column name, where they differ
ALIAS = {
    "name": "style_name",
    # The sheet keeps two: GAUCE (col D, "1") is part of the style code, GAUGE
    # (col V, "1.5GG & 3GG") is the knit detail. The UI collects both.
    "gauge": "gauge_detail",
    "gauge_code": "gauge",
    "wholesale_price": "whls_line_price_usd",
    "retail_price": "whls_retail_price_usd",
    "sy_price": "sy_retail_price_usd",
    "sy_sale_price": "final_sale_price_usd",
    "sample_price": "final_sample_price_usd",
    "image_path": "photo_url",
}
UNALIAS = {v: k for k, v in ALIAS.items()}

NUMERIC = {
    "admin_pct", "knit_minutes_dev",
    "box_length_cm", "box_depth_cm", "box_height_cm", "whls_line_price_usd",
    "whls_retail_price_usd", "sy_retail_price_usd", "final_sale_price_usd",
    "price_000", "final_sample_price_usd",
}
INTEGER = {"pcs_per_box", "style_number"}


def _num(v):
    """'' and None both mean 'not entered'. A blank is never stored as 0."""
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        return None


def _int(v):
    n = _num(v)
    return int(n) if n is not None else None


def _clean(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def get_or_create(cur, table, column, value, extra=None):
    """Self-teaching reference lists (backend.md §4).

    Matched case- and whitespace-insensitively so `Merino`, `merino ` and
    `MERINO` are one row, not three.
    """
    value = _clean(value)
    if not value:
        return None
    cur.execute(
        f"SELECT id FROM {table} WHERE lower(btrim({column})) = lower(btrim(%s)) LIMIT 1",
        (value,),
    )
    row = cur.fetchone()
    if row:
        return row["id"]
    cols, vals = [column], [value]
    for k, v in (extra or {}).items():
        cols.append(k)
        vals.append(v)
    ph = ", ".join(["%s"] * len(vals))
    cur.execute(
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({ph}) RETURNING id", vals
    )
    return cur.fetchone()["id"]


def _season_id(cur, code):
    """Seasons are created from their code: S27 -> SPRING/27 (schema.md §4.1.1)."""
    code = _clean(code)
    if not code:
        return None
    cur.execute("SELECT id FROM seasons WHERE code = %s", (code.upper(),))
    row = cur.fetchone()
    if row:
        return row["id"]
    letter, digits = code[0].upper(), "".join(ch for ch in code if ch.isdigit())
    if letter not in ("S", "F") or not digits:
        return None
    cur.execute(
        "INSERT INTO seasons (season_type, year_yy) VALUES (%s, %s) RETURNING id",
        ("SPRING" if letter == "S" else "FALL", int(digits)),
    )
    return cur.fetchone()["id"]


# --------------------------------------------------------------------- read
def load_style(style_id: int) -> dict | None:
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT s.*, se.code AS season, c.name AS collection,
                       cc.code AS content_code, mt.name AS material
                FROM styles s
                LEFT JOIN seasons se ON se.id = s.season_id
                LEFT JOIN collections c ON c.id = s.collection_id
                LEFT JOIN content_codes cc ON cc.id = s.content_code_id
                LEFT JOIN materials mt ON mt.id = s.material_id
                WHERE s.id = %s
                """,
                (style_id,),
            )
            s = cur.fetchone()
            if not s:
                return None

            out = {"id": s["id"], "season": s["season"], "collection": s["collection"],
                   "content_code": s["content_code"], "material": s["material"],
                   "version": s["version"]}
            for col in FLAT:
                out[UNALIAS.get(col, col)] = s.get(col)

            cur.execute(
                """
                SELECT z.code AS size, ss.finished_wt_kg AS weight_kg,
                       ss.pcs_per_box
                FROM style_sizes ss JOIN sizes z ON z.id = ss.size_id
                WHERE ss.style_id = %s ORDER BY z.sort_order
                """, (style_id,))
            out["sizes"] = [dict(r) for r in cur.fetchall()]

            # `sub_to` is the *name* of the colourway this one was replaced by
            # (identity.md §6). Names rather than ids, because the client sends
            # colourways as a list with no ids of its own.
            cur.execute(
                """
                SELECT cw.id, cw.ws_tag_color AS name, cw.subbed_on, cw.sub_reason,
                       t.ws_tag_color AS sub_to
                FROM style_colorways cw
                LEFT JOIN style_colorways t ON t.id = cw.subbed_to_colorway_id
                WHERE cw.style_id = %s ORDER BY cw.sort_order, cw.id
                """, (style_id,))
            colorways = [dict(r) for r in cur.fetchall()]
            for cw in colorways:
                cur.execute(
                    """
                    SELECT trim(concat_ws(' ', y.prefix, y.name,
                                 CASE WHEN y.color_code IS NULL THEN NULL
                                      ELSE '- ' || y.color_code END)) AS yarn,
                           cy.percent, cy.ends
                    FROM colorway_yarns cy
                    LEFT JOIN yarn_colors y ON y.id = cy.yarn_color_id
                    WHERE cy.colorway_id = %s ORDER BY cy.slot
                    """, (cw.pop("id"),))
                cw["bom"] = [dict(r) for r in cur.fetchall()]
            out["colorways"] = colorways

            # Every operation, with the minutes actually used for this style.
            # `minutes` is what the editor shows; `default_minutes` is the
            # season standard it can be compared against.
            cur.execute(
                """
                SELECT o.code, o.name, o.default_minutes, o.applies_by_default,
                       so.minutes AS override,
                       COALESCE(so.minutes,
                                CASE WHEN o.applies_by_default
                                     THEN o.default_minutes END) AS minutes
                FROM operations o
                LEFT JOIN style_operations so
                       ON so.style_id = %s AND so.operation_id = o.id
                ORDER BY o.sort_order, o.code
                """, (style_id,))
            out["operations"] = [dict(r) for r in cur.fetchall()]

            cur.execute(
                """
                SELECT m.point AS pom, z.code AS size, m.value_cm
                FROM style_measurements m JOIN sizes z ON z.id = m.size_id
                WHERE m.style_id = %s ORDER BY m.point, z.sort_order
                """, (style_id,))
            out["measurements"] = [dict(r) for r in cur.fetchall()]
            return out


def list_styles(season=None, q=None, color=None, size=None) -> list[dict]:
    sql = """
        SELECT DISTINCT s.id, s.style_name AS name, s.status, s.photo_url AS image_path,
               se.code AS season, se.season_number,
               (SELECT count(*) FROM style_colorways c2 WHERE c2.style_id = s.id)
                   AS colorway_count
        FROM styles s
        LEFT JOIN seasons se ON se.id = s.season_id
        LEFT JOIN style_colorways cw ON cw.style_id = s.id
        LEFT JOIN style_sizes ss ON ss.style_id = s.id
        LEFT JOIN sizes z ON z.id = ss.size_id
        WHERE 1 = 1
    """
    args: list = []
    if season:
        sql += " AND se.code = %s"; args.append(season)
    if q:
        sql += " AND s.style_name ILIKE %s"; args.append(f"%{q}%")
    if color:
        sql += " AND cw.ws_tag_color ILIKE %s"; args.append(f"%{color}%")
    if size:
        sql += " AND z.code = %s"; args.append(size)
    # Newest season first, so a repeated style's latest run leads.
    sql += " ORDER BY se.season_number DESC NULLS LAST, s.style_name"
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]


# -------------------------------------------------------------------- write
def save_style(payload: dict, style_id: int | None = None) -> int:
    """Create or replace a style and all its children, in one transaction."""
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            season_id = _season_id(cur, payload.get("season"))
            collection_id = get_or_create(
                cur, "collections", "name", payload.get("collection"),
                {"season_id": season_id} if season_id else None,
            ) if _clean(payload.get("collection")) else None

            # A key the client did not send is left alone: on insert the column
            # default applies, on update the stored value stays. Writing NULL
            # for an absent key would override `status` and the sell flags,
            # which carry NOT NULL defaults.
            values = {}
            for col in FLAT:
                key = UNALIAS.get(col, col)
                if key not in payload:
                    continue
                raw = payload[key]
                if col in NUMERIC:
                    values[col] = _num(raw)
                elif col in INTEGER:
                    values[col] = _int(raw)
                elif col in ("sell_sy", "sell_000"):
                    values[col] = bool(raw)
                else:
                    values[col] = _clean(raw)
            values["status"] = _clean(payload.get("status")) or "draft"
            # The content code decides the duty category, and with it every
            # duty and landed figure (schema.md §2.3).
            if "content_code" in payload:
                code = _clean(payload.get("content_code"))
                content_id = None
                if code:
                    cur.execute("SELECT id FROM content_codes WHERE upper(code) = upper(%s)",
                                (code,))
                    row = cur.fetchone()
                    content_id = row["id"] if row else None
                values["content_code_id"] = content_id
            # The yarn price drives material cost, and with it landed and margin.
            if "material" in payload:
                values["material_id"] = get_or_create(
                    cur, "materials", "name", payload.get("material"),
                    {"season_id": season_id} if season_id else None)
            values["season_id"] = season_id
            values["collection_id"] = collection_id
            if not values.get("style_name"):
                raise ValueError("Style name is required")

            if style_id:
                sets = ", ".join(f"{k} = %s" for k in values)
                cur.execute(
                    f"UPDATE styles SET {sets}, updated_at = now(), version = version + 1 "
                    "WHERE id = %s RETURNING id",
                    [*values.values(), style_id],
                )
                if not cur.fetchone():
                    raise LookupError("Style not found")
            else:
                cols = ", ".join(values)
                ph = ", ".join(["%s"] * len(values))
                cur.execute(
                    f"INSERT INTO styles ({cols}) VALUES ({ph}) RETURNING id",
                    list(values.values()),
                )
                style_id = cur.fetchone()["id"]

            # Children are replaced, not diffed (flow.md §3).
            cur.execute("DELETE FROM style_sizes WHERE style_id = %s", (style_id,))
            cur.execute("DELETE FROM style_measurements WHERE style_id = %s", (style_id,))
            cur.execute("DELETE FROM style_colorways WHERE style_id = %s", (style_id,))

            for row in payload.get("sizes") or []:
                size_id = get_or_create(cur, "sizes", "code", row.get("size"))
                if size_id:
                    cur.execute(
                        "INSERT INTO style_sizes (style_id, size_id, finished_wt_kg,"
                        " pcs_per_box) VALUES (%s,%s,%s,%s)",
                        (style_id, size_id, _num(row.get("weight_kg")),
                         # per size, falling back to the style-level figure
                         _int(row.get("pcs_per_box")) or values.get("pcs_per_box")),
                    )

            for order, cw in enumerate(payload.get("colorways") or []):
                name = _clean(cw.get("name"))
                if not name:
                    continue
                cur.execute(
                    "INSERT INTO style_colorways (style_id, ws_tag_color, sort_order)"
                    " VALUES (%s,%s,%s) RETURNING id",
                    (style_id, name, order),
                )
                cw_id = cur.fetchone()["id"]
                for slot, line in enumerate(cw.get("bom") or [], start=1):
                    yarn = _clean(line.get("yarn"))
                    if not yarn:
                        continue
                    if slot > 21:
                        break
                    yarn_id = get_or_create(cur, "yarn_colors", "name", yarn)
                    cur.execute(
                        "INSERT INTO colorway_yarns (colorway_id, slot, yarn_color_id,"
                        " percent, ends) VALUES (%s,%s,%s,%s,%s)",
                        (cw_id, slot, yarn_id, _num(line.get("percent")),
                         _num(line.get("ends"))),
                    )

            # Resolve "sub to" once every colourway exists, by name within
            # this style. A colourway cannot be subbed to itself.
            cur.execute(
                "SELECT id, ws_tag_color FROM style_colorways WHERE style_id = %s",
                (style_id,))
            by_name = {r["ws_tag_color"].strip().lower(): r["id"] for r in cur.fetchall()}
            for cw in payload.get("colorways") or []:
                name = _clean(cw.get("name"))
                target = _clean(cw.get("sub_to"))
                if not name:
                    continue
                src = by_name.get(name.strip().lower())
                dst = by_name.get(target.strip().lower()) if target else None
                if src and (dst or cw.get("sub_reason") or cw.get("subbed_on")):
                    cur.execute(
                        "UPDATE style_colorways SET subbed_to_colorway_id = %s,"
                        " subbed_on = %s, sub_reason = %s WHERE id = %s",
                        (dst if dst != src else None,
                         cw.get("subbed_on") or None,
                         _clean(cw.get("sub_reason")), src))

            # Operations: a row is stored only where this style differs from
            # the season standard, or uses an operation that is not standard.
            # Blank means "use the standard"; 0 means "not used on this style".
            if "operations" in payload:
                cur.execute(
                    "DELETE FROM style_operations WHERE style_id = %s", (style_id,))
                cur.execute("SELECT id, code, default_minutes, applies_by_default"
                            " FROM operations")
                ops = {r["code"]: r for r in cur.fetchall()}
                for row in payload.get("operations") or []:
                    op = ops.get((row.get("code") or "").strip())
                    if not op:
                        continue
                    mins = _num(row.get("minutes"))
                    if mins is None:
                        continue
                    standard = op["default_minutes"] if op["applies_by_default"] else None
                    if standard is not None and mins == standard:
                        continue          # same as the standard — nothing to store
                    cur.execute(
                        "INSERT INTO style_operations (style_id, operation_id, minutes)"
                        " VALUES (%s,%s,%s)", (style_id, op["id"], mins))

            for m in payload.get("measurements") or []:
                point = _clean(m.get("pom"))
                size_id = get_or_create(cur, "sizes", "code", m.get("size"))
                if point and size_id:
                    cur.execute(
                        "INSERT INTO style_measurements (style_id, size_id, point,"
                        " value_cm) VALUES (%s,%s,%s,%s)"
                        " ON CONFLICT (style_id, size_id, point) DO UPDATE"
                        " SET value_cm = EXCLUDED.value_cm",
                        (style_id, size_id, point, _num(m.get("value_cm"))),
                    )
            return style_id


def delete_style(style_id: int) -> bool:
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM styles WHERE id = %s", (style_id,))
            return cur.rowcount > 0


def set_photo(style_id: int, path: str) -> None:
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE styles SET photo_url = %s WHERE id = %s", (path, style_id))


# --------------------------------------------------------------------- meta
def meta() -> dict:
    """Every dropdown the editor needs, in one call (backend.md §5)."""
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            def col(sql):
                cur.execute(sql)
                return [r["v"] for r in cur.fetchall()]

            # cat_code / season_number / style_letter are the fixed parts of
            # the style code — the K, the 58 and the W in K58C3W795 — so the
            # editor can show it dissected the way the sheet writes it.
            cur.execute("SELECT code, name, cat_code, season_number, style_letter"
                        " FROM seasons ORDER BY season_number DESC")
            seasons = [dict(r) for r in cur.fetchall()]

            def distinct(c):
                return col(f"SELECT DISTINCT {c} AS v FROM styles"
                           f" WHERE {c} IS NOT NULL AND {c} <> '' ORDER BY v")

            # The weight rates the editor derives its columns from, so the
            # tolerances follow the season instead of being retyped in the UI.
            cur.execute(
                "SELECT se.code, r.wt_tolerance_low, r.wt_tolerance_high,"
                "       r.distribution_wt_add_kg, r.pricing_wt_factor"
                "  FROM season_rates r JOIN seasons se ON se.id = r.season_id"
            )
            rates = {
                r.pop("code"): {k: (float(v) if v is not None else None)
                                for k, v in r.items()}
                for r in (dict(x) for x in cur.fetchall())
            }

            return {
                "seasons": seasons,
                "rates": rates,
                "sizes": col("SELECT code AS v FROM sizes ORDER BY sort_order"),
                "contentCodes": col("SELECT code AS v FROM content_codes ORDER BY v"),
                "materials": col("SELECT name AS v FROM materials WHERE kind = 'yarn'"
                                 " ORDER BY v"),
                "collections": col("SELECT DISTINCT name AS v FROM collections ORDER BY v"),
                "subGroups": distinct("sub_group"),
                "yarns": col("SELECT DISTINCT name AS v FROM yarn_colors ORDER BY v"),
                "colorNames": col("SELECT DISTINCT ws_tag_color AS v FROM style_colorways"
                                  " ORDER BY v"),
                "options": {
                    k: distinct(k) for k in (
                        "construction", "bagging_method", "polybag_sticker",
                        "packing_method", "packing_in_box", "box_labeling",
                        "ship_via", "hang_tag", "hs_code", "duty_category",
                        # knit details: gauge_detail is the form's "gauge",
                        # gauge is the style-code digit (ALIAS above)
                        "gauge_detail", "gauge", "tension", "total_ends",
                        "composition_care", "color_sequence",
                    )
                },
            }


def add_meta(kind: str, name: str) -> None:
    targets = {
        "season": None,  # handled by _season_id
        "collection": ("collections", "name"),
        "sub_group": None,
        "yarn": ("yarn_colors", "name"),
    }
    if kind not in targets:
        raise ValueError("Unknown list")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if kind == "season":
                _season_id(cur, name)
            elif kind == "sub_group":
                pass  # learned from styles.sub_group; nothing to insert
            else:
                table, column = targets[kind]
                get_or_create(cur, table, column, name)


def costing(style_id: int) -> list[dict]:
    """Read v_sku_costing for one style (migration 0004)."""
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM v_sku_costing WHERE style_id = %s"
                " ORDER BY colorway, size_id", (style_id,))
            return [dict(r) for r in cur.fetchall()]
