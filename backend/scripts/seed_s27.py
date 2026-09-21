"""Seed S27 (Spring 2027) reference data, read out of the workbook.

Every number here was resolved from a formula in `Copy of S27 IM MASTER.xlsx`
by following its parameter references — not copied by eye. Where the sheet
does not say, the field is left NULL rather than guessed, so the golden test
shows the gap instead of hiding it behind an invented value.

    docker compose exec backend python -m scripts.seed_s27
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import pool, transaction  # noqa: E402

# Resolved from S27. The comment gives the cell the value came from.
RATES = {
    "exchange_rate_idr_usd":    16500,          # $GP$54
    "labour_rate_idr_per_hour": 37606.742197,   # $FP$55 (and every other op)
    "labour_multiplier":        1.6,            # $FP$54
    "admin_base_idr":           24000,          # $GM$54
    "additional_admin_idr":     10000,          # $GL$54
    "labels_tag_cost_idr":      3197,           # $GN$54
    "packaging_fee_idr":        5000,           # $GS$55
    "box_charge_idr":           776.16,         # $GR$54
    "plastic_charge_idr":       14500,          # GR$55
    "plastic_wt_kg":            0.022,          # EJ = 0.044/2
    "wt_tolerance_low":         0.96,           # CS = CR - (CR*4%)
    "wt_tolerance_high":        1.04,           # CT = CR + (CR*4%)
    "pricing_wt_factor":        1.04,           # CV = CU*1.04
    "distribution_wt_add_kg":   0.009,          # CU = CR + 0.009
    "volumetric_divisor":       5000,           # EN
    "kg_to_lb":                 2.2046,         # EM
    "container_20ft_cm3":       29700000,       # HE$54
    "sea_c_rate_usd":           10415.5,        # $HG$54
    "sea_p_rate_usd":           14420.5,        # $HH$54
    "dhl_usd_per_kg":           14.91,          # HB$54
    "dhl_grassy_usd_per_kg":    14.91,          # HC$54
    "disbursement_pct":         0.02,           # $GX$55
    "mpf_pct":                  0.0035,         # $GY$55
    "customs_usd":              0.1,            # HA$54
    "reps_commission_factor":   0.88,           # $IF$54
    "min_order_pcs":            18,             # note in HB$55
    # S27 prices at three multipliers; F26 only 2.2 (schema.md §9.4)
    "retail_markups":           [2.2, 2.25, 2.3],
    # Left NULL on purpose — S27 has no Canada, and the sheet does not state
    # these: fedex_canada_usd_per_kg, canada_duty_pct, outgoing_freight_usd,
    # sy_only_dhl_1pc_usd, sy_only_dhl_2pc_usd, special_op_rate_idr_per_hour,
    # target/min margins.
}

# code, tariff, usa rate, declared value  — from the (GT, GV, GQ) triples
DUTY = [("345", "6110.20.2020", 0.285, 21.30),   # cotton, 3,448 rows
        ("446", "6110.30.1520", 0.290, 21.15)]   # grassy, 328 rows

CONTENT = [("C", "Cotton", "COTTON", "345"), ("CPE", "Cotton PE", "COTTON", "345"),
           ("CE", "Cotton E", "COTTON", "345"), ("CP", "Cotton P", "COTTON", "345"),
           ("A", "Acrylic", "COTTON", "345"),
           ("Y", "Grassy", "GRASSY", "446"), ("YPE", "Grassy PE", "GRASSY", "446"),
           ("YE", "Grassy E", "GRASSY", "446"), ("YP", "Grassy P", "GRASSY", "446"),
           ("PB", "PB", "GRASSY", "446"), ("P", "P", "GRASSY", "446")]

BOXES = [("DHL 6", 41.7, 35.9, 36.9, 1.32)]      # EC/ED/EE, EK = $EL$21

# Standard minutes, read from each operation's own formula in S27.
OPERATIONS = [("CEK_POLA", "Cek pola", 16, True), ("LINK", "Link", 26, True),
              ("QC_LINK", "QC link", 4, True), ("FINISHING", "Finishing", 22, True),
              ("QC_FINISHING", "QC finishing", 2, True),
              ("LABEL_SEWING", "Label sewing: logo & content", 2, True),
              ("STEAM", "Steam", 5, True), ("QC_PRE", "QC pre", 6, True),
              ("QC_FINAL", "QC final", 5, True),
              # present in S27 but not applied to every style
              ("SOSOK", "Sosok", None, False),
              ("CLEANING_YARN", "Cleaning yarn", None, False),
              ("SERVICE_INTARSIA", "Service intarsia", None, False),
              ("EMBRO_STAMP", "Embro / stamp", None, False),
              ("CUCI_SCREEN", "Cuci screen", None, False),
              ("JEMUR", "Jemur", None, False)]


def main() -> None:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO seasons (season_type, year_yy, cat_code, style_letter,"
            " is_current) VALUES ('SPRING', 27, 'K', 'W', true)"
            " ON CONFLICT (season_type, year_yy) DO UPDATE SET is_current = true"
            " RETURNING id")
        season_id = cur.fetchone()[0]

        cols = ", ".join(RATES)
        ph = ", ".join(["%s"] * len(RATES))
        sets = ", ".join(f"{k} = EXCLUDED.{k}" for k in RATES)
        cur.execute(
            f"INSERT INTO season_rates (season_id, {cols}) VALUES (%s, {ph})"
            f" ON CONFLICT (season_id) DO UPDATE SET {sets}",
            [season_id, *RATES.values()])

        duty_ids = {}
        for code, tariff, rate, declared in DUTY:
            cur.execute(
                "INSERT INTO duty_categories (season_id, code, tariff_code,"
                " usa_duty_rate, declared_value_usd) VALUES (%s,%s,%s,%s,%s)"
                " ON CONFLICT (season_id, code) DO UPDATE SET"
                " tariff_code = EXCLUDED.tariff_code,"
                " usa_duty_rate = EXCLUDED.usa_duty_rate,"
                " declared_value_usd = EXCLUDED.declared_value_usd RETURNING id",
                (season_id, code, tariff, rate, declared))
            duty_ids[code] = cur.fetchone()[0]

        for code, desc, family, duty in CONTENT:
            cur.execute(
                "INSERT INTO content_codes (code, description, material_family,"
                " duty_category_id) VALUES (%s,%s,%s,%s)"
                " ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description,"
                " material_family = EXCLUDED.material_family,"
                " duty_category_id = EXCLUDED.duty_category_id",
                (code, desc, family, duty_ids[duty]))

        for code, l, d, h, empty in BOXES:
            cur.execute(
                "INSERT INTO box_types (code, length_cm, depth_cm, height_cm,"
                " empty_box_wt_kg) VALUES (%s,%s,%s,%s,%s)"
                " ON CONFLICT (code) DO UPDATE SET length_cm = EXCLUDED.length_cm,"
                " depth_cm = EXCLUDED.depth_cm, height_cm = EXCLUDED.height_cm,"
                " empty_box_wt_kg = EXCLUDED.empty_box_wt_kg", (code, l, d, h, empty))

        for i, (code, name, minutes, applies) in enumerate(OPERATIONS):
            cur.execute(
                "INSERT INTO operations (code, name, default_minutes, rate_basis,"
                " applies_by_default, sort_order) VALUES (%s,%s,%s,'standard',%s,%s)"
                " ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name,"
                " default_minutes = EXCLUDED.default_minutes,"
                " applies_by_default = EXCLUDED.applies_by_default",
                (code, name, minutes, applies, i))

    print(f"S27 seeded: season {season_id}, {len(RATES)} rates, {len(DUTY)} duty "
          f"categories, {len(CONTENT)} content codes, {len(BOXES)} box type, "
          f"{len(OPERATIONS)} operations")


if __name__ == "__main__":
    # Scripts run outside the FastAPI lifespan, so the pool is not open yet.
    pool.open()
    try:
        main()
    finally:
        pool.close()
