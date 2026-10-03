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

import json

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
    # what the garment is, collected on the Matrix screen (migration 0008)
    "matrix_construction",
    "based_body", "print_placement", "bottom_type", "bottom_rib",
    "similar_style_past", "distressed", "sleeve_category", "sleeve_length",
    "length_category", "yarn_type", "ply",
    # cost inputs: admin % and the knit minutes the labour cost is built from
    "admin_pct", "knit_minutes_dev", "knit_minutes_prod",
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


def get_or_create(cur, table, column, value, extra=None, scope=None):
    """Self-teaching reference lists (backend.md §4).

    Matched case- and whitespace-insensitively so `Merino`, `merino ` and
    `MERINO` are one row, not three.

    `scope` narrows that match. Most lists are global — a yarn colour is the
    same yarn in any season — but collections are not: S27's BEACH is a
    different run from S25's BEACH, and without the scope the first season to
    use a name would own it for every season after.
    """
    value = _clean(value)
    if not value:
        return None
    where = f"lower(btrim({column})) = lower(btrim(%s))"
    args = [value]
    for k, v in (scope or {}).items():
        if v is None:
            where += f" AND {k} IS NULL"
        else:
            where += f" AND {k} = %s"
            args.append(v)
    cur.execute(f"SELECT id FROM {table} WHERE {where} LIMIT 1", args)
    row = cur.fetchone()
    if row:
        return row["id"]
    cols, vals = [column], [value]
    for k, v in {**(scope or {}), **(extra or {})}.items():
        cols.append(k)
        vals.append(v)
    ph = ", ".join(["%s"] * len(vals))
    cur.execute(
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({ph}) RETURNING id", vals
    )
    return cur.fetchone()["id"]


# Every season_rates column except its own id and the season it belongs to.
_RATE_COLS = (
    "exchange_rate_idr_usd, labour_rate_idr_per_hour, labour_multiplier,"
    " special_op_rate_idr_per_hour, admin_base_idr, additional_admin_idr,"
    " labels_tag_cost_idr, packaging_fee_idr, box_charge_idr, plastic_charge_idr,"
    " plastic_wt_kg, wt_tolerance_low, wt_tolerance_high, pricing_wt_factor,"
    " distribution_wt_add_kg, volumetric_divisor, kg_to_lb, container_20ft_cm3,"
    " sea_c_rate_usd, sea_p_rate_usd, dhl_usd_per_kg, dhl_grassy_usd_per_kg,"
    " fedex_canada_usd_per_kg, disbursement_pct, mpf_pct, canada_duty_pct,"
    " customs_usd, outgoing_freight_usd, sy_only_dhl_1pc_usd, sy_only_dhl_2pc_usd,"
    " reps_commission_factor, retail_markups, target_retail_margin,"
    " min_retail_margin, target_sea_margin, min_order_pcs,"
    " packing_volume_divisor_cm3"
)


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
    new_id = cur.fetchone()["id"]

    # A new season starts on the last season's rates. They carry over in
    # practice and are revised, not invented from nothing — and without a row
    # here every calculated figure on the style screens is blank, which reads
    # as broken rather than as "not set yet". Copy everything but the keys.
    cur.execute("""
        INSERT INTO season_rates (season_id, %s)
        SELECT %%s, %s FROM season_rates r
        JOIN seasons se ON se.id = r.season_id
        ORDER BY se.season_number DESC
        LIMIT 1
    """ % (_RATE_COLS, _RATE_COLS), (new_id,))
    return new_id


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


def list_styles(season=None, q=None, color=None, size=None, limit=None) -> list[dict]:
    """The browse list: one row per style, newest season first.

    The colour and size filters are EXISTS rather than joins. Joining them
    multiplies a style by its colourways times its sizes — 1,462 styles became
    14,479 rows — and every one of those rows then ran the colourway count
    before DISTINCT threw the duplicates away. EXISTS filters without
    multiplying, so the count runs once per style and DISTINCT is not needed.

    `limit` is for the typeahead in the editor header, which shows eight
    hits. Without it a two-letter query matched 803 styles and sent all 803
    — 109kB per pause in typing, to draw eight lines.
    """
    sql = """
        SELECT s.id, s.style_name AS name, s.status, s.photo_url AS image_path,
               se.code AS season, se.season_number,
               (SELECT count(*) FROM style_colorways c2 WHERE c2.style_id = s.id)
                   AS colorway_count
        FROM styles s
        LEFT JOIN seasons se ON se.id = s.season_id
        WHERE 1 = 1
    """
    args: list = []
    if season:
        sql += " AND se.code = %s"; args.append(season)
    if q:
        sql += " AND s.style_name ILIKE %s"; args.append(f"%{q}%")
    if color:
        sql += (" AND EXISTS (SELECT 1 FROM style_colorways cw"
                "              WHERE cw.style_id = s.id AND cw.ws_tag_color ILIKE %s)")
        args.append(f"%{color}%")
    if size:
        sql += (" AND EXISTS (SELECT 1 FROM style_sizes ss"
                "              JOIN sizes z ON z.id = ss.size_id"
                "              WHERE ss.style_id = s.id AND z.code = %s)")
        args.append(size)
    # Newest season first, so a repeated style's latest run leads.
    sql += " ORDER BY se.season_number DESC NULLS LAST, s.style_name"
    if limit:
        sql += " LIMIT %s"; args.append(int(limit))
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]


def export_rows(season=None, q=None, color=None, size=None) -> list[dict]:
    """One row per style x size x colourway, the way the IM itself reads.

    Same filters as the browse list, so what downloads is what is on screen.
    Calculated figures come from v_sku_costing rather than being recomputed
    here — there is one costing chain and this is not a second one.
    """
    sql = """
        SELECT se.code AS season, s.style_name AS style, v.style_code AS sku,
               z.code AS size, cw.ws_tag_color AS colorway,
               col.name AS collection, s.whs_channel, s.finishing_location,
               cc.code AS content, s.gauge AS gauge_code, s.style_number,
               ss.finished_wt_kg, ss.pcs_per_box,
               s.whls_line_price_usd, s.whls_retail_price_usd,
               s.final_sale_price_usd, s.final_sample_price_usd,
               s.hs_code, s.duty_category, s.ship_via, s.packing_method,
               v.total_all_costs_usd, v.duty_to_usa,
               v.dhl_volumetric_usd, v.landed_dhl_volumetric_usd
        FROM styles s
        JOIN seasons se            ON se.id = s.season_id
        JOIN style_sizes ss        ON ss.style_id = s.id
        JOIN sizes z               ON z.id = ss.size_id
        JOIN style_colorways cw    ON cw.style_id = s.id
        LEFT JOIN collections col  ON col.id = s.collection_id
        LEFT JOIN content_codes cc ON cc.id = s.content_code_id
        LEFT JOIN v_sku_costing v  ON v.style_id = s.id
                                  AND v.size_id = z.id
                                  AND v.colorway_id = cw.id
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
    sql += (" ORDER BY se.season_number DESC, s.style_name,"
            " cw.sort_order, z.sort_order")
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]


def related_styles(style_id: int) -> list[dict]:
    """The same garment in other seasons, newest first.

    Styles sharing a product are one product; that is what a sales report
    merges on (identity.md).
    """
    sql = """
        SELECT s.id, s.style_name AS name, se.code AS season,
               se.season_number, s.status
        FROM styles me
        JOIN styles s      ON s.product_id = me.product_id AND s.id <> me.id
        LEFT JOIN seasons se ON se.id = s.season_id
        WHERE me.id = %s AND me.product_id IS NOT NULL
        ORDER BY se.season_number DESC NULLS LAST
    """
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (style_id,))
            return [dict(r) for r in cur.fetchall()]


def link_styles(style_id: int, other_id: int) -> None:
    """Declare two styles the same garment, keeping the older product.

    Everything on the newer product moves across and the empty product goes,
    so a link never leaves two products for one garment.
    """
    if style_id == other_id:
        raise ValueError("A style cannot be linked to itself")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT s.id, s.product_id, se.season_number
                FROM styles s LEFT JOIN seasons se ON se.id = s.season_id
                WHERE s.id IN (%s, %s)
            """, (style_id, other_id))
            rows = cur.fetchall()
            if len(rows) != 2:
                raise LookupError("Style not found")
            if any(r["product_id"] is None for r in rows):
                raise ValueError("Both styles need a product first")
            rows.sort(key=lambda r: (r["season_number"] is None, r["season_number"]))
            keep, drop = rows[0]["product_id"], rows[1]["product_id"]
            if keep == drop:
                return
            cur.execute("UPDATE styles SET product_id = %s WHERE product_id = %s",
                        (keep, drop))
            cur.execute("""
                UPDATE product_identifiers SET product_id = %s
                WHERE product_id = %s
                  AND NOT EXISTS (
                      SELECT 1 FROM product_identifiers x
                      WHERE x.product_id = %s AND x.kind = product_identifiers.kind
                        AND lower(x.value) = lower(product_identifiers.value)
                        AND x.season_id IS NOT DISTINCT FROM product_identifiers.season_id)
            """, (keep, drop, keep))
            cur.execute("DELETE FROM product_identifiers WHERE product_id = %s", (drop,))
            cur.execute("DELETE FROM products WHERE id = %s", (drop,))
            # Sales arrive under whichever name the source uses, so a link
            # made by hand has to record the alias as well as join the styles.
            cur.execute("""
                INSERT INTO product_identifiers (product_id, kind, value, season_id)
                SELECT product_id, 'style_name', style_name, season_id
                  FROM styles WHERE product_id = %s
                ON CONFLICT DO NOTHING
            """, (keep,))


def _append_to_matrix_order(cur, style_id: int) -> None:
    """Put a new style at the end of its collection on the Matrix sheet.

    The sheet orders by `matrix_order NULLS LAST, style_name`, so a new style
    only lands last when the rest of its collection already has explicit
    positions. In a collection nobody has dragged yet every position is NULL,
    they are all sorted by name, and the new one appears wherever its name
    falls — which looks random to someone who just typed it into the slot at
    the end.

    Writing the whole collection's positions is what makes "last" mean last.
    Numbering only the new style cannot work: any number it took would sort
    *before* the NULLs it is supposed to follow.

    Reversible — "Reset order" sets them all back to NULL.
    """
    cur.execute("""
        WITH me AS (
            SELECT season_id, collection_id FROM styles WHERE id = %s
        ), ordered AS (
            SELECT s.id,
                   row_number() OVER (
                       -- false sorts before true, so the new style goes last
                       -- while everything else keeps the order it is shown in.
                       ORDER BY (s.id = %s),
                                s.matrix_order NULLS LAST,
                                s.style_name) AS ord
              FROM styles s, me
             WHERE s.season_id IS NOT DISTINCT FROM me.season_id
               AND s.collection_id IS NOT DISTINCT FROM me.collection_id
        )
        UPDATE styles t SET matrix_order = ordered.ord
          FROM ordered WHERE t.id = ordered.id
    """, (style_id, style_id))


def _derive_channel(cur, style_id: int) -> None:
    """Write whs_channel from the two sell flags.

    The tick boxes are the fact; the channel is how the IM writes it down. It
    used to be editable in its own right, which meant one garment could say
    "000 ONLY" in the dropdown and have both boxes ticked — and one did.

    Done in SQL off the row's own columns so it needs neither flag passed in:
    a payload that sets only one of them still lands on the right channel.
    """
    cur.execute("""
        UPDATE styles SET whs_channel = CASE
            WHEN sell_sy AND sell_000 THEN 'BOTH'
            WHEN sell_000            THEN '000 ONLY'
            WHEN sell_sy             THEN 'SY ONLY'
            ELSE NULL
        END
        WHERE id = %s
    """, (style_id,))


def _record_rename(cur, style_id: int, scope: str, old: str, new: str) -> None:
    """Note that something was called `old` and is now called `new`.

    Nothing is written when the name has not really changed — case and stray
    whitespace are not a rename, and a history full of them is one nobody
    reads.

    For a style the old name is also filed as a product identifier, because
    that is what _sales_index matches on: the history is what people read, the
    identifier is what the matcher reads, and both have to be written here or
    they drift.
    """
    old_t, new_t = _clean(old), _clean(new)
    if not old_t or not new_t or old_t.upper() == new_t.upper():
        return

    cur.execute(
        "INSERT INTO name_history (style_id, scope, old_value, new_value)"
        " VALUES (%s, %s, %s, %s)", (style_id, scope, old_t, new_t))

    if scope != "style":
        return
    cur.execute("SELECT product_id, season_id FROM styles WHERE id = %s", (style_id,))
    row = cur.fetchone()
    if not row or not row["product_id"]:
        return
    cur.execute(
        "INSERT INTO product_identifiers (product_id, kind, value, season_id)"
        " VALUES (%s, 'style_name', %s, %s) ON CONFLICT DO NOTHING",
        (row["product_id"], old_t, row["season_id"]))


def style_name_history(style_id: int) -> list[dict]:
    """Every recorded rename for this style, newest first."""
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT scope, old_value, new_value, changed_at
                  FROM name_history WHERE style_id = %s
                 ORDER BY changed_at DESC, id DESC
            """, (style_id,))
            return [dict(r) for r in cur.fetchall()]


def _ensure_product(cur, style_id: int) -> None:
    """Give a style a product if it has none, reusing one with the same name.

    Case- and whitespace-insensitive, matching link_products.py — `Maui V` and
    `MAUI V ` are the same garment, and two products for one garment is the
    thing this whole table exists to prevent.

    The name is also recorded in product_identifiers, because that is what a
    sales feed looks up: sales arrive under whatever the source calls it.
    """
    cur.execute("SELECT style_name, season_id, product_id FROM styles WHERE id = %s",
                (style_id,))
    row = cur.fetchone()
    if not row or row["product_id"] is not None:
        return
    name = _clean(row["style_name"])
    if not name:
        return

    cur.execute(
        "SELECT id FROM products"
        " WHERE upper(btrim(display_name)) = upper(btrim(%s)) LIMIT 1", (name,))
    found = cur.fetchone()
    if found:
        product_id = found["id"]
    else:
        cur.execute(
            "INSERT INTO products (display_name, first_season_id)"
            " VALUES (%s, %s) RETURNING id", (name, row["season_id"]))
        product_id = cur.fetchone()["id"]

    cur.execute("UPDATE styles SET product_id = %s WHERE id = %s",
                (product_id, style_id))
    cur.execute(
        "INSERT INTO product_identifiers (product_id, kind, value, season_id)"
        " VALUES (%s, 'style_name', %s, %s) ON CONFLICT DO NOTHING",
        (product_id, name, row["season_id"]))


def unlink_style(style_id: int) -> None:
    """Split a style back out onto a product of its own."""
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT s.style_name, s.season_id FROM styles s WHERE s.id = %s
            """, (style_id,))
            row = cur.fetchone()
            if not row:
                raise LookupError("Style not found")
            cur.execute("""
                INSERT INTO products (display_name, first_season_id)
                VALUES (%s, %s) RETURNING id
            """, (row["style_name"], row["season_id"]))
            new_id = cur.fetchone()["id"]
            cur.execute("UPDATE styles SET product_id = %s WHERE id = %s",
                        (new_id, style_id))


# -------------------------------------------------------------------- write
def save_style(payload: dict, style_id: int | None = None) -> int:
    """Create or replace a style and all its children, in one transaction."""
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            season_id = _season_id(cur, payload.get("season"))
            collection_id = get_or_create(
                cur, "collections", "name", payload.get("collection"),
                scope={"season_id": season_id},
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

            is_new = style_id is None
            if style_id and values.get("style_name"):
                # Read before the UPDATE below overwrites it — afterwards the
                # old spelling is gone and there is nothing to record.
                cur.execute("SELECT style_name FROM styles WHERE id = %s", (style_id,))
                was = cur.fetchone()
                if was:
                    _record_rename(cur, style_id, "style",
                                   was["style_name"], values["style_name"])
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

            # Every style needs a product, from the moment it exists.
            #
            # Products used to be handed out only by scripts/link_products.py,
            # run by hand after a workbook import — so a style created in the
            # app never got one, and a style with no product cannot be linked
            # to another season ("Both styles need a product first"), shows no
            # related seasons, and is invisible to sales matching, which joins
            # on the product. The app could create styles it could never
            # finish.
            #
            # Matched on the name the same way the script does, so creating
            # F27's MAUI V CHUNKY COTTON where F26 already has one joins them
            # without anybody pressing Link.
            # The channel follows the tick boxes whenever they are written,
            # so the editor's read-only display cannot be contradicted by
            # anything that reaches this function another way.
            if "sell_sy" in values or "sell_000" in values:
                _derive_channel(cur, style_id)

            _ensure_product(cur, style_id)
            if is_new:
                if payload.get("matrix_parked"):
                    # Created into the tray: no position yet, and it must not
                    # be numbered or it would be on the sheet as well.
                    cur.execute(
                        "UPDATE styles SET matrix_parked = true,"
                        " matrix_order = NULL WHERE id = %s", (style_id,))
                else:
                    # Last on the sheet, not wherever its name happens to fall.
                    # Only on creation: re-running this on every save would
                    # shove a style to the end of its collection each time
                    # anyone corrected a typo on it.
                    _append_to_matrix_order(cur, style_id)

            # Children are replaced, not diffed (flow.md §3).
            #
            # Which means anything on a colourway that the editor does not
            # send would be destroyed by a save. Some of it is set elsewhere
            # entirely — the pen colour comes from the Matrix screen — so the
            # editor legitimately knows nothing about it and cannot send it
            # back. Kept here across the rewrite, keyed by the colourway name,
            # which is unique per style.
            #
            # subbed_to_colorway_id is deliberately not kept: it points at a
            # row id that this rewrite destroys, so restoring it would either
            # dangle or fail the constraint.
            cur.execute("""
                SELECT ws_tag_color, mark, highlight, zone,
                       product_colorway_id, whs_channel,
                       reps_color, color_sequence, sell_restriction,
                       subbed_on, sub_reason
                  FROM style_colorways WHERE style_id = %s
            """, (style_id,))
            kept = {r["ws_tag_color"]: dict(r) for r in cur.fetchall()}

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
                # Put back what the editor never had.
                prior = kept.get(name)
                if prior:
                    cur.execute("""
                        UPDATE style_colorways
                           SET mark = %s, product_colorway_id = %s,
                               whs_channel = %s, reps_color = %s,
                               color_sequence = %s, sell_restriction = %s,
                               subbed_on = %s, sub_reason = %s
                         WHERE id = %s
                    """, (prior["mark"], prior["product_colorway_id"],
                          prior["whs_channel"], prior["reps_color"],
                          prior["color_sequence"], prior["sell_restriction"],
                          prior["subbed_on"], prior["sub_reason"], cw_id))
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


# Everything that goes when a style does. Eight tables cascade off styles, so
# a delete is never only a row — and the counts are what make a confirmation
# worth reading rather than a reflex to click through.
_STYLE_CHILDREN = [
    ("colourways", "SELECT count(*) FROM style_colorways WHERE style_id = %s"),
    ("sizes", "SELECT count(*) FROM style_sizes WHERE style_id = %s"),
    ("sales rows", "SELECT count(*) FROM style_sales WHERE style_id = %s"),
    ("checklist ticks", "SELECT count(*) FROM style_steps WHERE style_id = %s"),
    ("operations", "SELECT count(*) FROM style_operations WHERE style_id = %s"),
    ("measurements", "SELECT count(*) FROM style_measurements WHERE style_id = %s"),
    ("trims", "SELECT count(*) FROM style_trims WHERE style_id = %s"),
    ("market prices", "SELECT count(*) FROM style_market_prices WHERE style_id = %s"),
    # Not a child table, but it goes the same way: the yarn lines hang off the
    # colourways, which hang off the style.
    ("yarn lines",
     "SELECT count(*) FROM colorway_yarns cy"
     " JOIN style_colorways cw ON cw.id = cy.colorway_id WHERE cw.style_id = %s"),
]


def delete_style(style_id: int) -> dict | None:
    """Remove a style, and say what went with it.

    None when there was no such style, so the route can answer 404 rather
    than reporting a delete that did not happen.
    """
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT style_name FROM styles WHERE id = %s", (style_id,))
            row = cur.fetchone()
            if not row:
                return None

            # Counted first: afterwards there is nothing left to count.
            removed = {}
            for label, sql in _STYLE_CHILDREN:
                cur.execute(sql, (style_id,))
                n = cur.fetchone()["count"]
                if n:
                    removed[label] = n

            cur.execute("DELETE FROM styles WHERE id = %s", (style_id,))
            return {"name": row["style_name"], "removed": removed}


def set_photo(style_id: int, path: str) -> None:
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE styles SET photo_url = %s WHERE id = %s", (path, style_id))


# --------------------------------------------------------------------- meta
def lookup_products(q=None, limit: int = 40) -> list[dict]:
    """Find a garment and show every season it ran in, under any name.

    What the Master File Lookup workbook pivots by hand: one row per product,
    the seasons it appeared in, and the names it went by. The names differ —
    that is the point — so the search looks at every name a product has been
    known by, not only its current one.
    """
    sql = """
        WITH hit AS (
            SELECT DISTINCT s.product_id
            FROM styles s
            WHERE s.product_id IS NOT NULL
              AND (%s::text IS NULL OR s.style_name ILIKE %s)
            UNION
            SELECT DISTINCT i.product_id
            FROM product_identifiers i
            WHERE %s::text IS NULL OR i.value ILIKE %s
        )
        SELECT p.id, p.display_name,
               count(DISTINCT s.season_id) AS seasons,
               jsonb_agg(jsonb_build_object(
                   'style_id', s.id, 'season', se.code,
                   'season_number', se.season_number, 'name', s.style_name,
                   'colorways', (SELECT count(*) FROM style_colorways cw
                                  WHERE cw.style_id = s.id)
               ) ORDER BY se.season_number DESC) AS runs
        FROM hit
        JOIN products p ON p.id = hit.product_id
        JOIN styles s   ON s.product_id = p.id
        LEFT JOIN seasons se ON se.id = s.season_id
        GROUP BY p.id, p.display_name
        ORDER BY count(DISTINCT s.season_id) DESC, p.display_name
        LIMIT %s
    """
    like = f"%{q}%" if q else None
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (q, like, q, like, limit))
            return [dict(r) for r in cur.fetchall()]


def matrix_rows(season=None, collection=None, q=None,
                start_date=None, end_date=None,
                include_parked=False) -> list[dict]:
    """One row per style, with what a printed review sheet shows.

    Grouped by collection because that is how the sheet is worked through, one
    worksheet per collection.

    NEW or EXACT REPEAT is not stored — it is whether this garment ran in an
    earlier season, which the product link already answers.
    """
    sql = """
        -- Every name a colourway on a style has been called, so a colour that
        -- was carried over and then renamed is still recognised as carried
        -- over. The team adds it under last season's name and renames it,
        -- which is what leaves the trail this walks.
        --
        -- Recursive so a colour renamed twice still reaches its original.
        -- Seeded from name_history rather than from every colourway, because
        -- that table is small and the join only expands where a rename exists.
        WITH RECURSIVE colour_was AS (
            SELECT style_id,
                   upper(btrim(new_value)) AS now_name,
                   upper(btrim(old_value)) AS was_name
              FROM name_history WHERE scope = 'colorway'
            UNION
            SELECT c.style_id, c.now_name, upper(btrim(h.old_value))
              FROM colour_was c
              JOIN name_history h
                ON h.style_id = c.style_id AND h.scope = 'colorway'
               AND upper(btrim(h.new_value)) = c.was_name
        )
        SELECT s.id, s.style_name AS name, s.ply, s.photo_url AS image_path,
               se.code AS season, col.name AS collection,
               s.gauge_detail, s.whs_channel,
               concat(se.cat_code, se.season_number, cc.code, s.gauge,
                      se.style_letter, s.style_number) AS style_code,
               EXISTS (SELECT 1 FROM styles o
                       WHERE o.product_id = s.product_id AND o.id <> s.id
                         AND o.season_id <> s.season_id) AS is_repeat,
               (SELECT se2.code FROM styles o
                  JOIN seasons se2 ON se2.id = o.season_id
                 WHERE o.product_id = s.product_id AND o.id <> s.id
                   AND se2.season_number < se.season_number
                 ORDER BY se2.season_number DESC LIMIT 1) AS last_season,
               ARRAY(SELECT cw.ws_tag_color FROM style_colorways cw
                      WHERE cw.style_id = s.id
                      ORDER BY cw.sort_order, cw.ws_tag_color) AS colorways,
               -- Which of those colours are NEW — written in green on the
               -- card, where a carried-over colour is plain black.
               --
               -- "Carried over" means the colour ran in ANY earlier season of
               -- this garment, not only the one before: a colour that sits out
               -- a season and comes back was still not invented this season.
               --
               -- A style with no earlier season at all matches nothing here,
               -- so every one of its colours is new. That is intended — a new
               -- style's colours are all new.
               ARRAY(
                   SELECT cw.ws_tag_color FROM style_colorways cw
                    WHERE cw.style_id = s.id
                      AND NOT EXISTS (
                          SELECT 1 FROM styles o
                            JOIN seasons se2 ON se2.id = o.season_id
                            JOIN style_colorways pcw ON pcw.style_id = o.id
                           WHERE o.product_id = s.product_id
                             AND se2.season_number < se.season_number
                             AND (upper(btrim(pcw.ws_tag_color))
                                    = upper(btrim(cw.ws_tag_color))
                                  OR upper(btrim(pcw.ws_tag_color)) IN (
                                       SELECT w.was_name FROM colour_was w
                                        WHERE w.style_id = s.id
                                          AND w.now_name
                                                = upper(btrim(cw.ws_tag_color)))))
                    ORDER BY cw.sort_order, cw.ws_tag_color) AS new_colorways,
               -- The pen colour on a colourway's name, keyed by the name
               -- rather than folded into the array above: the sales table
               -- looks its quantities up by that name, and turning the list
               -- into objects would mean changing every reader of it.
               -- The name is unique per style, so it is a safe key.
               coalesce((
                   SELECT jsonb_object_agg(cw.ws_tag_color, cw.mark)
                     FROM style_colorways cw
                    WHERE cw.style_id = s.id AND cw.mark IS NOT NULL
               ), '{}'::jsonb) AS colorway_marks,
               -- Which band of the ruled list each colour sits in. Keyed by
               -- name like the pen and the background, for the same reason.
               coalesce((
                   SELECT jsonb_object_agg(cw.ws_tag_color, cw.zone)
                     FROM style_colorways cw
                    WHERE cw.style_id = s.id
               ), '{}'::jsonb) AS colorway_zones,
               coalesce((
                   SELECT jsonb_object_agg(cw.ws_tag_color, cw.highlight)
                     FROM style_colorways cw
                    WHERE cw.style_id = s.id AND cw.highlight IS NOT NULL
               ), '{}'::jsonb) AS colorway_highlights,
               -- The attribute block the workbook prints under each photo.
               -- Most of these columns exist but were never imported, so they
               -- come back null today and the sheet prints the row blank.
               -- gauge is listed here as well as inside the style_code concat
               -- above: used there it builds a string, and a column that is
               -- only ever concatenated never reaches the sheet.
               s.matrix_highlight, s.past_sy_mark, s.past_000_mark,
               s.matrix_band, s.needs_photo, s.notes,
               s.gauge, s.gauge_detail, s.matrix_construction,
               s.construction, s.based_body,
               s.print_placement, s.total_ends,
               s.bottom_type, s.bottom_rib, s.distressed,
               s.sleeve_category, s.sleeve_length, s.length_category,
               s.similar_style_past, s.yarn_type, s.matrix_parked,
               -- The S/M weight is what the workbook shows; the others are
               -- graded from it.
               (SELECT ss.finished_wt_kg FROM style_sizes ss
                  JOIN sizes sz ON sz.id = ss.size_id
                 WHERE ss.style_id = s.id AND sz.code = 'S/M') AS weight_sm,
               -- The preparation checklist, same rules as the Checklist page.
               (coalesce((
                   SELECT jsonb_object_agg(st.step,
                              jsonb_build_object('by', st.done_by,
                                                 'at', st.done_at))
                     FROM style_steps st
                    WHERE st.style_id = s.id
                      AND NOT (st.step = ANY (%s))
               ), '{}'::jsonb)
                || CASE WHEN {IM_P}
                        THEN jsonb_build_object('IM-P',
                                 jsonb_build_object('auto', true))
                        ELSE '{}'::jsonb END
                || CASE WHEN {C_IM}
                        THEN jsonb_build_object('C-IM',
                                 jsonb_build_object('auto', true))
                        ELSE '{}'::jsonb END
               ) AS steps,
               -- Every season this garment ran in, for the sales history
               -- table. Quantities are not here: no sales data is loaded.
               ARRAY(SELECT se2.code FROM styles o
                       JOIN seasons se2 ON se2.id = o.season_id
                      WHERE o.product_id = s.product_id
                      ORDER BY se2.season_number DESC) AS seasons_run,
               -- A repeat runs a year later in the same half of the year:
               -- F26 -> F27, not F26 -> S27. That is season_number + 2.
               -- The code is computed rather than joined so it can be named
               -- even when that season has not been imported yet.
               CASE WHEN (se.season_number + 2) %% 2 = 0
                    THEN 'S' || ((se.season_number - 2) / 2)
                    ELSE 'F' || ((se.season_number - 3) / 2)
               END AS next_season,
               -- Whether the next season exists at all. Without this,
               -- "not imported" and "decided against" both read as
               -- not-repeating, and the whole sheet comes out red.
               EXISTS (SELECT 1 FROM styles o2
                         JOIN seasons se3 ON se3.id = o2.season_id
                        WHERE se3.season_number = se.season_number + 2) AS next_season_loaded,
               EXISTS (SELECT 1 FROM styles o
                         JOIN seasons se2 ON se2.id = o.season_id
                        WHERE o.product_id = s.product_id
                          AND se2.season_number = se.season_number + 2) AS repeats_next,
               -- Which channels the NEXT season's version of this garment is
               -- set to sell through. Read off the booleans rather than
               -- whs_channel: that text is blank on 254 styles, while the
               -- flags are NOT NULL and are what the editor actually toggles.
               (SELECT o.sell_sy FROM styles o
                  JOIN seasons se2 ON se2.id = o.season_id
                 WHERE o.product_id = s.product_id
                   AND se2.season_number = se.season_number + 2
                 ORDER BY o.id LIMIT 1) AS next_sells_sy,
               (SELECT o.sell_000 FROM styles o
                  JOIN seasons se2 ON se2.id = o.season_id
                 WHERE o.product_id = s.product_id
                   AND se2.season_number = se.season_number + 2
                 ORDER BY o.id LIMIT 1) AS next_sells_000,
               -- The circles above the photo. A repeat is the same half of
               -- the year one year earlier, so the previous season is
               -- season_number - 2: F26 (57) repeats F25 (55).
               --
               -- NULL where this garment did not run then, which is what the
               -- card reads to decide whether to draw the circles at all —
               -- a NEW style has no past-season row and gets none.
               (SELECT o.sell_sy FROM styles o
                  JOIN seasons se2 ON se2.id = o.season_id
                 WHERE o.product_id = s.product_id
                   AND se2.season_number = se.season_number - 2
                 ORDER BY o.id LIMIT 1) AS prev_sells_sy,
               (SELECT o.sell_000 FROM styles o
                  JOIN seasons se2 ON se2.id = o.season_id
                 WHERE o.product_id = s.product_id
                   AND se2.season_number = se.season_number - 2
                 ORDER BY o.id LIMIT 1) AS prev_sells_000,
               -- How many earlier seasons this garment ran in. Not used to
               -- colour anything yet: orange is meant to mean "ran in the two
               -- previous seasons" and yellow "ran before but unconfirmed",
               -- and what makes a past season confirmed is still open
               -- (docs/caveats.md). Shown on the circles' tooltip so the
               -- person applying the ring by hand can see it.
               (SELECT count(DISTINCT o.season_id) FROM styles o
                  JOIN seasons se2 ON se2.id = o.season_id
                 WHERE o.product_id = s.product_id
                   AND se2.season_number < se.season_number) AS past_seasons,
               -- The orange ring: ran in BOTH of the two previous seasons.
               -- F26 (57) wants F25 (55) and F24 (53) — same half of the year,
               -- one and two years back. Computed, not stored: it is a fact
               -- about the links, and a stored copy would be a second answer
               -- to the same question.
               (EXISTS (SELECT 1 FROM styles o
                          JOIN seasons se2 ON se2.id = o.season_id
                         WHERE o.product_id = s.product_id
                           AND se2.season_number = se.season_number - 2)
                AND EXISTS (SELECT 1 FROM styles o
                              JOIN seasons se2 ON se2.id = o.season_id
                             WHERE o.product_id = s.product_id
                               AND se2.season_number = se.season_number - 4)
               ) AS repeats_two_past,
               -- {colourway: {whs_000: n, sy: n}} for the period asked for.
               -- Absent rather than zero when nothing was fetched: a blank
               -- cell means "not known", a 0 means "sold none".
               (SELECT jsonb_object_agg(t.colour, t.channels) FROM (
                    SELECT cw.ws_tag_color AS colour,
                           jsonb_object_agg(lower(sl.channel), sl.quantity) AS channels
                      FROM style_sales sl
                      JOIN style_colorways cw ON cw.id = sl.colorway_id
                     WHERE sl.style_id = s.id
                       AND (%s::date IS NULL OR sl.period_start = %s)
                       AND (%s::date IS NULL OR sl.period_end = %s)
                     GROUP BY cw.ws_tag_color) t) AS sales
        FROM styles s
        JOIN seasons se            ON se.id = s.season_id
        LEFT JOIN collections col   ON col.id = s.collection_id
        LEFT JOIN content_codes cc  ON cc.id = s.content_code_id
        WHERE s.status <> 'draft'
    """.replace("{IM_P}", _IM_P_RULE).replace("{C_IM}", _C_IM_RULE)
    # Placeholders bind in the order they appear, and all five are in the
    # SELECT: the checklist's AUTO_STEPS, then the four sales dates.
    args: list = [AUTO_STEPS, start_date, start_date, end_date, end_date]
    # A parked style has no place in the running order, so it stays off the
    # sheet and out of the print. Only the Matrix screen asks for them, to
    # fill its tray.
    if not include_parked:
        sql += " AND NOT s.matrix_parked"
    if season:
        sql += " AND se.code = %s"; args.append(season)
    if collection:
        sql += " AND col.name = %s"; args.append(collection)
    if q:
        sql += " AND s.style_name ILIKE %s"; args.append(f"%{q}%")
    sql += (" ORDER BY col.sort_order NULLS LAST, col.name NULLS LAST,"
            " s.matrix_order NULLS LAST, s.style_name")
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]


# -------------------------------------------------------------------- sales
def _sales_index(cur, season_id):
    """Every name a style can be found by, this season, to its colourways.

    Two passes. First the season's own style names. Then every other name the
    same product has been known by, because the sources do not use this
    season's name — Shopify sells "RIHANNA CHUNKY CARDI COTTON" where F26 says
    "RIHANNA CARDI CHUNKY COTTON". That alias comes from product_identifiers,
    so linking two styles by hand improves the matching without anyone
    maintaining a separate mapping table.

    The season's own name wins where both would match.
    """
    cur.execute("""
        SELECT s.id AS style_id, s.product_id,
               upper(btrim(s.style_name)) AS style,
               cw.id AS colorway_id, upper(btrim(cw.ws_tag_color)) AS colour
          FROM styles s
          LEFT JOIN style_colorways cw ON cw.style_id = s.id
         WHERE s.season_id = %s
    """, (season_id,))
    index, by_product = {}, {}
    for r in cur.fetchall():
        index.setdefault(r["style"], {})[r["colour"]] = (r["style_id"], r["colorway_id"])
        if r["product_id"]:
            by_product.setdefault(r["product_id"], r["style"])

    cur.execute("""
        SELECT DISTINCT i.product_id, upper(btrim(i.value)) AS alias
          FROM product_identifiers i
         WHERE i.kind = 'style_name'
    """)
    for r in cur.fetchall():
        own = by_product.get(r["product_id"])
        if own and r["alias"] not in index:
            index[r["alias"]] = index[own]

    # Third pass: colours this season's styles used to be called. Shopify and
    # Salesforce keep selling under the old colour name just as they do with
    # the style name, and until name_history existed there was nowhere to look
    # it up — colour matching was exact-name only, so a renamed colourway lost
    # its figures silently.
    #
    # Chained oldest to newest, so BLUE -> OCEAN BLUE -> DEEP OCEAN resolves
    # from any of the three. Rows are applied in order and each one points at
    # whatever its new name resolves to by then.
    cur.execute("""
        SELECT upper(btrim(s.style_name)) AS style,
               upper(btrim(h.old_value))  AS was,
               upper(btrim(h.new_value))  AS now
          FROM name_history h
          JOIN styles s ON s.id = h.style_id
         WHERE h.scope = 'colorway' AND s.season_id = %s
         ORDER BY h.changed_at, h.id
    """, (season_id,))
    for r in cur.fetchall():
        colours = index.get(r["style"])
        if not colours:
            continue
        target = colours.get(r["now"])
        # Only fills a gap: a colour name in use today always wins over one
        # that used to mean something else.
        if target and r["was"] not in colours:
            colours[r["was"]] = target
    return index


def import_sales(season, start_date, end_date, channel, rows) -> dict:
    """Store one channel's sold quantities for a period.

    Rows that match nothing are kept, with style_id null and the source's own
    spelling in source_style and source_color, so a miss can be looked at
    rather than disappearing.

    Re-importing the same channel and period replaces it — a second run after
    a correction must not double the figures.
    """
    if channel not in ("WHS_000", "SY"):
        raise ValueError("channel must be WHS_000 or SY")

    matched = unmatched = 0
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            season_id = _season_id(cur, season)
            if season_id is None:
                raise ValueError("unknown season: %r" % (season,))

            cur.execute(
                "DELETE FROM style_sales WHERE season_id = %s AND channel = %s"
                "   AND period_start = %s AND period_end = %s",
                (season_id, channel, start_date, end_date))

            index = _sales_index(cur, season_id)

            # More than one source row can land on the same colourway — that
            # is what alias matching is for, and Shopify splits a colour
            # across listings anyway. They add up; one row per colourway is
            # what the sheet prints and what the unique index allows.
            totals, seen_as, misses = {}, {}, []
            for row in rows:
                style = " ".join(str(row.get("style") or "").split()).upper()
                colour = " ".join(str(row.get("color") or "").split()).upper()
                try:
                    qty = int(float(row.get("quantity") or 0))
                except (TypeError, ValueError):
                    continue
                colours = index.get(style)
                hit = colours.get(colour) if colours else None
                if hit:
                    matched += 1
                    totals[hit] = totals.get(hit, 0) + qty
                    seen_as.setdefault(hit, (row.get("style"), row.get("color")))
                else:
                    unmatched += 1
                    # A colour we do not list is a different problem from a
                    # style we do not have: the first needs a colourway added,
                    # the second a product link. Keep the style_id when we
                    # know it, so the two can be told apart.
                    style_id = None
                    if colours:
                        style_id = next(iter(colours.values()))[0]
                    misses.append((style_id, row.get("style"),
                                   row.get("color"), qty))

            for (style_id, colorway_id), qty in totals.items():
                src_style, src_colour = seen_as[(style_id, colorway_id)]
                cur.execute("""
                    INSERT INTO style_sales
                        (style_id, colorway_id, season_id, channel, quantity,
                         period_start, period_end, source_style, source_color)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (style_id, colorway_id, season_id, channel, qty,
                      start_date, end_date, src_style, src_colour))

            for style_id, src_style, src_colour, qty in misses:
                cur.execute("""
                    INSERT INTO style_sales
                        (style_id, season_id, channel, quantity,
                         period_start, period_end, source_style, source_color)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """, (style_id, season_id, channel, qty, start_date, end_date,
                      src_style, src_colour))

    return {"channel": channel, "season": season,
            "period": [start_date, end_date],
            "matched": matched, "unmatched": unmatched,
            "colour_only": sum(1 for m in misses if m[0] is not None),
            "colourways": len(totals),
            "rows": matched + unmatched}


def sales_periods(season=None) -> list[dict]:
    """The windows sales have been loaded for, newest first.

    A sheet asking for a window nobody loaded shows empty cells, which look
    exactly like a style that sold nothing. This is what lets it say which
    it is.
    """
    sql = """
        SELECT se.code AS season, sl.period_start, sl.period_end,
               sl.channel, count(*) AS rows, sum(sl.quantity) AS units
          FROM style_sales sl
          LEFT JOIN seasons se ON se.id = sl.season_id
         WHERE (%s::text IS NULL OR se.code = %s)
         GROUP BY se.code, sl.period_start, sl.period_end, sl.channel
         ORDER BY sl.period_start DESC, sl.channel
    """
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (season, season))
            return [dict(r) for r in cur.fetchall()]


def unmatched_sales(season=None) -> list[dict]:
    """Rows no style or colourway was found for — the ones worth reading."""
    sql = """
        SELECT sl.source_style, sl.source_color, sl.channel, sl.quantity,
               sl.period_start, sl.period_end, se.code AS season,
               CASE WHEN sl.style_id IS NULL THEN 'style'
                    ELSE 'colour' END AS missing
          FROM style_sales sl
          LEFT JOIN seasons se ON se.id = sl.season_id
         WHERE sl.colorway_id IS NULL
           AND (%s::text IS NULL OR se.code = %s)
         ORDER BY sl.quantity DESC
    """
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (season, season))
            return [dict(r) for r in cur.fetchall()]


# ------------------------------------------------------------------ reports
# draft -> submitted -> approved | rejected. A rejected report returns to
# draft, so the same row carries its whole history rather than being replaced.
_FLOW = {
    "draft": {"submitted"},
    "submitted": {"approved", "rejected", "draft"},
    "approved": {"draft"},
    "rejected": {"draft"},
}


def list_reports(status: str | None = None) -> list[dict]:
    sql = """
        SELECT r.*, se.code AS season
        FROM reports r LEFT JOIN seasons se ON se.id = r.season_id
        WHERE (%s::text IS NULL OR r.status = %s)
        ORDER BY r.created_at DESC
    """
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (status, status))
            return [dict(r) for r in cur.fetchall()]


def _report(cur, report_id):
    cur.execute("""
        SELECT r.*, se.code AS season
        FROM reports r LEFT JOIN seasons se ON se.id = r.season_id
        WHERE r.id = %s
    """, (report_id,))
    row = cur.fetchone()
    if not row:
        raise LookupError("Report not found")
    return dict(row)


def save_report(payload: dict, report_id: int | None = None) -> dict:
    fields = ("title", "kind", "note", "prepared_by")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            season_id = _season_id(cur, payload.get("season"))
            values = {k: _clean(payload.get(k)) for k in fields if k in payload}
            values["season_id"] = season_id
            if "filters" in payload:
                values["filters"] = json.dumps(payload.get("filters") or {})

            if report_id is None:
                cols = list(values)
                cur.execute(
                    f"INSERT INTO reports ({', '.join(cols)})"
                    f" VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id",
                    [values[c] for c in cols],
                )
                report_id = cur.fetchone()["id"]
            elif values:
                sets = ", ".join(f"{c} = %s" for c in values)
                cur.execute(f"UPDATE reports SET {sets} WHERE id = %s",
                            [*values.values(), report_id])
                if cur.rowcount == 0:
                    raise LookupError("Report not found")
            return _report(cur, report_id)


def set_report_status(report_id: int, status, by=None, note=None) -> dict:
    status = _clean(status)
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            current = _report(cur, report_id)["status"]
            if status not in _FLOW.get(current, set()):
                raise ValueError(f"A {current} report cannot become {status}")
            if status == "submitted":
                cur.execute(
                    "UPDATE reports SET status = %s, submitted_at = now(),"
                    " decided_by = NULL, decided_at = NULL, decision_note = NULL"
                    " WHERE id = %s", (status, report_id))
            elif status == "draft":
                cur.execute(
                    "UPDATE reports SET status = 'draft', submitted_at = NULL,"
                    " decided_by = NULL, decided_at = NULL, decision_note = NULL"
                    " WHERE id = %s", (report_id,))
            else:
                cur.execute(
                    "UPDATE reports SET status = %s, decided_by = %s,"
                    " decision_note = %s, decided_at = now() WHERE id = %s",
                    (status, _clean(by), _clean(note), report_id))
            return _report(cur, report_id)


def delete_report(report_id: int) -> None:
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM reports WHERE id = %s", (report_id,))


def _collections_by_season(cur) -> dict:
    """{season code: [collection names]}, in the order the sheet runs."""
    cur.execute("""
        SELECT se.code, c.name
          FROM collections c
          JOIN seasons se ON se.id = c.season_id
         ORDER BY se.season_number, c.sort_order NULLS LAST, c.name
    """)
    out: dict = {}
    for row in cur.fetchall():
        code = row["code"] if isinstance(row, dict) else row[0]
        name = row["name"] if isinstance(row, dict) else row[1]
        out.setdefault(code, []).append(name)
    return out


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
                # Collections belong to a season — S26's COTTON and F26's
                # COTTON are different rows — so a screen that has picked a
                # season can offer only that season's blocks rather than all
                # 31 names at once.
                "collections_by_season": _collections_by_season(cur),
                "subGroups": distinct("sub_group"),
                "yarns": col("SELECT DISTINCT name AS v FROM yarn_colors ORDER BY v"),
                # YCA, YST, YAC, YTX, YP — the code every yarn colour name
                # starts with, which is the vocabulary for `yarn_type`.
                "yarnTypes": col(
                    "SELECT DISTINCT split_part(name, ' ', 1) AS v FROM yarn_colors"
                    " WHERE name ~ '^Y[A-Z]+ ' ORDER BY v"),
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
                        "based_body", "print_placement", "bottom_type",
                        "bottom_rib", "similar_style_past", "distressed",
                        "sleeve_category", "sleeve_length", "length_category",
                        "yarn_type",
                    )
                },
            }


def add_meta(kind: str, name: str, season: str | None = None) -> None:
    """Add one entry to a reference list.

    `season` is required for a collection and ignored by everything else.
    collections.season_id is NOT NULL and this function used to insert without
    it, so adding a collection raised a 500 — the only caller that worked was
    save_style, which scopes it properly. A collection is per season by design:
    S27's BEACH is a different run from S25's BEACH.
    """
    targets = {
        "season": None,  # handled by _season_id
        "collection": ("collections", "name"),
        "sub_group": None,
        "yarn": ("yarn_colors", "name"),
    }
    if kind not in targets:
        raise ValueError("Unknown list")
    if kind == "collection" and not _clean(season):
        raise ValueError("A collection belongs to a season — choose one first")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if kind == "season":
                _season_id(cur, name)
            elif kind == "sub_group":
                pass  # learned from styles.sub_group; nothing to insert
            elif kind == "collection":
                get_or_create(
                    cur, "collections", "name", name,
                    scope={"season_id": _season_id(cur, season)})
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


# ---------------------------------------------------------------- checklist
# The preparation steps the operators tick off per style (migration 0011).
# The order is the order they read in the workbook, which is the order they
# are worked through; it is not enforced anywhere.
# Two of them are not ticked by anyone: they are true when the data they
# describe is present, so the tick and the record cannot disagree. The other
# seven are about things outside the database — a pattern, a spec, a knitted
# swatch on a rail — and nothing here can know whether those exist.
CHECKLIST_STEPS = [
    {"code": "IM",   "label": "Entered in IM", "auto": False},
    {"code": "IM-P", "label": "IM price", "auto": True,
     "rule": "Ticked when IM is ticked and the retail price is entered —"
             " and the wholesale line price too, if the style sells"
             " through 000."},
    {"code": "Y%",   "label": "Yarn %", "auto": False},
    {"code": "P",    "label": "Pola", "auto": False},
    {"code": "S",    "label": "Spec", "auto": False},
    {"code": "C-PB", "label": "PB has chosen the colour", "auto": False},
    {"code": "C-IM", "label": "Colour entered in IM", "auto": True,
     "rule": "Ticked when IM is ticked and the style has colourways."},
    {"code": "SW-S", "label": "Hanging swatch — spec", "auto": False},
    {"code": "SW-R", "label": "Hanging swatch — knit", "auto": False},
    {"code": "SEND TO PB", "label": "Sent to PB", "auto": False},
]

AUTO_STEPS = [s["code"] for s in CHECKLIST_STEPS if s["auto"]]

# Both computed steps are about work done *in IM*, so neither can be true
# before the style is in IM at all. IM is the one hand tick they hang off.
_IN_IM = """
    EXISTS (SELECT 1 FROM style_steps im
             WHERE im.style_id = s.id AND im.step = 'IM')
"""

# sy_retail_price_usd is deliberately not read here: it is filled on 1 style
# out of 1462, so requiring it would leave every SY style unticked for ever.
# The retail figure the sheet actually carries is whls_retail_price_usd, on
# both channels; whls_line_price_usd is the wholesale one and only matters to
# a style that sells through 000.
_IM_P_RULE = _IN_IM + """
    AND s.whls_retail_price_usd IS NOT NULL
    AND (NOT s.sell_000 OR s.whls_line_price_usd IS NOT NULL)
    AND (s.sell_000 OR s.sell_sy)
"""

_C_IM_RULE = _IN_IM + """
    AND EXISTS (SELECT 1 FROM style_colorways cw WHERE cw.style_id = s.id)
"""


def checklist_rows(season=None, collection=None, q=None) -> list[dict]:
    """One row per style, with the steps already done.

    Returns the done steps as an object keyed by step, so a tick carries its
    own who-and-when rather than the grid having to ask again per cell.
    """
    sql = """
        SELECT s.id, s.style_name AS name, se.code AS season,
               col.name AS collection,
               concat(se.cat_code, se.season_number, cc.code, s.gauge,
                      se.style_letter, s.style_number) AS style_code,
               -- Hand ticks, then the computed ones merged on top. A hand
               -- tick left on a step that later became automatic is dropped
               -- rather than shown: the rule is the answer now, not what
               -- somebody once clicked.
               (coalesce((
                   SELECT jsonb_object_agg(st.step,
                              jsonb_build_object('by', st.done_by,
                                                 'at', st.done_at))
                     FROM style_steps st
                    WHERE st.style_id = s.id
                      AND NOT (st.step = ANY (%s))
               ), '{}'::jsonb)
                || CASE WHEN {IM_P}
                        THEN jsonb_build_object('IM-P',
                                 jsonb_build_object('auto', true))
                        ELSE '{}'::jsonb END
                || CASE WHEN {C_IM}
                        THEN jsonb_build_object('C-IM',
                                 jsonb_build_object('auto', true))
                        ELSE '{}'::jsonb END
               ) AS steps
          FROM styles s
          JOIN seasons se           ON se.id = s.season_id
     LEFT JOIN collections col       ON col.id = s.collection_id
     LEFT JOIN content_codes cc      ON cc.id = s.content_code_id
         WHERE s.status <> 'draft'
    """.replace("{IM_P}", _IM_P_RULE).replace("{C_IM}", _C_IM_RULE)
    args: list = [AUTO_STEPS]        # the placeholder in the SELECT binds first
    if season:
        sql += " AND se.code = %s"; args.append(season)
    if collection:
        sql += " AND col.name = %s"; args.append(collection)
    if q:
        sql += " AND s.style_name ILIKE %s"; args.append(f"%{q}%")
    sql += (" ORDER BY col.sort_order NULLS LAST, col.name NULLS LAST,"
            " s.matrix_order NULLS LAST, s.style_name")
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]


def set_step(style_id: int, step: str, done: bool, done_by=None) -> dict:
    """Tick or untick one step. Ticking twice is not an error.

    Unticking deletes the row rather than storing a false: a step that was
    never done and a step that was undone are the same thing to everyone
    reading the sheet, and keeping the difference would mean explaining it.
    """
    step = (step or "").strip()
    if not step:
        raise ValueError("step is required")
    if step in AUTO_STEPS:
        # Accepting it would store a tick the grid then ignores, which reads
        # as the save having failed.
        raise ValueError(f"{step} is worked out from the data, not ticked")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT 1 FROM styles WHERE id = %s", (style_id,))
            if not cur.fetchone():
                raise ValueError(f"no style {style_id}")
            if done:
                cur.execute("""
                    INSERT INTO style_steps (style_id, step, done_by)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (style_id, step) DO UPDATE
                       SET done_by = EXCLUDED.done_by, done_at = now()
                    RETURNING step, done_by, done_at
                """, (style_id, step, (done_by or "").strip() or None))
                return dict(cur.fetchone())
            cur.execute(
                "DELETE FROM style_steps WHERE style_id = %s AND step = %s",
                (style_id, step))
            return {"step": step, "done_by": None, "done_at": None}


# ----------------------------------------------------------------- matrix
# The fields the Matrix screen collects: what the garment is, as opposed to
# what it costs. Weight is not in this list — it lives on style_sizes, not on
# the style, so update_matrix_fields takes it separately as weight_sm and
# grades the other sizes from it (see _set_weight_sm).
MATRIX_FIELDS = [
    # gauge_detail, not gauge: "gauge" is the single character inside the
    # style code (K57C3W542), and editing it here would silently rename the
    # style. The machine gauge is a spec — "3B + 3GG", "3GP" — and is what
    # the workbook's GG (MACHINE) row shows.
    {"key": "gauge_detail", "label": "GG (machine)"},
    # The Matrix construction, not the knit one on the Yarn screen — that is
    # styles.construction and stays MACHINE KNIT.
    {"key": "matrix_construction", "label": "Construction"},
    {"key": "print_placement", "label": "Printed"},
    {"key": "based_body", "label": "Base body"},
    {"key": "sleeve_category", "label": "Sleeve category"},
    {"key": "sleeve_length", "label": "Sleeve length"},
    # A closed list, unlike Yarn: these four are the whole vocabulary, and
    # each has a colour on the sheet. Defined here so the field, its choices
    # and the sheet all read from one place.
    {"key": "length_category", "label": "Length category",
     "choices": ["Cropped", "Super Cropped", "Biasa", "Long"]},
    # An override on the ends count, not a second copy of it: left empty the
    # sheet shows total_ends, and clearing this puts it back to that.
    {"key": "ply", "label": "Ply", "numeric": True, "from": "total_ends"},
    {"key": "yarn_type", "label": "Yarn", "options": "yarn_codes"},
]

# The highlighter bar. Not one of the attribute rows — it says nothing about
# the garment — but it is set from the same screen and saved the same way, so
# it is writable through the same endpoint.
HIGHLIGHT_COLOURS = ["green", "amber", "blue"]

# The ring round a past-season circle. Unlike the highlighter this is NOT a
# pen: orange is derived from the season links (repeats_two_past) and nothing
# writes it. Yellow is reserved for "ran before but unconfirmed", pending a
# definition of confirmed — docs/caveats.md §10. Kept in step with RING_MARKS
# in frontend/src/sections/SheetCard.jsx; frontend/test compares the two.
RING_MARKS = ["yellow", "orange"]

# The second bar. One colour today; a list so a second is CSS, not a migration.
BAND_COLOURS = ["purple"]

# Which channels a style sells through. The order is the order a click walks
# through them on the Matrix card's number, so BOTH — the plain, unhighlighted
# case — comes first.
#
# A style may also have no channel at all: 257 arrived from the workbook that
# way and a blank is not the same as BOTH. Nothing here sets it back to blank,
# because saying "sells through both" is an answer and leaving it empty is the
# absence of one; the cycle only ever moves between answers.
WHS_CHANNELS = ["BOTH", "000 ONLY", "SY ONLY"]

# The same fact written twice: the channel is what the IM calls it, the two
# flags are the tick boxes in the editor. They are not independent, and the
# workbook never disagreed with itself — 1,207 imported styles map exactly
# this way. So setting one sets the other, or the card and the editor show
# contradictory things about the same garment.
CHANNEL_SELLS = {
    "BOTH":     (True,  True),
    "000 ONLY": (False, True),
    "SY ONLY":  (True,  False),
}

# RING_KEYS is deliberately NOT here any more. The circle rings are computed
# from the season links (repeats_two_past), so accepting a written one would
# put a hand-set value underneath a derived one with nothing to say which the
# card was showing. The columns stay for now — the yellow rule is still open
# and may want somewhere to record a confirmation — but nothing writes them.
_MATRIX_KEYS = ({f["key"] for f in MATRIX_FIELDS}
                | {"matrix_highlight", "matrix_band", "needs_photo", "notes"}
                | {"whs_channel"})

_MATRIX_NUMERIC = {f["key"] for f in MATRIX_FIELDS if f.get("numeric")}


def _set_weight_sm(cur, style_id: int, value) -> None:
    """Store the S/M weight and grade the other sizes from it.

    The same arithmetic as regradeSizes in the frontend's grading.js, so the
    Matrix screen and the style editor leave a style in the same state: M/L
    at x1.1, X/L at x1.21, X/S at the style's own factor. A size outside those
    four is left as it stands, and so is the finished weight of any size the
    style does not come in.

    S/M is added to the style's sizes if it is not there — the weight is
    stored on that row, and it is the one the others are graded from.
    Clearing it clears every graded size too, as the editor does.
    """
    text = "" if value is None else str(value).strip()
    if text == "":
        cur.execute(
            "UPDATE style_sizes ss SET finished_wt_kg = NULL FROM sizes z"
            " WHERE z.id = ss.size_id AND ss.style_id = %s"
            "   AND z.code IN ('S/M', 'M/L', 'X/L', 'X/S')", (style_id,))
        return
    weight = _num(text)
    if weight is None or not weight.is_finite() or weight < 0:
        raise ValueError("weight_sm must be a number of kilograms")

    size_id = get_or_create(cur, "sizes", "code", "S/M")
    cur.execute(
        "INSERT INTO style_sizes (style_id, size_id) VALUES (%s, %s)"
        " ON CONFLICT (style_id, size_id) DO NOTHING", (style_id, size_id))
    cur.execute(
        """
        UPDATE style_sizes ss
           SET finished_wt_kg = round(%s * CASE z.code
                   WHEN 'S/M' THEN 1
                   WHEN 'M/L' THEN 1.1
                   WHEN 'X/L' THEN 1.21
                   WHEN 'X/S' THEN s.xs_weight_factor
               END, 5)
          FROM sizes z, styles s
         WHERE z.id = ss.size_id AND s.id = ss.style_id
           AND ss.style_id = %s
           AND z.code IN ('S/M', 'M/L', 'X/L', 'X/S')
        """, (weight, style_id))


def update_matrix_fields(style_id: int, fields: dict) -> dict:
    """Write some of the Matrix attributes on one style.

    Only the keys given are touched, so the grid can save a single cell
    without sending — and risking overwriting — the rest of the row.
    weight_sm is accepted alongside the style's own columns and written to
    its sizes.
    """
    fields = dict(fields)
    has_weight = "weight_sm" in fields
    weight = fields.pop("weight_sm", None)
    unknown = set(fields) - _MATRIX_KEYS
    if unknown:
        raise ValueError(f"not a matrix field: {', '.join(sorted(unknown))}")
    if not fields and not has_weight:
        raise ValueError("nothing to update")

    sets, args = [], []
    for key, value in fields.items():
        text = "" if value is None else str(value).strip()
        if key == "needs_photo":
            # It arrives over JSON as a string, and "false" is a true one, so
            # the words are read rather than left to Python's truthiness.
            sets.append(f"{key} = %s")
            args.append(text.lower() in ("1", "true", "yes", "on"))
            continue
        # An emptied cell is "not known", whatever its type — stored as NULL
        # rather than "" so the sheet and the importer agree on what absent
        # looks like. Half the columns here arrived empty-string from the
        # importer and half NULL, and telling those apart helps nobody.
        if text == "":
            sets.append(f"{key} = NULL")
            continue
        if key == "matrix_band" and text and text not in BAND_COLOURS:
            raise ValueError(
                f"{text!r} is not a band colour"
                f" — expected one of {', '.join(BAND_COLOURS)}")
        if key == "matrix_highlight" and text and text not in HIGHLIGHT_COLOURS:
            raise ValueError(
                f"{text!r} is not a highlight colour"
                f" — expected one of {', '.join(HIGHLIGHT_COLOURS)}")
        # Checked, because this one is not decoration: the sell channel is read
        # by the sales reports, the IM export and the checklist's price step.
        if key == "whs_channel" and text and text not in WHS_CHANNELS:
            raise ValueError(
                f"{text!r} is not a sell channel"
                f" — expected one of {', '.join(WHS_CHANNELS)}")
        if key == "whs_channel" and text:
            # The tick boxes follow. Done here rather than left to the client
            # so it holds whoever writes the channel — the Matrix card's
            # number, the style editor, or an import.
            sy, whs = CHANNEL_SELLS[text]
            sets.append("sell_sy = %s"); args.append(sy)
            sets.append("sell_000 = %s"); args.append(whs)
        if key in _MATRIX_NUMERIC:
            try:
                args.append(int(float(text)))
            except ValueError as exc:
                raise ValueError(f"{key} must be a number") from exc
        else:
            args.append(text)
        sets.append(f"{key} = %s")

    args.append(style_id)
    sets.append("updated_at = now()")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # The style first, so an unknown id fails here rather than on the
            # sizes' foreign key.
            cur.execute(
                f"UPDATE styles SET {', '.join(sets)}"
                f" WHERE id = %s RETURNING id, "
                + ", ".join(sorted(_MATRIX_KEYS)), args)
            row = cur.fetchone()
            if not row:
                raise ValueError(f"no style {style_id}")
            row = dict(row)
            if has_weight:
                _set_weight_sm(cur, style_id, weight)
                cur.execute(
                    "SELECT ss.finished_wt_kg FROM style_sizes ss"
                    " JOIN sizes z ON z.id = ss.size_id"
                    " WHERE ss.style_id = %s AND z.code = 'S/M'", (style_id,))
                sm = cur.fetchone()
                row["weight_sm"] = sm["finished_wt_kg"] if sm else None
            return row


def set_matrix_order(style_ids: list[int]) -> int:
    """Place these styles in this order, first to last.

    The list is the whole of one collection as the screen showed it, so the
    positions are rewritten rather than nudged — no gaps to run out of, and
    no arithmetic to get wrong when a card moves three places.
    """
    ids = [int(i) for i in style_ids]
    if not ids:
        return 0
    with transaction() as conn:
        with conn.cursor() as cur:
            # matrix_parked is cleared here rather than by its own call:
            # being given a position IS being placed, and a style that was
            # both numbered and parked would show in two places at once.
            cur.execute("""
                UPDATE styles s SET matrix_order = pos.ord, matrix_parked = false
                  FROM unnest(%s::bigint[]) WITH ORDINALITY AS pos(id, ord)
                 WHERE s.id = pos.id
            """, (ids,))
            return cur.rowcount


def clear_matrix_order(style_ids: list[int]) -> int:
    """Back to name order for these styles."""
    ids = [int(i) for i in style_ids]
    if not ids:
        return 0
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE styles SET matrix_order = NULL WHERE id = ANY(%s)",
                (ids,))
            return cur.rowcount


def yarn_codes(min_colours: int = 5) -> list[str]:
    """The yarn codes worth offering in a list, commonest first.

    Taken from the prefix on yarn_colors.name — "YCA ALMOND BUTTER - 872" is
    a YCA — because the prefix column exists but was never populated by the
    importer.

    Filtered by how many colours carry the code. The table also holds trims
    and zips under names like "XZIPAB-J4534-65CM-CASHEW", each appearing once;
    a threshold separates the codes that are really in use from the one-offs
    without anyone having to keep a hand-written list in step.
    """
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT split_part(btrim(name), ' ', 1) AS code, count(*) AS n
                  FROM yarn_colors
                 WHERE name IS NOT NULL AND btrim(name) <> ''
                 GROUP BY 1
                HAVING count(*) >= %s
                 ORDER BY n DESC, code
            """, (min_colours,))
            return [r[0] for r in cur.fetchall()]


# The pen colours a colourway name can be written in. Nothing means the
# ordinary colour, which is why it is not in the list.
# Kept in step with COLORWAY_MARKS in frontend/src/sections/SheetCard.jsx —
# the card decides which pen comes next, this decides which it will accept, and
# a list that drifts means a click the server refuses. frontend/test does check.
# Green is gone from this list on purpose: it means "new this season",
# which matrix_rows works out (new_colorways), so nothing writes it.
# Black — no mark — means the colour was carried over.
COLORWAY_MARKS = ["red", "purple", "magenta", "blue"]

# The background behind a colourway name, as opposed to the pen it is
# written in. Yellow first because that is the one reached for; grey is
# the second press, for a name being set aside rather than picked out.
COLORWAY_HIGHLIGHTS = ["yellow", "grey"]


def set_colorway_highlight(style_id: int, colour: str, highlight: str) -> dict:
    """Write the background behind one colourway name, or clear it."""
    return _set_colorway(style_id, colour, "highlight", highlight,
                         COLORWAY_HIGHLIGHTS, "colourway highlight")


def set_colorway_mark(style_id: int, colour: str, mark: str) -> dict:
    """Write the pen colour on one colourway, or clear it.

    Addressed by name rather than id because that is what the sheet has in
    hand — the card renders a list of names, and the unique index on
    (style_id, ws_tag_color) makes it an unambiguous key.
    """
    return _set_colorway(style_id, colour, "mark", mark,
                         COLORWAY_MARKS, "colourway mark")


def _set_colorway(style_id: int, colour: str, column: str, value: str,
                  allowed: list, label: str) -> dict:
    """Write one pen-or-background column on one colourway, or clear it.

    Addressed by name rather than id because that is what the sheet has in
    hand — the card renders a list of names, and the unique index on
    (style_id, ws_tag_color) makes it an unambiguous key.

    `column` is never user input: it comes from the two callers above, so it
    can be interpolated where a bind parameter cannot go.
    """
    name = (colour or "").strip()
    if not name:
        raise ValueError("colour is required")
    setting = (value or "").strip() or None
    if setting is not None and setting not in allowed:
        raise ValueError(
            f"{setting!r} is not a {label}"
            f" — expected one of {', '.join(allowed)}")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"""
                UPDATE style_colorways SET {column} = %s
                 WHERE style_id = %s AND ws_tag_color = %s
             RETURNING ws_tag_color AS color, mark, highlight
            """, (setting, style_id, name))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"{name!r} is not a colourway of style {style_id}")
            return dict(row)


# The bands of the ruled colourway list, top to bottom. Matches
# COLORWAY_ZONES in frontend/src/sections/SheetCard.jsx.
COLORWAY_ZONES = ("sample", "main", "extra")


def add_colorway(style_id: int, name: str, zone: str = "main") -> dict:
    """Add a colourway to a style, at the end of its band.

    `zone` is the band it lands in — there is an add button under each one,
    and a colour typed into the third band's button belongs in the third band.
    Without it every button added to the middle one and the colour appeared
    somewhere the person was not looking.

    The unique index on (style_id, ws_tag_color) does the duplicate check, so
    two people adding the same colour at once get one row and one error rather
    than two rows.
    """
    # Upper-cased here, not only in the browser: the name is the key the pen,
    # the background and the matched sales figures are all filed under, and
    # "Pure Snow" arriving from anywhere else would be a second colourway.
    colour = (name or "").strip().upper()
    if not colour:
        raise ValueError("a colourway needs a name")
    band = (zone or "main").strip() or "main"
    if band not in COLORWAY_ZONES:
        raise ValueError(
            f"{band!r} is not a band — expected one of "
            f"{', '.join(COLORWAY_ZONES)}")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT 1 FROM styles WHERE id = %s", (style_id,))
            if not cur.fetchone():
                raise ValueError(f"no style {style_id}")
            cur.execute("""
                INSERT INTO style_colorways (style_id, ws_tag_color, zone, sort_order)
                SELECT %s, %s, %s, coalesce(max(sort_order) + 1, 0)
                  FROM style_colorways WHERE style_id = %s
                ON CONFLICT (style_id, ws_tag_color) DO NOTHING
             RETURNING ws_tag_color AS color, zone, sort_order
            """, (style_id, colour, band, style_id))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"{colour!r} is already a colourway of this style")
            return dict(row)


def arrange_colorways(style_id: int, items: list[dict]) -> int:
    """Place a style's colourways: which band each is in, and in what order.

    The whole list is sent, not a move, for the same reason set_matrix_order
    takes a whole block — the server never has to work out what the screen
    meant by "third", and there are no gaps to run out of.

    A colour the caller leaves out is left exactly as it is rather than being
    deleted or pushed to the end: dropping a row is what delete_colorway is
    for, and a partial list arriving from a stale screen must not quietly
    rearrange what it did not mention.
    """
    rows = []
    for i, item in enumerate(items or []):
        colour = _clean((item or {}).get("color"))
        zone = _clean((item or {}).get("zone")) or "main"
        if not colour:
            continue
        if zone not in COLORWAY_ZONES:
            raise ValueError(
                f"{zone!r} is not a band — expected one of "
                f"{', '.join(COLORWAY_ZONES)}")
        rows.append((colour, zone, i))
    if not rows:
        raise ValueError("nothing to arrange")

    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            moved = 0
            for colour, zone, order in rows:
                cur.execute("""
                    UPDATE style_colorways SET zone = %s, sort_order = %s
                     WHERE style_id = %s
                       AND upper(btrim(ws_tag_color)) = upper(btrim(%s))
                """, (zone, order, style_id, colour))
                moved += cur.rowcount
            return moved


def rename_colorway(style_id: int, colour: str, name: str) -> dict:
    """Rename one colourway, keeping its pen, background and sort order.

    The name is this style's key for a colourway — the sales figures are
    matched to it — so a rename here is a rename everywhere the name is used.
    """
    old = (colour or "").strip()
    new = (name or "").strip().upper()
    if not old:
        raise ValueError("colour is required")
    if not new:
        raise ValueError("a colourway needs a name")
    if old == new:
        return {"color": new}
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                UPDATE style_colorways SET ws_tag_color = %s
                 WHERE style_id = %s AND ws_tag_color = %s
                   AND NOT EXISTS (SELECT 1 FROM style_colorways other
                                    WHERE other.style_id = %s
                                      AND other.ws_tag_color = %s)
             RETURNING ws_tag_color AS color, mark, highlight
            """, (new, style_id, old, style_id, new))
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "SELECT 1 FROM style_colorways"
                    " WHERE style_id = %s AND ws_tag_color = %s", (style_id, new))
                if cur.fetchone():
                    raise ValueError(f"{new!r} is already a colourway of this style")
                raise ValueError(f"{old!r} is not a colourway of style {style_id}")
            # Only once the rename has actually happened — a failed one above
            # raises, and a history of renames that did not occur is worse
            # than none.
            _record_rename(cur, style_id, "colorway", old, new)
            return dict(row)


def delete_colorway(style_id: int, colour: str) -> dict:
    """Remove a colourway, and say what went with it.

    Three tables cascade off style_colorways: its yarn lines, any per-colour
    operation overrides, and the sold quantities fetched against it. So this
    is not only a name disappearing from a list, and the counts are returned
    for the message that says so.
    """
    name = (colour or "").strip()
    if not name:
        raise ValueError("colour is required")
    with transaction() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT id FROM style_colorways"
                " WHERE style_id = %s AND ws_tag_color = %s", (style_id, name))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"{name!r} is not a colourway of style {style_id}")
            cw_id = row["id"]

            # Counted before the delete: afterwards there is nothing to count.
            cur.execute("SELECT count(*) AS n FROM colorway_yarns WHERE colorway_id = %s",
                        (cw_id,))
            yarns = cur.fetchone()["n"]
            cur.execute("SELECT count(*) AS n FROM style_sales WHERE colorway_id = %s",
                        (cw_id,))
            sales = cur.fetchone()["n"]
            cur.execute("SELECT count(*) AS n FROM style_operations WHERE colorway_id = %s",
                        (cw_id,))
            operations = cur.fetchone()["n"]

            cur.execute("DELETE FROM style_colorways WHERE id = %s", (cw_id,))
            return {"color": name, "yarns": yarns, "sales": sales,
                    "operations": operations}
