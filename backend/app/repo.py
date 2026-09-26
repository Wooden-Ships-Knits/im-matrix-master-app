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


def list_styles(season=None, q=None, color=None, size=None) -> list[dict]:
    """The browse list: one row per style, newest season first.

    The colour and size filters are EXISTS rather than joins. Joining them
    multiplies a style by its colourways times its sizes — 1,462 styles became
    14,479 rows — and every one of those rows then ran the colourway count
    before DISTINCT threw the duplicates away. EXISTS filters without
    multiplying, so the count runs once per style and DISTINCT is not needed.
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
                start_date=None, end_date=None) -> list[dict]:
    """One row per style, with what a printed review sheet shows.

    Grouped by collection because that is how the sheet is worked through, one
    worksheet per collection.

    NEW or EXACT REPEAT is not stored — it is whether this garment ran in an
    earlier season, which the product link already answers.
    """
    sql = """
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
    """
    # The four sales placeholders sit in the SELECT, so they bind first.
    args: list = [start_date, start_date, end_date, end_date]
    if season:
        sql += " AND se.code = %s"; args.append(season)
    if collection:
        sql += " AND col.name = %s"; args.append(collection)
    if q:
        sql += " AND s.style_name ILIKE %s"; args.append(f"%{q}%")
    sql += " ORDER BY col.sort_order NULLS LAST, col.name NULLS LAST, s.style_name"
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
