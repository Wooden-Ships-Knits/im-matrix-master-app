"""Production-line knit minutes, and the packing volume Salesforce wants.

Two gaps found by checking im-to-sales-force's field map against the database.

LT_P maps to MINUTES PER PC PER MACHINE IN PROD LINE. The sheet carries two
adjacent minute columns, PROD LINE and DEV, both filled on 3,788 rows, and
the importer was reading only DEV.

PACKING_VOLUME__C is calculated, and needs its own container volume. The
sheet keeps two, and the duplicate "% VOL OF 1 BOX" columns use different
ones. Reading the wrong column made every packing volume 4.4% high.

The view is restated in full because CREATE OR REPLACE VIEW will only add
columns at the end, and only if everything before them is unchanged.

Revision ID: 0007_prod_minutes_packing_volume
Revises: 0006_channel_and_finishing
Create Date: 2026-09-23
"""
from alembic import op

revision = "0007_prod_minutes_packing_volume"
down_revision = "0006_channel_and_finishing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles ADD COLUMN knit_minutes_prod numeric(8,2)")
    op.execute("ALTER TABLE season_rates"
               " ADD COLUMN packing_volume_divisor_cm3 numeric(16,2)")
    op.execute("DROP VIEW IF EXISTS v_sku_costing;")
    op.execute("""
    CREATE VIEW v_sku_costing AS
    WITH labour AS (
        -- Standard minutes unless the style overrides them, plus any operation
        -- added for this style alone (schema.md §5).
        SELECT s.id AS style_id,
               COALESCE(SUM(COALESCE(so.minutes, o.default_minutes)), 0) AS minutes
        FROM styles s
        LEFT JOIN operations o
               ON o.applies_by_default
              OR o.id IN (SELECT operation_id FROM style_operations WHERE style_id = s.id)
        LEFT JOIN style_operations so
               ON so.style_id = s.id AND so.operation_id = o.id
        GROUP BY s.id
    ),
    base AS (
        SELECT
            s.id AS style_id, ss.size_id, cw.id AS colorway_id,
            z.code AS size, cw.ws_tag_color AS colorway, s.style_name,
            se.code AS season,
            -- The style code the SKU is built from (schema.md §2.3)
            concat(se.cat_code, se.season_number, cc.code, s.gauge,
                   se.style_letter, s.style_number) AS style_code,
            -- The UI collects one weight. In the sheet PRE COMPONENT WT (CR)
            -- and FINISHED KGS / ITEM (CW) are the same value, so the finished
            -- weight stands in when no pre-component weight was entered.
            COALESCE(ss.pre_component_wt_kg, ss.finished_wt_kg) AS pre_wt,
            ss.finished_wt_kg AS finished_wt,
            COALESCE(ss.pcs_per_box, s.pcs_per_box) AS pcs_per_box,
            COALESCE(bt.length_cm, s.box_length_cm) AS box_l,
            COALESCE(bt.depth_cm,  s.box_depth_cm)  AS box_d,
            COALESCE(bt.height_cm, s.box_height_cm) AS box_h,
            bt.empty_box_wt_kg AS empty_box_wt,
            s.admin_pct, s.knit_minutes_dev, lab.minutes AS op_minutes,
            m.price_idr AS material_price_idr,
            dc.declared_value_usd, dc.usa_duty_rate,
            s.whls_line_price_usd, s.whls_retail_price_usd, s.sy_retail_price_usd,
            r.*
        FROM styles s
        JOIN seasons se       ON se.id = s.season_id
        LEFT JOIN season_rates r ON r.season_id = se.id
        LEFT JOIN style_sizes ss ON ss.style_id = s.id
        LEFT JOIN sizes z        ON z.id = ss.size_id
        LEFT JOIN style_colorways cw ON cw.style_id = s.id
        LEFT JOIN content_codes cc   ON cc.id = s.content_code_id
        LEFT JOIN duty_categories dc ON dc.id = cc.duty_category_id
        LEFT JOIN materials m        ON m.id = s.material_id
        LEFT JOIN labour lab         ON lab.style_id = s.id
        -- The client edits box dimensions; match them to a known box so the
        -- empty-box weight is known (schema.md §2.3).
        LEFT JOIN box_types bt ON bt.length_cm = s.box_length_cm
                              AND bt.depth_cm  = s.box_depth_cm
                              AND bt.height_cm = s.box_height_cm
    ),
    calc AS (
        SELECT b.*,
            -- weights ---------------------------------------------------- CS/CT
            b.pre_wt * b.wt_tolerance_low            AS wt_low,
            b.pre_wt * b.wt_tolerance_high           AS wt_high,
            b.pre_wt + b.distribution_wt_add_kg      AS distribution_wt,   -- CU
            (b.pre_wt + b.distribution_wt_add_kg)
                * b.pricing_wt_factor                AS pricing_wt,        -- CV
            -- box ---------------------------------------------------------- EL
            (b.pcs_per_box * b.finished_wt) + b.empty_box_wt
                + (b.pcs_per_box * b.plastic_wt_kg)  AS gross_kg_full_box,
            (b.box_l * b.box_d * b.box_h) / NULLIF(b.volumetric_divisor,0)
                                                     AS vol_box_kg,        -- EN
            (b.box_l * b.box_d * b.box_h)
                / NULLIF(b.container_20ft_cm3,0)     AS pct_vol_box,       -- HE
            -- money -------------------------------------------------------- FN
            (b.pre_wt + b.distribution_wt_add_kg) * b.material_price_idr
                                                     AS material_idr,
            (COALESCE(b.op_minutes,0) + COALESCE(b.knit_minutes_dev,0)) / 60.0
                * b.labour_rate_idr_per_hour * b.labour_multiplier
                                                     AS labour_idr,        -- FO..GI
            b.admin_pct * b.admin_base_idr + b.additional_admin_idr
                                                     AS admin_idr,         -- GM
            b.declared_value_usd * b.usa_duty_rate    AS duty_tax          -- GW
        FROM base b
    )
    SELECT
        style_id, size_id, colorway_id, season, style_code, style_name, size, colorway,
        pre_wt, finished_wt, pcs_per_box,
        round(wt_low, 5)  AS wt_low_tolerance,
        round(wt_high, 5) AS wt_high_tolerance,
        round(distribution_wt, 5) AS distribution_wt,
        round(pricing_wt, 5)      AS wt_for_pricing,
        round(gross_kg_full_box, 4) AS gross_kg_full_box,
        round((gross_kg_full_box / NULLIF(pcs_per_box,0)) * kg_to_lb, 4) AS lbs_per_item,
        -- "N/A" in the sheet when the volumetric weight is under the real one
        CASE WHEN vol_box_kg < gross_kg_full_box THEN NULL
             ELSE round(vol_box_kg, 4) END AS volumetric_kg_box,
        CASE WHEN vol_box_kg < gross_kg_full_box THEN NULL
             ELSE round(vol_box_kg / NULLIF(pcs_per_box,0), 4) END AS volumetric_kg_item,
        round(material_idr, 2) AS material_idr,
        round(labour_idr, 2)   AS labour_idr,
        round(admin_idr, 2)    AS admin_idr,
        round((material_idr + labour_idr) / NULLIF(exchange_rate_idr_usd,0), 4)
            AS total_all_costs_usd,                                        -- GJ
        round((material_idr + labour_idr + admin_idr + labels_tag_cost_idr)
              / NULLIF(exchange_rate_idr_usd,0), 4) AS receiving_cost_usd, -- GO
        round(((pcs_per_box / 4.0) * box_charge_idr
               + plastic_charge_idr / NULLIF(pcs_per_box,0))
              / NULLIF(exchange_rate_idr_usd,0), 4) AS extra_charges_usd,  -- GR
        round(packaging_fee_idr / NULLIF(exchange_rate_idr_usd,0), 4)
            AS packaging_fee_usd,                                          -- GS
        round(duty_tax, 4) AS duty_tax,
        round(duty_tax + duty_tax * disbursement_pct
              + declared_value_usd * mpf_pct, 4) AS duty_to_usa,           -- GZ
        customs_usd,
        round(finished_wt * dhl_usd_per_kg, 4) AS dhl_air_usd,             -- HB
        round(COALESCE(CASE WHEN vol_box_kg < gross_kg_full_box THEN NULL
                            ELSE vol_box_kg / NULLIF(pcs_per_box,0) END,
                       finished_wt) * dhl_grassy_usd_per_kg, 4)
            AS dhl_volumetric_usd,                                         -- HC
        round(sea_c_rate_usd * (pct_vol_box / NULLIF(pcs_per_box,0)), 4) AS sea_c_usd,
        round(sea_p_rate_usd * (pct_vol_box / NULLIF(pcs_per_box,0)), 4) AS sea_p_usd,
        -- landed = receiving + extras + packaging + duty + customs + freight  HK/HL
        round((material_idr + labour_idr + admin_idr + labels_tag_cost_idr)
                / NULLIF(exchange_rate_idr_usd,0)
              + ((pcs_per_box / 4.0) * box_charge_idr
                 + plastic_charge_idr / NULLIF(pcs_per_box,0))
                / NULLIF(exchange_rate_idr_usd,0)
              + packaging_fee_idr / NULLIF(exchange_rate_idr_usd,0)
              + duty_tax + duty_tax * disbursement_pct
                + declared_value_usd * mpf_pct
              + customs_usd
              + COALESCE(CASE WHEN vol_box_kg < gross_kg_full_box THEN NULL
                              ELSE vol_box_kg / NULLIF(pcs_per_box,0) END,
                         finished_wt) * dhl_grassy_usd_per_kg
        , 4) AS landed_dhl_volumetric_usd,
        whls_line_price_usd, whls_retail_price_usd, sy_retail_price_usd,
        round(whls_line_price_usd * reps_commission_factor, 2) AS whls_after_commission,
        round(whls_retail_price_usd / NULLIF(whls_line_price_usd,0), 4) AS final_mark_up,
        target_retail_margin, min_retail_margin,
        -- Packing Volume (enter in SF). The sheet writes it as =IZ58*10000:
        -- the item's share of a container, scaled up. It does not use the
        -- container volume the sea-freight percentage uses. There are two,
        -- and the duplicate "% VOL OF 1 BOX" columns divide by different
        -- ones: 29,700,000 there, and 31,000,000 in Spring or 33,000,000 in
        -- Fall here. Same box, two answers; the wrong one is 4.4% out.
        round(pct_vol_box * container_20ft_cm3
              / NULLIF(packing_volume_divisor_cm3, 0)
              / NULLIF(pcs_per_box, 0) * 10000, 6) AS packing_volume
    FROM calc;
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_sku_costing;")
    op.execute("ALTER TABLE styles DROP COLUMN knit_minutes_prod")
    op.execute("ALTER TABLE season_rates DROP COLUMN packing_volume_divisor_cm3")
