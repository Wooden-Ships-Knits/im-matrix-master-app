"""Sold quantities, imported per channel and period.

The fetching lives in web-apps/services — its credentials, its clients, its
job queue. This takes the rows it produces and stores them, so a printed sheet
does not wait on Salesforce and Shopify answering, and can be reproduced later.
"""
from fastapi import APIRouter, Body, HTTPException, Query

from .. import repo

router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.post("/import")
def import_sales(payload: dict = Body(...)):
    required = ("season", "start_date", "end_date", "channel")
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise HTTPException(400, f"missing: {', '.join(missing)}")
    try:
        return repo.import_sales(
            payload["season"], payload["start_date"], payload["end_date"],
            payload["channel"], payload.get("rows") or [])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/fetch")
def fetch(payload: dict = Body(...)):
    """Fetch a window from Salesforce and Shopify, and store it.

    Both are live calls and can take a while; this returns once they are in.
    """
    required = ("season", "start_date", "end_date")
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise HTTPException(400, f"missing: {', '.join(missing)}")

    from ..sales import fetch_sales
    season, start, end = (payload["season"], payload["start_date"],
                          payload["end_date"])
    try:
        rows = fetch_sales(season, start, end)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:                       # network, auth, a rejected query
        raise HTTPException(502, f"fetch failed: {exc}") from exc

    return [repo.import_sales(season, start, end, channel, channel_rows)
            for channel, channel_rows in rows.items()]


@router.get("/periods")
def periods(season: str | None = Query(None)):
    """Which windows have been loaded, so a sheet can say when it has none."""
    return repo.sales_periods(season=season)


@router.get("/unmatched")
def unmatched(season: str | None = Query(None)):
    """What matched no style or colourway, biggest quantity first."""
    return repo.unmatched_sales(season=season)
