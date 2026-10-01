"""Reference lists — every dropdown the editor needs, in one call."""
from fastapi import APIRouter, Body, HTTPException

from .. import repo

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("")
def get_meta():
    return repo.meta()


@router.post("/{kind}", status_code=201)
def add_meta(kind: str, body: dict = Body(...)):
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    # Only a collection uses this; it is the season the new one belongs to.
    season = str(body.get("season") or "").strip() or None
    try:
        repo.add_meta(kind, name, season=season)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "name": name, "season": season}
