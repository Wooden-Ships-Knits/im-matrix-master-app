"""Style CRUD — the endpoints the React client already calls (api.js)."""
import csv
import io
from datetime import date

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import StreamingResponse

from .. import repo

router = APIRouter(prefix="/api/styles", tags=["styles"])


@router.get("")
def list_styles(
    season: str | None = Query(None),
    q: str | None = Query(None),
    color: str | None = Query(None),
    size: str | None = Query(None),
):
    return repo.list_styles(season=season, q=q, color=color, size=size)


@router.get("/export.csv")
def export_csv(
    season: str | None = Query(None),
    q: str | None = Query(None),
    color: str | None = Query(None),
    size: str | None = Query(None),
):
    """The filtered list as a CSV, one row per style x size x colourway.

    Declared before /{style_id} so the router does not read "export.csv" as an
    id and answer 422.
    """
    rows = repo.export_rows(season=season, q=q, color=color, size=size)
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    name = f"im-{(season or 'all').lower()}-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/matrix")
def matrix(
    season: str | None = Query(None),
    collection: str | None = Query(None),
    q: str | None = Query(None),
):
    """The styles a printed review sheet covers, grouped by collection.

    Declared before /{style_id}, which would otherwise read "matrix" as an id.
    """
    return repo.matrix_rows(season=season, collection=collection, q=q)


@router.get("/{style_id}")
def get_style(style_id: int):
    style = repo.load_style(style_id)
    if not style:
        raise HTTPException(status_code=404, detail="Style not found")
    return style


@router.get("/{style_id}/related")
def related(style_id: int):
    """The same garment in other seasons."""
    return repo.related_styles(style_id)


@router.post("/{style_id}/link")
def link(style_id: int, payload: dict = Body(...)):
    """Declare this style and another the same garment."""
    other = payload.get("style_id")
    if not other:
        raise HTTPException(status_code=400, detail="style_id is required")
    try:
        repo.link_styles(style_id, int(other))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return repo.related_styles(style_id)


@router.post("/{style_id}/unlink")
def unlink(style_id: int):
    """Split this style out onto a product of its own."""
    try:
        repo.unlink_style(style_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return repo.related_styles(style_id)


@router.post("", status_code=201)
def create_style(payload: dict = Body(...)):
    try:
        new_id = repo.save_style(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return repo.load_style(new_id)


@router.put("/{style_id}")
def update_style(style_id: int, payload: dict = Body(...)):
    try:
        repo.save_style(payload, style_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return repo.load_style(style_id)


@router.delete("/{style_id}")
def delete_style(style_id: int):
    if not repo.delete_style(style_id):
        raise HTTPException(status_code=404, detail="Style not found")
    return {"ok": True}


@router.get("/{style_id}/costing")
def get_costing(style_id: int):
    """The calculated columns for this style — one row per size x colourway.

    Nothing here is stored: it is recomputed from the style's inputs and the
    season's rates every time it is asked for (schema.md §5).
    """
    if not repo.load_style(style_id):
        raise HTTPException(status_code=404, detail="Style not found")
    return repo.costing(style_id)
