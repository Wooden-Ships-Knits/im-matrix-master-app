"""The Color Table screen: the season's yarn colours as a swatch board.

Reads are the whole board in one call; writes are the few facts the board
owns (palette, swatch hex, available kilos) — the colour names themselves
still come from the BOM import and are not editable here.
"""
from fastapi import APIRouter, Body, HTTPException

from .. import repo

router = APIRouter(prefix="/api/colors", tags=["colors"])


@router.get("")
def table():
    """Every yarn colour grouped by palette, trims left out."""
    return repo.color_table()


@router.get("/{color_id}/styles")
def styles(color_id: int):
    """The styles knitted with this colour — what the hover card lists."""
    return repo.color_styles(color_id)


@router.patch("/{color_id}")
def update(color_id: int, payload: dict = Body(...)):
    """Write palette / hex / quantities on one colour."""
    try:
        return repo.update_yarn_color(color_id, payload or {})
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/palettes")
def create_palette(payload: dict = Body(...)):
    """Make a palette (or return the existing one with that name)."""
    try:
        return repo.create_palette(payload.get("name"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
