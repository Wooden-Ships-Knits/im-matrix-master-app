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


@router.get("/highlights")
def highlights():
    """The colours the highlighter bar offers."""
    return repo.HIGHLIGHT_COLOURS


@router.get("/channels")
def channels():
    """The sell channels the number cell cycles through."""
    return repo.WHS_CHANNELS


@router.get("/ring-marks")
def ring_marks():
    """The colours a ring round a next-season circle can be."""
    return repo.RING_MARKS


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
    # Only the Matrix screen wants these — it has a tray to put them in. The
    # printed sheet asks without it and never sees a style with no position.
    include_parked: bool = Query(False),
):
    """The same rows the printed sheet uses, so both read one query."""
    return repo.matrix_rows(season=season, collection=collection, q=q,
                            include_parked=include_parked)


@router.patch("/{style_id}")
def update(style_id: int, payload: dict = Body(...)):
    """Write one or more attributes. Absent keys are left alone."""
    try:
        return repo.update_matrix_fields(style_id, payload or {})
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/colorway-marks")
def colorway_marks():
    """The pen colours a colourway name can be written in."""
    return repo.COLORWAY_MARKS


@router.get("/colorway-highlights")
def colorway_highlights():
    """The backgrounds a colourway name can sit on."""
    return repo.COLORWAY_HIGHLIGHTS


@router.post("/{style_id}/colorway", status_code=201)
def add_colorway(style_id: int, payload: dict = Body(...)):
    """Add a colourway to this style, at the end of its list."""
    try:
        return repo.add_colorway(style_id, payload.get("color"),
                                 payload.get("zone") or "main")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{style_id}/colorways/arrange")
def arrange_colorways(style_id: int, payload: dict = Body(...)):
    """Place this style's colourways: band and order, the whole list at once."""
    items = payload.get("colorways")
    if not isinstance(items, list):
        raise HTTPException(400, "colorways must be a list")
    try:
        return {"moved": repo.arrange_colorways(style_id, items)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/colorway-zones")
def colorway_zones():
    """The bands a colourway can sit in, top to bottom."""
    return list(repo.COLORWAY_ZONES)


@router.patch("/{style_id}/colorway")
def colorway(style_id: int, payload: dict = Body(...)):
    """Set or clear one of a colourway's two colours.

    The pen on the name and the background behind it are separate marks, so
    a request carries whichever it is changing.
    """
    try:
        if "name" in payload:
            return repo.rename_colorway(
                style_id, payload.get("color"), payload.get("name"))
        if "highlight" in payload:
            return repo.set_colorway_highlight(
                style_id, payload.get("color"), payload.get("highlight"))
        return repo.set_colorway_mark(
            style_id, payload.get("color"), payload.get("mark"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/{style_id}/colorway")
def remove_colorway(style_id: int, color: str = Query(...)):
    """Remove a colourway from this style.

    The name travels as a query parameter rather than a body: a DELETE with a
    body is legal but poorly supported, and the name is already the key.
    """
    try:
        return repo.delete_colorway(style_id, color)
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
