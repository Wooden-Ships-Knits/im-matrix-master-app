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


@router.get("/unmatched")
def unmatched(season: str | None = Query(None)):
    """What matched no style or colourway, biggest quantity first."""
    return repo.unmatched_sales(season=season)
