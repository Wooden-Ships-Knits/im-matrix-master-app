"""Style CRUD — the endpoints the React client already calls (api.js)."""
from fastapi import APIRouter, Body, HTTPException, Query

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


@router.get("/{style_id}")
def get_style(style_id: int):
    style = repo.load_style(style_id)
    if not style:
        raise HTTPException(status_code=404, detail="Style not found")
    return style


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
