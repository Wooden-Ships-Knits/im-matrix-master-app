"""Fetching sold quantities, so the Sales History sheet can be printed.

Ported from web-apps/services/reports/sales_report. The Operator team used
that report to build this sheet by hand; automating the sheet brings the
fetching with it.

Kept from the original because each was a bug once: the "*SALE*" exclusion on
the title, the Bali-only warehouse filter, filtering order lines by product
family rather than SKU, the right-anchored style/colour split, and the
season-to-SKU arithmetic. Left behind: pandas, which none of it needs.
"""
from .fetch import fetch_sales  # noqa: F401
