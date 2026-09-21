"""Initial schema — 22 tables.

schema.md §11. Written as explicit SQL rather than op.create_table because the
design uses Postgres features SQLAlchemy does not express cleanly: identity
columns, STORED generated columns, UNIQUE NULLS NOT DISTINCT and arrays.

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-21
"""
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

ID = "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY"


def upgrade() -> None:
    # ---------------------------------------------------------------- seasons
    op.execute(f"""
    CREATE TABLE seasons (
        {ID},
        season_type text NOT NULL CHECK (season_type IN ('SPRING','FALL')),
        year_yy     smallint NOT NULL CHECK (year_yy BETWEEN 0 AND 99),
        -- code, name and season_number are derived: schema.md §4.1.1
        code text GENERATED ALWAYS AS (
            (CASE season_type WHEN 'SPRING' THEN 'S' ELSE 'F' END)
            || lpad(year_yy::text, 2, '0')) STORED,
        name text GENERATED ALWAYS AS (
            (CASE season_type WHEN 'SPRING' THEN 'Spring ' ELSE 'Fall ' END)
            || (2000 + year_yy)::text) STORED,
        season_number smallint GENERATED ALWAYS AS (
            2 * year_yy + CASE season_type WHEN 'SPRING' THEN 4 ELSE 5 END) STORED,
        cat_code     text NOT NULL DEFAULT 'K',
        style_letter text NOT NULL DEFAULT 'W',
        -- Season defaults. Each holds one value for the whole season, so it is
        -- set here once and never typed per style (schema.md §4.1).
        default_construction            text,
        default_details                 text,
        default_lining                  text,
        default_tension                 text,
        default_production_vendor       text,
        default_spec                    text,
        default_hang_tag_instructions   text,
        default_hook_sock_tag           text,
        default_bagging_method          text,
        default_poly_bag_sticker        text,
        default_packing_method          text,
        default_ship_via                text,
        default_packing_method_in_box   text,
        default_special_instructions    text,
        default_box_labeling            text,
        is_current boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (season_type, year_yy)
    );
    CREATE UNIQUE INDEX seasons_code_key ON seasons (code);
    """)

    # ----------------------------------------------------------- season_rates
    op.execute(f"""
    CREATE TABLE season_rates (
        {ID},
        season_id bigint NOT NULL UNIQUE REFERENCES seasons(id) ON DELETE CASCADE,
        exchange_rate_idr_usd        numeric(12,2),
        labour_rate_idr_per_hour     numeric(14,4),
        labour_multiplier            numeric(8,4),
        special_op_rate_idr_per_hour numeric(14,4),
        admin_base_idr               numeric(14,2),
        additional_admin_idr         numeric(14,2),
        labels_tag_cost_idr          numeric(14,2),
        packaging_fee_idr            numeric(14,2),
        box_charge_idr               numeric(14,2),
        plastic_charge_idr           numeric(14,2),
        plastic_wt_kg                numeric(8,4),
        wt_tolerance_low             numeric(8,4),
        wt_tolerance_high            numeric(8,4),
        pricing_wt_factor            numeric(8,4),
        distribution_wt_add_kg       numeric(8,4),
        volumetric_divisor           numeric(10,2),
        kg_to_lb                     numeric(10,6),
        container_20ft_cm3           numeric(16,2),
        sea_c_rate_usd               numeric(12,4),
        sea_p_rate_usd               numeric(12,4),
        dhl_usd_per_kg               numeric(12,4),
        dhl_grassy_usd_per_kg        numeric(12,4),
        fedex_canada_usd_per_kg      numeric(12,4),
        disbursement_pct             numeric(10,6),
        mpf_pct                      numeric(10,6),
        canada_duty_pct              numeric(10,6),
        customs_usd                  numeric(12,4),
        outgoing_freight_usd         numeric(12,4),
        sy_only_dhl_1pc_usd          numeric(12,4),
        sy_only_dhl_2pc_usd          numeric(12,4),
        reps_commission_factor       numeric(8,4),
        -- S27 prices at 2.2 / 2.25 / 2.3; F26 only 2.2 (schema.md §9.4)
        retail_markups               numeric(8,4)[] NOT NULL DEFAULT '{{}}',
        target_retail_margin         numeric(8,4),
        min_retail_margin            numeric(8,4),
        target_sea_margin            numeric(8,4),
        min_order_pcs                smallint
    );
    """)

    # ------------------------------------------------------------ collections
    op.execute(f"""
    CREATE TABLE collections (
        {ID},
        season_id  bigint NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        name       text NOT NULL,
        sort_order smallint NOT NULL DEFAULT 0,
        UNIQUE (season_id, name)
    );
    """)

    # ------------------------------------------------------- duty_categories
    op.execute(f"""
    CREATE TABLE duty_categories (
        {ID},
        season_id          bigint NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        code               text NOT NULL,             -- 345 / 446
        tariff_code        text,                      -- 6110.20.2020
        usa_duty_rate      numeric(10,6),             -- 0.285 / 0.29
        declared_value_usd numeric(12,4),             -- 21.30 / 21.15
        description        text,
        UNIQUE (season_id, code)
    );
    """)

    # ---------------------------------------------------------- content_codes
    op.execute(f"""
    CREATE TABLE content_codes (
        {ID},
        code             text NOT NULL UNIQUE,        -- C, Y, CPE, YPE ...
        description      text,
        material_family  text,                        -- COTTON / GRASSY
        duty_category_id bigint REFERENCES duty_categories(id)
    );
    """)

    # -------------------------------------------------------------- box_types
    op.execute(f"""
    CREATE TABLE box_types (
        {ID},
        code            text NOT NULL UNIQUE,         -- DHL 6 / 7 / 8
        length_cm       numeric(8,2),
        depth_cm        numeric(8,2),
        height_cm       numeric(8,2),
        empty_box_wt_kg numeric(8,3)
    );
    """)

    # -------------------------------------------------------------- materials
    op.execute(f"""
    CREATE TABLE materials (
        {ID},
        season_id     bigint REFERENCES seasons(id) ON DELETE CASCADE,
        code          text,                           -- YST, AC, CA, TX, YP
        name          text NOT NULL,
        kind          text NOT NULL DEFAULT 'yarn'
                      CHECK (kind IN ('yarn','zipper','button','stamp','other')),
        unit          text NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg','pcs')),
        exchange_rate numeric(12,2),
        price_idr     numeric(14,4),
        price_usd     numeric(12,4),
        UNIQUE (season_id, name)
    );
    """)

    # ------------------------------------------------------------ yarn_colors
    op.execute(f"""
    CREATE TABLE yarn_colors (
        {ID},
        material_id bigint REFERENCES materials(id),
        prefix      text,                             -- YCA, YST, BJ
        name        text NOT NULL,                    -- BREAKER WHITE
        color_code  text,                             -- 658
        UNIQUE (prefix, name, color_code)
    );
    """)

    # ------------------------------------------------------------- operations
    op.execute(f"""
    CREATE TABLE operations (
        {ID},
        code               text NOT NULL UNIQUE,
        name               text NOT NULL,
        default_minutes    numeric(8,2),
        rate_basis         text NOT NULL DEFAULT 'standard'
                           CHECK (rate_basis IN ('standard','special')),
        applies_by_default boolean NOT NULL DEFAULT false,
        sort_order         smallint NOT NULL DEFAULT 0
    );
    """)

    # ------------------------------------------------------------------ sizes
    op.execute(f"""
    CREATE TABLE sizes (
        {ID},
        code         text NOT NULL UNIQUE,            -- X/S
        label_suffix text,                            -- XS, used in the care label
        sort_order   smallint NOT NULL DEFAULT 0
    );
    """)

    # ---------------------------------------------------------------- markets
    op.execute(f"""
    CREATE TABLE markets (
        {ID},
        season_id          bigint NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        code               text NOT NULL,             -- USA, CANADA, DIVERSE, EFSN, ELLIS
        pricing_rule       text,
        commission_factor  numeric(8,4),
        UNIQUE (season_id, code)
    );
    """)

    # --------------------------------------------------------------- products
    # Identity across seasons — identity.md. This is what sales merges on.
    op.execute(f"""
    CREATE TABLE products (
        {ID},
        product_code    text UNIQUE,                  -- IM-000142; set by the app
        display_name    text NOT NULL,
        status          text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','discontinued')),
        first_season_id bigint REFERENCES seasons(id),
        notes           text
    );

    CREATE TABLE product_colorways (
        {ID},
        product_id     bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        canonical_name text NOT NULL,
        notes          text,
        UNIQUE (product_id, canonical_name)
    );
    """)

    # ----------------------------------------------------------------- styles
    op.execute(f"""
    CREATE TABLE styles (
        {ID},
        season_id     bigint NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
        product_id    bigint REFERENCES products(id) ON DELETE SET NULL,
        collection_id bigint REFERENCES collections(id),
        -- style_number and style_name are NOT unique: #99 is two styles and five
        -- styles carry two numbers (schema.md §4.2). Indexed for search only.
        style_number  integer,
        style_name    text NOT NULL,
        status        text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','hold','cancel')),
        content_code_id bigint REFERENCES content_codes(id),
        gauge         text,                           -- text: S27 has "2I"
        whs_code      text,
        print_placement text,
        cc_marker     text,
        final_finishing_category text,
        total_ends    text,
        gauge_detail  text,
        care_label_base text,
        based_body    text,
        material_id   bigint REFERENCES materials(id),
        box_type_id   bigint REFERENCES box_types(id),
        knit_minutes_dev       numeric(8,2),
        knit_minutes_breakdown text,
        admin_pct              numeric(8,4),
        finishing_home_price_idr numeric(14,2),
        finishing_home_minutes   numeric(8,2),
        embroidery_price_idr     numeric(14,2),
        embroidery_minutes       numeric(8,2),
        -- Two price tracks, both optional: 724 S27 rows are SY-only (schema.md §4.3)
        whls_line_price_usd    numeric(12,2),
        whls_retail_price_usd  numeric(12,2),
        sy_retail_price_usd    numeric(12,2),
        sy_mark_up             numeric(8,4),
        final_sale_price_usd   numeric(12,2),
        final_sample_price_usd numeric(12,2),
        similar_repeat_price_note text,
        photo_url  text,
        notes      text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version    integer NOT NULL DEFAULT 1
    );
    CREATE INDEX styles_season_idx ON styles (season_id);
    CREATE INDEX styles_number_idx ON styles (season_id, style_number);
    CREATE INDEX styles_name_idx   ON styles (lower(style_name));
    CREATE INDEX styles_product_idx ON styles (product_id);
    """)

    # ------------------------------------------------------------ style_sizes
    op.execute(f"""
    CREATE TABLE style_sizes (
        {ID},
        style_id bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        size_id  bigint NOT NULL REFERENCES sizes(id),
        pre_component_wt_kg numeric(8,4),
        finished_wt_kg      numeric(8,4),
        pcs_per_box         smallint,
        UNIQUE (style_id, size_id)
    );
    """)

    # -------------------------------------------------------- style_colorways
    op.execute(f"""
    CREATE TABLE style_colorways (
        {ID},
        style_id            bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        product_colorway_id bigint REFERENCES product_colorways(id) ON DELETE SET NULL,
        ws_tag_color        text NOT NULL,
        whs_channel         text,                     -- 000 / SY / BOTH / SO / CO / CN
        reps_color          boolean,
        color_sequence      text,
        sell_restriction    text,
        sort_order          smallint NOT NULL DEFAULT 0,
        -- "Sub to" — identity.md §6. Keep the old row and point it at the new
        -- one; editing the tag in place is how the history is lost today.
        subbed_to_colorway_id bigint REFERENCES style_colorways(id) ON DELETE SET NULL,
        subbed_on             date,
        sub_reason            text,
        UNIQUE (style_id, ws_tag_color),
        CONSTRAINT style_colorways_no_self_sub CHECK (subbed_to_colorway_id <> id)
    );
    """)

    # --------------------------------------------------------- colorway_yarns
    op.execute(f"""
    CREATE TABLE colorway_yarns (
        {ID},
        colorway_id   bigint NOT NULL REFERENCES style_colorways(id) ON DELETE CASCADE,
        slot          smallint NOT NULL CHECK (slot BETWEEN 1 AND 21),
        yarn_color_id bigint REFERENCES yarn_colors(id),
        percent       numeric(7,4),
        ends          numeric(5,2),
        UNIQUE (colorway_id, slot)
    );
    """)

    # -------------------------------------------------------- style_operations
    op.execute(f"""
    CREATE TABLE style_operations (
        {ID},
        style_id     bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        operation_id bigint NOT NULL REFERENCES operations(id),
        -- NULL colorway = applies to every colourway of the style
        colorway_id  bigint REFERENCES style_colorways(id) ON DELETE CASCADE,
        minutes      numeric(8,2),
        UNIQUE NULLS NOT DISTINCT (style_id, operation_id, colorway_id)
    );

    CREATE TABLE style_trims (
        {ID},
        style_id      bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        material_id   bigint NOT NULL REFERENCES materials(id),
        qty_per_piece numeric(10,4),
        UNIQUE (style_id, material_id)
    );

    CREATE TABLE style_market_prices (
        {ID},
        style_id       bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        market_id      bigint NOT NULL REFERENCES markets(id),
        line_price_usd numeric(12,2),
        UNIQUE (style_id, market_id)
    );

    CREATE TABLE style_measurements (
        {ID},
        style_id bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        size_id  bigint NOT NULL REFERENCES sizes(id),
        point    text NOT NULL,
        value_cm numeric(6,2),
        UNIQUE (style_id, size_id, point)
    );
    """)

    # ---------------------------------------------------- product_identifiers
    op.execute(f"""
    CREATE TABLE product_identifiers (
        {ID},
        product_id          bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        product_colorway_id bigint REFERENCES product_colorways(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN
             ('style_name','style_number','style_code','sku','ws_tag_color')),
        value      text NOT NULL,
        season_id  bigint REFERENCES seasons(id),
        first_seen date,
        last_seen  date
    );
    -- One value, in one season, resolves to exactly one product.
    CREATE UNIQUE INDEX product_identifiers_lookup
        ON product_identifiers (kind, lower(value), season_id) NULLS NOT DISTINCT;
    """)

    # Sizes are not free-form: they are the columns of the measurement grid and
    # the rows of the weight table (logic.md §3). Seeded so the grid has columns
    # on an empty database (flow.md §5).
    op.execute("""
    INSERT INTO sizes (code, label_suffix, sort_order) VALUES
        ('X/S','XS',1), ('S/M','SM',2), ('M/L','ML',3), ('X/L','XL',4);
    """)


def downgrade() -> None:
    for table in [
        "product_identifiers", "style_measurements", "style_market_prices",
        "style_trims", "style_operations", "colorway_yarns", "style_colorways",
        "style_sizes", "styles", "product_colorways", "products", "markets",
        "sizes", "operations", "yarn_colors", "materials", "box_types",
        "content_codes", "duty_categories", "collections", "season_rates",
        "seasons",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
