"""The Color Table screen: the season's yarn colours as a swatch board.

Reads are the whole board in one call; writes are the two facts the board
owns — the palette a swatch sits in and its hex. The colour names come from
the BOM import, and the kilos come from the YARN ANALYSIS batch the board
names at the top of the page, so neither is editable here.

The review queue is the other half of the same screen: the rows of that file
nobody could place. Answering one writes an alias, which is how the next
import places it by itself (scripts/load_yarn_stock.py).
"""
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import Response

from .. import repo

router = APIRouter(prefix="/api/colors", tags=["colors"])


@router.get("")
def table():
    """Every yarn colour grouped by palette, trims left out."""
    return repo.color_table()


@router.get("/review")
def review(status: str = "open"):
    """The import's open questions, with the candidates the resolver found."""
    try:
        return {"items": repo.review_queue(status)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/review/{item_id}")
def answer(item_id: int, payload: dict = Body(...)):
    """Answer one question: {yarn_color_id} to confirm, {dismiss: true} to close."""
    try:
        return repo.answer_review(
            item_id, payload.get("yarn_color_id"),
            who=(payload.get("who") or None),
            dismiss=bool(payload.get("dismiss")))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/{color_id}/styles")
def styles(color_id: int):
    """The styles knitted with this colour — what the hover card lists."""
    return repo.color_styles(color_id)


# ---------------------------------------------------------------- changes
# Suggestions by people: kilos of one colour covering another's shortage, and
# yarn swaps proposed per colourway. Neither touches the BOM or the figures.


@router.get("/changes")
def changes():
    """Every open sub and proposal, with what they do to each yarn's AV."""
    return repo.color_changes()


@router.get("/changes/history")
def changes_history(limit: int = 200):
    """Withdrawn and replaced changes, newest first."""
    return {"items": repo.change_history(limit)}


@router.get("/changes.csv")
def changes_csv():
    """The open changes in the team's NOTE PERUBAHAN shape."""
    body = repo.changes_csv()
    return Response(body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition":
                             'attachment; filename="color-changes.csv"',
                             "Cache-Control": "no-store"})


@router.post("/subs")
def save_sub(payload: dict = Body(...)):
    """{short_id, sub_id, kg, who?, note?} — kg 0 withdraws the pair."""
    try:
        return repo.save_sub(payload.get("short_id"), payload.get("sub_id"),
                             payload.get("kg"), who=payload.get("who"),
                             note=payload.get("note"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/subs/{sub_id}")
def withdraw_sub(sub_id: int, who: str | None = Query(None, max_length=40)):
    try:
        return repo.withdraw_sub(sub_id, who)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/proposals")
def save_proposal(payload: dict = Body(...)):
    """{colorway_id, from_id, to_id, kg?, who?, note?}; to_id == from_id withdraws."""
    try:
        return repo.save_proposal(payload.get("colorway_id"), payload.get("from_id"),
                                  payload.get("to_id"), kg=payload.get("kg"),
                                  who=payload.get("who"), note=payload.get("note"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/proposals/{proposal_id}")
def withdraw_proposal(proposal_id: int, who: str | None = Query(None, max_length=40)):
    try:
        return repo.withdraw_proposal(proposal_id, who)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


# ---------------------------------------------------------------- CSAT
# The Color Sequence Adjustment Table: colours laid out freely on a shared
# page to compare them. Positions only — it changes nothing about a colour.


@router.get("/csat")
def csat_pages():
    return repo.csat_pages()


@router.get("/csat/{name}")
def csat_page(name: str):
    return repo.csat_page(name)


@router.put("/csat/{name}")
def save_csat(name: str, payload: dict = Body(...)):
    try:
        return repo.save_csat(name, payload.get("items") or [],
                              title=payload.get("title"),
                              focus_id=payload.get("focus_id"),
                              who=payload.get("who"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/csat/{name}")
def delete_csat(name: str):
    try:
        return repo.delete_csat(name)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


# ---------------------------------------------------------------- one colour


@router.get("/{color_id}/colorways")
def colorways(color_id: int):
    """The colourways knitted with this colour, with any open proposal."""
    return repo.color_colorways(color_id)


@router.get("/{color_id}/candidates")
def candidates(color_id: int):
    """Substitutes PPIC named for this yarn, matched against ours."""
    try:
        return repo.sub_candidates(color_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


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
