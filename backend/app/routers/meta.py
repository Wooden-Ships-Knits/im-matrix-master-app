"""Reference lists — every dropdown the editor needs, in one call."""
import hashlib
import json

from fastapi import APIRouter, Body, HTTPException, Request, Response

from .. import repo

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("")
def get_meta(request: Request):
    """The lists, behind a validator.

    Every page mounts this (61KB raw), and between edits it never changes —
    so the body is hashed into an ETag and a matching If-None-Match gets an
    empty 304. fetch() then serves the browser's cached body to the client
    as if it were a fresh 200, so api.js and the pages change not at all.
    Cache-Control: no-cache means "revalidate every time", which keeps
    today's freshness exactly: an edit changes the hash and the next
    navigation gets the new body.
    """
    body = json.dumps(repo.meta(), sort_keys=True, default=str)
    etag = f'"{hashlib.md5(body.encode()).hexdigest()}"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


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
