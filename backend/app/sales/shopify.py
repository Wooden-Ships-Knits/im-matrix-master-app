"""Sold quantities from Shopify, by product and colour. Fills the SY column.

Ported from web-apps/services/reports/sales_report/shopify.py. The queries are
kept verbatim, including two details that were wrong there once and are
load-bearing:

- The "*SALE*" exclusion goes on the TITLE. The marker only ever appears
  there — no SKU has contained it — so filtering the SKU column excluded
  nothing at all.
- No comma after the last GROUP BY column. ShopifyQL rejects a dangling one
  with "mismatched input 'SINCE'".

A clearance listing is a different product in Shopify, with its own product_id
and usually a "P"-prefixed SKU. It must never merge into the full-price row:
stripping the prefix instead of dropping the row once read 94 units where
Shopify showed 38.
"""
import json
import urllib.request

from .text import tidy

QUERY = """
query SalesQuantityByProduct($query: String!) {
  shopifyqlQuery(query: $query) {
    tableData { columns { name } rows }
    parseErrors
  }
}
"""

WITH_SEASON = """
FROM sales
SHOW quantity_ordered
WHERE is_canceled_order = false AND product_variant_sku_at_time_of_sale CONTAINS '{code}' AND product_title_at_time_of_sale NOT CONTAINS '*SALE*'
GROUP BY product_title_at_time_of_sale, product_variant_sku_at_time_of_sale,
    product_id WITH TOTALS, CURRENCY 'USD'
SINCE {start} UNTIL {end}
ORDER BY product_title_at_time_of_sale DESC
LIMIT 100000
""".strip()

WITHOUT_SEASON = """
FROM sales
SHOW quantity_ordered
WHERE is_canceled_order = false AND product_title_at_time_of_sale NOT CONTAINS '*SALE*'
GROUP BY product_title_at_time_of_sale, product_variant_sku_at_time_of_sale
SINCE {start} UNTIL {end}
ORDER BY product_title_at_time_of_sale DESC
LIMIT 100000
""".strip()


class Shopify:
    def __init__(self, store, token, api_version, start, end, code=None):
        self.url = f"https://{store}/admin/api/{api_version}/graphql.json"
        self.headers = {"X-Shopify-Access-Token": token,
                        "Content-Type": "application/json"}
        self.start, self.end, self.code = start, end, code

    def _shopifyql(self):
        template = WITH_SEASON if self.code else WITHOUT_SEASON
        return template.format(start=self.start, end=self.end, code=self.code)

    def _post(self, payload):
        req = urllib.request.Request(
            self.url, method="POST", data=json.dumps(payload).encode(),
            headers=self.headers)
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)

    def rows(self):
        """[{style, color, quantity}], one per product and colour."""
        body = self._post({"query": QUERY,
                           "variables": {"query": self._shopifyql()}})
        data = (body.get("data") or {}).get("shopifyqlQuery") or {}
        if not data:
            raise RuntimeError(f"Shopify returned no shopifyqlQuery: {body}")

        # parseErrors was always requested and never read there, so a rejected
        # query surfaced as a TypeError on the next line instead of the reason.
        errors = data.get("parseErrors") or []
        if errors:
            raise RuntimeError(f"ShopifyQL rejected the query: {errors}")

        table = data.get("tableData")
        if not table:
            raise RuntimeError("ShopifyQL returned no tableData and no parseErrors")

        columns = [c["name"] for c in table["columns"]]
        if not columns:
            return []          # a query matching nothing returns no columns

        TITLE = "product_title_at_time_of_sale"
        SKU = "product_variant_sku_at_time_of_sale"
        QTY = "quantity_ordered"

        # ShopifyQL returns each row as an object keyed by column name. pandas
        # took either shape without comment, which is why the original never
        # had to say so; positional access here fails with KeyError: 0.
        def field(row, name):
            if isinstance(row, dict):
                return row.get(name)
            return row[columns.index(name)]

        totals = {}
        for row in table["rows"]:
            title = field(row, TITLE)
            if title and "*SALE*" in str(title).upper():
                continue       # second line of defence behind the WHERE clause
            sku = str(field(row, SKU) or "")
            parts = sku.split("-")
            colour = tidy(parts[1]) if len(parts) > 1 else ""
            try:
                qty = int(float(field(row, QTY) or 0))
            except (TypeError, ValueError):
                continue
            key = (tidy(title), colour)
            totals[key] = totals.get(key, 0) + qty

        return [{"style": s, "color": c, "quantity": q}
                for (s, c), q in sorted(totals.items())]
