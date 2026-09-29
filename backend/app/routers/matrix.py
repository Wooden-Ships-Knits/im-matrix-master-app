"""The Matrix Master screen: what the garment is, and how the sheet is laid out.

Two things the team sets up together — the attributes the printed sheet lists
under each photo, and the order the cards sit in. Both are edited across a
whole collection at once, which is why they are here rather than on the
per-style routes.
"""
from fastapi import APIRouter, Body, HTTPException, Query

from .. import repo

router = APIRouter(prefix="/api/matrix", tags=["matrix"])


@router.get("/fields")
def fields():
    """The editable Matrix attributes, in the order the workbook lists them."""
    return repo.MATRIX_FIELDS


@router.get("/yarn-codes")
def yarn_codes():
    """The codes the Yarn field offers. Not a closed list — the field still
    takes anything typed, because a new yarn arrives before its colours do."""
    return repo.yarn_codes()


@router.get("")
def rows(
    season: str | None = Query(None),
    collection: str | None = Query(None),
    q: str | None = Query(None),
):
    """The same rows the printed sheet uses, so both read one query."""
    return repo.matrix_rows(season=season, collection=collection, q=q)


@router.patch("/{style_id}")
def update(style_id: int, payload: dict = Body(...)):
    """Write one or more attributes. Absent keys are left alone."""
    try:
        return repo.update_matrix_fields(style_id, payload or {})
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/order")
def order(payload: dict = Body(...)):
    """Place a collection's styles, first to last.

    The whole block is sent, not a move, so the server never has to work out
    what the screen meant by "third".
    """
    ids = payload.get("style_ids")
    if not isinstance(ids, list):
        raise HTTPException(400, "style_ids must be a list")
    try:
        if payload.get("clear"):
            return {"cleared": repo.clear_matrix_order(ids)}
        return {"placed": repo.set_matrix_order(ids)}
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc)) from exc
