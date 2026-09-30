"""Signing in.

One password, two ways in: with it you are an operator, without it a guest.
There are no accounts — see app/auth.py for why.
"""
import hmac

from fastapi import APIRouter, Body, HTTPException

from .. import auth
from ..settings import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(payload: dict = Body(...)):
    """Exchange the password for an operator session."""
    given = str(payload.get("password") or "")
    # compare_digest so a wrong password takes the same time however many
    # leading characters were right.
    if not hmac.compare_digest(given, settings.app_password):
        raise HTTPException(401, "That password is not right")
    return auth.issue(auth.OPERATOR)


@router.post("/guest")
def guest():
    """A session that can read and nothing else."""
    return auth.issue(auth.GUEST)


@router.get("/me")
def me(authorization: str | None = None):
    """What the caller's token says it is, for the page to check on load."""
    role = auth.read((authorization or "").removeprefix("Bearer ").strip() or None)
    return {"role": role}
