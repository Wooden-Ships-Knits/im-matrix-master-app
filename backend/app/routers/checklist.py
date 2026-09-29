"""The operator's preparation checklist, one grid for a whole season.

Read as a grid rather than per style: the steps are ticked in bulk while
working through a collection, so one request carries the season and one
carries each tick.
"""
from fastapi import APIRouter, Body, HTTPException, Query

from .. import repo

router = APIRouter(prefix="/api/checklist", tags=["checklist"])


@router.get("/steps")
def steps():
    """The step vocabulary, in the order the workbook lists it.

    Each carries whether it is ticked by hand or worked out from the data, so
    the grid knows which cells to make clickable without repeating the list.
    """
    return repo.CHECKLIST_STEPS


@router.get("")
def rows(
    season: str | None = Query(None),
    collection: str | None = Query(None),
    q: str | None = Query(None),
):
    return repo.checklist_rows(season=season, collection=collection, q=q)


@router.post("/{style_id}")
def set_step(style_id: int, payload: dict = Body(...)):
    if "step" not in payload:
        raise HTTPException(400, "step is required")
    try:
        return repo.set_step(
            style_id, payload["step"], bool(payload.get("done")),
            payload.get("done_by"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
