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
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from simple_salesforce import Salesforce as SalesforceAPI

from .text import parse_style_color, tidy

MAIN_WAREHOUSE = "000 - Bali"
CHUNK = 200          # SOQL IN() clauses are not unbounded

# The report puts WHS 000 and SY side by side over one date range, so both
# have to mean the same window. Shopify decides that: ShopifyQL reads a bare
# date in the STORE's timezone, which is US Eastern, and there is no way to
# tell it otherwise. So the dates typed into the report are Eastern calendar
# dates, and this converts them to the instants SOQL wants.
#
# It used to append "Z" and take them as UTC, which opened and closed the
# wholesale window four hours before the web-store one. Orders in those two
# slivers counted on one channel and not the other, with nothing on the sheet
# to say so.
#
# A named zone rather than a fixed offset, because Eastern is -4 in July and
# -5 in January; a hardcoded offset is wrong for half the year.
STORE_TZ = ZoneInfo("America/New_York")


def _utc(day: str, end_of_day: bool = False) -> str:
    """An Eastern calendar date as the UTC instant SOQL compares against.

    A malformed date is left alone rather than guessed at: SOQL will reject it
    and say so, which is easier to act on than a window silently shifted to
    some default day.
    """
    try:
        parsed = date.fromisoformat(str(day).strip())
    except (TypeError, ValueError):
        return str(day)
    moment = time.max.replace(microsecond=0) if end_of_day else time.min
    local = datetime.combine(parsed, moment, STORE_TZ)
    return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
        WHERE CreatedDate >= {_utc(self.start)}
          AND CreatedDate <= {_utc(self.end, end_of_day=True)}
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
                   kugo2p__Product__r.Style__c,
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
            # The product master's current name wins over the one frozen onto
            # the line when the order was created. A style renamed mid-season
            # keeps its old name on every older line, so without this its sales
            # split in two — XAVIER CARDI CHUNKY COTTON and XAVIER BUTTON CARDI
            # CHUNKY COTTON were the same garment, and only the second exists
            # here, so ten units landed on a style this database does not have.
            #
            # Colour and size still come from the line: Style__c is only the
            # style. A line whose product has no Style__c keeps the parsed
            # name, so nothing loses its identity.
            master = tidy((line.get("kugo2p__Product__r") or {}).get("Style__c"))
            if master:
                style = master
            try:
                qty = int(float(line.get("kugo2p__Quantity__c") or 0))
            except (TypeError, ValueError):
                continue
            key = (tidy(style), tidy(colour))
            totals[key] = totals.get(key, 0) + qty

        return [{"style": s, "color": c, "quantity": q}
                for (s, c), q in sorted(totals.items())]
