"""Sold quantities from Salesforce, by style and colour. Fills the WHS 000 column.

Ported from web-apps/services/reports/sales_report/salesforce.py.

Two things the SOQL does deliberately:

- Only the main Bali warehouse counts. Filtered on the warehouse NAME through
  the parent lookup rather than a raw id, so the criterion reads from the
  query. Consignment accounts ("3-…") and the sample warehouse are out of
  scope on purpose.
- Order lines are filtered by ProductFamily, not by joining to Product2 and
  filtering on SKU. The same style often runs across seasons under one name
  with season-specific SKUs, so the family is the reliable one.

simple_salesforce is used for the login and query paging; the queries
themselves are ours.
"""
from simple_salesforce import Salesforce as SalesforceAPI

from .text import parse_style_color, tidy

MAIN_WAREHOUSE = "000 - Bali"
CHUNK = 200          # SOQL IN() clauses are not unbounded


class Salesforce:
    def __init__(self, username, password, security_token, start, end, season,
                 domain="wooden-ships.my"):
        self.sf = SalesforceAPI(username=username, password=password,
                                security_token=security_token, domain=domain)
        self.start, self.end, self.season = start, end, season

    def _order_ids(self):
        soql = f"""
        SELECT Id, kugo2p__RecordStatus__c
        FROM kugo2p__SalesOrder__c
        WHERE CreatedDate >= {self.start}T00:00:00Z
          AND CreatedDate <= {self.end}T23:59:59Z
          AND kugo2p__OrderName__c LIKE '{self.season}%'
        ORDER BY CreatedDate DESC
        LIMIT 100000
        """
        records = self.sf.query_all(soql)["records"]
        return [r["Id"] for r in records
                if r.get("kugo2p__RecordStatus__c") != "Cancelled"]

    def _lines(self, order_ids):
        out = []
        for i in range(0, len(order_ids), CHUNK):
            ids = ",".join(f"'{oid}'" for oid in order_ids[i:i + CHUNK])
            soql = f"""
            SELECT kugo2p__ProductFamily__c, kugo2p__ProductName__c,
                   kugo2p__Quantity__c
            FROM kugo2p__SalesOrderProductLine__c
            WHERE kugo2p__SalesOrder__c IN ({ids})
              AND kugo2p__ProductFamily__c LIKE '{self.season}%'
              AND kugo2p__Warehouse__r.Name = '{MAIN_WAREHOUSE}'
            LIMIT 100000
            """
            out.extend(self.sf.query_all(soql)["records"])
        return out

    def rows(self):
        """[{style, color, quantity}], one per style and colour."""
        order_ids = self._order_ids()
        if not order_ids:
            return []

        totals = {}
        for line in self._lines(order_ids):
            style, colour, _size = parse_style_color(
                line.get("kugo2p__ProductName__c"))
            try:
                qty = int(float(line.get("kugo2p__Quantity__c") or 0))
            except (TypeError, ValueError):
                continue
            key = (tidy(style), tidy(colour))
            totals[key] = totals.get(key, 0) + qty

        return [{"style": s, "color": c, "quantity": q}
                for (s, c), q in sorted(totals.items())]
